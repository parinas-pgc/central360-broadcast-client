import type { InboxQuery, InboxResponse, StatusResponse } from "../types.js";
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
    /**
     * Hook fired when the SDK detects the hub returned `401 {"error":"session_expired"}`
     * on any /v1/* call. Indicates the user's original 8h hub login window
     * (`originalLoginExp`) has elapsed and the session cannot be renewed without
     * re-authentication at the hub. Satellites typically respond by clearing local
     * session state and redirecting the user to `${HUB_URL}/login?next=<satellite_url>`.
     *
     * The SDK still performs its standard cleanup (drop the cached callback token via
     * `safeDelete`) regardless of whether this hook is wired. Wiring it just adds the
     * proactive UX bounce. See `docs/broadcast-stance4-stabilization.md` for context.
     *
     * Added in 1.1.0. Optional — older satellites that don't pass this continue to
     * work exactly as before (silent empty bell, eventual auth-gate fallback).
     */
    onSessionExpired?: (userId: number) => void | Promise<void>;
}
/**
 * Discriminated result of an explicit callback-token issue/refresh attempt. Returned
 * by `issueCallbackTokenDetailed` so callers (notably the proxy router's `/init`
 * handler) can distinguish a hard session-expiration from other failure modes.
 *
 * Added in 1.1.0. The original `issueCallbackToken({...}) -> StoredToken | null`
 * return shape is preserved for backward compatibility — it's now a thin wrapper
 * over `issueCallbackTokenDetailed`.
 */
export type IssueCallbackTokenResult = {
    ok: true;
    stored: StoredToken;
} | {
    ok: false;
    /** HTTP status from the hub, or 0 if the call never made it (network/timeout). */
    status: number;
    /**
     * True when the hub returned `401 {"error":"session_expired"}`. Indicates the
     * cap fired — see `HubBroadcastClientConfig.onSessionExpired` for the
     * recommended satellite response.
     */
    sessionExpired: boolean;
};
export declare class HubBroadcastClient {
    private readonly hubUrl;
    private readonly hubApiKey;
    private readonly app;
    private readonly tokenStore;
    private readonly fetchImpl;
    private readonly timeoutMs;
    private readonly onError;
    private readonly onSessionExpired?;
    constructor(cfg: HubBroadcastClientConfig);
    private endpoint;
    private headers;
    /**
     * Internal: fire the configured `onSessionExpired` hook safely. Per-call hook
     * (passed via opts) wins over the global hook so the proxy router can capture
     * per-request signals without sharing state across requests.
     */
    private fireSessionExpired;
    private safeGet;
    private safeSet;
    private safeDelete;
    /** Public: hub status probe (no auth required beyond mounting). */
    status(): Promise<StatusResponse | null>;
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
    issueCallbackToken({ userId, bearer, }: {
        userId: number;
        bearer: string;
    }): Promise<StoredToken | null>;
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
    issueCallbackTokenDetailed({ userId, bearer, onSessionExpired, }: {
        userId: number;
        bearer: string;
        /**
         * Per-call session-expired hook. Fires after the SDK detects
         * `401 {"error":"session_expired"}` from the hub. Wins over the global
         * `HubBroadcastClientConfig.onSessionExpired`. Use to capture the signal
         * for a specific request (e.g. inside an Express handler) without sharing
         * state across requests.
         */
        onSessionExpired?: (userId: number) => void | Promise<void>;
    }): Promise<IssueCallbackTokenResult>;
    /**
     * Internal: returns a usable callback token for the user. Refreshes proactively
     * if the stored token is missing or expires within REFRESH_LEEWAY_MS. Returns null
     * if no token is available (caller should drop the request and surface empty state).
     */
    private ensureCallbackToken;
    /**
     * Inbox fetch with auto-refresh-on-401. Graceful-degradation: returns EMPTY_INBOX
     * on any error path so the satellite UI never breaks (spec §4).
     *
     * Pass `onSessionExpired` to receive the per-request signal when the hub reports
     * `session_expired` during this call (either at refresh time or on the inbox
     * call itself). The proxy router uses this to translate the bell-empty path
     * into `401 {"error":"session_expired"}` for the browser.
     */
    getInbox(opts: {
        userId: number;
        onSessionExpired?: (userId: number) => void | Promise<void>;
    } & InboxQuery): Promise<InboxResponse>;
    /**
     * Mark a broadcast as read for the user. Returns true on success, false on any
     * graceful-degradation path. Idempotent on the hub side (COALESCE — see route handler).
     */
    markRead(opts: {
        userId: number;
        broadcastId: string | number;
        onSessionExpired?: (userId: number) => void | Promise<void>;
    }): Promise<boolean>;
    /** Mark first-login modal as shown for the user. Same semantics as markRead. */
    markModalShown(opts: {
        userId: number;
        broadcastId: string | number;
        onSessionExpired?: (userId: number) => void | Promise<void>;
    }): Promise<boolean>;
    private simpleAck;
}
