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
  /**
   * Fired when the satellite proxy returns `401 {"error":"session_expired"}` from
   * any broadcast endpoint. Indicates the user's original 8h hub login window
   * (`originalLoginExp`, Stance 4 cap) has elapsed and cannot be renewed without
   * re-authentication at the hub.
   *
   * Recommended satellite handling:
   * ```tsx
   * onSessionExpired={() => {
   *   localStorage.removeItem("hub_token");
   *   window.location.href = `${import.meta.env.VITE_HUB_URL}/login?next=${
   *     encodeURIComponent(window.location.href)
   *   }`;
   * }}
   * ```
   *
   * Added in 1.1.0. Optional — if unset the SDK silently empties the bell on
   * `session_expired` (matching the pre-1.1.0 fallback behaviour, in which the
   * satellite's own auth-gate eventually catches the expired session on next
   * heartbeat). See `docs/broadcast-stance4-stabilization.md`.
   */
  onSessionExpired?: () => void;
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
