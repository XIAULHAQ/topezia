"use client";

/**
 * Client-side filter bar + sort + facet sidebar + company-grouped listing for
 * the redesigned /jobs/{slug} pages.
 *
 * Everything here operates on `jobs` as already loaded server-side (see
 * DISPLAY_TAKE in lib/seo/pages.ts) — no new API calls, no pagination beyond
 * what's already on the page. That means "N companies" and the facet counts
 * describe the loaded pool, not the true site-wide total; the section header
 * says so explicitly rather than implying completeness it can't back up.
 *
 * Salary bands only count yearly-USD postings (see salaryBandOf) — hourly
 * rates, project budgets and other currencies aren't force-converted into a
 * band, they're just left out of that one facet.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { SeoJob } from "@/lib/seo/pages";

/**
 * Everything a job card needs, and nothing it doesn't.
 *
 * `descriptionRaw` is deliberately absent. This is a client component, so every
 * field on this type is serialised into the RSC payload and shipped to the
 * browser — and descriptions average ~4KB of HTML each. At 150 jobs that was
 * ~600KB of payload for a field no card ever reads: /jobs/tech-software was
 * 1,888KB uncompressed. The JSON-LD does need the description, but that is
 * built server-side in SeoPageView from the full row before it is narrowed here.
 */
export type CardJob = Omit<SeoJob, "descriptionSnippet">;
import { placeLabel, salaryText, freshness, salaryBandOf, SALARY_BAND_ORDER, label } from "@/lib/seo/job-display";

type SortKey = "newest" | "salary" | "company";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";
const LINE = "#ececf2";

function timeValue(j: CardJob): number {
  return (j.postedAt ?? j.lastVerifiedAt).getTime();
}

