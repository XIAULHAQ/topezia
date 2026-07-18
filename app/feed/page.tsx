"use client";

/**
 * Screen B — the feed (spec §6.2), redesigned onto the global AppShell.
 * Honest, explained job matches: match ring, have/gap skill chips, a why-line,
 * freshness stamp, and a tracked View/Apply click-out. The dark hero shows the
 * REAL "Where you stand" insights; the right rail mixes real panels (your
 * preferences, email alerts, strong-match count) with clearly-labelled
 * "Coming soon" panels for features we don't back with data yet.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/_components/AppShell";
import AlertCapture from "@/app/jobs/_components/AlertCapture";
import { C, GRAD, FONT, Icon, MatchRing, Card, SoonTag } from "@/app/_components/ui";

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

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

const REGION_LABEL: Record<string, string> = {
  GLOBAL: "Anywhere", EMEA: "EMEA", APAC: "APAC", LATAM: "LatAm", ANZ: "ANZ",
  EUROPE: "Europe", NORTH_AMERICA: "North America",
};

function placeLabel(m: Match): string {
  if (m.remoteType === "ONSITE" || m.remoteType === "HYBRID") {
    return m.locationState || REGION_LABEL[m.remoteScope ?? ""] || m.country || label(m.remoteType);
  }
  const scope = m.remoteScope;
  if (!scope) return "Remote";
  if (scope === "US") return "Remote (US)";
  return `Remote (${REGION_LABEL[scope] ?? scope})`;
}

function freshHours(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6));
}
function freshness(iso: string): string {
  const h = freshHours(iso);
  if (h < 1) return "just now";
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function fmtSalary(m: Match): string | null {
  if (m.salaryMin == null && m.salaryMax == null) return null;
  const per = m.salaryPeriod === "HOUR" ? "/hr" : m.salaryPeriod === "PER_MILE" ? "/mi" : m.salaryPeriod === "DAY" ? "/day" : "/yr";
  const k = (n: number) => (m.salaryPeriod === "YEAR" && n >= 1000 ? `${Math.round(n / 1000)}k` : `${n.toLocaleString()}`);
  const lo = m.salaryMin, hi = m.salaryMax;
  if (lo != null && hi != null) return `$${k(lo)}–${k(hi)}${per}`;
  return `$${k((lo ?? hi)!)}${per}`;
}
function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

interface FeedInsights {
  fieldLabel: string | null;
  targetJobs: number;
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null;
  skillGaps: { skill: string; pct: number; youHave: string | null }[];
  reliable: boolean;
}
interface Prefs {
  fullName: string | null;
  headline: string | null;
  remoteTypes: string[];
  locations: string[];
  salaryFloor: number | null;
  salaryTarget: number | null;
  salaryPeriod: string | null;
}

export default function FeedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<{ strong: number; totalLive: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("All matches");
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [alert, setAlert] = useState<{ slug: string; place?: string; label: string } | null>(null);
  const [insights, setInsights] = useState<FeedInsights | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  async function toggleSave(jobId: string) {
    const wasSaved = saved.has(jobId);
    setSaved((prev) => { const n = new Set(prev); wasSaved ? n.delete(jobId) : n.add(jobId); return n; });
    try {
      if (wasSaved) await fetch(`/api/saves?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE" });
      else await fetch("/api/saves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
    } catch {
      setSaved((prev) => { const n = new Set(prev); wasSaved ? n.add(jobId) : n.delete(jobId); return n; }); // revert
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/profile/insights");
        if (r.ok) setInsights((await r.json()).insights ?? null);
      } catch { /* optional */ }
    })();
    (async () => {
      try {
        const r = await fetch("/api/saves");
        if (r.ok) setSaved(new Set(((await r.json()).jobs ?? []).map((j: { jobId: string }) => j.jobId)));
      } catch { /* optional */ }
    })();
    (async () => {
      try {
        const r = await fetch("/api/profile");
        if (r.ok) {
          const d = await r.json();
          const p = d.profile;
          if (p) setPrefs({ fullName: p.fullName, headline: p.headline, remoteTypes: p.remoteTypes ?? [], locations: p.locations ?? [], salaryFloor: p.salaryFloor, salaryTarget: p.salaryTarget, salaryPeriod: p.salaryPeriod });
        }
      } catch { /* optional */ }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/matches");
        if (res.status === 401) { router.replace("/onboard"); return; }
        if (!res.ok) throw new Error(`server ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setMatches(data.matches || []);
        setStats(data.stats || null);
        setAlert(data.alert ?? null);
        setLoading(false);

        if (data.pending) {
          setEnriching(true);
          try {
            const r2 = await fetch("/api/matches/rerank", { method: "POST" });
            if (r2.ok) {
              const d2 = await r2.json();
              if (!cancelled) { setMatches(d2.matches || []); setStats(d2.stats || null); }
            } else if (!cancelled) {
              setMatches((prev) => prev.map((m) => ({ ...m, pending: false })));
            }
          } catch {
            if (!cancelled) setMatches((prev) => prev.map((m) => ({ ...m, pending: false })));
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
    return () => { cancelled = true; };
  }, [router]);

  const statsReady = stats !== null && !enriching && !matches.some((m) => m.pending);
  const shown = matches.filter((m) => {
    if (filter === "Remote") return m.remoteType.startsWith("REMOTE");
    if (filter === "Hourly") return m.salaryPeriod === "HOUR" || m.employmentType === "HOURLY";
    if (filter === "Saved") return saved.has(m.jobId);
    return true;
  });
  const topId = matches.filter((m) => !m.pending).sort((a, b) => b.score - a.score)[0]?.jobId;
  const name = (prefs?.fullName ?? "").split(/\s+/)[0] || "there";

  if (error) {
    return (
      <AppShell>
        <div style={{ textAlign: "center", padding: "80px 16px", color: C.mut }}>
          <p style={{ marginBottom: 20 }}>{error}</p>
          <button style={{ padding: "12px 24px", background: GRAD, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: FONT }} onClick={() => window.location.reload()}>Try again</button>
        </div>
      </AppShell>
    );
  }
  if (loading) {
    return (
      <AppShell>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <div style={{ textAlign: "center", padding: "100px 16px" }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${C.line}`, borderTopColor: C.c1, borderRadius: "50%", margin: "0 auto 20px", animation: "spin .8s linear infinite" }} />
          <p style={{ color: C.mut }}>Reading thousands of jobs, scoring your fit…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}"}</style>
      <div style={{ display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ── Main column ── */}
        <div style={{ flex: "1 1 480px", minWidth: 0 }}>
          {/* Dark hero — greeting + REAL "where you stand" insights */}
          <section style={S.hero}>
            <div style={S.heroGlow} />
            <div style={{ position: "relative" }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.4px" }}>{greeting()}, {name} 👋</h1>
              {insights && insights.reliable ? (
                <>
                  <div style={S.eyebrow}>Where you stand · you against {insights.targetJobs} {insights.fieldLabel ?? "roles"}</div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
                    <div style={S.heroStat}><div style={S.heroNum}>{insights.coveragePct ?? "—"}%</div><div style={S.heroSub}>of the skills your field asks for, you already have</div></div>
                    {insights.seniority && (
                      <div style={S.heroStat}><div style={S.heroNum}>{insights.seniority.atOrAbove}</div><div style={S.heroSub}>roles at or above your level ({label(insights.seniority.level)}); {insights.seniority.below} below</div></div>
                    )}
                    {insights.skillGaps[0] && (
                      <div style={S.heroStat}><div style={S.heroNum}>{insights.skillGaps[0].pct}%</div><div style={S.heroSub}>want {insights.skillGaps[0].skill}{insights.skillGaps[0].youHave ? ` — you're only ${insights.skillGaps[0].youHave.toLowerCase()}` : ", which you don't list"}</div></div>
                    )}
                  </div>
                  <a href="/profile" style={S.heroLink}>See your full breakdown and roadmap <Icon name="arrowR" size={14} /></a>
                </>
              ) : (
                <p style={{ margin: "12px 0 0", fontSize: 13, color: "#B9C0D4", lineHeight: 1.6, maxWidth: 520 }}>
                  {insights?.fieldLabel
                    ? <>Your market is still thin — only {insights.targetJobs} {insights.fieldLabel.replace(/ roles( \(broad\))?$/, "")} {insights.targetJobs === 1 ? "role is" : "roles are"} open to your region, too few for reliable stats yet. </>
                    : "We're scoring every live job against your résumé — real numbers, including the low ones. "}
                  <a href="/profile" style={{ ...S.heroLink, display: "inline", marginTop: 0 }}>More on your profile →</a>
                </p>
              )}
            </div>
          </section>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={filter === f ? S.pillOn : S.pillOff}>
                {f}{f === "All matches" ? ` · ${matches.length}` : ""}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.mut, fontWeight: 500 }}>
              <Icon name="sliders" size={14} />Sort: Best match <SoonTag />
            </div>
          </div>

          {enriching && (
            <div style={S.enriching}><span style={S.enrichDot} /> Scoring your fit and writing why-lines…</div>
          )}

          {shown.length === 0 && (
            <div style={S.empty}>{filter === "Saved" ? "Saving jobs is coming soon." : "No matches in this view yet — try “All matches”, or widen your preferences."}</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {shown.map((m, i) => {
              const sal = fmtSalary(m);
              const isNew = freshHours(m.lastVerifiedAt) < 24;
              const isTop = m.jobId === topId && !m.pending;
              return (
                <article key={m.jobId} style={S.card}>
                  {isTop && <div style={S.topRibbon}>TOP MATCH</div>}
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", paddingTop: isTop ? 10 : 0 }}>
                    <div style={{ ...S.logo, background: GRAD }}>{(m.company || "?")[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{m.title}</h2>
                        {isNew && <span style={S.newTag}>NEW</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.slate, fontWeight: 600, marginTop: 4 }}>{m.company}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: C.mut }}>
                        <span style={S.metaItem}><Icon name="pin" size={13} />{placeLabel(m)}</span>
                        <span style={S.metaItem}><Icon name="clock" size={13} />{label(m.employmentType)}</span>
                        {sal && <span style={{ ...S.metaItem, color: "#059669", fontWeight: 600 }}><Icon name="coins" size={13} />{sal}</span>}
                      </div>
                      {(m.matchedSkills.length > 0 || m.gapSkills.length > 0) && (
                        <div style={{ display: "flex", gap: 6, marginTop: 11, flexWrap: "wrap" }}>
                          {m.matchedSkills.slice(0, 4).map((t) => <span key={t} style={S.tagHave}>{t}</span>)}
                          {m.gapSkills.slice(0, 2).map((t) => <span key={t} style={S.tagGap}>{t}</span>)}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <MatchRing value={m.score} pending={m.pending} />
                        <div style={{ fontSize: 10.5, color: C.mut, width: 46, lineHeight: 1.35 }}>{m.pending ? "scoring…" : "match to you"}</div>
                      </div>
                      <div style={{ display: "flex", gap: 7 }}>
                        <div onClick={() => toggleSave(m.jobId)} title={saved.has(m.jobId) ? "Saved — click to remove" : "Save this job"} style={{ ...S.iconBtn, cursor: "pointer", ...(saved.has(m.jobId) ? { background: "#EEF2FF", color: C.c1, borderColor: "#C7D2FE" } : {}) }}>
                          <Icon name="bookmark" size={15} />
                        </div>
                        <a href={`/job/${m.jobId}?score=${m.score}&pos=${i + 1}`} style={S.applyBtn}>View job</a>
                      </div>
                    </div>
                  </div>
                  {(m.whyLine || m.pending) && (
                    <div style={S.cardFoot}>
                      <Icon name="spark" size={14} color={C.c1} />
                      <span style={{ flex: 1 }}>{m.pending ? "Scoring your fit…" : m.whyLine}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#059669" }}>● verified {freshness(m.lastVerifiedAt)}</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {/* ── Right rail ── */}
        <div style={S.rail}>
          {/* REAL: preferences */}
          <Card>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}>
              <h2 style={S.railH}>Your job preferences</h2><a href="/profile" style={S.railEdit}>Edit</a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5, color: C.slate }}>
              <PrefRow k="Role" v={prefs?.headline || "Not set yet"} />
              <PrefRow k="Work type" v={prefs && prefs.remoteTypes.length ? prefs.remoteTypes.map((r) => label(r)).join(", ") : "Open to all"} />
              <PrefRow k="Locations" v={prefs && prefs.locations.length ? prefs.locations.join(" · ") : "Anywhere eligible"} />
              <PrefRow k="Salary target" v={prefs?.salaryTarget ? `$${prefs.salaryTarget.toLocaleString()}${prefs.salaryPeriod === "HOUR" ? "/hr" : "/yr"}` : "—"} />
            </div>
          </Card>

          {/* REAL: email alert */}
          {alert ? (
            <AlertCapture slug={alert.slug} place={alert.place} label={alert.label} />
          ) : (
            <Card>
              <h2 style={S.railH}>Get matches by email</h2>
              <p style={S.railP}>Set your job title on your profile and we&apos;ll email new matching jobs as they land.</p>
              <a href="/profile" style={S.railEdit}>Set your role →</a>
            </Card>
          )}

          {/* REAL: honest strong-match count */}
          <Card>
            <h2 style={S.railH}>Right now</h2>
            <p style={{ fontSize: 16, margin: "6px 0 2px" }}>
              {statsReady
                ? <><b style={{ color: C.c1, fontWeight: 800 }}>{stats!.strong}</b> strong matches</>
                : <><b style={{ color: "#c7c7d1" }}>—</b> <span style={{ color: C.mut }}>counting…</span></>}
            </p>
            <p style={S.railP}>matched against {stats?.totalLive ?? 0} verified jobs open to you</p>
          </Card>

          {/* Dark AI coach tip — real gap data, learning path Soon */}
          <section style={S.coach}>
            <div style={S.coachGlow} />
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="spark" size={18} color="#fff" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>AI coach tip</h2>
            </div>
            <p style={{ position: "relative", margin: 0, fontSize: 12.5, lineHeight: 1.65, color: "#C7CEE4" }}>
              {insights?.skillGaps?.[0]
                ? <>Learning <strong style={{ color: "#fff" }}>{insights.skillGaps[0].skill}</strong> would line you up with the <strong style={{ color: "#4ADE80" }}>{insights.skillGaps[0].pct}%</strong> of roles in your field that ask for it.</>
                : <>Keep your skills current — as your profile sharpens, so do your matches.</>}
            </p>
            <div style={S.coachBtn}>Start learning path <SoonTag style={{ background: "rgba(255,255,255,.15)", color: "#fff", borderColor: "transparent" }} /></div>
          </section>

          {/* Coming soon: saved searches */}
          <Card style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}>
              <h2 style={S.railH}>Saved searches</h2><SoonTag label="Coming soon" />
            </div>
            <p style={{ ...S.railP, margin: 0 }}>Save a search and we&apos;ll keep it a click away, with fresh counts.</p>
          </Card>

          {/* Coming soon: recent history */}
          <Card>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}>
              <h2 style={S.railH}>Recent search history</h2><SoonTag label="Coming soon" />
            </div>
            <p style={{ ...S.railP, margin: 0 }}>Your recent searches will show up here so you can pick up where you left off.</p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function PrefRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: C.mut }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  hero: { background: C.navy, borderRadius: 18, padding: "24px 28px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 18 },
  heroGlow: { position: "absolute", top: -100, right: -40, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)" },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: "#A5B4FC", textTransform: "uppercase", marginTop: 14 },
  heroStat: { flex: 1, minWidth: 180, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" },
  heroNum: { fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" },
  heroSub: { fontSize: 12, color: "#B9C0D4", marginTop: 5, lineHeight: 1.5 },
  heroLink: { display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 13, fontWeight: 700, color: "#A5B4FC", textDecoration: "none" },
  pillOn: { padding: "8px 17px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: GRAD, color: "#fff", border: "1px solid transparent", boxShadow: "0 5px 14px rgba(99,102,241,.3)", fontFamily: FONT },
  pillOff: { padding: "8px 17px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: "#fff", color: C.slate, border: `1px solid ${C.line}`, fontFamily: FONT },
  enriching: { display: "flex", alignItems: "center", gap: 8, background: "#EEF2FF", color: C.c1, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginBottom: 14 },
  enrichDot: { width: 10, height: 10, borderRadius: "50%", background: C.c1, animation: "pulse 1s ease-in-out infinite", display: "inline-block" },
  empty: { background: "#fff", border: `1px dashed ${C.line}`, borderRadius: 16, padding: 32, textAlign: "center", color: C.mut, marginBottom: 14 },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 22px", position: "relative", overflow: "hidden" },
  topRibbon: { position: "absolute", top: 0, left: 0, background: GRAD, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: ".5px", padding: "4px 12px", borderRadius: "0 0 10px 0" },
  logo: { width: 48, height: 48, borderRadius: 13, color: "#fff", display: "grid", placeItems: "center", fontSize: 17, fontWeight: 800, flex: "none" },
  newTag: { background: "#EEF2FF", color: "#4F46E5", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 9px" },
  metaItem: { display: "inline-flex", alignItems: "center", gap: 5 },
  tagHave: { background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0", borderRadius: 7, padding: "3px 10px", fontSize: 10.5, fontWeight: 600 },
  tagGap: { background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A", borderRadius: 7, padding: "3px 10px", fontSize: 10.5, fontWeight: 600 },
  iconBtn: { width: 34, height: 34, border: `1px solid ${C.line}`, borderRadius: 9, display: "grid", placeItems: "center", color: C.mut, cursor: "default" },
  applyBtn: { background: GRAD, color: "#fff", borderRadius: 9, padding: "8px 17px", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" },
  cardFoot: { display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid #F1F5F9", fontSize: 11, color: C.mut },
  rail: { flex: "1 1 280px", maxWidth: 320, marginLeft: "auto", display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 20 },
  railH: { margin: 0, fontSize: 15, fontWeight: 700, flex: 1 },
  railEdit: { fontSize: 12, fontWeight: 600, color: C.c1, textDecoration: "none" },
  railP: { color: C.mut, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 4px" },
  coach: { background: `linear-gradient(160deg, ${C.navy}, ${C.navy2})`, borderRadius: 16, padding: "22px 24px", color: "#fff", position: "relative", overflow: "hidden" },
  coachGlow: { position: "absolute", top: -60, right: -60, width: 190, height: 190, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.35), transparent 70%)" },
  coachBtn: { position: "relative", marginTop: 14, background: GRAD, borderRadius: 10, padding: "10px", textAlign: "center", fontSize: 12.5, fontWeight: 600, cursor: "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
};
