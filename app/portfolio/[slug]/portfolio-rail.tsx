"use client";

/**
 * The sticky rail: Save and Share.
 *
 * Deliberately no appreciation/like count. That's a community-engagement
 * mechanic — it turns a portfolio into a popularity contest and pressures
 * people to post what performs rather than what represents them. Save is a
 * private bookmark and Share is a link; neither ranks anyone.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import { C, Icon } from "@/app/_components/ui";
import ShareMenu from "@/app/_components/ShareMenu";

export default function PortfolioRail({
  portfolioId,
  initialSaved,
  canSave,
  shareUrl,
  title,
}: {
  portfolioId: string;
  initialSaved: boolean;
  canSave: boolean;
  shareUrl: string;
  title: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggleSave() {
    if (!canSave) { window.location.href = `/login?next=${encodeURIComponent(new URL(shareUrl).pathname)}`; return; }
    const next = !saved;
    setSaved(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/save`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setSaved(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.rail}>
      <button type="button" onClick={toggleSave} disabled={busy} style={saved ? S.btnOn : S.btn} aria-pressed={saved}>
        <Icon name="bookmark" size={16} />
        {saved ? "Saved" : "Save"}
      </button>
      <ShareMenu url={shareUrl} title={title} buttonStyle={S.btn} wrapperStyle={{ display: "block", width: "100%" }}>
        <Icon name="share" size={16} />
        Share
      </ShareMenu>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  rail: { display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 90, alignItems: "stretch" },
  btn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    border: `1px solid ${C.line}`, background: "#fff", color: C.slate,
    borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", width: "100%",
  },
  btnOn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    border: "1px solid #C7D2FE", background: "#EEF2FF", color: C.c1,
    borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", width: "100%",
  },
};
