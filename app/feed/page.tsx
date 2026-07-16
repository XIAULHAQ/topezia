"use client";

/**
 * Screen B — the feed (spec §6.2).
 * Honest, explained job matches: big score, have/gap skill chips, a why-line,
 * freshness stamp, and a tracked View-job click-out. Low-score cards render
 * compact with a "Why low?" expander. Right rail = the whole profile surface.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Match = {
  jobId: string; title: string; company: string; verticalSlug: string; cardLayout: string;
  source: string; sourceUrl: string; remoteType: string; employmentType: string;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null;
  locationState: string | null; lastVerifiedAt: string; similarity: number; score: number;
  matchedSkills: string[]; gapSkills: string[]; whyLine: string;
};

const FILTERS = ["All matches", "Remote", "Hourly", "Saved"] as const;
type Filter = (typeof FILTERS)[number];

const scoreColor = (s: number) => (s >= 80 ? "#059669" : s >= 70 ? INDIGO : s >= 50 ? "#d97706" : "#9ca3af");
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

function freshness(iso: string): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6));
  if (h < 1) return "verified live just now";
  if (h < 48) return `verified live ${h}h ago`;
  return `verified ${Math.round(h / 24)}d ago`;
}

export default function FeedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<{ strong: number; totalLive: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("All matches");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/matches");
      if (res.status === 401) {
        router.replace("/onboard");
        return;
      }
      const data = await res.json();
      setMatches(data.matches || []);
      setStats(data.stats || null);
      setLoading(false);
    })();
  }, [router]);

  const shown = matches.filter((m) => {
    if (filter === "Remote") return m.remoteType.startsWith("REMOTE");
    if (filter === "Hourly") return m.salaryPeriod === "HOUR" || m.employmentType === "HOURLY";
    if (filter === "Saved") return false; // saves not wired yet
    return true;
  });

  const topGaps = Object.entries(
    matches.flatMap((m) => m.gapSkills).reduce<Record<string, number>>((a, g) => ((a[g] = (a[g] || 0) + 1), a), {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (loading) {
    return (
      <main style={S.page}>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <div style={S.loadingWrap}>
          <div style={S.brand}>topezia</div>
          <div style={S.spinner} />
          <p style={{ color: MUTED }}>Reading thousands of jobs, scoring your fit…</p>
        </div>
      </main>
    );
  }

  return (
    <main style={S.page}>
      <header style={S.topbar}>
        <div style={S.brand}>topezia</div>
        <input style={S.refine} placeholder='Refine — e.g. "more remote, less agency work"' disabled title="Conversational refine — coming soon" />
        <div style={S.avatar}>You</div>
      </header>

      <div style={S.body}>
        <div style={S.feedCol}>
          <div style={S.pills}>
            {FILTERS.map((f) => (
              <button key={f} style={filter === f ? S.pillOn : S.pillOff} onClick={() => setFilter(f)}>
                {f}
                {f === "All matches" && ` · ${matches.length}`}
              </button>
            ))}
          </div>

          {shown.length === 0 && (
            <div style={S.empty}>
              {filter === "Saved" ? "Saving jobs is coming soon." : "No matches in this view yet — try “All matches”, or widen your preferences."}
            </div>
          )}

          {shown.map((m, i) => {
            const low = m.score < 70;
            const open = expanded[m.jobId];
            return (
              <div key={m.jobId} style={low && !open ? S.cardLow : S.card}>
                <div style={S.cardTop}>
                  <div style={{ flex: 1 }}>
                    <div style={S.jobTitle}>{m.title}</div>
                    <div style={S.jobMeta}>
                      {m.company} · {m.locationState || label(m.remoteType)} · {label(m.employmentType)}
                    </div>
                  </div>
                  <div style={{ ...S.score, color: scoreColor(m.score) }}>{m.score}</div>
                </div>

                {low && !open ? (
                  <button style={S.whyLow} onClick={() => setExpanded({ ...expanded, [m.jobId]: true })}>Why low?</button>
                ) : (
                  <>
                    {m.whyLine && <p style={S.why}>{m.whyLine}</p>}
                    <div style={S.chips}>
                      {m.matchedSkills.slice(0, 6).map((s) => (
                        <span key={s} style={S.chipHave}>{s}</span>
                      ))}
                      {m.gapSkills.slice(0, 4).map((s) => (
                        <span key={s} style={S.chipGap}>{s}</span>
                      ))}
                    </div>
                  </>
                )}

                <div style={S.cardFoot}>
                  <span style={S.fresh}>● {freshness(m.lastVerifiedAt)}</span>
                  <span style={S.via}>via {label(m.source)} → applies on company site</span>
                  <a style={S.viewBtn} href={`/go/${m.jobId}?score=${m.score}&pos=${i + 1}`} target="_blank" rel="noreferrer">View job</a>
                </div>
              </div>
            );
          })}
        </div>

        <aside style={S.rail}>
          <div style={S.railCard}>
            <div style={S.railH}>How Topezia reads you</div>
            <p style={S.railP}>
              We matched you against {stats?.totalLive ?? 0} verified live jobs using your skills and trajectory — real scores, including the low ones.
            </p>
            <a style={S.railLink} href="/onboard">Correct anything →</a>
          </div>
          <div style={S.railCard}>
            <div style={S.railH}>Right now</div>
            <p style={S.railBig}><b style={{ color: INDIGO }}>{stats?.strong ?? 0}</b> strong matches</p>
            <p style={S.railP}>over {stats?.totalLive ?? 0} verified jobs</p>
          </div>
          {topGaps.length > 0 && (
            <div style={S.railCard}>
              <div style={S.railH}>Unlock more matches</div>
              <p style={S.railP}>Skills that keep coming up as gaps:</p>
              <div style={S.chips}>
                {topGaps.map(([g, n]) => (
                  <span key={g} style={S.chipGap}>{g} · {n}</span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK },
  loadingWrap: { maxWidth: 640, margin: "0 auto", padding: "120px 16px", textAlign: "center" },
  spinner: { width: 36, height: 36, border: `3px solid #e2e2ea`, borderTopColor: INDIGO, borderRadius: "50%", margin: "20px auto", animation: "spin 0.8s linear infinite" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO },
  topbar: { display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", background: "#fff", borderBottom: "1px solid #ececf2", position: "sticky", top: 0, zIndex: 10 },
  refine: { flex: 1, padding: "10px 14px", borderRadius: 999, border: "1px solid #e2e2ea", fontSize: 14, fontFamily: "inherit", background: "#f7f7fb" },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: "#eef0ff", color: INDIGO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  body: { maxWidth: 1080, margin: "0 auto", padding: 24, display: "flex", gap: 24, alignItems: "flex-start" },
  feedCol: { flex: 1, minWidth: 0 },
  pills: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  pillOn: { padding: "8px 14px", borderRadius: 999, border: `1px solid ${INDIGO}`, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { padding: "8px 14px", borderRadius: 999, border: "1px solid #d9d9e3", background: "#fff", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 14 },
  cardLow: { background: "#fbfbfd", border: "1px solid #f0f0f5", borderRadius: 16, padding: "14px 20px", marginBottom: 14, opacity: 0.92 },
  cardTop: { display: "flex", alignItems: "flex-start", gap: 12 },
  jobTitle: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 18 },
  jobMeta: { color: MUTED, fontSize: 14, marginTop: 3 },
  score: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 30, lineHeight: 1 },
  why: { fontSize: 15, lineHeight: 1.5, margin: "12px 0", color: "#374151" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chipHave: { padding: "4px 9px", background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: 999, fontSize: 13, fontWeight: 600 },
  chipGap: { padding: "4px 9px", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", borderRadius: 999, fontSize: 13, fontWeight: 600 },
  whyLow: { marginTop: 8, background: "transparent", border: "none", color: INDIGO, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: 0, fontFamily: "inherit" },
  cardFoot: { display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap", fontSize: 13 },
  fresh: { color: "#059669", fontWeight: 600 },
  via: { color: MUTED, flex: 1, minWidth: 120 },
  viewBtn: { padding: "8px 16px", background: INDIGO, color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: 14 },
  empty: { background: "#fff", border: "1px dashed #d9d9e3", borderRadius: 16, padding: 32, textAlign: "center", color: MUTED },
  rail: { width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 88 },
  railCard: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 18 },
  railH: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 8 },
  railP: { color: MUTED, fontSize: 14, lineHeight: 1.5, margin: "0 0 8px" },
  railBig: { fontSize: 16, margin: "0 0 2px" },
  railLink: { color: INDIGO, fontWeight: 700, fontSize: 14, textDecoration: "none" },
};
