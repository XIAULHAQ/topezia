/**
 * Email alert sender (spec §9) — run on a schedule (GitHub Actions, like the
 * ingestion cron; never a Vercel function, which times out at 10s).
 *
 * Run: npx tsx scripts/send-alerts.ts [--dry-run] [--limit=N]
 *
 * For each active, due alert: find jobs first seen since the last send that
 * match the saved search, and email them. Alerts with nothing new send nothing —
 * an empty "here's 0 jobs" email is how you train people to ignore you.
 *
 * --dry-run prints exactly what would be sent without calling Resend.
 */

import { prisma } from "@/lib/prisma";
import { alertWhere, type AlertTarget } from "@/lib/alerts/query";
import { sendEmail, renderAlertEmail } from "@/lib/alerts/send";

const WINDOW_HOURS = { DAILY: 24, WEEKLY: 24 * 7 } as const;
const MAX_JOBS_PER_EMAIL = 10;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  if (!dryRun && !process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set — refusing to run without --dry-run.");
    process.exit(1);
  }

  // Double opt-in: confirmed addresses only. Never mail someone who didn't click.
  const alerts = await prisma.jobAlert.findMany({
    where: { unsubscribedAt: null, confirmedAt: { not: null } },
    take: limit,
  });
  console.log(`${alerts.length} confirmed, active alert(s)${dryRun ? " — DRY RUN, nothing will be sent" : ""}\n`);

  let sent = 0, skippedNotDue = 0, skippedNoJobs = 0, failed = 0;

  for (const a of alerts) {
    const windowH = WINDOW_HOURS[a.frequency];
    const due = !a.lastSentAt || Date.now() - a.lastSentAt.getTime() >= windowH * 3600_000;
    if (!due) {
      skippedNotDue++;
      continue;
    }

    const since = a.lastSentAt ?? new Date(Date.now() - windowH * 3600_000);
    const target: AlertTarget = {
      label: a.label,
      roleId: a.roleId,
      verticalId: a.verticalId,
      locationState: a.locationState,
      remoteOnly: a.remoteOnly,
    };
    const jobs = await prisma.job.findMany({
      where: alertWhere(target, since),
      select: { id: true, titleRaw: true, companyName: true, locationState: true, remoteType: true },
      orderBy: { firstSeenAt: "desc" },
      take: MAX_JOBS_PER_EMAIL,
    });

    if (jobs.length === 0) {
      // Nothing new — send nothing. Silence beats an empty digest.
      skippedNoJobs++;
      continue;
    }

    const { subject, html, unsubUrl } = renderAlertEmail(a.label, jobs, a.unsubToken);

    if (dryRun) {
      console.log(`  WOULD SEND → ${a.email}`);
      console.log(`    subject: ${subject}`);
      console.log(`    jobs:    ${jobs.map((j) => `${j.titleRaw} @ ${j.companyName}`).join(" | ")}`);
      console.log(`    unsub:   ${unsubUrl}\n`);
      sent++;
      continue;
    }

    try {
      await sendEmail({ to: a.email, subject, html, listUnsubscribeUrl: unsubUrl });
      await prisma.jobAlert.update({ where: { id: a.id }, data: { lastSentAt: new Date() } });
      console.log(`  sent → ${a.email} (${jobs.length} jobs)`);
      sent++;
    } catch (err) {
      failed++;
      console.error(`  FAILED → ${a.email}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. ${dryRun ? "Would send" : "Sent"}: ${sent}, not due: ${skippedNotDue}, nothing new: ${skippedNoJobs}, failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
