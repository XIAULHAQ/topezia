"use client";

/**
 * Screen B — the feed (spec §6.2).
 * Honest, explained job matches: big score, have/gap skill chips, a why-line,
 * freshness stamp, and a tracked View-job click-out. Low-score cards render
 * compact with a "Why low?" expander. Right rail = the whole profile surface.
 */
import { useEffect, useState } from "react";
import AlertCapture from "@/app/jobs/_components/AlertCapture";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Match = {
  jobId: string; title: string; company: string; verticalSlug: string; cardLayout: string;
  source: string; sourceUrl: string; remoteType: string; employmentType: string;
  country: string | null; remoteScope: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null;
  locationState: string | null; lastVerifiedAt: string; similarity: number; score: number;
  matchedSkills: string[]; gapSkills: string[]; whyLine: string; pending: boolean;
};

const FILTERS = ["All matches", "Remote", "Hourly", "Saved"] as const;
type Filter = (typeof FILTERS)[number];

const scoreColor = (s: number) => (s >= 80 ? "#059669" : s >= 70 ? INDIGO : s >= 50 ? "#d97706" : "#9ca3af");
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

const REGION_LABEL: Record<string, string> = {
  GLOBAL: "Anywhere", EMEA: "EMEA", APAC: "APAC", LATAM: "LatAm", ANZ: "ANZ",
  EUROPE: "Europe", NORTH_AMERICA: "North America",
};

/** Where a job actually is — "Remote (Poland)" beats a bare "Remote". */
function placeLabel(m: Match): string {
  if (m.remoteType === "ONSITE" || m.remoteType === "HYBRID") {
    return m.locationState || REGION_LABEL[m.remoteScope ?? ""] || m.country || label(m.remoteType);
  }
  const scope = m.remoteScope;
  if (!scope) return "Remote";
  if (scope === "US") return "Remote (US)";
  return `Remote (${REGION_LABEL[scope] ?? scope})`;
}

function freshness(iso: string): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6));
  if (h < 1) return "verified live just now";
  if (h < 48) return `verified live ${h}h ago`;
  return `verified ${Math.round(h / 24)}d ago`;
}

interface FeedInsights {
  fieldLabel: string | null;
  targetJobs: number;
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null;
  skillGaps: { skill: string; pct: number; youHave: string | null }[];
  reliable: boolean;
}

