"use client";

/**
 * Share the public profile. The menu carries an explicit "Copy link" — see
 * ShareMenu for why share-or-silently-copy wasn't enough.
 */
import type { CSSProperties } from "react";
import ShareMenu from "@/app/_components/ShareMenu";

export default function ShareButton({ url }: { url: string }) {
  return (
    <ShareMenu url={url} title="Topezia profile" tone="dark" buttonStyle={S.btn}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v8h16v-8" /><path d="M12 3v12" /><path d="M8 7l4-4 4 4" />
      </svg>
      Share profile
    </ShareMenu>
  );
}

const S: Record<string, CSSProperties> = {
  btn: {
    display: "inline-flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)",
    color: "#fff", borderRadius: 11, padding: "10px 18px",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: "var(--font-sora), system-ui, sans-serif",
  },
};
