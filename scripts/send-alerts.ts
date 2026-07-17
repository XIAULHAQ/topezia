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

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const WINDOW_HOURS = { DAILY: 24, WEEKLY: 24 * 7 } as const;
const MAX_JOBS_PER_EMAIL = 10;

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
}

function renderEmail(label: string, jobs: { id: string; titleRaw: string; companyName: string; locationState: string | null; remoteType: string }[], unsubToken: string) {
  const base = siteUrl();
  const rows = jobs
    .map(
      (j) => `
      <tr><td style="padding:12px 0;border-bottom:1px solid #ececf2;">
        <div style="font-weight:700;font-size:16px;color:#1a1a2e;">${escapeHtml(j.titleRaw)}</div>
        <div style="color:#6b7280;font-size:14px;margin-top:2px;">${escapeHtml(j.companyName)} · ${escapeHtml(j.locationState || j.remoteType.replace(/_/g, " ").toLowerCase())}</div>
        <a href="${base}/go/${j.id}" style="display:inline-block;margin-top:8px;color:#4f46e5;font-weight:700;font-size:14px;text-decoration:none;">View job →</a>
      </td></tr>`
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 6px;color:#1a1a2e;">${jobs.length} new ${escapeHtml(label.toLowerCase())}</h1>
      <p style="color:#6b7280;font-size:14px;margin:0 0 8px;line-height:1.5;">Fresh since we last wrote. Want to know which actually fit you? <a href="${base}/onboard" style="color:#4f46e5;font-weight:700;">Upload your résumé</a> for honest scores and skill gaps.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">
      You're getting this because you asked for ${escapeHtml(label.toLowerCase())} alerts.<br/>
      <a href="${base}/alerts/unsubscribe?token=${unsubToken}" style="color:#6b7280;">Unsubscribe</a> — one click, no questions.
    </p>
  </div></body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function sendViaResend(to: string, subject: string, html: string) {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL ?? "Topezia <alerts@topezia.com>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  if (!dryRun && !process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set — refusing to run without --dry-run.");
    process.exit(1);
  }

  const alerts = await prisma.jobAlert.findMany({ where: { unsubscribedAt: null }, take: limit });
  console.log(`${alerts.length} active alert(s)${dryRun ? " — DRY RUN, nothing will be sent" : ""}\n`);

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

    const subject = `${jobs.length} new ${a.label.toLowerCase()}`;
    const html = renderEmail(a.label, jobs, a.unsubToken);

    if (dryRun) {
      console.log(`  WOULD SEND → ${a.email}`);
      console.log(`    subject: ${subject}`);
      console.log(`    jobs:    ${jobs.map((j) => `${j.titleRaw} @ ${j.companyName}`).join(" | ")}`);
      console.log(`    unsub:   ${siteUrl()}/alerts/unsubscribe?token=${a.unsubToken}\n`);
      sent++;
      continue;
    }

    try {
      await sendViaResend(a.email, subject, html);
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
