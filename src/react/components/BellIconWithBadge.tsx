// Bell icon with numeric unread badge (caps at 99+). Click toggles the inbox panel.
// Spec Part III §2 — placement: top-right of app shell. Visible on every authed page.

import { useState } from "react";
import { useBroadcastInbox } from "../hooks.js";
import { InboxPanel } from "./InboxPanel.js";

export interface BellIconWithBadgeProps {
  className?: string;
  /** Custom click handler (e.g., to navigate to a full-page inbox view). */
  onClick?: () => void;
  /** Override the default popover panel with custom content. */
  renderPanel?: (close: () => void) => React.ReactNode;
}

export function BellIconWithBadge({ className, onClick, renderPanel }: BellIconWithBadgeProps) {
  const { unreadCount } = useBroadcastInbox();
  const [open, setOpen] = useState(false);
  const badge = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div style={{ position: "relative", display: "inline-block" }} className={className}>
      <button
        type="button"
        aria-label={`Notifications${badge ? ` (${unreadCount} unread)` : ""}`}
        onClick={() => {
          if (onClick) {
            onClick();
            return;
          }
          setOpen((o) => !o);
        }}
        style={{
          background: "transparent",
          border: "none",
          padding: 8,
          cursor: "pointer",
          position: "relative",
          color: "inherit",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badge && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              background: "#dc2626",
              color: "white",
              fontSize: 10,
              fontWeight: 600,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              padding: "0 4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {badge}
          </span>
        )}
      </button>
      {open && !onClick && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
            width: 380,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "70vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
          role="dialog"
          aria-label="Notifications"
        >
          {renderPanel ? renderPanel(() => setOpen(false)) : <InboxPanel onClose={() => setOpen(false)} />}
        </div>
      )}
    </div>
  );
}
