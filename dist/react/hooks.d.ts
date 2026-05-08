import { type InfiniteData, type QueryKey } from "@tanstack/react-query";
import type { InboxBroadcast, InboxResponse } from "../types.js";
interface InboxPage extends InboxResponse {
}
/**
 * Paginated inbox query. Returns all loaded broadcasts as a flat list plus the
 * unread_count from the first page (the hub returns the global unread count, not
 * a per-page count, so subsequent pages overwrite it without harm).
 */
export declare function useBroadcastInbox(opts?: {
    unreadOnly?: boolean;
    pageSize?: number;
}): {
    broadcasts: InboxBroadcast[];
    unreadCount: number;
    isLoading: boolean;
    isFetching: boolean;
    fetchNextPage: (options?: import("@tanstack/react-query").FetchNextPageOptions) => Promise<import("@tanstack/react-query").InfiniteQueryObserverResult<InfiniteData<InboxPage, unknown>, Error>>;
    hasNextPage: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<InfiniteData<InboxPage, unknown>, Error>>;
    error: Error | null;
};
/** Returns the broadcast that should appear in the top banner (or null). */
export declare function useImportantBanner(): InboxBroadcast | null;
/** Returns first-login modal broadcasts in display order (oldest first). */
export declare function useFirstLoginModals(): InboxBroadcast[];
interface CacheSnapshot {
    key: QueryKey;
    data: InfiniteData<InboxPage> | undefined;
}
export declare function useMarkRead(): import("@tanstack/react-query").UseMutationResult<true, Error, string, CacheSnapshot[]>;
export declare function useMarkModalShown(): import("@tanstack/react-query").UseMutationResult<true, Error, string, CacheSnapshot[]>;
/** Bulk-mark every currently-loaded unread broadcast as read. */
export declare function useMarkAllRead(): import("@tanstack/react-query").UseMutationResult<void, Error, void, unknown>;
export {};
