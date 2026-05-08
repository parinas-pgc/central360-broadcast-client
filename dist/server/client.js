// Server-side hub broadcast client. Wraps the hub's `/api/hub/external/broadcasts/v1/*`
// surface with: per-satellite API key forwarding, hub-callback-token lifecycle, per-call
// timeout, and the graceful-degradation contract (spec Part VII §4 line 737).
//
// SECURITY: This module runs on the satellite's BACKEND only. The hub API key and the
// callback token must never reach the browser (spec Part VII §17 F7 line 1204 — server-
// to-server only).
const DEFAULT_TIMEOUT_MS = 4000;
const REFRESH_LEEWAY_MS = 60 * 1000; // refresh if token expires within next minute
const EMPTY_INBOX = { broadcasts: [], next_cursor: null, unread_count: 0 };
/**
 * Internal: AbortController-backed timeout wrapper around fetch. Returns a tagged
 * result so callers can distinguish network failures from HTTP responses without
 * try/catch sprawl.
 */
async function timedFetch(fetchImpl, url, init, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
        return { ok: true, res };
    }
    catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        return { ok: false, reason: isAbort ? "timeout" : "network", err };
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Internal: best-effort parse of a JSON response body. Returns null if the body
 * isn't readable as JSON (e.g. empty body, plain text, or already consumed). Used
 * to detect structured error codes like `{"error":"session_expired"}` without
 * letting a malformed body crash the SDK.
 */
