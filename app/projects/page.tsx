"use client";

/**
 * /projects — the freelance-projects feed, separated from the jobs feed.
 *
 * Jobs and projects are different intents ("next career move" vs "earn this
 * week"), so each gets its own surface. Every capsule here re-queries the
 * server (kind/period/currency scope RETRIEVAL, not the fetched dozen —
 * filtering 12 cards client-side is how the old Projects pill ended up empty
 * for most users). Reranked results are cached per profile+job, so revisiting
 * a capsule is fast and free.
 *
 * Budgets display in the poster's real currency, never FX-converted; the
 * "USD only" capsule narrows for people who don't want to think in euros.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/_components/AppShell";
import { C, GRAD, FONT, Icon, MatchRing } from "@/app/_components/ui";
import { curSym } from "@/lib/currency";
import { fetchProfileShared } from "@/lib/fetch-profile";

type Match = {
  jobId: string; title: string; company: string; verticalSlug: string;
  kind: string; sourceUrl: string; employmentType: string;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string | null;
  lastVerifiedAt: string; score: number;
  matchedSkills: string[]; gapSkills: string[]; whyLine: string; pending: boolean;
};

const TYPE_FILTERS = ["All", "Hourly", "Fixed price"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

function fmtBudget(m: Match): string | null {
  if (m.salaryMin == null && m.salaryMax == null) return null;
  const sym = curSym(m.salaryCurrency);
  const per = m.salaryPeriod === "HOUR" ? "/hr" : " budget";
  const n = (x: number) => x.toLocaleString();
  if (m.salaryMin != null && m.salaryMax != null) return `${sym}${n(m.salaryMin)}–${n(m.salaryMax)}${per}`;
  return `${sym}${n((m.salaryMin ?? m.salaryMax)!)}${per}`;
}

function freshness(iso: string): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6));
  if (h < 1) return "just now";
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [usdOnly, setUsdOnly] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  // Saving was wired on the feed but never here, so projects could be found and
  // not kept. Same endpoint — a project IS a Job — and the same optimistic
  // update: flip immediately, revert only if the request fails.
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

  // Refetch whenever a capsule changes — the scope lives in the query string.
  useEffect(() => {
    let cancelled = false;
    // Existing saves, so an already-saved project renders filled instead of
    // looking unsaved until you click it. ?kind=PROJECT because this list only
    // ever shows projects.
    (async () => {
      try {
        // Same refresh-race guard as the feed: one authenticated request first,
        // shared in flight, so parallel calls cannot each rotate the token.
        await fetchProfileShared().catch(() => null);
        const r = await fetch("/api/saves?kind=PROJECT");
        if (r.ok && !cancelled) setSaved(new Set(((await r.json()).jobs ?? []).map((j: { jobId: string }) => j.jobId)));
      } catch { /* optional — the page works without it */ }
    })();

    (async () => {
      await fetchProfileShared().catch(() => null);
      if (cancelled) return;
      setLoading(true); setError(false);
      const qs = new URLSearchParams({ kind: "PROJECT" });
      if (typeFilter === "Hourly") qs.set("period", "HOUR");
      if (typeFilter === "Fixed price") qs.set("period", "PROJECT");
      if (usdOnly) qs.set("currency", "USD");
      try {
        const res = await fetch(`/api/matches?${qs}`);
        if (res.status === 401) { router.replace("/onboard"); return; }
        if (!res.ok) throw new Error(`server ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setMatches(data.matches || []);
        setLoading(false);
        if (data.pending) {
          try {
            const r2 = await fetch(`/api/matches/rerank?${qs}`, { method: "POST" });
            if (r2.ok && !cancelled) setMatches((await r2.json()).matches || []);
            else if (!cancelled) setMatches((prev) => prev.map((m) => ({ ...m, pending: false })));
          } catch {
            if (!cancelled) setMatches((prev) => prev.map((m) => ({ ...m, pending: false })));
          }
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [typeFilter, usdOnly, router]);

  return (
    <AppShell>
      <style>{"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}"}</style>
      <div style={{ maxWidth: 860 }}>
        <section style={S.hero}>
          <div style={S.heroGlow} />
          <div style={{ position: "relative" }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.4px" }}>Freelance projects</h1>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#B9C0D4", lineHeight: 1.6, maxWidth: 560 }}>
              Live projects from Freelancer.com, scored against your profile like everything else.
              You bid on their site — we never sit in between. Budgets shown in the client&apos;s own currency.
            </p>
          </div>
        </section>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
          {TYPE_FILTERS.map((f) => (
            <button key={f} onClick={() => setTypeFilter(f)} style={typeFilter === f ? S.pillOn : S.pillOff}>{f}</button>
          ))}
          <div style={{ width: 1, height: 22, background: C.line, margin: "0 4px" }} />
          <button onClick={() => setUsdOnly((v) => !v)} style={usdOnly ? S.pillOn : S.pillOff}>USD only</button>
          <div style={{ flex: 1 }} />
          {!loading && matches.length > 0 && (
            <span style={{ fontSize: 12, color: C.mut, fontWeight: 500 }}>{matches.length} projects</span>
          )}
        </div>

        {loading && <div style={S.empty}>Finding projects that fit your skills…</div>}
        {error && <div style={S.empty}>Couldn&apos;t load projects — try again in a moment.</div>}
        {!loading && !error && matches.length === 0 && (
          <div style={S.empty}>
            No live projects in this view yet — try widening the filters. Projects skew toward design,
            development, marketing and finance, and new ones arrive daily.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {matches.map((m, i) => {
            const budget = fmtBudget(m);
            return (
              <article key={m.jobId} style={S.card}>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ ...S.logo, background: GRAD }}>{(m.company || "?")[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{m.title}</h2>
                      <span style={S.typeTag}>{m.salaryPeriod === "HOUR" ? "HOURLY" : "FIXED PRICE"}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.slate, fontWeight: 600, marginTop: 4 }}>{m.company}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: C.mut }}>
                      <span style={S.metaItem}><Icon name="globe" size={13} />Remote (Anywhere)</span>
                      {budget && <span style={{ ...S.metaItem, color: "#059669", fontWeight: 600 }}><Icon name="coins" size={13} />{budget}</span>}
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
                      <div
                        onClick={() => toggleSave(m.jobId)}
                        title={saved.has(m.jobId) ? "Saved — click to remove" : "Save this project"}
                        style={{ ...S.iconBtn, cursor: "pointer", ...(saved.has(m.jobId) ? { background: "#EEF2FF", color: C.c1, borderColor: "#C7D2FE" } : {}) }}
                      >
                        <Icon name="bookmark" size={15} />
                      </div>
                      <a href={`/job/${m.jobId}?score=${m.score}&pos=${i + 1}`} style={S.applyBtn}>View &amp; bid</a>
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
    </AppShell>
  );
}

const S: Record<string, CSSProperties> = {
  hero: { background: C.navy, borderRadius: 18, padding: "24px 28px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 18 },
  heroGlow: { position: "absolute", top: -100, right: -40, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)", pointerEvents: "none" },
  pillOn: { background: GRAD, color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
  pillOff: { background: "#fff", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
  empty: { background: "#fff", border: `1.5px dashed ${C.line}`, borderRadius: 16, padding: "38px 24px", textAlign: "center", color: C.mut, fontSize: 14, marginBottom: 14 },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "18px 20px", position: "relative" },
  logo: { width: 44, height: 44, borderRadius: 12, color: "#fff", display: "grid", placeItems: "center", fontSize: 17, fontWeight: 700, flex: "none" },
  typeTag: { background: "#F5F3FF", color: "#7C3AED", border: "1px solid #DDD6FE", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" },
  metaItem: { display: "inline-flex", alignItems: "center", gap: 5 },
  tagHave: { background: "#ECFDF5", color: "#047857", fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 10px" },
  tagGap: { background: "#FFF7ED", color: "#C2410C", fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 10px" },
  iconBtn: { width: 34, height: 34, border: `1px solid ${C.line}`, borderRadius: 9, display: "grid", placeItems: "center", color: C.mut, flex: "none" },
  applyBtn: { background: GRAD, color: "#fff", borderRadius: 10, padding: "9px 18px", fontSize: 12.5, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(99,102,241,.25)" },
  cardFoot: { display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid #F1F5F9`, fontSize: 12, color: C.slate, lineHeight: 1.5, flexWrap: "wrap" },
};