export default function JobsInteractive({
  jobs,
  poolLabel,
  matchGate,
  alertSlot,
}: {
  jobs: CardJob[];
  /** What to call this pool in the "showing N of M" line, e.g. "Backend Engineer". */
  poolLabel: string;
  matchGate?: ReactNode;
  alertSlot?: ReactNode;
}) {
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [postedWeek, setPostedWeek] = useState(false);
  const [hasSalary, setHasSalary] = useState(false);
  const [fullTimeOnly, setFullTimeOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [pickedCompanies, setPickedCompanies] = useState<Set<string>>(new Set());
  const [pickedLocations, setPickedLocations] = useState<Set<string>>(new Set());
  const [pickedBands, setPickedBands] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  }

  // Facet option lists come from the FULL loaded pool, not the filtered
  // result — counts stay stable reference points while you check boxes,
  // which is the simpler and more predictable of the two common facet UX
  // patterns (the other being counts that shrink as you narrow).
  const companyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) counts.set(j.companyName, (counts.get(j.companyName) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [jobs]);

  const locationOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const p = placeLabel(j);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [jobs]);

  const bandOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const band = salaryBandOf(j);
      if (band) counts.set(band, (counts.get(band) ?? 0) + 1);
    }
    return SALARY_BAND_ORDER.filter((b) => counts.has(b)).map((b) => [b, counts.get(b)!] as const);
  }, [jobs]);

  const filtered = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return jobs.filter((j) => {
      if (remoteOnly && !j.remoteType.startsWith("REMOTE")) return false;
      if (postedWeek && timeValue(j) < weekAgo) return false;
      if (hasSalary && salaryText(j) == null) return false;
      if (fullTimeOnly && j.employmentType !== "FULL_TIME") return false;
      if (pickedCompanies.size > 0 && !pickedCompanies.has(j.companyName)) return false;
      if (pickedLocations.size > 0 && !pickedLocations.has(placeLabel(j))) return false;
      if (pickedBands.size > 0) {
        const band = salaryBandOf(j);
        if (!band || !pickedBands.has(band)) return false;
      }
      return true;
    });
  }, [jobs, remoteOnly, postedWeek, hasSalary, fullTimeOnly, pickedCompanies, pickedLocations, pickedBands]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "newest") arr.sort((a, b) => timeValue(b) - timeValue(a));
    else if (sort === "company") arr.sort((a, b) => a.companyName.localeCompare(b.companyName));
    else if (sort === "salary") arr.sort((a, b) => (b.salaryMax ?? -1) - (a.salaryMax ?? -1));
    return arr;
  }, [filtered, sort]);

  // Grouped by company so one recent poster can't fill the whole page —
  // first-appearance order (which already reflects the chosen sort), each
  // group capped to 5 rows with an expand toggle.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byCompany = new Map<string, CardJob[]>();
    for (const j of sorted) {
      if (!byCompany.has(j.companyName)) {
        byCompany.set(j.companyName, []);
        order.push(j.companyName);
      }
      byCompany.get(j.companyName)!.push(j);
    }
    return order.map((company) => ({ company, jobs: byCompany.get(company)! }));
  }, [sorted]);

  const anyFilterActive =
    remoteOnly || postedWeek || hasSalary || fullTimeOnly || pickedCompanies.size > 0 || pickedLocations.size > 0 || pickedBands.size > 0;

  const chip = (active: boolean, label_: string, onClick: () => void) => (
    <button
      key={label_}
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${active ? INDIGO : LINE}`,
        background: active ? "#eef0ff" : "#fff", color: active ? INDIGO : MUTED, borderRadius: 999,
        padding: "8px 14px", fontSize: 12.5, fontWeight: active ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label_}
    </button>
  );

  const facetRow = (label_: string, count: number, active: boolean, onClick: () => void) => (
    <div
      key={label_}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, cursor: "pointer", color: active ? INDIGO : INK, padding: "5px 0" }}
    >
      <span
        style={{
          width: 15, height: 15, flex: "none", borderRadius: 4, border: `1.5px solid ${active ? INDIGO : "#cbd5e1"}`,
          background: active ? INDIGO : "#fff", display: "grid", placeItems: "center", color: "#fff", fontSize: 10,
        }}
      >
        {active ? "✓" : ""}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? 700 : 500 }}>{label_}</span>
      <span style={{ flex: "none", color: MUTED }}>{count}</span>
    </div>
  );

  return (
    <div id="tz-jobs-grid">
      <style dangerouslySetInnerHTML={{ __html: JOBS_GRID_CSS }} />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={S.filterBar}>
          {chip(remoteOnly, "Remote only", () => setRemoteOnly((v) => !v))}
          {chip(postedWeek, "Posted this week", () => setPostedWeek((v) => !v))}
          {chip(hasSalary, "Salary listed", () => setHasSalary((v) => !v))}
          {chip(fullTimeOnly, "Full-time only", () => setFullTimeOnly((v) => !v))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: MUTED }}>
            Sort
            {(["newest", "salary", "company"] as SortKey[]).map((s) => (
              <span
                key={s}
                onClick={() => setSort(s)}
                style={{
                  borderRadius: 8, padding: "6px 11px", cursor: "pointer",
                  fontWeight: sort === s ? 700 : 500, color: sort === s ? INDIGO : MUTED,
                  background: sort === s ? "#eef0ff" : "transparent",
                }}
              >
                {s === "newest" ? "Newest" : s === "salary" ? "Salary" : "Company"}
              </span>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: MUTED }}>
          Showing {sorted.length} of the {jobs.length} most recently verified{anyFilterActive ? " (filtered)" : ""}
        </div>

        {groups.length === 0 && (
          <p style={S.empty}>Nothing matches these filters right now — try clearing one.</p>
        )}

        {groups.map((g) => {
          const open = !!expanded[g.company];
          const shown = open ? g.jobs : g.jobs.slice(0, 5);
          const rest = g.jobs.length - shown.length;
          return (
            <section key={g.company} style={S.card}>
              <div style={S.cardHead}>
                <div style={S.avatar}>{g.company[0]?.toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.company}>{g.company}</div>
                  <div style={S.companyMeta}>{g.jobs.length} {g.jobs.length === 1 ? "role" : "roles"} shown here</div>
                </div>
              </div>
              <div>
                {shown.map((j) => {
                  const pay = salaryText(j);
                  const isProject = j.kind === "PROJECT";
                  return (
                    <a key={j.id} href={`/job/${j.id}`} style={S.jobRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.jobTitle}>{j.titleRaw}</div>
                        <div style={S.jobMeta}>
                          {placeLabel(j)} · {isProject ? "Freelance" : label(j.employmentType)}
                          {pay ? ` · ${pay}` : ""}
                        </div>
                        <div style={S.fresh}>{freshness(j.lastVerifiedAt)} · via {label(j.source)}</div>
                      </div>
                      <span style={S.viewBtn}>{isProject ? "View & bid" : "View job"}</span>
                    </a>
                  );
                })}
              </div>
              {rest > 0 && (
                <div style={S.showMore} onClick={() => setExpanded((s) => ({ ...s, [g.company]: true }))}>
                  Show {rest} more at {g.company}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {matchGate}

        {companyOptions.length > 0 && (
          <section style={S.facetCard}>
            <div style={S.facetTitle}>Top companies</div>
            {companyOptions.map(([c, n]) => facetRow(c, n, pickedCompanies.has(c), () => toggle(pickedCompanies, setPickedCompanies, c)))}
          </section>
        )}

        {locationOptions.length > 0 && (
          <section style={S.facetCard}>
            <div style={S.facetTitle}>Location</div>
            {locationOptions.map(([l, n]) => facetRow(l, n, pickedLocations.has(l), () => toggle(pickedLocations, setPickedLocations, l)))}
          </section>
        )}

        {bandOptions.length > 0 && (
          <section style={S.facetCard}>
            <div style={S.facetTitle}>Salary band</div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>Yearly USD postings only — nothing here is converted or estimated.</div>
            {bandOptions.map(([b, n]) => facetRow(b, n, pickedBands.has(b), () => toggle(pickedBands, setPickedBands, b)))}
          </section>
        )}

        {alertSlot}
      </div>
    </div>
  );
}

const JOBS_GRID_CSS = `
#tz-jobs-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}
@media (max-width:900px){#tz-jobs-grid{grid-template-columns:minmax(0,1fr)!important}}
`;

const S: Record<string, React.CSSProperties> = {
  filterBar: { position: "sticky", top: 0, zIndex: 5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, background: "#f7f7fbee", backdropFilter: "blur(6px)", padding: "10px 2px" },
  empty: { color: MUTED, fontSize: 14, lineHeight: 1.6, background: "#fff", border: "1px dashed #dcdce6", borderRadius: 14, padding: 18, margin: 0 },
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden" },
  cardHead: { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "#f7f7fb", borderBottom: `1px solid ${LINE}` },
  avatar: { width: 34, height: 34, flex: "none", borderRadius: 10, background: INDIGO, color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800 },
  company: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 13.5, color: INK },
  companyMeta: { fontSize: 11, color: MUTED, marginTop: 2 },
  jobRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid #f1f5f9`, color: INK, textDecoration: "none" },
  jobTitle: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 600, fontSize: 13.5 },
  jobMeta: { color: MUTED, fontSize: 12, marginTop: 3 },
  fresh: { color: "#059669", fontSize: 11, fontWeight: 600, marginTop: 6 },
  viewBtn: { flex: "none", border: `1px solid ${LINE}`, borderRadius: 9, padding: "7px 12px", fontSize: 11.5, fontWeight: 700, color: MUTED },
  showMore: { padding: "11px 16px", fontSize: 12.5, fontWeight: 700, color: INDIGO, cursor: "pointer" },
  facetCard: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "16px 18px" },
  facetTitle: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 10 },
};
