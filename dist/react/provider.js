import { jsx as _jsx } from "react/jsx-runtime";
// React context for the broadcast SDK. Holds the satellite's proxy basePath and
// (optionally) the locally-bundled app logo URL used as the avatar on inbox cards
// (spec Part III §2 — "App's own locally-bundled logo. The hub does not return
// an avatar URL").
import { createContext, useContext } from "react";
const BroadcastContext = createContext(null);
export function BroadcastProvider({ children, ...value }) {
    return _jsx(BroadcastContext.Provider, { value: value, children: children });
}
export function useBroadcastContext() {
    const ctx = useContext(BroadcastContext);
    if (!ctx) {
        throw new Error("useBroadcastContext must be called inside <BroadcastProvider>. Wrap your app once near the root.");
    }
    return ctx;
}
