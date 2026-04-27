// Scrollable inbox panel. Pinned items first, then sent_at DESC. Cards show avatar
// (the satellite's local logo from BroadcastProvider.appLogoSrc), sender name, title,
// truncated body, severity stripe, "to you" tag, and read/unread visual differentiation.
// Spec Part III §2 (line 262).

import { useBroadcastContext } from "../provider.js";
import { useBroadcastInbox, useMarkAllRead, useMarkRead } from "../hooks.js";
import type { InboxBroadcast, Severity } from "../../types.js";

const SEVERITY_COLOR: Record<Severity, string> = {
  info: "#9ca3af",
  notice: "#3b82f6",
  important: "#f59e0b",
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export interface InboxPanelProps {
  onClose?: () => void;
}

export function InboxPanel({ onClose }: InboxPanelProps) {
  const ctx = useBroadcastContext();
  const { broadcasts, unreadCount, isLoading, fetchNextPage, hasNextPage } = useBroadcastInbox();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  return (
    <>
      <header
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14 }}>Notifications</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              style={{
                background: "transparent",
                border: "none",
                color: "#2563eb",
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Mark all as read
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "#6b7280", padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {isLoading && broadcasts.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280", fontSize: 13 }}>Loading…</div>
        )}
        {!isLoading && broadcasts.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 13 }}>You&rsquo;re all caught up</div>
          </div>
        )}
        {broadcasts.map((b) => (
          <Card
            key={b.id}
            broadcast={b}
            appLogoSrc={ctx.appLogoSrc}
            onOpen={() => {
              if (b.read_at === null) markRead.mutate(b.id);
            }}
          />
        ))}
        {hasNextPage && (
          <div style={{ padding: 12, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => fetchNextPage()}
              style={{
                background: "transparent",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                color: "#374151",
              }}
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Card({
  broadcast: b,
  appLogoSrc,
  onOpen,
}: {
  broadcast: InboxBroadcast;
  appLogoSrc?: string;
  onOpen: () => void;
}) {
  const isUnread = b.read_at === null;
  const stripe = SEVERITY_COLOR[b.severity];
  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        borderBottom: "1px solid #f3f4f6",
        background: isUnread ? "#eff6ff" : "white",
        cursor: "pointer",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: stripe }} aria-hidden="true" />
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {appLogoSrc ? (
          <img src={appLogoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 14, color: "#9ca3af" }}>•</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          {b.pinned && <span title="Pinned" style={{ fontSize: 11 }}>📌</span>}
          <div style={{ fontSize: 12, color: "#6b7280", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {b.displayed_sender}
          </div>
          {b.audience_label === "to you" && (
            <span
              style={{
                fontSize: 10,
                background: "#dbeafe",
                color: "#1e40af",
                padding: "1px 6px",
                borderRadius: 10,
                fontWeight: 500,
              }}
            >
              To you
            </span>
          )}
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, color: "#111827" }}>{b.title}</div>
        <div
          style={{
            fontSize: 13,
            color: "#374151",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.4,
          }}
        >
          {b.body}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{formatRelative(b.sent_at)}</span>
          {b.link_url && (
            <a
              href={b.link_url}
              onClick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#2563eb", textDecoration: "none" }}
            >
              Read more →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
