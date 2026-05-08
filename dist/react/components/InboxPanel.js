import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Scrollable inbox panel. Pinned items first, then sent_at DESC. Cards show avatar
// (the satellite's local logo from BroadcastProvider.appLogoSrc), sender name, title,
// truncated body, severity stripe, "to you" tag, and read/unread visual differentiation.
// Spec Part III §2 (line 262).
import { useBroadcastContext } from "../provider.js";
import { useBroadcastInbox, useMarkAllRead, useMarkRead } from "../hooks.js";
const SEVERITY_COLOR = {
    info: "#9ca3af",
    notice: "#3b82f6",
    important: "#f59e0b",
};
function formatRelative(iso) {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const min = Math.floor(diff / 60000);
    if (min < 1)
        return "just now";
    if (min < 60)
        return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)
        return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30)
        return `${day}d ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12)
        return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
}
export function InboxPanel({ onClose }) {
    const ctx = useBroadcastContext();
    const { broadcasts, unreadCount, isLoading, fetchNextPage, hasNextPage } = useBroadcastInbox();
    const markRead = useMarkRead();
    const markAllRead = useMarkAllRead();
    return (_jsxs(_Fragment, { children: [_jsxs("header", { style: {
                    padding: "12px 16px",
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#fafafa",
                }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 14 }, children: "Notifications" }), _jsxs("div", { style: { display: "flex", gap: 12, alignItems: "center" }, children: [unreadCount > 0 && (_jsx("button", { type: "button", onClick: () => markAllRead.mutate(), disabled: markAllRead.isPending, style: {
                                    background: "transparent",
                                    border: "none",
                                    color: "#2563eb",
                                    fontSize: 12,
                                    cursor: "pointer",
                                    padding: 0,
                                }, children: "Mark all as read" })), onClose && (_jsx("button", { type: "button", onClick: onClose, "aria-label": "Close", style: { background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "#6b7280", padding: 0, lineHeight: 1 }, children: "\u00D7" }))] })] }), _jsxs("div", { style: { flex: 1, overflowY: "auto" }, children: [isLoading && broadcasts.length === 0 && (_jsx("div", { style: { padding: 24, textAlign: "center", color: "#6b7280", fontSize: 13 }, children: "Loading\u2026" })), !isLoading && broadcasts.length === 0 && (_jsxs("div", { style: { padding: 32, textAlign: "center", color: "#6b7280" }, children: [_jsx("div", { style: { fontSize: 32, marginBottom: 8 }, children: "\u2713" }), _jsx("div", { style: { fontSize: 13 }, children: "You\u2019re all caught up" })] })), broadcasts.map((b) => (_jsx(Card, { broadcast: b, appLogoSrc: ctx.appLogoSrc, onOpen: () => {
                            if (b.read_at === null)
                                markRead.mutate(b.id);
                        } }, b.id))), hasNextPage && (_jsx("div", { style: { padding: 12, textAlign: "center" }, children: _jsx("button", { type: "button", onClick: () => fetchNextPage(), style: {
                                background: "transparent",
                                border: "1px solid #e5e7eb",
                                borderRadius: 6,
                                padding: "6px 12px",
                                fontSize: 12,
                                cursor: "pointer",
                                color: "#374151",
                            }, children: "Load more" }) }))] })] }));
}
function Card({ broadcast: b, appLogoSrc, onOpen, }) {
    const isUnread = b.read_at === null;
    const stripe = SEVERITY_COLOR[b.severity];
    return (_jsxs("div", { onClick: onOpen, style: {
            display: "flex",
            gap: 10,
            padding: "12px 14px",
            borderBottom: "1px solid #f3f4f6",
            background: isUnread ? "#eff6ff" : "white",
            cursor: "pointer",
            position: "relative",
        }, children: [_jsx("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: stripe }, "aria-hidden": "true" }), _jsx("div", { style: { flexShrink: 0, width: 32, height: 32, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }, children: appLogoSrc ? (_jsx("img", { src: appLogoSrc, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" } })) : (_jsx("span", { style: { fontSize: 14, color: "#9ca3af" }, children: "\u2022" })) }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }, children: [b.pinned && _jsx("span", { title: "Pinned", style: { fontSize: 11 }, children: "\uD83D\uDCCC" }), _jsx("div", { style: { fontSize: 12, color: "#6b7280", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: b.displayed_sender }), b.audience_label === "to you" && (_jsx("span", { style: {
                                    fontSize: 10,
                                    background: "#dbeafe",
                                    color: "#1e40af",
                                    padding: "1px 6px",
                                    borderRadius: 10,
                                    fontWeight: 500,
                                }, children: "To you" }))] }), _jsx("div", { style: { fontWeight: 600, fontSize: 14, marginBottom: 2, color: "#111827" }, children: b.title }), _jsx("div", { style: {
                            fontSize: 13,
                            color: "#374151",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            lineHeight: 1.4,
                        }, children: b.body }), _jsxs("div", { style: { display: "flex", gap: 12, marginTop: 4, alignItems: "center" }, children: [_jsx("span", { style: { fontSize: 11, color: "#9ca3af" }, children: formatRelative(b.sent_at) }), b.link_url && (_jsx("a", { href: b.link_url, onClick: (e) => e.stopPropagation(), target: "_blank", rel: "noopener noreferrer", style: { fontSize: 11, color: "#2563eb", textDecoration: "none" }, children: "Read more \u2192" }))] })] })] }));
}
