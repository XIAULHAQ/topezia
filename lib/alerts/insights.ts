/**
 * Insight alerts — "a note when your market moves."
 *
 * Mechanism: a weekly cron captures a compact snapshot of each opted-in
 * profile's insights (InsightSnapshot), diffs it against the previous capture,
 * and emails ONLY when something actually moved. Same discipline as the job
 * alerts sender: a quiet market sends nothing — an empty "nothing changed"
 * email is how you train people to ignore you.
 *
 * Every claim in an alert is a diff of two counted snapshots, never a
 * projection. Thresholds below exist so a one-posting wobble in a small field
 * doesn't read as a trend.
 */
import type { ProfileInsights } from "@/lib/matching/insights";
import { escapeHtml, siteUrl } from "@/lib/alerts/send";

// Compact capture of what we'd want to diff later. Versioned so the differ
// can refuse shapes it doesn't understand instead of misreading them.
export interface InsightSnapshotPayload {
  v: 1;
  fieldLabel: string | null;
  targetJobs: number;
  coveragePct: number | null;
  reliable: boolean;
  gaps: { skill: string; pct: number; jobsWanting: number }[];
  certs: { label: string; jobs: number }[];
}

export function snapshotFrom(ins: ProfileInsights): InsightSnapshotPayload {
  return {
    v: 1,
    fieldLabel: ins.fieldLabel,
    targetJobs: ins.targetJobs,
    coveragePct: ins.coveragePct,
    reliable: ins.reliable,
    gaps: ins.skillGaps.map((g) => ({ skill: g.skill, pct: g.pct, jobsWanting: g.jobsWanting })),
    certs: ins.certs.map((c) => ({ label: c.label, jobs: c.jobs })),
  };
}

export interface InsightChange {
  kind: "FIELD_SIZE" | "GAP_SHIFT" | "NEW_TOP_GAP" | "CERT_NEW";
  headline: string; // one counted sentence, ready to show
  detail: string | null; // optional second line
}

// Movement thresholds. A gap share must move >= 8 points to count (on a
// 40-job field that's ~3 postings, past single-posting noise); field size must
// move >= 5 postings AND >= 15% so small markets don't fire on every wobble.
const GAP_SHIFT_MIN = 8;
const FIELD_SIZE_MIN = 5;
const FIELD_SIZE_MIN_PCT = 0.15;

export function diffInsights(prev: InsightSnapshotPayload, cur: InsightSnapshotPayload): InsightChange[] {
  // Both sides must be reliable — diffing against a thin-market snapshot
  // reports the corpus growing up, not the market moving.
  if (prev.v !== 1 || !prev.reliable || !cur.reliable) return [];
  const out: InsightChange[] = [];
  const field = cur.fieldLabel ?? "your field";

  const delta = cur.targetJobs - prev.targetJobs;
  if (Math.abs(delta) >= FIELD_SIZE_MIN && Math.abs(delta) >= prev.targetJobs * FIELD_SIZE_MIN_PCT) {
    out.push({
      kind: "FIELD_SIZE",
      headline: delta > 0
        ? `Your field grew: ${prev.targetJobs} → ${cur.targetJobs} eligible postings in ${field}.`
        : `Your field tightened: ${prev.targetJobs} → ${cur.targetJobs} eligible postings in ${field}.`,
      detail: null,
    });
  }

  const prevBySkill = new Map(prev.gaps.map((g) => [g.skill.toLowerCase(), g]));
  for (const g of cur.gaps) {
    const p = prevBySkill.get(g.skill.toLowerCase());
    if (p && Math.abs(g.pct - p.pct) >= GAP_SHIFT_MIN) {
      out.push({
        kind: "GAP_SHIFT",
        headline: `Demand for ${g.skill} moved ${p.pct}% → ${g.pct}% of ${field}.`,
        detail: `${g.jobsWanting} postings now name it — it's ${g.pct - p.pct > 0 ? "still on your roadmap and climbing" : "cooling, but still a gap"}.`,
      });
    }
  }

  // A skill breaking into the top 3 that the previous capture didn't list at
  // all — the "learn this next" candidates shifting under the user.
  const prevSkills = new Set(prev.gaps.map((g) => g.skill.toLowerCase()));
  for (const g of cur.gaps.slice(0, 3)) {
    if (!prevSkills.has(g.skill.toLowerCase())) {
      out.push({
        kind: "NEW_TOP_GAP",
        headline: `${g.skill} entered your field's top asks — ${g.pct}% of postings now name it.`,
        detail: null,
      });
    }
  }

  const prevCerts = new Set(prev.certs.map((c) => c.label));
  for (const c of cur.certs) {
    if (!prevCerts.has(c.label)) {
      out.push({
        kind: "CERT_NEW",
        headline: `${c.label} is now named in ${c.jobs} of your field's postings.`,
        detail: null,
      });
    }
  }

  return out.slice(0, 4); // an alert is a nudge, not a report
}

export function renderInsightAlertEmail(opts: {
  fieldLabel: string | null;
  changes: InsightChange[];
  unsubToken: string;
}): { subject: string; html: string; unsubUrl: string } {
  const base = siteUrl();
  const unsubUrl = `${base}/api/coach/alerts/unsubscribe?token=${opts.unsubToken}`;
  const field = opts.fieldLabel ?? "your field";
  const rows = opts.changes
    .map(
      (c) => `<tr><td style="padding:12px 0;border-bottom:1px solid #ececf2;">
        <div style="font-weight:700;font-size:15px;color:#1a1a2e;line-height:1.45;">${escapeHtml(c.headline)}</div>
        ${c.detail ? `<div style="color:#6b7280;font-size:13px;margin-top:3px;line-height:1.5;">${escapeHtml(c.detail)}</div>` : ""}
      </td></tr>`
    )
    .join("");

  return {
    subject: `Your market moved — ${escapeHtml(field)}`,
    unsubUrl,
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 6px;color:#1a1a2e;">Your market moved</h1>
      <p style="color:#6b7280;font-size:14px;margin:0 0 8px;line-height:1.5;">What changed in ${escapeHtml(field)} since we last measured — counted from real postings, never invented.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <a href="${base}/coach" style="display:inline-block;margin-top:16px;color:#4f46e5;font-weight:700;font-size:14px;text-decoration:none;">Open your career coach →</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">You asked to hear when your market moves. Quiet weeks send nothing.<br/><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a> — one click, no questions.</p>
  </div>
</body></html>`,
  };
}
