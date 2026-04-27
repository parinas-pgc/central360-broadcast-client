// React context for the broadcast SDK. Holds the satellite's proxy basePath and
// (optionally) the locally-bundled app logo URL used as the avatar on inbox cards
// (spec Part III §2 — "App's own locally-bundled logo. The hub does not return
// an avatar URL").

import { createContext, useContext, type ReactNode } from "react";

export interface BroadcastContextValue {
  /** Path where the satellite mounted createBroadcastProxyRouter, e.g. "/api/broadcasts". */
  basePath: string;
  /** URL of the satellite's own logo, used as the avatar on inbox cards. */
  appLogoSrc?: string;
  /** Display name of the satellite (e.g., "Hedgehog360"). Used in modal/banner fallbacks. */
  appName?: string;
  /** Polling interval in ms. Default: 5 * 60 * 1000 (spec §5 line 753 — "every 5 min"). */
  pollIntervalMs?: number;
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null);

export interface BroadcastProviderProps extends BroadcastContextValue {
  children: ReactNode;
}

export function BroadcastProvider({ children, ...value }: BroadcastProviderProps) {
  return <BroadcastContext.Provider value={value}>{children}</BroadcastContext.Provider>;
}

export function useBroadcastContext(): BroadcastContextValue {
  const ctx = useContext(BroadcastContext);
  if (!ctx) {
    throw new Error(
      "useBroadcastContext must be called inside <BroadcastProvider>. Wrap your app once near the root.",
    );
  }
  return ctx;
}
