// Top-of-page banner for unread `important` ecosystem-wide / app-wide broadcasts only.
// Never appears for user-specific broadcasts (spec §3.1 line 287). Dismissable per-user
// via sessionStorage so it doesn't reappear in the same session, but the broadcast
// stays in the inbox until the user opens it.

import { useEffect, useState } from "react";
import { useImportantBanner } from "../hooks.js";

const DISMISS_KEY_PREFIX = "broadcast.banner.dismissed.";

export interface BroadcastBannerProps {
  className?: string;
  onReadMore?: (broadcastId: string) => void;
}

export function BroadcastBanner({ className, onReadMore }: BroadcastBannerProps) {
  const broadcast = useImportantBanner();
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !broadcast) return;
    const flag = window.sessionStorage.getItem(DISMISS_KEY_PREFIX + broadcast.id);
    if (flag === "1") setDismissedId(broadcast.id);
  }, [broadcast]);

  if (!broadcast) return null;
  if (dismissedId === broadcast.id) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(DISMISS_KEY_PREFIX + broadcast.id, "1");
    }
    setDismissedId(broadcast.id);
  };

  const truncatedBody = broadcast.body.length > 140 ? broadcast.body.slice(0, 140).trim() + "…" : broadcast.body;

  return (
    <div
      role="alert"
      className={className}
      style={{
        background: "#fffbeb",
        borderBottom: "1px solid #fde68a",
        color: "#78350f",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16 }}>⚠</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontWeight: 600 }}>{broadcast.displayed_sender}:</strong>{" "}
        <strong style={{ fontWeight: 600 }}>{broadcast.title}</strong>
        {" — "}
        <span style={{ opacity: 0.85 }}>{truncatedBody}</span>
      </div>
      <button
        type="button"
        onClick={() => onReadMore?.(broadcast.id)}
        style={{
          background: "transparent",
          border: "1px solid #d97706",
          color: "#92400e",
          padding: "4px 10px",
          borderRadius: 4,
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Read more
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss banner"
        style={{
          background: "transparent",
          border: "none",
          color: "#92400e",
          fontSize: 18,
          cursor: "pointer",
          padding: "0 4px",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
