// Wire-level types for the hub broadcast satellite API (`/api/hub/external/broadcasts/v1/*`).
// Source-of-truth: artifacts/api-server/src/routes/hub/external-broadcasts.ts
// Spec anchors: Part IV §"GET /v1/inbox" (line 507), Part III §2 (line 262), §3 (line 287).
//
// All field names match the wire JSON exactly (snake_case where the hub returns snake_case).

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
  /** Long-lived hub-callback token (8h by default). Forwarded as `Authorization: Bearer <token>` on every /v1/* call. */
  callbackToken: string;
  /** Epoch milliseconds at which the token expires. */
  expiresAt: number;
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
