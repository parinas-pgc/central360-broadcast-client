// React hooks for the broadcast SDK. Built on TanStack Query so satellites get
// caching, deduplication, refetch-on-focus, and polling for free.
//
// Polling cadence per spec Part VII §5 (line 753): default 5 min. Refetch on focus
// catches "user came back to the tab" scenarios. Refetch on mount catches "user
// just navigated to a page in the satellite shell."
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchInbox, markRead as apiMarkRead, markModalShown as apiMarkModalShown, pickBannerBroadcast, pickModalQueue, } from "./client.js";
import { useBroadcastContext } from "./provider.js";
const DEFAULT_POLL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
/**
 * Cache keys are scoped by basePath + filters so multiple BroadcastProviders
 * (or unreadOnly variants of the same provider) don't collide.
 */
function inboxQueryKey(basePath, unreadOnly, pageSize) {
    return ["broadcast", "inbox", basePath, { unreadOnly, pageSize }];
}
function inboxQueryKeyPrefix(basePath) {
    return ["broadcast", "inbox", basePath];
}
/**
 * Paginated inbox query. Returns all loaded broadcasts as a flat list plus the
 * unread_count from the first page (the hub returns the global unread count, not
 * a per-page count, so subsequent pages overwrite it without harm).
 */
export function useBroadcastInbox(opts) {
    const ctx = useBroadcastContext();
    const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
    const unreadOnly = opts?.unreadOnly ?? false;
    const pollMs = ctx.pollIntervalMs ?? DEFAULT_POLL_MS;
    const query = useInfiniteQuery({
        queryKey: inboxQueryKey(ctx.basePath, unreadOnly, pageSize),
        initialPageParam: undefined,
        queryFn: async ({ pageParam }) => {
            return fetchInbox({ basePath: ctx.basePath, onSessionExpired: ctx.onSessionExpired }, { cursor: pageParam, limit: pageSize, unreadOnly });
        },
        getNextPageParam: (last) => last.next_cursor ?? undefined,
        refetchOnWindowFocus: true,
        refetchInterval: pollMs,
        staleTime: pollMs / 2,
    });
    const broadcasts = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.broadcasts), [query.data]);
    // unread_count comes back on every page; the hub computes it globally, so the
    // last loaded page reflects current truth.
    const unreadCount = query.data?.pages?.[query.data.pages.length - 1]?.unread_count ?? 0;
    return {
        broadcasts,
        unreadCount,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        fetchNextPage: query.fetchNextPage,
        hasNextPage: query.hasNextPage ?? false,
        refetch: query.refetch,
        error: query.error,
    };
}
/** Returns the broadcast that should appear in the top banner (or null). */
export function useImportantBanner() {
    const { broadcasts } = useBroadcastInbox();
    return useMemo(() => pickBannerBroadcast(broadcasts), [broadcasts]);
}
/** Returns first-login modal broadcasts in display order (oldest first). */
export function useFirstLoginModals() {
    const { broadcasts } = useBroadcastInbox();
    return useMemo(() => pickModalQueue(broadcasts), [broadcasts]);
}
/**
 * Patches every cached inbox query under this provider's basePath (covers all
 * unreadOnly/pageSize variants). Returns a list of snapshots so onError can roll
 * back if the server write fails.
 */
function patchAllInboxCaches(qc, basePath, broadcastId, patch) {
    const entries = qc.getQueriesData({ queryKey: inboxQueryKeyPrefix(basePath) });
    const snapshots = [];
    for (const [key, data] of entries) {
        snapshots.push({ key, data });
        if (!data)
            continue;
        let unreadDelta = 0;
        const pages = data.pages.map((p) => ({
            ...p,
            broadcasts: p.broadcasts.map((b) => {
                if (b.id !== broadcastId)
                    return b;
                if (patch.read_at && b.read_at === null && patch.read_at !== null)
                    unreadDelta -= 1;
                return { ...b, ...patch };
            }),
        }));
        if (unreadDelta !== 0) {
            // The hub computes unread_count globally, but we adjust the local cache so
            // the badge reflects the click instantly. Next refetch reconciles to truth.
            const last = pages[pages.length - 1];
            if (last) {
                pages[pages.length - 1] = { ...last, unread_count: Math.max(0, last.unread_count + unreadDelta) };
            }
        }
        qc.setQueryData(key, { ...data, pages });
    }
    return snapshots;
}
function rollbackInboxCaches(qc, snapshots) {
    for (const snap of snapshots)
        qc.setQueryData(snap.key, snap.data);
}
/**
 * Wraps a write API that returns boolean into one that throws on false. This
 * lets us reuse TanStack Query's onError handler for rollback in a uniform way.
 */
async function expectOk(p) {
    const ok = await p;
    if (!ok)
        throw new Error("hub_write_failed");
    return true;
}
export function useMarkRead() {
    const ctx = useBroadcastContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (broadcastId) => expectOk(apiMarkRead({ basePath: ctx.basePath, onSessionExpired: ctx.onSessionExpired }, broadcastId)),
        onMutate: async (broadcastId) => {
            // Cancel in-flight queries so they don't overwrite the optimistic patch.
            await qc.cancelQueries({ queryKey: inboxQueryKeyPrefix(ctx.basePath) });
            return patchAllInboxCaches(qc, ctx.basePath, broadcastId, { read_at: new Date().toISOString() });
        },
        onError: (_err, _id, snapshots) => {
            if (snapshots)
                rollbackInboxCaches(qc, snapshots);
        },
        onSettled: () => {
            // Reconcile with server truth on the next idle tick.
            qc.invalidateQueries({ queryKey: inboxQueryKeyPrefix(ctx.basePath), refetchType: "none" });
        },
    });
}
export function useMarkModalShown() {
    const ctx = useBroadcastContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (broadcastId) => expectOk(apiMarkModalShown({ basePath: ctx.basePath, onSessionExpired: ctx.onSessionExpired }, broadcastId)),
        onMutate: async (broadcastId) => {
            await qc.cancelQueries({ queryKey: inboxQueryKeyPrefix(ctx.basePath) });
            return patchAllInboxCaches(qc, ctx.basePath, broadcastId, { modal_shown_at: new Date().toISOString() });
        },
        onError: (_err, _id, snapshots) => {
            if (snapshots)
                rollbackInboxCaches(qc, snapshots);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: inboxQueryKeyPrefix(ctx.basePath), refetchType: "none" });
        },
    });
}
/** Bulk-mark every currently-loaded unread broadcast as read. */
export function useMarkAllRead() {
    const { broadcasts } = useBroadcastInbox();
    const markRead = useMarkRead();
    return useMutation({
        mutationFn: async () => {
            const unread = broadcasts.filter((b) => b.read_at === null);
            // Sequential to avoid hammering the satellite proxy. We swallow per-item
            // failures so a single bad broadcast doesn't abort the bulk operation —
            // each individual markRead still rolls back its own optimistic patch via
            // its onError handler.
            for (const b of unread) {
                try {
                    await markRead.mutateAsync(b.id);
                }
                catch {
                    /* per-item failure already rolled back by useMarkRead.onError */
                }
            }
        },
    });
}
