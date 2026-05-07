// Express router factory — drop-in proxy that the satellite's backend mounts to expose
// safe browser-callable endpoints. Browser → satellite proxy → hub. The hub API key
// and callback token NEVER leave the satellite's backend (spec Part VII §17 F7).
//
// Usage:
//   import { Router } from "express";
//   import { HubBroadcastClient, InMemoryTokenStore, createBroadcastProxyRouter } from "@central360/broadcast-client/server";
//
//   const client = new HubBroadcastClient({ ... });
//   app.use("/api/broadcasts", createBroadcastProxyRouter({
//     client,
//     getUserIdFromRequest: (req) => req.session?.userId ?? null,
//   }));

// `express` is an OPTIONAL peer dep — pnpm won't symlink it into this package's
// node_modules, so we cannot import it at runtime here. Instead the satellite
// (which definitely has express) passes us its `Router` constructor. Type-only
// imports below are erased at compile time and have no runtime resolution cost.
import type { Request, Response, Router as ExpressRouter } from "express";
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
export function createBroadcastProxyRouter(cfg: BroadcastProxyRouterConfig): ExpressRouter {
  if (typeof cfg.Router !== "function") {
    throw new Error(
      "createBroadcastProxyRouter: `Router` is required. Pass `express.Router` (or import { Router } from 'express') in the config.",
    );
  }
  const router = cfg.Router();

  async function resolveUserId(req: Request, res: Response): Promise<number | null> {
    const userId = await cfg.getUserIdFromRequest(req);
    if (userId === null || userId === undefined || !Number.isInteger(userId) || userId <= 0) {
      res.status(401).json({ error: "unauthenticated" });
      return null;
    }
    return userId;
  }

  router.get("/inbox", async (req, res) => {
    const userId = await resolveUserId(req, res);
    if (userId === null) return;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : undefined;
    const unreadOnly = String(req.query.unreadOnly ?? "") === "true";
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    // Per-request session_expired tracker. Captured by the SDK via the per-call
    // hook so we don't share state across concurrent requests.
    let sessionExpired = false;
    const inbox = await cfg.client.getInbox({
      userId,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
      unreadOnly,
      since,
      onSessionExpired: () => { sessionExpired = true; },
    });
    if (sessionExpired) {
      res.status(401).json({ error: "session_expired" });
      return;
    }
    res.json(inbox);
  });

  router.post("/:id/read", async (req, res) => {
    const userId = await resolveUserId(req, res);
    if (userId === null) return;
    let sessionExpired = false;
    const ok = await cfg.client.markRead({
      userId,
      broadcastId: req.params.id,
      onSessionExpired: () => { sessionExpired = true; },
    });
    if (sessionExpired) {
      res.status(401).json({ error: "session_expired" });
      return;
    }
    res.status(ok ? 200 : 502).json({ ok });
  });

  router.post("/:id/modal-shown", async (req, res) => {
    const userId = await resolveUserId(req, res);
    if (userId === null) return;
    let sessionExpired = false;
    const ok = await cfg.client.markModalShown({
      userId,
      broadcastId: req.params.id,
      onSessionExpired: () => { sessionExpired = true; },
    });
    if (sessionExpired) {
      res.status(401).json({ error: "session_expired" });
      return;
    }
    res.status(ok ? 200 : 502).json({ ok });
  });

  if (cfg.getRedirectTokenFromRequest) {
    const getRedirectToken = cfg.getRedirectTokenFromRequest;
    router.post("/init", async (req, res) => {
      const userId = await resolveUserId(req, res);
      if (userId === null) return;
      const redirectToken = await getRedirectToken(req);
      if (!redirectToken) {
        res.status(400).json({ error: "missing_redirect_token" });
        return;
      }
      const result = await cfg.client.issueCallbackTokenDetailed({ userId, bearer: redirectToken });
      if (!result.ok) {
        if (result.sessionExpired) {
          res.status(401).json({ error: "session_expired" });
          return;
        }
        res.status(502).json({ ok: false });
        return;
      }
      // Do NOT return the callback token to the browser. Just confirm storage.
      res.json({ ok: true, expiresAt: result.stored.expiresAt });
    });
  }

  return router;
}
