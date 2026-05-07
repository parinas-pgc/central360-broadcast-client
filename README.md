# `@central360/broadcast-client`

Official SDK Parinas Central360 satellites use to integrate the Central360 HUB
broadcast system end-to-end. Wraps the hub's `/v1/*` API with the callback-token
refresh state machine, polling cadence, error semantics, and graceful-degradation
contract specified in the broadcast spec Part VII §17 F6/F7.

## Architecture

```
Browser  ──>  Satellite proxy router  ──>  Hub /v1/*
              (createBroadcastProxyRouter)   (HubBroadcastClient)
```

**The browser never sees the hub API key or the hub callback token.** All
`/v1/*` calls are server-to-server. The React layer only ever talks to the
satellite's own proxy.

## Install

The SDK is distributed via the [Parinas GitHub repo](https://github.com/parinas-pgc/central360-broadcast-client) — no npm registry, no auth tokens. Add it to your satellite's `package.json` as a git URL pinned to an exact version tag:

```json
{
  "dependencies": {
    "@central360/broadcast-client": "github:parinas-pgc/central360-broadcast-client#v1.1.0"
  }
}
```

Then `pnpm install` (or `npm install` / `yarn`). The package's `prepare` script auto-builds it during install, so you get the compiled `dist/` directly in `node_modules/`.

> **Always pin to an exact tag** (`#v1.1.0`, not `#main`). Your lockfile then guarantees a deterministic install across CI, dev, and prod.

### What's new in 1.1.0 (Stance 4 / `session_expired` surface)

Non-breaking. Adds proactive UX for the hub's session-age cap:

- The proxy router now translates the hub's `401 {"error":"session_expired"}`
  into a same-shape browser-facing 401 (instead of silently returning empty).
- `BroadcastProvider` accepts `onSessionExpired?: () => void` — wire it to bounce
  the user to `${HUB_URL}/login` when the cap fires.
- `HubBroadcastClient` accepts `onSessionExpired?: (userId) => void` for
  server-side hooks (logging, custom session cleanup).
- New `client.issueCallbackTokenDetailed({...})` returns a discriminated result
  with `sessionExpired: boolean` for callers that need the structured signal.

Existing 1.0.0 consumers that bump without changing any other code see no
behaviour change beyond the bell going empty slightly earlier when the cap
fires — same as today's fallback, just with the option to add a clean bounce.
Full context: `docs/broadcast-stance4-stabilization.md`.

For higher-assurance environments (production CI), pin to an immutable commit SHA instead of a tag — tags are mutable on GitHub, commit SHAs are not:
>
> ```json
> "@central360/broadcast-client": "github:parinas-pgc/central360-broadcast-client#a1b2c3d4e5..."
> ```

The repo is public — no GitHub authentication needed. `pnpm install` works out of the box on dev machines, in CI, and inside Replit projects. The SDK itself contains no secrets; every credential (hub URL, hub API key, JWT verifier) is passed in by the caller at runtime.

> **Heads-up:** install runs the SDK's `prepare` script which invokes `tsc` to build `dist/`. If your satellite uses `pnpm install --ignore-scripts` or `npm install --ignore-scripts`, the SDK won't build and imports will fail at runtime. Either drop `--ignore-scripts` for this install, or vendor a built copy of the SDK locally.

Peer deps you supply at the satellite (you almost certainly already have these):

- `express` ^5 (for the proxy router; server-side only)
- `react` >=18 (for the hooks/components; browser-side only)
- `@tanstack/react-query` ^5 (for the hooks/components; browser-side only)

---

## (a) Satellite backend — wire the proxy in ~12 lines

```ts
import express, { Router } from "express";
import {
  HubBroadcastClient,
  InMemoryTokenStore,
  createBroadcastProxyRouter,
} from "@central360/broadcast-client/server";

const broadcastClient = new HubBroadcastClient({
  hubUrl: process.env.HUB_URL!,                 // e.g. https://central360.parinas.com
  hubApiKey: process.env.HUB_API_KEY!,          // satellite-specific dev/prod key
  app: "hedgehog360",                           // your app's hub-registered slug
  tokenStore: new InMemoryTokenStore(),         // swap for a DB-backed impl in prod
});

const app = express();
app.use("/api/broadcasts", createBroadcastProxyRouter({
  Router,                                       // your express.Router (passed in
                                                // because express is an optional
                                                // peer dep of the SDK)
  client: broadcastClient,
  getUserIdFromRequest: (req) => req.session?.userId ?? null,
  // Optional convenience — lets the React layer call POST /init at app boot.
  // If omitted, call `broadcastClient.issueCallbackToken(...)` from your login
  // flow instead, using the 30-sec redirect token returned by the hub.
  getRedirectTokenFromRequest: (req) => req.session?.hubRedirectToken ?? null,
}));
```

### Token bootstrap (one of the two)

1. **Login-flow boot (recommended for production).** When the user lands back
   from the hub launcher, you receive a 30-sec redirect JWT. Call
   `broadcastClient.issueCallbackToken({ userId, bearer: redirectToken })` once
   — the SDK stores the resulting 8h callback token and auto-refreshes it on
   the 60-sec leeway window from then on.
2. **Mounted `POST /init`.** If you wired `getRedirectTokenFromRequest` above,
   the React layer can call `POST /api/broadcasts/init` at boot and the proxy
   does step 1 for you.

---

## (b) Satellite frontend — wire React in ~15 lines

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BroadcastProvider,
  BellIconWithBadge,
  BroadcastBanner,
  BroadcastModalQueue,
} from "@central360/broadcast-client/react";
import logoSrc from "./assets/logo.png";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BroadcastProvider basePath="/api/broadcasts" appLogoSrc={logoSrc} appName="Hedgehog360">
        <BroadcastBanner />
        <header><BellIconWithBadge /></header>
        <BroadcastModalQueue />
        {/* …rest of app… */}
      </BroadcastProvider>
    </QueryClientProvider>
  );
}
```

That's the full bell + badge + popover inbox + amber banner + first-login modal
queue with optimistic mark-as-read, 5-minute polling, and refetch-on-focus.

---

## Hooks (if you're rolling your own UI)

| Hook | Returns |
| --- | --- |
| `useBroadcastInbox({ unreadOnly?, pageSize? })` | `{ broadcasts, unreadCount, fetchNextPage, hasNextPage, refetch, isLoading, isFetching, error }` |
| `useImportantBanner()` | `InboxBroadcast \| null` — the broadcast that should appear in the top banner. |
| `useFirstLoginModals()` | `InboxBroadcast[]` — modal queue oldest-first. |
| `useMarkRead()` | TanStack mutation; `mutate(broadcastId)` |
| `useMarkModalShown()` | TanStack mutation; `mutate(broadcastId)` |
| `useMarkAllRead()` | TanStack mutation; `mutate()` |

All hooks share one underlying `useInfiniteQuery` cache with a default 5-minute
poll (override via `BroadcastProvider.pollIntervalMs`).

---

## Server SDK methods

```ts
const client = new HubBroadcastClient({ hubUrl, hubApiKey, app, tokenStore });

