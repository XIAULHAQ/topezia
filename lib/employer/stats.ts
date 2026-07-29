/**
 * Employer dashboard metrics — every number counted from real rows.
 *
 * The design this implements shipped with illustrative numbers (1,316 views
 * +22%, 39 applicants, "avg. time to reply 2.1d", "similar studios reply in
 * 0.8 days", "3 credits left this month", a 2.4x-more-applicants claim). Same
 * rule as the rest of the product: a number an employer is shown must be
 * something we actually counted, so the ones with no source behind them are
 * NOT rendered rather than filled in with plausible-looking values.
 *
 * Specifically absent, and why:
 * - time-to-reply / time-to-first-response: there is no employer messaging
 *   and no reply timestamp anywhere in the schema. Application.updatedAt
 *   moves on any edit, so deriving "reply speed" from it would be a guess
 *   dressed as a measurement.
 * - peer benchmarks ("similar studios reply in..."): would need a population
 *   of employers to compare against, which does not exist yet.
 * - posting credits/quota: no such concept in billing.
 *
 * What IS real and computed here: views (from JobView, which only started
 * counting when that table shipped — see `viewsSince`), applicants, pipeline
 * stages, awaiting-review age, company profile strength, and the setup
 * checklist.
 */
import { prisma } from "@/lib/prisma";
import type { Company } from "@prisma/client";

export const AWAITING_REVIEW_DAYS = 3; // an APPLIED sitting this long is "waiting"
const PULSE_DAYS = 7;

export interface PulseDay {
  /** ISO date (UTC midnight), the bucket key. */
  day: string;
  label: string; // "Mon"
  views: number;
  applications: number;
}

