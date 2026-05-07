// Browser-side fetch wrappers. These hit the SATELLITE's own proxy router (mounted
// via `createBroadcastProxyRouter`), NEVER the hub directly. The hub API key and
// callback token live on the satellite's backend only (spec Part VII §17 F7).
//
// Graceful-degradation contract (spec §4): every error path returns a safe empty
// shape. The UI surfaces never throw a red error to the user.

import type { InboxBroadcast, InboxQuery, InboxResponse } from "../types.js";

const DEFAULT_TIMEOUT_MS = 4000;
const EMPTY_INBOX: InboxResponse = { broadcasts: [], next_cursor: null, unread_count: 0 };

export interface BrowserClientConfig {
  /** Where the satellite mounted its proxy, e.g. "/api/broadcasts". No trailing slash. */
  basePath: string;
  /** Per-call timeout in ms. Default 4000. */
  timeoutMs?: number;
  /** Override fetch (tests). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Optional: forward extra headers (e.g. CSRF token). */
  headers?: Record<string, string>;
  /**
   * Fired when the proxy returns `401 {"error":"session_expired"}` (Stance 4 cap).
   * Added in 1.1.0. Wired by `BroadcastProvider.onSessionExpired` — direct callers
   * may pass it explicitly. The fetch helpers still return `EMPTY_INBOX` / `false`
   * so existing graceful-degradation paths are unaffected.
   */
  onSessionExpired?: () => void;
}

async function timed(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal, credentials: "same-origin" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildInboxUrl(basePath: string, q: InboxQuery): string {
  const u = new URL(`${basePath.replace(/\/+$/, "")}/inbox`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (q.cursor) u.searchParams.set("cursor", q.cursor);
  if (q.limit !== undefined) u.searchParams.set("limit", String(q.limit));
  if (q.unreadOnly) u.searchParams.set("unreadOnly", "true");
  if (q.since) u.searchParams.set("since", q.since);
  // Strip origin if running in browser context — fetch handles relative URLs fine,
  // and we want path-relative requests to respect the satellite's base path / proxy.
  return typeof window !== "undefined" ? u.pathname + u.search : u.toString();
}

/**
 * Best-effort detection of the proxy's `401 {"error":"session_expired"}` signal.
 * Reads the body once; safe to ignore the result (caller still returns the empty
 * shape regardless). Added in 1.1.0.
 */
async function detectSessionExpired(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = await res.json();
    return !!(body && typeof body === "object" && (body as { error?: string }).error === "session_expired");
  } catch {
    return false;
  }
}

export async function fetchInbox(cfg: BrowserClientConfig, q: InboxQuery = {}): Promise<InboxResponse> {
  const fetchImpl = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = buildInboxUrl(cfg.basePath, q);
  const res = await timed(fetchImpl, url, { method: "GET", headers: cfg.headers }, timeoutMs);
  if (!res) return EMPTY_INBOX;
  if (!res.ok) {
    if (cfg.onSessionExpired && (await detectSessionExpired(res))) {
      try { cfg.onSessionExpired(); } catch { /* swallow — UX hook should not break polling */ }
    }
    return EMPTY_INBOX;
  }
  try {
    const body = (await res.json()) as InboxResponse;
    if (!body || !Array.isArray(body.broadcasts)) return EMPTY_INBOX;
    return body;
  } catch {
    return EMPTY_INBOX;
  }
}

async function postAck(cfg: BrowserClientConfig, broadcastId: string, suffix: string): Promise<boolean> {
  const fetchImpl = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${cfg.basePath.replace(/\/+$/, "")}/${encodeURIComponent(broadcastId)}${suffix}`;
  const res = await timed(
    fetchImpl,
    url,
    { method: "POST", headers: { "Content-Type": "application/json", ...cfg.headers }, body: "{}" },
    timeoutMs,
  );
  if (!res) return false;
  if (!res.ok) {
    if (cfg.onSessionExpired && (await detectSessionExpired(res))) {
      try { cfg.onSessionExpired(); } catch { /* swallow */ }
    }
    return false;
  }
  return true;
}

export function markRead(cfg: BrowserClientConfig, broadcastId: string): Promise<boolean> {
  return postAck(cfg, broadcastId, "/read");
}

export function markModalShown(cfg: BrowserClientConfig, broadcastId: string): Promise<boolean> {
  return postAck(cfg, broadcastId, "/modal-shown");
}

// ---------------------------------------------------------------------------
// Pure derivation helpers — used by the React hooks but exported standalone so
// satellites that don't use TanStack Query (or want to test render logic) can
// reach for them directly.
// ---------------------------------------------------------------------------

/** Predicate: should this broadcast trigger the top-of-page banner? (spec §3.1) */
export function isBannerCandidate(b: InboxBroadcast): boolean {
  return b.severity === "important" && b.audience_label !== "to you" && b.read_at === null;
}

/** Predicate: should this broadcast trigger the first-login modal? (spec §3.2) */
export function isModalCandidate(b: InboxBroadcast): boolean {
  return b.first_login_modal === true && b.modal_shown_at === null;
}

/** Returns the most-recent unread important ecosystem/app-wide broadcast, or null. */
export function pickBannerBroadcast(broadcasts: InboxBroadcast[]): InboxBroadcast | null {
  const candidates = broadcasts.filter(isBannerCandidate);
  if (candidates.length === 0) return null;
  // sent_at DESC — broadcasts arrive sorted newest-first from the hub.
  return candidates[0];
}

/** Returns first-login modal broadcasts oldest-first per spec §3.2. */
export function pickModalQueue(broadcasts: InboxBroadcast[]): InboxBroadcast[] {
  return broadcasts
    .filter(isModalCandidate)
    .slice()
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
}
