"use client";

/**
 * Yoast-style green/yellow/red checklist, recomputed on every keystroke via
 * useMemo in the parent (pure text analysis — lib/blog/seo-analysis.ts — so
 * this never needs a server round-trip).
 */
import { useState, type CSSProperties } from "react";
import type { SeoCheck, SeoStatus } from "@/lib/blog/seo-analysis";

const DOT: Record<SeoStatus, string> = { good: "#16A34A", ok: "#D97706", bad: "#DC2626" };
const BG: Record<SeoStatus, string> = { good: "#F0FDF4", ok: "#FFFBEB", bad: "#FEF2F2" };

export default function SeoPanel({ checks }: { checks: SeoCheck[] }) {
  const [tab, setTab] = useState<"seo" | "readability">("seo");
  const group = checks.filter((c) => c.group === tab);
  const score = (g: "seo" | "readability") => {
    const items = checks.filter((c) => c.group === g);
    const good = items.filter((c) => c.status === "good").length;
    return items.length ? Math.round((good / items.length) * 100) : 0;
  };

  return (
    <div style={S.card}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setTab("seo")} style={tab === "seo" ? S.tabOn : S.tabOff}>
          SEO analysis · {score("seo")}%
        </button>
        <button type="button" onClick={() => setTab("readability")} style={tab === "readability" ? S.tabOn : S.tabOff}>
          Readability · {score("readability")}%
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {group.map((c) => (
          <div key={c.id} style={{ ...S.row, background: BG[c.status] }}>
            <span style={{ ...S.dot, background: DOT[c.status] }} />
            <span style={S.msg}>{c.message}</span>
          </div>
        ))}
        {group.length === 0 && <p style={S.empty}>Nothing to check yet.</p>}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 18, position: "sticky", top: 20 },
  tabOn: { background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tabOff: { background: "#F8FAFC", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  row: { display: "flex", alignItems: "flex-start", gap: 9, borderRadius: 10, padding: "9px 11px" },
  dot: { width: 8, height: 8, borderRadius: "50%", flex: "none", marginTop: 4 },
  msg: { fontSize: 12.5, lineHeight: 1.5, color: "#334155" },
  empty: { fontSize: 12.5, color: "#94A3B8" },
};