export interface EmployerStats {
  applicants: { total: number; last7: number; prev7: number };
  awaitingReview: number; // APPLIED, older than AWAITING_REVIEW_DAYS
  postings: { live: number; draft: number; closed: number };
  views: { last7: number; prev7: number; total: number };
  /**
   * When view counting actually began for this employer. Null when we have no
   * view rows at all — the UI uses this to say "counting since you shipped
   * this" instead of showing a confident 0 that reads like "nobody looked".
   */
  viewsSince: string | null;
  pulse: PulseDay[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function utcMidnight(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

/**
 * All postings belonging to this employer — the same ownership rule
 * /api/postings uses (posted by me, or owned by my company), so the dashboard
 * can never show a number computed over a different set than the list beneath
 * it.
 */
export function ownedPostingsWhere(userId: string, companyId: string | null) {
  return companyId
    ? { OR: [{ postedByUserId: userId }, { companyId }] }
    : { postedByUserId: userId };
}

export async function employerStats(userId: string, companyId: string | null): Promise<EmployerStats> {
  const where = ownedPostingsWhere(userId, companyId);
  const jobs = await prisma.job.findMany({ where, select: { id: true, status: true } });
  const jobIds = jobs.map((j) => j.id);

  const postings = {
    live: jobs.filter((j) => j.status === "LIVE").length,
    draft: jobs.filter((j) => j.status === "DRAFT").length,
    closed: jobs.filter((j) => j.status === "EXPIRED").length,
  };

  if (jobIds.length === 0) {
    return {
      applicants: { total: 0, last7: 0, prev7: 0 },
      awaitingReview: 0,
      postings,
      views: { last7: 0, prev7: 0, total: 0 },
      viewsSince: null,
      pulse: emptyPulse(),
    };
  }

  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const staleBefore = new Date(now.getTime() - AWAITING_REVIEW_DAYS * DAY_MS);

  const [appTotal, appLast7, appPrev7, awaiting, viewTotal, viewLast7, viewPrev7, firstView, pulseRows] =
    await Promise.all([
      prisma.application.count({ where: { jobId: { in: jobIds } } }),
      prisma.application.count({ where: { jobId: { in: jobIds }, createdAt: { gte: since7 } } }),
      prisma.application.count({ where: { jobId: { in: jobIds }, createdAt: { gte: since14, lt: since7 } } }),
      prisma.application.count({
        where: { jobId: { in: jobIds }, stage: "APPLIED", createdAt: { lt: staleBefore } },
      }),
      prisma.jobView.count({ where: { jobId: { in: jobIds } } }),
      prisma.jobView.count({ where: { jobId: { in: jobIds }, day: { gte: utcMidnight(since7) } } }),
      prisma.jobView.count({
        where: { jobId: { in: jobIds }, day: { gte: utcMidnight(since14), lt: utcMidnight(since7) } },
      }),
      prisma.jobView.findFirst({
        where: { jobId: { in: jobIds } },
        orderBy: { day: "asc" },
        select: { day: true },
      }),
      pulseSeries(jobIds),
    ]);

  return {
    applicants: { total: appTotal, last7: appLast7, prev7: appPrev7 },
    awaitingReview: awaiting,
    postings,
    views: { last7: viewLast7, prev7: viewPrev7, total: viewTotal },
    viewsSince: firstView ? firstView.day.toISOString() : null,
    pulse: pulseRows,
  };
}

function emptyPulse(): PulseDay[] {
  const out: PulseDay[] = [];
  const today = utcMidnight(new Date());
  for (let i = PULSE_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    out.push({ day: d.toISOString(), label: DAY_LABEL[d.getUTCDay()], views: 0, applications: 0 });
  }
  return out;
}

/** Views and applications per day for the last 7 days, zero-filled. */
async function pulseSeries(jobIds: string[]): Promise<PulseDay[]> {
  const today = utcMidnight(new Date());
  const from = new Date(today.getTime() - (PULSE_DAYS - 1) * DAY_MS);

  const [views, apps] = await Promise.all([
    prisma.jobView.groupBy({
      by: ["day"],
      where: { jobId: { in: jobIds }, day: { gte: from } },
      _count: { _all: true },
    }),
    prisma.application.findMany({
      where: { jobId: { in: jobIds }, createdAt: { gte: from } },
      select: { createdAt: true },
    }),
  ]);

  const viewBy = new Map(views.map((v) => [utcMidnight(v.day).toISOString(), v._count._all]));
  const appBy = new Map<string, number>();
  for (const a of apps) {
    const k = utcMidnight(a.createdAt).toISOString();
    appBy.set(k, (appBy.get(k) ?? 0) + 1);
  }

  const out: PulseDay[] = [];
  for (let i = PULSE_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const k = d.toISOString();
    out.push({
      day: k,
      label: DAY_LABEL[d.getUTCDay()],
      views: viewBy.get(k) ?? 0,
      applications: appBy.get(k) ?? 0,
    });
  }
  return out;
}

// ── Company profile strength + setup checklist ────────────────────────────

export interface ChecklistItem {
  label: string;
  done: boolean;
  /** Where the fix lives, so the item is actionable rather than a scold. */
  action: "company" | "post" | "logo" | null;
}

/**
 * Same shape as the job-seeker profile meter: a share of concrete fields that
 * are actually filled, never a vibe. Each item is worth the same, so the
 * percentage is just done/total — no hidden weighting to make it look better.
 */
export function companyChecklist(company: Company | null, hasPosting: boolean, hasLivePosting: boolean): ChecklistItem[] {
  return [
    { label: "Company name", done: !!company?.name?.trim(), action: "company" },
    { label: "What you do (tagline)", done: !!company?.tagline?.trim(), action: "company" },
    { label: "About your company", done: (company?.about?.trim().length ?? 0) >= 40, action: "company" },
    { label: "Website", done: !!company?.website?.trim(), action: "company" },
    { label: "Location", done: !!company?.location?.trim(), action: "company" },
    { label: "Company logo", done: !!company?.logoUrl, action: "logo" },
    { label: "First posting created", done: hasPosting, action: "post" },
    { label: "A posting is live", done: hasLivePosting, action: "post" },
  ];
}

export function strengthPct(items: ChecklistItem[]): number {
  if (!items.length) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}