await client.status();                                                    // GET /v1/_status
await client.issueCallbackToken({ userId, bearer: redirectOrCallbackJwt }); // POST /v1/issue-callback-token
await client.getInbox({ userId, cursor?, limit?, unreadOnly?, since? });    // GET /v1/inbox
await client.markRead({ userId, broadcastId });                            // POST /v1/:id/read
await client.markModalShown({ userId, broadcastId });                      // POST /v1/:id/modal-shown
```

Token lifecycle (spec Part VII §17 F6 Option B):

- `getInbox`/`markRead`/`markModalShown` look up the stored callback token via
  `tokenStore.get(userId)`. If it's missing the call returns the empty-inbox
  shape (graceful-degrade — no throw).
- If the token is within 60s of expiry the SDK calls
  `POST /v1/issue-callback-token` using the *current* callback token as bearer
  (the hub accepts either a redirect token or a valid callback token).
- The token's `expiresAt` is **variable** (Stance 4 cap, hub-side as of
  2026-05-07). It can be anywhere from a few seconds to 8h depending on the
  user's `originalLoginExp`. Always read `stored.expiresAt`; never assume "+8h."
- 401 on any /v1/ call → drop the cached token + return empty (the satellite's
  next login flow will re-bootstrap). If the body is `{"error":"session_expired"}`,
  the SDK additionally fires `onSessionExpired` (1.1.0+) so the satellite can
  bounce the user to hub login.
- 403/5xx/network/timeout → return empty inbox or `false` for write ops. The
  SDK never throws on hub-side errors. Only programmer errors throw.

## TokenStore

```ts
interface TokenStore {
  get(userId: number): Promise<{ token: string; expiresAt: number } | null>;
  set(userId: number, value: { token: string; expiresAt: number }): Promise<void>;
  delete(userId: number): Promise<void>;
}
```

- `InMemoryTokenStore` ships with the package — fine for dev and single-process
  satellites.
- For multi-instance satellites, plug in a Redis or Postgres-backed impl. The
  store value is opaque to the SDK; only `token` and `expiresAt` matter.

## Wire reference

Snake-case fields per Part IV. Highlights:

```ts
type InboxBroadcast = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  severity: "info" | "notice" | "important";
  pinned: boolean;
  first_login_modal: boolean;
  audience_label: "to you" | "to your team" | "to everyone in this app" | "to everyone";
  scope_label: string;
  displayed_sender: string;
  sent_at: string;          // ISO timestamp
  read_at: string | null;
  modal_shown_at: string | null;
};
```

See also: `docs/broadcast-harness.md` for the wire-level smoke harness used by
the hub team during Phase 5.
