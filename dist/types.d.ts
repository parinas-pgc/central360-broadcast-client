export type Severity = "info" | "notice" | "important";
export type AudienceLabel = "to you" | "ecosystem";
export interface InboxBroadcast {
    /** Stringified broadcast ID. The hub stores int but serializes as string for client safety. */
    id: string;
    title: string;
    body: string;
    link_url: string | null;
    severity: Severity;
    pinned: boolean;
    /** When true and modal_shown_at is null, satellite shows the one-shot first-login modal. */
    first_login_modal: boolean;
    /** Pre-rendered sender name. Pair with the satellite's locally-bundled logo (Part I §5). */
    displayed_sender: string;
    /** ISO-8601 UTC timestamp. */
    sent_at: string;
    /** ISO-8601 UTC timestamp or null. */
    expires_at: string | null;
    /** Human-readable scope label, e.g. "to all apps". */
    scope_label: string;
    /** "to you" for user-specific, "ecosystem" otherwise. */
    audience_label: AudienceLabel;
    /** ISO-8601 UTC timestamp or null. Null means unread. */
    read_at: string | null;
    /** ISO-8601 UTC timestamp or null. Null means modal not yet shown for this user. */
    modal_shown_at: string | null;
}
export interface InboxResponse {
    broadcasts: InboxBroadcast[];
    /** Opaque cursor for the next page. Null when there are no more results. */
    next_cursor: string | null;
    /** Number of unread broadcasts visible to this user (for the bell badge). */
    unread_count: number;
}
export interface IssueTokenResponse {
    /**
     * Hub-callback token. Forwarded as `Authorization: Bearer <token>` on every
     * /v1/* call. Variable lifetime — the hub clamps `expiresAt` to the smaller
     * of (a) 8h from issuance and (b) the user's `originalLoginExp` (Stance 4
     * cap, deployed 2026-05-07). Never assume "+8h"; always read `expiresAt`
     * from this response. See `docs/broadcast-stance4-stabilization.md`.
     */
    callbackToken: string;
    /** Epoch milliseconds at which the token expires. Source of truth for TTL. */
    expiresAt: number;
}
/**
 * Structured error body the hub may return on `401` from any `/v1/*` endpoint
 * after the Stance 4 session cap fires. Returned by the satellite proxy router
 * (added in 1.1.0) so the frontend can distinguish "user's hub session expired,
 * bounce to hub login" from generic 401s (which are operator-config errors).
 */
export interface IssueTokenErrorBody {
    error: "session_expired";
}
export interface InboxQuery {
    cursor?: string;
    limit?: number;
    unreadOnly?: boolean;
    /** ISO-8601 UTC timestamp. Filters to broadcasts with `sent_at >= since`. */
    since?: string;
}
/** Minimal status response from `GET /v1/_status`. */
export interface StatusResponse {
    enabled: boolean;
    phase: number;
    surface: string;
}