async function safeReadErrorBody(res) {
    try {
        const body = await res.json();
        if (body && typeof body === "object")
            return body;
        return null;
    }
    catch {
        return null;
    }
}
export class HubBroadcastClient {
    hubUrl;
    hubApiKey;
    app;
    tokenStore;
    fetchImpl;
    timeoutMs;
    onError;
    onSessionExpired;
    constructor(cfg) {
        if (!cfg.hubUrl)
            throw new Error("HubBroadcastClient: hubUrl is required");
        if (!cfg.hubApiKey)
            throw new Error("HubBroadcastClient: hubApiKey is required");
        if (!cfg.app)
            throw new Error("HubBroadcastClient: app is required");
        if (!cfg.tokenStore)
            throw new Error("HubBroadcastClient: tokenStore is required");
        this.hubUrl = cfg.hubUrl.replace(/\/+$/, "");
        this.hubApiKey = cfg.hubApiKey;
        this.app = cfg.app;
        this.tokenStore = cfg.tokenStore;
        this.fetchImpl = cfg.fetch ?? fetch;
        this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.onError = cfg.onError ?? (() => { });
        this.onSessionExpired = cfg.onSessionExpired;
    }
    endpoint(path, query) {
        const url = new URL(`${this.hubUrl}/api/hub/external/broadcasts${path}`);
        url.searchParams.set("app", this.app);
        if (query) {
            for (const [k, v] of Object.entries(query)) {
                if (v === undefined || v === null)
                    continue;
                url.searchParams.set(k, String(v));
            }
        }
        return url.toString();
    }
    headers(bearer) {
        const h = {
            "Content-Type": "application/json",
            "X-Hub-Api-Key": this.hubApiKey,
        };
        if (bearer)
            h["Authorization"] = `Bearer ${bearer}`;
        return h;
    }
    /**
     * Internal: fire the configured `onSessionExpired` hook safely. Per-call hook
     * (passed via opts) wins over the global hook so the proxy router can capture
     * per-request signals without sharing state across requests.
     */
    async fireSessionExpired(userId, perCall) {
        const hook = perCall ?? this.onSessionExpired;
        if (!hook)
            return;
        try {
            await hook(userId);
        }
        catch (err) {
            this.onError("onSessionExpired", err);
        }
    }
    // ----- Token-store wrappers ----------------------------------------------
    // The store may be a remote system (Redis, Postgres). Treat its outage as
    // graceful-degrade: never let it throw past the SDK boundary.
    async safeGet(userId) {
        try {
            return await this.tokenStore.get(userId);
        }
        catch (err) {
            this.onError("tokenStore.get", err);
            return null;
        }
    }
    async safeSet(userId, value) {
        try {
            await this.tokenStore.set(userId, value);
        }
        catch (err) {
            this.onError("tokenStore.set", err);
        }
    }
    async safeDelete(userId) {
        try {
            await this.tokenStore.delete(userId);
        }
        catch (err) {
            this.onError("tokenStore.delete", err);
        }
    }
    /** Public: hub status probe (no auth required beyond mounting). */
    async status() {
        const r = await timedFetch(this.fetchImpl, this.endpoint("/v1/_status"), { method: "GET" }, this.timeoutMs);
        if (!r.ok) {
            this.onError("status", r.err);
            return null;
        }
        if (!r.res.ok)
            return null;
        try {
            return (await r.res.json());
        }
        catch (err) {
            this.onError("status:json", err);
            return null;
        }
    }
    /**
     * Exchange a redirect token (or refresh an existing callback token) for a fresh
     * hub-callback token. Stores the result in the configured TokenStore.
     *
     * - Call once at launch with `bearer = redirectToken` (the 30-sec token from /auth/verify).
     * - Call again before expiry with `bearer = currentCallbackToken` to refresh.
     *
     * Returns the new stored token, or `null` on any failure (caller decides whether
     * to retry). For callers that need to distinguish `session_expired` from other
     * failure modes (e.g. the proxy router's `/init` handler), use
     * {@link issueCallbackTokenDetailed} instead.
     *
     * The token's `expiresAt` is the source of truth — it can be anywhere from a few
     * seconds to 8 hours depending on the user's `originalLoginExp` (Stance 4 cap).
     * Never assume "issued + 8h"; always read `stored.expiresAt`.
     */
    async issueCallbackToken({ userId, bearer, }) {
        const result = await this.issueCallbackTokenDetailed({ userId, bearer });
        return result.ok ? result.stored : null;
    }
    /**
     * Detailed variant of {@link issueCallbackToken}. Returns a discriminated result
     * including `sessionExpired: true` when the hub returned
     * `401 {"error":"session_expired"}`. Use this in places where the caller wants
     * to surface the structured error code (e.g. forward `401 session_expired` to
     * the browser so the satellite frontend can bounce to hub login).
     *
     * Added in 1.1.0. The behaviour and side-effects (TokenStore set/delete,
     * `onSessionExpired` hook firing) are identical to `issueCallbackToken` —
     * only the return shape differs. Optional per-call `onSessionExpired` hook
     * lets the caller capture this signal without sharing state across requests.
     */
    async issueCallbackTokenDetailed({ userId, bearer, onSessionExpired, }) {
        if (!Number.isInteger(userId) || userId <= 0)
            throw new Error("issueCallbackToken: invalid userId");
        if (!bearer)
            throw new Error("issueCallbackToken: bearer is required");
        const r = await timedFetch(this.fetchImpl, this.endpoint("/v1/issue-callback-token"), {
            method: "POST",
            headers: this.headers(bearer),
            body: JSON.stringify({ userId }),
        }, this.timeoutMs);
        if (!r.ok) {
            this.onError("issueCallbackToken:network", r.err);
            return { ok: false, status: 0, sessionExpired: false };
        }
        if (r.res.status === 401 || r.res.status === 403) {
            // Bearer rejected (expired, mismatched, or session-cap exceeded). Read the
            // body BEFORE clearing state so we can detect `session_expired` and fire
            // the proactive-bounce hook for satellites that wired one.
            const body = await safeReadErrorBody(r.res);
            const sessionExpired = body?.error === "session_expired";
            await this.safeDelete(userId);
            if (sessionExpired)
                await this.fireSessionExpired(userId, onSessionExpired);
            return { ok: false, status: r.res.status, sessionExpired };
        }
        if (!r.res.ok) {
            this.onError("issueCallbackToken:status", new Error(`HTTP ${r.res.status}`));
            return { ok: false, status: r.res.status, sessionExpired: false };
        }
        let body;
        try {
            body = (await r.res.json());
        }
        catch (err) {
            this.onError("issueCallbackToken:json", err);
            return { ok: false, status: r.res.status, sessionExpired: false };
        }
        if (!body || typeof body.callbackToken !== "string" || typeof body.expiresAt !== "number") {
            this.onError("issueCallbackToken:shape", new Error("malformed response"));
            return { ok: false, status: r.res.status, sessionExpired: false };
        }
        const stored = { token: body.callbackToken, expiresAt: body.expiresAt };
        await this.safeSet(userId, stored);
        return { ok: true, stored };
    }
    /**
     * Internal: returns a usable callback token for the user. Refreshes proactively
     * if the stored token is missing or expires within REFRESH_LEEWAY_MS. Returns null
     * if no token is available (caller should drop the request and surface empty state).
     */
    async ensureCallbackToken(userId, onSessionExpired) {
        const stored = await this.safeGet(userId);
        if (!stored)
            return null;
        if (stored.expiresAt - Date.now() > REFRESH_LEEWAY_MS)
            return stored;
        // Stored token is close to expiry — try to refresh using itself as bearer.
        const result = await this.issueCallbackTokenDetailed({
            userId,
            bearer: stored.token,
            onSessionExpired,
        });
        return result.ok ? result.stored : null;
    }
    /**
     * Inbox fetch with auto-refresh-on-401. Graceful-degradation: returns EMPTY_INBOX
     * on any error path so the satellite UI never breaks (spec §4).
     *
     * Pass `onSessionExpired` to receive the per-request signal when the hub reports
     * `session_expired` during this call (either at refresh time or on the inbox
     * call itself). The proxy router uses this to translate the bell-empty path
     * into `401 {"error":"session_expired"}` for the browser.
     */
    async getInbox(opts) {
        const { userId, cursor, limit, unreadOnly, since, onSessionExpired } = opts;
        if (!Number.isInteger(userId) || userId <= 0)
            return EMPTY_INBOX;
        const tok = await this.ensureCallbackToken(userId, onSessionExpired);
        if (!tok)
            return EMPTY_INBOX;
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
            // Token expired between our leeway check and the call. Read the body to
            // detect session_expired before clearing state. We do NOT auto-retry here
            // because we don't have a fresh bearer — the satellite must capture the
            // redirect token at next user-driven login.
            const body = await safeReadErrorBody(r.res);
            const sessionExpired = body?.error === "session_expired";
            await this.safeDelete(userId);
            if (sessionExpired)
                await this.fireSessionExpired(userId, onSessionExpired);
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
            const body = (await r.res.json());
            if (!body || !Array.isArray(body.broadcasts))
                return EMPTY_INBOX;
            return body;
        }
        catch (err) {
            this.onError("getInbox:json", err);
            return EMPTY_INBOX;
        }
    }
    /**
     * Mark a broadcast as read for the user. Returns true on success, false on any
     * graceful-degradation path. Idempotent on the hub side (COALESCE — see route handler).
     */
    async markRead(opts) {
        return this.simpleAck("/v1/", opts.broadcastId, "/read", opts.userId, "markRead", opts.onSessionExpired);
    }
    /** Mark first-login modal as shown for the user. Same semantics as markRead. */
    async markModalShown(opts) {
        return this.simpleAck("/v1/", opts.broadcastId, "/modal-shown", opts.userId, "markModalShown", opts.onSessionExpired);
    }
    async simpleAck(pre, broadcastId, suffix, userId, op, onSessionExpired) {
        if (!Number.isInteger(userId) || userId <= 0)
            return false;
        const idStr = String(broadcastId);
        if (!/^[0-9]+$/.test(idStr))
            return false;
        const tok = await this.ensureCallbackToken(userId, onSessionExpired);
        if (!tok)
            return false;
        const url = this.endpoint(`${pre}${idStr}${suffix}`);
        const r = await timedFetch(this.fetchImpl, url, {
            method: "POST",
            headers: this.headers(tok.token),
            body: JSON.stringify({ userId }),
        }, this.timeoutMs);
        if (!r.ok) {
            this.onError(`${op}:network`, r.err);
            return false;
        }
        if (r.res.status === 401) {
            const body = await safeReadErrorBody(r.res);
            const sessionExpired = body?.error === "session_expired";
            await this.safeDelete(userId);
            if (sessionExpired)
                await this.fireSessionExpired(userId, onSessionExpired);
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
