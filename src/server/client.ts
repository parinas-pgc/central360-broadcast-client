// Server-side hub broadcast client. Wraps the hub's `/api/hub/external/broadcasts/v1/*`
// surface with: per-satellite API key forwarding, hub-callback-token lifecycle, per-call
// timeout, and the graceful-degradation contract (spec Part VII §4 line 737).
//
// SECURITY: This module runs on the satellite's BACKEND only. The hub API key and the
// callback token must never reach the browser (spec Part VII §17 F7 line 1204 — server-
// to-server only).

import type { InboxQuery, InboxResponse, IssueTokenResponse, StatusResponse } from "../types.js";
import type { StoredToken, TokenStore } from "./token-store.js";

export interface HubBroadcastClientConfig {
  /** Base URL of the hub api-server, e.g. https://hub.parinas.com (no trailing slash). */
  hubUrl: string;
  /** Per-satellite API key from `HUB_BROADCAST_API_KEY`. NEVER ship this to the browser. */
  hubApiKey: string;
  /** Satellite app slug (e.g. "hedgehog360"), matched against the hub's per-satellite key map. */
  app: string;
  /** Token persistence. See `InMemoryTokenStore` for the default. */
  tokenStore: TokenStore;
  /** Override fetch (for tests). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Per-call timeout in ms. Default 4000 (spec §4 line 737 — "≤ 4 seconds"). */
  timeoutMs?: number;
  /** Hook for SDK consumers to surface errors to their own logger (Sentry, etc). */
  onError?: (op: string, err: unknown) => void;
}

const DEFAULT_TIMEOUT_MS = 4000;
const REFRESH_LEEWAY_MS = 60 * 1000; // refresh if token expires within next minute

const EMPTY_INBOX: InboxResponse = { broadcasts: [], next_cursor: null, unread_count: 0 };

/**
 * Internal: AbortController-backed timeout wrapper around fetch. Returns a tagged
 * result so callers can distinguish network failures from HTTP responses without
 * try/catch sprawl.
 */
async function timedFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: true; res: Response } | { ok: false; reason: "timeout" | "network"; err: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    return { ok: true, res };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: isAbort ? "timeout" : "network", err };
  } finally {
    clearTimeout(timer);
  }
}

export class HubBroadcastClient {
  private readonly hubUrl: string;
  private readonly hubApiKey: string;
  private readonly app: string;
  private readonly tokenStore: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly onError: (op: string, err: unknown) => void;

  constructor(cfg: HubBroadcastClientConfig) {
    if (!cfg.hubUrl) throw new Error("HubBroadcastClient: hubUrl is required");
    if (!cfg.hubApiKey) throw new Error("HubBroadcastClient: hubApiKey is required");
    if (!cfg.app) throw new Error("HubBroadcastClient: app is required");
    if (!cfg.tokenStore) throw new Error("HubBroadcastClient: tokenStore is required");
    this.hubUrl = cfg.hubUrl.replace(/\/+$/, "");
    this.hubApiKey = cfg.hubApiKey;
    this.app = cfg.app;
    this.tokenStore = cfg.tokenStore;
    this.fetchImpl = cfg.fetch ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onError = cfg.onError ?? (() => {});
  }

