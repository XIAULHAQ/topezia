/**
 * Per-page market stats — SEO addendum §2.1.
 *
 * This is the block that makes a programmatic page real content rather than a
 * listings dump, so it renders SERVER-SIDE in the initial HTML (§2.2). Nothing
 * here is computed: every number comes from the PageStats row written at the end
 * of the last ingestion run.
 *
 * Copy guardrails (§2.3) are load-bearing, not decoration:
 * - Market data, never a judgement of a listing or an employer. No "great pay
 *   for this role", no "below market" — those are claims about someone's
 *   specific job, and this product's whole position is that we describe rather
 *   than rank people.
 * - No urgency. Nothing here says "act now" or "in demand — apply today".
 * - Ranges, not false precision: pay is pre-rounded to $500/yr or $1/hr in
 *   lib/seo/page-stats.ts, so the same figure appears here and anywhere else it
 *   is read from.
 * - A missing stat is OMITTED, never rendered as "N/A" or "0". Pay below the
 *   sample floor arrives as null and this component simply doesn't draw it.
 */
import type { CSSProperties } from "react";
import type { PageStatsView, SeoPage } from "@/lib/seo/pages";

const INK = "#1a1a2e";
const MUTED = "#6b7280";
const LINE = "#E6E9F0";

const EMP_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  TEMP: "Temporary",
  HOURLY: "Hourly",
  INTERNSHIP: "Internship",
};

const money = (n: number) => `$${n.toLocaleString()}`;
/** "/yr" and "/hr" rather than "per YEAR" — this reads in a sentence. */
const unit = (payType: string | null) => (payType === "HOUR" ? "/hr" : "/yr");

/** "Updated 30 July 2026" — a date a human parses at a glance, in en-GB so it
 *  doesn't read ambiguously to a non-US visitor. */
function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={S.statV}>{value}</div>
      <div style={S.statK}>{label}</div>
    </div>
  );
}

export default function StatsBlock({ page, stats }: { page: SeoPage; stats: PageStatsView }) {
  const hasPay = stats.medianPay != null && stats.paySampleSize > 0;

  // Employment types worth naming: anything that rounds to 0% is noise in a
  // breakdown, and listing it implies a precision the sample doesn't carry.
  const empTypes = Object.entries(stats.empTypeBreakdown)
    .filter(([, pct]) => pct >= 1)
    .sort((a, b) => b[1] - a[1]);

  // Remote share is "location pages only" per §2.1 — on a remote-role page it
  // restates the page's own filter, and on a plain role page the hero already
  // carries it.
  const showRemote = page.kind === "role-state" || page.kind === "role-country" || page.kind === "place";

  return (
    <section style={S.wrap} aria-label={`${page.topic} market data`}>
      <h2 style={S.h2}>The {page.topic.toLowerCase()} market right now</h2>
      <p style={S.sub}>
        Measured across the {stats.listingCount.toLocaleString()} live{" "}
        {stats.listingCount === 1 ? "posting" : "postings"} on this page — not an estimate, and not a
        forecast.
      </p>

      <div style={S.grid}>
        <Stat
          value={stats.listingCount.toLocaleString()}
          label={`Open ${stats.listingCount === 1 ? "posting" : "postings"}`}
        />
        <Stat
          value={stats.companyCount.toLocaleString()}
          label={stats.companyCount === 1 ? "Company hiring" : "Companies hiring"}
        />
        <Stat value={stats.postedLast7d.toLocaleString()} label="Posted in the last 7 days" />
        {showRemote && <Stat value={`${stats.remoteShare}%`} label="Remote-eligible" />}
      </div>

      {hasPay && (
        <div style={S.row}>
          <div style={S.rowHead}>Pay</div>
          <div>
            <div style={S.payLine}>
              Median <strong style={{ color: INK }}>{money(stats.medianPay!)}{unit(stats.payType)}</strong>
              {stats.p25Pay != null && stats.p75Pay != null && (
                <> · most between {money(stats.p25Pay)} and {money(stats.p75Pay)}</>
              )}
            </div>
            {/* The denominator is the honesty mechanism: pay is stated on a
                minority of postings, and hiding that would overclaim. */}
            <div style={S.note}>
              From the {stats.paySampleSize} {stats.paySampleSize === 1 ? "posting" : "postings"} here that
              publish a range.
            </div>
          </div>
        </div>
      )}

      {stats.topSkills.length > 0 && (
        <div style={S.row}>
          <div style={S.rowHead}>Most asked for</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {stats.topSkills.map((s) => (
              <span key={s.name} style={S.chip}>
                {s.name}
                <span style={S.chipN}>{Math.round((s.n / stats.listingCount) * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {empTypes.length > 0 && (
        <div style={S.row}>
          <div style={S.rowHead}>Type of work</div>
          <div style={S.plain}>
            {empTypes.map(([t, pct], i) => (
              <span key={t}>
                {i > 0 && " · "}
                {EMP_LABELS[t] ?? t.replace(/_/g, " ").toLowerCase()} {pct}%
              </span>
            ))}
          </div>
        </div>
      )}

      <p style={S.updated}>
        Updated <time dateTime={stats.computedAt.toISOString()}>{formatDate(stats.computedAt)}</time>, when
        we last re-checked these listings.
      </p>
    </section>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { border: `1px solid ${LINE}`, borderRadius: 16, padding: "22px 24px", background: "#fff", marginBottom: 26 },
  h2: { margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.3px", color: INK },
  sub: { margin: "7px 0 18px", fontSize: 13, color: MUTED, lineHeight: 1.6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(140px,100%),1fr))", gap: 16, paddingBottom: 18, borderBottom: `1px solid ${LINE}` },
  statV: { fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.6px" },
  statK: { fontSize: 11.5, color: MUTED, marginTop: 3, lineHeight: 1.45 },
  row: { display: "flex", gap: 16, alignItems: "flex-start", padding: "14px 0", borderBottom: `1px solid ${LINE}`, flexWrap: "wrap" },
  rowHead: { flex: "none", width: 116, fontSize: 12, fontWeight: 700, color: INK, paddingTop: 2 },
  payLine: { fontSize: 13.5, color: MUTED, lineHeight: 1.6 },
  note: { fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 1.5 },
  plain: { fontSize: 13, color: MUTED, lineHeight: 1.6, flex: 1, minWidth: 180 },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#F5F7FB", border: `1px solid ${LINE}`, borderRadius: 999, padding: "5px 11px", fontSize: 12.5, fontWeight: 600, color: INK },
  chipN: { fontSize: 11, fontWeight: 700, color: MUTED },
  updated: { margin: "14px 0 0", fontSize: 11.5, color: MUTED },
};
