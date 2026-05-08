import type { InboxBroadcast, InboxQuery, InboxResponse } from "../types.js";
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
export declare function fetchInbox(cfg: BrowserClientConfig, q?: InboxQuery): Promise<InboxResponse>;
export declare function markRead(cfg: BrowserClientConfig, broadcastId: string): Promise<boolean>;
export declare function markModalShown(cfg: BrowserClientConfig, broadcastId: string): Promise<boolean>;
/** Predicate: should this broadcast trigger the top-of-page banner? (spec §3.1) */
export declare function isBannerCandidate(b: InboxBroadcast): boolean;
/** Predicate: should this broadcast trigger the first-login modal? (spec §3.2) */
export declare function isModalCandidate(b: InboxBroadcast): boolean;
/** Returns the most-recent unread important ecosystem/app-wide broadcast, or null. */
export declare function pickBannerBroadcast(broadcasts: InboxBroadcast[]): InboxBroadcast | null;
/** Returns first-login modal broadcasts oldest-first per spec §3.2. */
export declare function pickModalQueue(broadcasts: InboxBroadcast[]): InboxBroadcast[];