export default function FeedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<{ strong: number; totalLive: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("All matches");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [authed, setAuthed] = useState(true); // default true to avoid a flash of the save prompt
  const [alert, setAlert] = useState<{ slug: string; place?: string; label: string } | null>(null);
  const [insights, setInsights] = useState<FeedInsights | null>(null);

  useEffect(() => {
    // Insights power the "Where you stand" snapshot — optional, never blocks the feed.
    (async () => {
      try {
        const r = await fetch("/api/profile/insights");
        if (r.ok) setInsights((await r.json()).insights ?? null);
      } catch { /* optional */ }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Stage 1 — fast: jobs appear in ~2s with provisional scores.
        const res = await fetch("/api/matches");
        if (res.status === 401) {
          router.replace("/onboard");
          return;
        }
        if (!res.ok) throw new Error(`server ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setMatches(data.matches || []);
        setStats(data.stats || null);
        setAuthed(data.authed ?? false);
        setAlert(data.alert ?? null);
        setLoading(false);

        // Stage 2 — enrich the pending cards with real LLM scores + why-lines.
        if (data.pending) {
          setEnriching(true);
          try {
            const r2 = await fetch("/api/matches/rerank", { method: "POST" });
            if (r2.ok) {
              const d2 = await r2.json();
              if (!cancelled) {
                setMatches(d2.matches || []);
                setStats(d2.stats || null);
              }
            }
          } finally {
            if (!cancelled) setEnriching(false);
          }
        }
      } catch {
        if (cancelled) return;
        setError("Scoring your matches is taking longer than expected — the first load can be slow. Please try again.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <main style={S.page}>
        <div style={S.loadingWrap}>
          <div style={S.brand}>topezia</div>
          <p style={{ color: MUTED, margin: "20px 0" }}>{error}</p>
          <button style={S.retry} onClick={() => window.location.reload()}>Try again</button>
        </div>
      </main>
    );
  }

  // Until the rerank lands, every score is a provisional similarity number, so
  // "strong matches" would read 0 for reasons that have nothing to do with fit.
  const statsReady = stats !== null && !enriching && !matches.some((m) => m.pending);

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
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}"}</style>
      <header style={S.topbar}>
        <div style={S.brand}>topezia</div>
        <div style={S.refine} title="Conversational refine — coming soon" aria-disabled="true">
          <span style={S.refineText}>Refine — e.g. &quot;more remote, less agency work&quot;</span>
          <span style={S.soon}>Soon</span>
        </div>
        <nav style={S.navLinks}>
          <a href="/profile" style={S.navLink}>Profile</a>
          <a href="/settings" style={S.navLink}>Settings</a>
          {authed ? (
            <a href="/profile" style={{ ...S.avatar, textDecoration: "none" }}>You</a>
          ) : (
            <a href="/login" style={S.saveBtn}>Save matches →</a>
          )}
        </nav>
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

          {insights && insights.reliable && (
            <div style={S.stand}>
              <div style={S.standHead}>Where you stand · you against {insights.targetJobs} {insights.fieldLabel ?? "jobs"}</div>
              <div style={S.standGrid}>
                <div style={S.standStat}>
                  <div style={S.standNum}>{insights.coveragePct ?? "—"}%</div>
                  <div style={S.standLabel}>of the skills your field asks for, you already have</div>
                </div>
                {insights.seniority && (
                  <div style={S.standStat}>
                    <div style={S.standNum}>{insights.seniority.atOrAbove}</div>
                    <div style={S.standLabel}>roles at or above your level ({label(insights.seniority.level)}); {insights.seniority.below} below</div>
                  </div>
                )}
                <div style={S.standStat}>
                  <div style={S.standNum}>{insights.skillGaps[0].pct}%</div>
                  <div style={S.standLabel}>want {insights.skillGaps[0].skill}{insights.skillGaps[0].youHave ? ` — you're only ${insights.skillGaps[0].youHave.toLowerCase()}` : ", which you don't list"}</div>
                </div>
              </div>
              <a href="/profile" style={S.standLink}>See your full breakdown and roadmap →</a>
            </div>
          )}
          {insights && !insights.reliable && insights.fieldLabel && (
            <div style={S.standThin}>
              Your market is still thin — only {insights.targetJobs} {insights.fieldLabel.replace(/ roles( \(broad\))?$/, "")} {insights.targetJobs === 1 ? "role is" : "roles are"} open to your region, too few for reliable stats yet. <a href="/profile" style={S.standLink}>More on your profile →</a>
            </div>
          )}

          {enriching && (
            <div style={S.enriching}>
              <span style={S.enrichDot} /> Scoring your fit and writing why-lines…
            </div>
          )}

          {shown.length === 0 && (
            <div style={S.empty}>
              {filter === "Saved" ? "Saving jobs is coming soon." : "No matches in this view yet — try “All matches”, or widen your preferences."}
            </div>
          )}

          {shown.map((m, i) => {
            const low = !m.pending && m.score < 70;
            const open = expanded[m.jobId];
            return (
              <div key={m.jobId} style={low && !open ? S.cardLow : S.card}>
                <div style={S.cardTop}>
                  <div style={{ flex: 1 }}>
                    <div style={S.jobTitle}>{m.title}</div>
                    <div style={S.jobMeta}>
                      {m.company} · {placeLabel(m)} · {label(m.employmentType)}
                    </div>
                  </div>
                  <div style={S.scoreBox}>
                    <div style={{ ...S.score, color: m.pending ? "#c7c7d1" : scoreColor(m.score) }}>{m.score}</div>
                    <div style={S.scoreLabel}>{m.pending ? "scoring…" : "match to your profile"}</div>
                  </div>
                </div>

                {m.pending ? (
                  <p style={S.scoring}>Scoring your fit…</p>
                ) : low && !open ? (
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
                  <a style={S.viewBtn} href={`/job/${m.jobId}?score=${m.score}&pos=${i + 1}`}>View job</a>
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
            <a style={S.railLink} href="/profile">Correct anything →</a>
          </div>
          {alert ? (
            <AlertCapture slug={alert.slug} place={alert.place} label={alert.label} />
          ) : (
            <div style={S.railCard}>
              <div style={S.railH}>Get matches by email</div>
              <p style={S.railP}>Set your job title on your profile and we&apos;ll email new matching jobs as they land.</p>
              <a style={S.railLink} href="/profile">Set your role →</a>
            </div>
          )}
          <div style={S.railCard}>
            <div style={S.railH}>Right now</div>
            <p style={S.railBig}>
              {statsReady
                ? <><b style={{ color: INDIGO }}>{stats!.strong}</b> strong matches</>
                : <><b style={S.railPending}>—</b> <span style={{ color: MUTED }}>counting strong matches…</span></>}
            </p>
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
  railPending: { color: "#c7c7d1" } as const,
  loadingWrap: { maxWidth: 640, margin: "0 auto", padding: "120px 16px", textAlign: "center" },
  spinner: { width: 36, height: 36, border: `3px solid #e2e2ea`, borderTopColor: INDIGO, borderRadius: "50%", margin: "20px auto", animation: "spin 0.8s linear infinite" },
  retry: { padding: "12px 24px", background: INDIGO, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO },
  topbar: { display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", background: "#fff", borderBottom: "1px solid #ececf2", position: "sticky", top: 0, zIndex: 10 },
  refine: { flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px 10px 14px", borderRadius: 999, border: "1px dashed #d4d4dc", fontSize: 14, background: "transparent", cursor: "default" },
  refineText: { color: "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  soon: { flexShrink: 0, fontSize: 11, fontWeight: 700, color: MUTED, background: "#ececf2", borderRadius: 999, padding: "2px 8px" },
  navLinks: { display: "flex", gap: 16, alignItems: "center" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: "#eef0ff", color: INDIGO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 },
  saveBtn: { padding: "9px 16px", background: INDIGO, color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" },
  body: { maxWidth: 1080, margin: "0 auto", padding: 24, display: "flex", gap: 24, alignItems: "flex-start" },
  feedCol: { flex: 1, minWidth: 0 },
  stand: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 18, marginBottom: 14 },
  standHead: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 12 },
  standGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 },
  standStat: { background: "#f7f7fb", borderRadius: 10, padding: 12 },
  standNum: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO },
  standLabel: { fontSize: 12, color: MUTED, lineHeight: 1.4, marginTop: 4 },
  standLink: { color: INDIGO, textDecoration: "none", fontSize: 14, fontWeight: 700 },
  standThin: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 16, marginBottom: 14, fontSize: 13, color: MUTED, lineHeight: 1.5 },
  pills: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  pillOn: { padding: "8px 14px", borderRadius: 999, border: `1px solid ${INDIGO}`, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { padding: "8px 14px", borderRadius: 999, border: "1px solid #d9d9e3", background: "#fff", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 14 },
  cardLow: { background: "#fbfbfd", border: "1px solid #f0f0f5", borderRadius: 16, padding: "14px 20px", marginBottom: 14, opacity: 0.92 },
  cardTop: { display: "flex", alignItems: "flex-start", gap: 12 },
  jobTitle: { fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 18 },
  jobMeta: { color: MUTED, fontSize: 14, marginTop: 3 },
  scoreBox: { display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", maxWidth: 96, flexShrink: 0 },
  score: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 30, lineHeight: 1 },
  scoreLabel: { fontSize: 11, color: MUTED, lineHeight: 1.3, marginTop: 3 },
  why: { fontSize: 15, lineHeight: 1.5, margin: "12px 0", color: "#374151" },
  scoring: { fontSize: 14, color: "#9ca3af", margin: "10px 0", fontStyle: "italic" },
  enriching: { display: "flex", alignItems: "center", gap: 8, background: "#eef0ff", color: INDIGO, padding: "10px 14px", borderRadius: 10, fontSize: 14, fontWeight: 600, marginBottom: 14 },
  enrichDot: { width: 10, height: 10, borderRadius: "50%", background: INDIGO, animation: "pulse 1s ease-in-out infinite", display: "inline-block" },
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
