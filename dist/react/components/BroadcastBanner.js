import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Top-of-page banner for unread `important` ecosystem-wide / app-wide broadcasts only.
// Never appears for user-specific broadcasts (spec §3.1 line 287). Dismissable per-user
// via sessionStorage so it doesn't reappear in the same session, but the broadcast
// stays in the inbox until the user opens it.
import { useEffect, useState } from "react";
import { useImportantBanner } from "../hooks.js";
const DISMISS_KEY_PREFIX = "broadcast.banner.dismissed.";
export function BroadcastBanner({ className, onReadMore }) {
    const broadcast = useImportantBanner();
    const [dismissedId, setDismissedId] = useState(null);
    useEffect(() => {
        if (typeof window === "undefined" || !broadcast)
            return;
        const flag = window.sessionStorage.getItem(DISMISS_KEY_PREFIX + broadcast.id);
        if (flag === "1")
            setDismissedId(broadcast.id);
    }, [broadcast]);
    if (!broadcast)
        return null;
    if (dismissedId === broadcast.id)
        return null;
    const dismiss = () => {
        if (typeof window !== "undefined") {
            window.sessionStorage.setItem(DISMISS_KEY_PREFIX + broadcast.id, "1");
        }
        setDismissedId(broadcast.id);
    };
    const truncatedBody = broadcast.body.length > 140 ? broadcast.body.slice(0, 140).trim() + "…" : broadcast.body;
    return (_jsxs("div", { role: "alert", className: className, style: {
            background: "#fffbeb",
            borderBottom: "1px solid #fde68a",
            color: "#78350f",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
        }, children: [_jsx("span", { "aria-hidden": "true", style: { fontSize: 16 }, children: "\u26A0" }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("strong", { style: { fontWeight: 600 }, children: [broadcast.displayed_sender, ":"] }), " ", _jsx("strong", { style: { fontWeight: 600 }, children: broadcast.title }), " — ", _jsx("span", { style: { opacity: 0.85 }, children: truncatedBody })] }), _jsx("button", { type: "button", onClick: () => onReadMore?.(broadcast.id), style: {
                    background: "transparent",
                    border: "1px solid #d97706",
                    color: "#92400e",
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                }, children: "Read more" }), _jsx("button", { type: "button", onClick: dismiss, "aria-label": "Dismiss banner", style: {
                    background: "transparent",
                    border: "none",
                    color: "#92400e",
                    fontSize: 18,
                    cursor: "pointer",
                    padding: "0 4px",
                    lineHeight: 1,
                }, children: "\u00D7" })] }));
}
