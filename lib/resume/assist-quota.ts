/**
 * The AI-resume quota — the only reader/writer of ResumeAssistWindow.
 *
 * The metered unit is an "AI resume update": a 24-hour WINDOW of unlimited
 * drafting clicks, opened by the first one. Metering per click would make a
 * monthly allowance of one absurd — a resume needs a summary plus bullets for
 * several roles, and charging each click against the month would spend the
 * whole allowance on a single bullet. The window is what "one updated resume"
 * actually costs.
 *
 * Limits: FREE gets 1 window per rolling 30 days; PREMIUM gets 3 per rolling
 * 7 days. Both are implemented now — premium activates the moment a profile's
 * tier flips, no code change. Hand-editing and PDF download are NEVER metered:
 * only the model calls cost anything, so only they are counted.
 *
 * Rolling windows, not calendar months, on purpose: "resets on the 1st"
 * teaches people to burn their allowance at month-end; "30 days after you
 * used it" is the same generosity with no gaming and no timezone questions.
 */
import { prisma } from "@/lib/prisma";
import type { MemberTier } from "@prisma/client";

export const WINDOW_MS = 24 * 60 * 60 * 1000;

const RULES: Record<MemberTier, { count: number; periodMs: number; label: string }> = {
  FREE: { count: 1, periodMs: 30 * 24 * 60 * 60 * 1000, label: "1 AI resume update a month" },
  PREMIUM: { count: 3, periodMs: 7 * 24 * 60 * 60 * 1000, label: "3 AI resume updates a week" },
};

export interface AssistStatus {
  /** Can a drafting call run right now? */
  allowed: boolean;
  /** Set while a window is open — drafting is free until then. */
  activeUntil: string | null;
  /** Set when blocked — the moment the next window unlocks. */
  nextAt: string | null;
  /** Windows still available in the current period (excludes the active one). */
  remaining: number;
  /** Human copy for the plan, e.g. "1 AI resume update a month". */
  planLabel: string;
}

function computeStatus(tier: MemberTier, starts: Date[], now: Date): AssistStatus {
  const rule = RULES[tier];
  const inPeriod = starts.filter((d) => now.getTime() - d.getTime() < rule.periodMs);

  const active = inPeriod.find((d) => now.getTime() - d.getTime() < WINDOW_MS);
  if (active) {
    return {
      allowed: true,
      activeUntil: new Date(active.getTime() + WINDOW_MS).toISOString(),
      nextAt: null,
      remaining: Math.max(0, rule.count - inPeriod.length),
      planLabel: rule.label,
    };
  }

  if (inPeriod.length < rule.count) {
    return { allowed: true, activeUntil: null, nextAt: null, remaining: rule.count - inPeriod.length, planLabel: rule.label };
  }

  // Blocked: the next unlock is when the OLDEST counted window ages out.
  const oldest = inPeriod.reduce((a, b) => (a < b ? a : b));
  return {
    allowed: false,
    activeUntil: null,
    nextAt: new Date(oldest.getTime() + rule.periodMs).toISOString(),
    remaining: 0,
    planLabel: rule.label,
  };
}

/** Read-only: what the UI shows next to the AI buttons. */
export async function peekAssistStatus(profileId: string, tier: MemberTier): Promise<AssistStatus> {
  const rows = await prisma.resumeAssistWindow.findMany({
    where: { profileId },
    orderBy: { startedAt: "desc" },
    take: 10, // both rules only ever look this far back
    select: { startedAt: true },
  });
  return computeStatus(tier, rows.map((r) => r.startedAt), new Date());
}

/**
 * Gate for an actual drafting call. Opens a new window if one is needed and
 * the quota allows it. Runs in a transaction and RE-CHECKS inside it, so two
 * simultaneous first clicks can't each open a window and double-spend.
 */
export async function consumeAssist(profileId: string, tier: MemberTier): Promise<AssistStatus> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const rows = await tx.resumeAssistWindow.findMany({
      where: { profileId },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { startedAt: true },
    });
    const status = computeStatus(tier, rows.map((r) => r.startedAt), now);
    if (!status.allowed) return status;
    if (status.activeUntil) return status; // window already open — nothing to spend

    await tx.resumeAssistWindow.create({ data: { profileId, startedAt: now } });
    return computeStatus(tier, [now, ...rows.map((r) => r.startedAt)], now);
  });
}

/** The 429 copy, honest about the plan and the date. */
export function blockedMessage(s: AssistStatus): string {
  const when = s.nextAt
    ? new Date(s.nextAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })
    : "later";
  return `Your plan includes ${s.planLabel}, and you've used it. The next one unlocks ${when}. Your resume stays fully editable and downloadable in the meantime.`;
}