  private endpoint(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.hubUrl}/api/hub/external/broadcasts${path}`);
    url.searchParams.set("app", this.app);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private headers(bearer?: string): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Hub-Api-Key": this.hubApiKey,
    };
    if (bearer) h["Authorization"] = `Bearer ${bearer}`;
    return h;
  }

  // ----- Token-store wrappers ----------------------------------------------
  // The store may be a remote system (Redis, Postgres). Treat its outage as
  // graceful-degrade: never let it throw past the SDK boundary.

  private async safeGet(userId: number): Promise<StoredToken | null> {
    try {
      return await this.tokenStore.get(userId);
    } catch (err) {
      this.onError("tokenStore.get", err);
      return null;
    }
  }

  private async safeSet(userId: number, value: StoredToken): Promise<void> {
    try {
      await this.tokenStore.set(userId, value);
    } catch (err) {
      this.onError("tokenStore.set", err);
    }
  }

  private async safeDelete(userId: number): Promise<void> {
    try {
      await this.tokenStore.delete(userId);
    } catch (err) {
      this.onError("tokenStore.delete", err);
    }
  }

  /** Public: hub status probe (no auth required beyond mounting). */
  async status(): Promise<StatusResponse | null> {
    const r = await timedFetch(this.fetchImpl, this.endpoint("/v1/_status"), { method: "GET" }, this.timeoutMs);
    if (!r.ok) {
      this.onError("status", r.err);
      return null;
    }
    if (!r.res.ok) return null;
    try {
      return (await r.res.json()) as StatusResponse;
    } catch (err) {
      this.onError("status:json", err);
      return null;
    }
  }

  /**
   * Exchange a redirect token (or refresh an existing callback token) for a fresh
   * long-lived hub-callback token. Stores the result in the configured TokenStore.
   *
   * - Call once at launch with `bearer = redirectToken` (the 30-sec token from /auth/verify).
   * - Call again before expiry with `bearer = currentCallbackToken` to refresh.
   *
   * Returns the new stored token, or null on failure (caller decides whether to retry).
   */
  async issueCallbackToken({
    userId,
    bearer,
  }: {
    userId: number;
    bearer: string;
  }): Promise<StoredToken | null> {
    if (!Number.isInteger(userId) || userId <= 0) throw new Error("issueCallbackToken: invalid userId");
    if (!bearer) throw new Error("issueCallbackToken: bearer is required");

    const r = await timedFetch(
      this.fetchImpl,
      this.endpoint("/v1/issue-callback-token"),
      {
        method: "POST",
        headers: this.headers(bearer),
        body: JSON.stringify({ userId }),
      },
      this.timeoutMs,
    );
    if (!r.ok) {
      this.onError("issueCallbackToken:network", r.err);
      return null;
    }
    if (r.res.status === 401 || r.res.status === 403) {
      // Bearer rejected (expired or mismatched). Clear any stale entry so we don't
      // attempt to refresh with a poisoned token next call.
      await this.safeDelete(userId);
      return null;
    }
    if (!r.res.ok) {
      this.onError("issueCallbackToken:status", new Error(`HTTP ${r.res.status}`));
      return null;
    }
    let body: IssueTokenResponse;
    try {
      body = (await r.res.json()) as IssueTokenResponse;
    } catch (err) {
      this.onError("issueCallbackToken:json", err);
      return null;
    }
    if (!body || typeof body.callbackToken !== "string" || typeof body.expiresAt !== "number") {
      this.onError("issueCallbackToken:shape", new Error("malformed response"));
      return null;
    }
    const stored: StoredToken = { token: body.callbackToken, expiresAt: body.expiresAt };
    await this.safeSet(userId, stored);
    return stored;
  }

  /**
   * Internal: returns a usable callback token for the user. Refreshes proactively
   * if the stored token is missing or expires within REFRESH_LEEWAY_MS. Returns null
   * if no token is available (caller should drop the request and surface empty state).
   */
  private async ensureCallbackToken(userId: number): Promise<StoredToken | null> {
    const stored = await this.safeGet(userId);
    if (!stored) return null;
    if (stored.expiresAt - Date.now() > REFRESH_LEEWAY_MS) return stored;
    // Stored token is close to expiry — try to refresh using itself as bearer.
    const refreshed = await this.issueCallbackToken({ userId, bearer: stored.token });
    return refreshed ?? null;
  }

  /**
   * Inbox fetch with auto-refresh-on-401. Graceful-degradation: returns EMPTY_INBOX
   * on any error path so the satellite UI never breaks (spec §4).
   */
  async getInbox(opts: { userId: number } & InboxQuery): Promise<InboxResponse> {
    const { userId, cursor, limit, unreadOnly, since } = opts;
    if (!Number.isInteger(userId) || userId <= 0) return EMPTY_INBOX;

    const tok = await this.ensureCallbackToken(userId);
    if (!tok) return EMPTY_INBOX;

    const url = this.endpoint("/v1/inbox", {
      userId,
      cursor,
      limit,
      unread_only: unreadOnly ? "true" : undefined,
      since,
    });

    const r = await timedFetch(this.fetchImpl, url, { method: "GET", headers: this.headers(tok.token) }, this.timeoutMs);
    if (!r.ok) {
      this.onError("getInbox:network", r.err);
      return EMPTY_INBOX;
    }
    if (r.res.status === 401) {
      // Token expired between our leeway check and the call. Drop the stored token
      // so the next call re-issues. We do NOT auto-retry here because we don't have
      // a fresh bearer to issue with — the satellite must capture the redirect token
      // at next user-driven login.
      await this.safeDelete(userId);
      return EMPTY_INBOX;
    }
    if (r.res.status === 403 || r.res.status === 503) {
      // 403 = key/identity mismatch (graceful per Part III §8). 503 = feature flag off.
      return EMPTY_INBOX;
    }
    if (!r.res.ok) {
      this.onError("getInbox:status", new Error(`HTTP ${r.res.status}`));
      return EMPTY_INBOX;
    }
    try {
      const body = (await r.res.json()) as InboxResponse;
      if (!body || !Array.isArray(body.broadcasts)) return EMPTY_INBOX;
      return body;
    } catch (err) {
      this.onError("getInbox:json", err);
      return EMPTY_INBOX;
    }
  }

  /**
   * Mark a broadcast as read for the user. Returns true on success, false on any
   * graceful-degradation path. Idempotent on the hub side (COALESCE — see route handler).
   */
  async markRead(opts: { userId: number; broadcastId: string | number }): Promise<boolean> {
    return this.simpleAck("/v1/", opts.broadcastId, "/read", opts.userId, "markRead");
  }

  /** Mark first-login modal as shown for the user. Same semantics as markRead. */
  async markModalShown(opts: { userId: number; broadcastId: string | number }): Promise<boolean> {
    return this.simpleAck("/v1/", opts.broadcastId, "/modal-shown", opts.userId, "markModalShown");
  }

  private async simpleAck(
    pre: string,
    broadcastId: string | number,
    suffix: string,
    userId: number,
    op: string,
  ): Promise<boolean> {
    if (!Number.isInteger(userId) || userId <= 0) return false;
    const idStr = String(broadcastId);
    if (!/^[0-9]+$/.test(idStr)) return false;

    const tok = await this.ensureCallbackToken(userId);
    if (!tok) return false;

    const url = this.endpoint(`${pre}${idStr}${suffix}`);
    const r = await timedFetch(
      this.fetchImpl,
      url,
      {
        method: "POST",
        headers: this.headers(tok.token),
        body: JSON.stringify({ userId }),
      },
      this.timeoutMs,
    );
    if (!r.ok) {
      this.onError(`${op}:network`, r.err);
      return false;
    }
    if (r.res.status === 401) {
      await this.safeDelete(userId);
      return false;
    }
    if (!r.res.ok) {
      // 404 (not_found), 403 (perm), 503 (flag off), 4xx/5xx — all swallowed gracefully.
      this.onError(`${op}:status`, new Error(`HTTP ${r.res.status}`));
      return false;
    }
    return true;
  }
}
