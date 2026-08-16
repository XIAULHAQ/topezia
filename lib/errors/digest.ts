/**
 * The Monday error digest — the "checked every week" half of the error log.
 *
 * One email to the product owner: how many errors are open, the top ones by
 * recent activity, what changed since last week, and a link to /hq/errors to
 * resolve them. Sent even when the list is EMPTY — a clean week is worth
 * knowing, and "no email" must never be mistakable for "no errors" (the
 * reporters could be broken; the digest saying "0 open" proves they aren't
 * silently failing to write, because the digest reads the same table).
 *
 * Recipient: ERROR_DIGEST_TO, defaulting to the owner's address. One env var
 * moves it or adds a comma-separated second reader.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail, siteUrl, escapeHtml } from "@/lib/alerts/send";

export const DIGEST_TO = process.env.ERROR_DIGEST_TO ?? "brandon@tiltmediaco.com";
export const DIGEST_FROM = process.env.ERROR_DIGEST_FROM ?? "Topezia <alerts@mail.topezia.com>";

export async function sendErrorDigest(now = new Date()): Promise<{ open: number; newThisWeek: number; sent: boolean }> {
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const [open, newThisWeek, resolvedThisWeek] = await Promise.all([
    prisma.errorLog.findMany({ where: { status: "OPEN" }, orderBy: { lastSeenAt: "desc" }, take: 25 }),
    prisma.errorLog.count({ where: { status: "OPEN", firstSeenAt: { gte: weekAgo } } }),
    prisma.errorLog.count({ where: { status: "RESOLVED", resolvedAt: { gte: weekAgo } } }),
  ]);
  const totalOpen = await prisma.errorLog.count({ where: { status: "OPEN" } });

  const url = `${siteUrl()}/hq/errors`;
  const subject = totalOpen === 0
    ? "Topezia error log: clean week — nothing open"
    : `Topezia error log: ${totalOpen} open (${newThisWeek} new this week)`;

  const rows = open.map((e) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;color:#666;text-transform:uppercase">${escapeHtml(e.source)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px"><b>${escapeHtml(e.message.slice(0, 140))}</b>${e.path ? `<br><code style="font-size:11px;color:#666">${escapeHtml(e.path)}</code>` : ""}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#666;white-space:nowrap">×${e.count}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#666;white-space:nowrap">${e.lastSeenAt.toISOString().slice(0, 10)}</td>
    </tr>`).join("");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#111">
    <h2 style="margin:0 0 6px">Weekly error log</h2>
    <p style="margin:0 0 16px;color:#555">${totalOpen} open · ${newThisWeek} new this week · ${resolvedThisWeek} resolved this week</p>
    ${totalOpen === 0
      ? `<p>Nothing open. The reporters are wired and writing (this email reads the same table they write), so this is a genuinely clean week.</p>`
      : `<table style="border-collapse:collapse;width:100%">${rows}</table>${totalOpen > open.length ? `<p style="color:#666;font-size:12px">…and ${totalOpen - open.length} more.</p>` : ""}`}
    <p style="margin:18px 0 0"><a href="${url}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700">Review and resolve →</a></p>
    <p style="margin:18px 0 0;font-size:12px;color:#888">Fix, mark resolved with a note, then clear. Anything resolved that fires again reopens itself.</p>
  </div>`;

  let sent = false;
  for (const to of DIGEST_TO.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      await sendEmail({ to, subject, html, from: DIGEST_FROM });
      sent = true;
    } catch (e) {
      console.error("[cron/error-digest] send failed:", e instanceof Error ? e.message : e);
    }
  }
  return { open: totalOpen, newThisWeek, sent };
}
