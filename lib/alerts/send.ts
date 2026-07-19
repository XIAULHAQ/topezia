/**
 * Resend delivery + email templates (spec §9).
 *
 * Deliverability notes baked in here on purpose:
 * - We send from a SUBDOMAIN (mail.topezia.com) so bulk alert reputation can't
 *   poison the root domain used for human/corporate mail.
 * - Bulk mail carries List-Unsubscribe + List-Unsubscribe-Post (RFC 8058).
 *   Gmail/Yahoo have REQUIRED one-click list-unsubscribe for bulk senders since
 *   Feb 2024 — without these headers you get throttled or binned regardless of
 *   how good your SPF/DKIM is.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Bulk mail only: enables RFC 8058 one-click unsubscribe. */
  listUnsubscribeUrl?: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");

  const headers: Record<string, string> = {};
  if (opts.listUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${opts.listUnsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL ?? "Topezia Job Alerts <alerts@mail.topezia.com>",
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(Object.keys(headers).length ? { headers } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

const shell = (inner: string, footer: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">${inner}</div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">${footer}</p>
  </div></body></html>`;

/** Double opt-in confirmation — transactional, no unsubscribe header needed. */
export function renderConfirmEmail(label: string, confirmToken: string): { subject: string; html: string } {
  const url = `${siteUrl()}/api/alerts/confirm?token=${confirmToken}`;
  return {
    subject: `Confirm your ${label.toLowerCase()} alert`,
    html: shell(
      `<h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">One click and you're set</h1>
       <p style="color:#6b7280;font-size:15px;line-height:1.55;margin:0 0 20px;">Confirm you want emails when new <strong>${escapeHtml(label.toLowerCase())}</strong> show up. We won't send anything until you do.</p>
       <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">Confirm my alert</a>`,
      `If you didn't ask for this, just ignore it — we won't email you again.`
    ),
  };
}

/** The alert itself — bulk, so it must carry the unsubscribe affordances. */
export function renderAlertEmail(
  label: string,
  jobs: { id: string; titleRaw: string; companyName: string; locationState: string | null; remoteType: string }[],
  unsubToken: string
): { subject: string; html: string; unsubUrl: string } {
  const base = siteUrl();
  const unsubUrl = `${base}/api/alerts/unsubscribe?token=${unsubToken}`;
  const rows = jobs
    .map(
      (j) => `<tr><td style="padding:12px 0;border-bottom:1px solid #ececf2;">
        <div style="font-weight:700;font-size:16px;color:#1a1a2e;">${escapeHtml(j.titleRaw)}</div>
        <div style="color:#6b7280;font-size:14px;margin-top:2px;">${escapeHtml(j.companyName)} · ${escapeHtml(j.locationState || j.remoteType.replace(/_/g, " ").toLowerCase())}</div>
        <a href="${base}/job/${j.id}" style="display:inline-block;margin-top:8px;color:#4f46e5;font-weight:700;font-size:14px;text-decoration:none;">View job →</a>
      </td></tr>`
    )
    .join("");

  return {
    subject: `${jobs.length} new ${label.toLowerCase()}`,
    unsubUrl,
    html: shell(
      `<h1 style="font-size:20px;margin:0 0 6px;color:#1a1a2e;">${jobs.length} new ${escapeHtml(label.toLowerCase())}</h1>
       <p style="color:#6b7280;font-size:14px;margin:0 0 8px;line-height:1.5;">Fresh since we last wrote. Want to know which actually fit you? <a href="${base}/onboard" style="color:#4f46e5;font-weight:700;">Upload your résumé</a> for honest scores and skill gaps.</p>
       <table style="width:100%;border-collapse:collapse;">${rows}</table>`,
      `You asked for ${escapeHtml(label.toLowerCase())} alerts.<br/><a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe</a> — one click, no questions.`
    ),
  };
}
