import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Shows one first-login modal at a time for broadcasts where first_login_modal=true
// and modal_shown_at is null. On dismiss, calls markModalShown and the next queued
// broadcast appears. Spec Part III §3.2 (line 287).
import { useEffect, useState } from "react";
import { useBroadcastContext } from "../provider.js";
import { useFirstLoginModals, useMarkModalShown } from "../hooks.js";
export function BroadcastModalQueue({ className }) {
    const queue = useFirstLoginModals();
    const markShown = useMarkModalShown();
    // Track which IDs we've dismissed locally during this render to avoid a flicker
    // between optimistic update and server reconciliation.
    const [dismissedIds, setDismissedIds] = useState(new Set());
    const next = queue.find((b) => !dismissedIds.has(b.id));
    // Reset dismissed set when the underlying queue resets to empty (e.g., on logout
    // or when the user navigates back after acknowledging everything).
    useEffect(() => {
        if (queue.length === 0 && dismissedIds.size > 0)
            setDismissedIds(new Set());
    }, [queue.length, dismissedIds.size]);
    if (!next)
        return null;
    const dismiss = () => {
        setDismissedIds((prev) => {
            const updated = new Set(prev);
            updated.add(next.id);
            return updated;
        });
        markShown.mutate(next.id);
    };
    return (_jsx(BroadcastModal, { broadcast: next, onAcknowledge: dismiss, className: className }));
}
function BroadcastModal({ broadcast, onAcknowledge, className }) {
    const ctx = useBroadcastContext();
    return (_jsx("div", { role: "dialog", "aria-modal": "true", "aria-labelledby": `broadcast-modal-title-${broadcast.id}`, className: className, style: {
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
        }, children: _jsxs("div", { style: {
                background: "white",
                borderRadius: 10,
                maxWidth: 460,
                width: "100%",
                padding: 24,
                boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }, children: [ctx.appLogoSrc && (_jsx("img", { src: ctx.appLogoSrc, alt: "", style: { width: 28, height: 28, borderRadius: 6, objectFit: "cover" } })), _jsx("div", { style: { fontSize: 13, color: "#6b7280" }, children: broadcast.displayed_sender })] }), _jsx("h2", { id: `broadcast-modal-title-${broadcast.id}`, style: { margin: "0 0 10px", fontSize: 18, fontWeight: 600, color: "#111827" }, children: broadcast.title }), _jsx("p", { style: { margin: 0, fontSize: 14, lineHeight: 1.5, color: "#374151", whiteSpace: "pre-wrap" }, children: broadcast.body }), broadcast.link_url && (_jsx("a", { href: broadcast.link_url, target: "_blank", rel: "noopener noreferrer", style: { display: "inline-block", marginTop: 12, fontSize: 13, color: "#2563eb", textDecoration: "none" }, children: "Read more \u2192" })), _jsx("div", { style: { marginTop: 20, display: "flex", justifyContent: "flex-end" }, children: _jsx("button", { type: "button", onClick: onAcknowledge, style: {
                            background: "#2563eb",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            padding: "8px 18px",
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: "pointer",
                        }, children: "Got it" }) })] }) }));
}
