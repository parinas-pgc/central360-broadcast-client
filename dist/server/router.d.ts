import type { Request, Router as ExpressRouter } from "express";
import type { HubBroadcastClient } from "./client.js";
/** Subset of the express.Router constructor signature we need. */
export type RouterFactory = () => ExpressRouter;
export interface BroadcastProxyRouterConfig {
    /**
     * The satellite's express Router constructor — typically `express.Router` or
     * `Router` named-imported from "express". Passed in (rather than resolved by
     * the SDK) because express is an optional peer dep and pnpm strict isolation
     * means the SDK can't resolve the satellite's copy on its own.
     */
    Router: RouterFactory;
    client: HubBroadcastClient;
    /**
     * Returns the authenticated user's ID from the satellite's own session, or null
     * if the request is unauthenticated. The proxy returns 401 when null.
     */
    getUserIdFromRequest: (req: Request) => number | null | Promise<number | null>;
    /**
     * Optional: derive the redirect token from the satellite session for the convenience
     * `POST /init` endpoint. If unset, /init is not mounted and satellites must call
     * `client.issueCallbackToken` directly from their login flow.
     */
    getRedirectTokenFromRequest?: (req: Request) => string | null | Promise<string | null>;
}
/**
 * Returns an Express Router exposing:
 *   GET  /inbox?cursor&limit&unreadOnly&since
 *   POST /:id/read
 *   POST /:id/modal-shown
 *   POST /init                (only mounted when getRedirectTokenFromRequest is provided)
 *
 * The satellite passes its own `Router` constructor in `cfg.Router` (typically
 * `express.Router`). The SDK never imports express at runtime — only as types —
 * so installing this package in a frontend-only context (e.g., the hub itself
 * which only uses /react) does not require express to be present.
 *
 * **Stance 4 / `session_expired` (added 1.1.0):** when the SDK detects the hub
 * returned `401 {"error":"session_expired"}` during any underlying call, this
 * router translates it to `401 {"error":"session_expired"}` on the browser-facing
 * response (replacing the previous generic `200 EMPTY_INBOX` for inbox or
 * `502 {ok:false}` for /init). Satellite frontends opt in to proactive
 * "session expired, please re-login at hub" UX by detecting this status+body.
 * Existing satellites that ignore the body get the same behaviour they had
 * before — bell goes empty, AuthGate eventually catches it on next heartbeat.
 */
export declare function createBroadcastProxyRouter(cfg: BroadcastProxyRouterConfig): ExpressRouter;
