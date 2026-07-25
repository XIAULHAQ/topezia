"use client";

/**
 * The sticky rail: Like, Save and Share.
 *
 * Like and Save are deliberately different things and sit next to each other
 * so the difference is visible: Save is a private bookmark (nobody is told),
 * Like is public appreciation with a count the creator can see.
 *
 * The count lives on this page only. It never orders the grid, never feeds
 * matching, and never appears on a profile — which is the line that keeps it
 * appreciation rather than a leaderboard, the thing that would push people to
 * post what performs instead of what represents them.
 *
 * NOTE: `position: sticky` belongs on the GRID ITEM in page.tsx, not here. A
 * sticky child can only travel inside its parent's box, and with
 * `align-items: start` that box is exactly the rail's own height — so sticking
 * it here looked correct and did nothing.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import { C, Icon } from "@/app/_components/ui";
import ShareMenu from "@/app/_components/ShareMenu";

export default function PortfolioRail({
  portfolioId,
  initialSaved,
  initialLiked,
  initialLikes,
  canAct,
  shareUrl,
  title,
}: {
  portfolioId: string;
  initialSaved: boolean;
  initialLiked: boolean;
  initialLikes: number;
  /** Signed in with a profile — both Like and Save need a real account. */
  canAct: boolean;
  shareUrl: string;
  title: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [busy, setBusy] = useState(false);

  const signIn = () => {
    window.location.href = `/login?next=${encodeURIComponent(new URL(shareUrl).pathname)}`;
  };

  async function toggleSave() {
    if (!canAct) return signIn();
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

  async function toggleLike() {
    if (!canAct) return signIn();
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1))); // optimistic
    setBusy(true);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/like`, { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error();
      // The server's total wins: someone else may have liked it since the
      // page was rendered, and an optimistic ±1 would then be quietly wrong.
      const d = await res.json().catch(() => null);
      if (d && typeof d.likes === "number") setLikes(d.likes);
    } catch {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.rail}>
      <button type="button" onClick={toggleLike} disabled={busy} style={liked ? S.btnLiked : S.btn} aria-pressed={liked}>
        <Icon name="heart" size={16} filled={liked} />
        {liked ? "Liked" : "Like"}
        {likes > 0 && <span style={liked ? S.countOn : S.count}>{likes}</span>}
      </button>

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

const baseBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit", width: "100%",
};

const S: Record<string, CSSProperties> = {
  rail: { display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" },
  btn: { ...baseBtn, border: `1px solid ${C.line}`, background: "#fff", color: C.slate },
  btnOn: { ...baseBtn, border: "1px solid #C7D2FE", background: "#EEF2FF", color: C.c1 },
  // Rose rather than the brand indigo: Like and Save are adjacent toggles, and
  // if "on" looked the same for both you could not tell at a glance which one
  // you had pressed.
  btnLiked: { ...baseBtn, border: "1px solid #FBCFE8", background: "#FDF2F8", color: "#BE185D" },
  count: { fontSize: 12.5, fontWeight: 700, color: C.mut, marginLeft: 2 },
  countOn: { fontSize: 12.5, fontWeight: 700, color: "#BE185D", marginLeft: 2 },
};
