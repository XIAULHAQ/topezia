"use client";

/** Share the public profile — native share sheet if available, else copy link. */
import { useState } from "react";
import type { CSSProperties } from "react";

export default function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Topezia profile", url });
        return;
      }
    } catch { /* user dismissed the share sheet — fall through to copy */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — nothing else we can do */ }
  }

  return (
    <button onClick={share} style={S.btn}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8h16v-8" /><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /></svg>
      {copied ? "Link copied!" : "Share profile"}
    </button>
  );
}

const S: Record<string, CSSProperties> = {
  btn: { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", borderRadius: 11, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Sora', system-ui, sans-serif" },
};
