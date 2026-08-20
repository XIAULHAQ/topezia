/**
 * Inviting someone to apply for a posting.
 *
 * This is the third place in the product that mails an address a user chose,
 * after company invites and the member network — so it inherits the same
 * discipline, for the same reason. Read lib/network/doc.ts for the full
 * argument; the short version is that outreach nobody asked for is the thing
 * that burns a sending domain, and the limits below are the price of doing it.
 *
 * WHAT IS DIFFERENT HERE. A job invitation is not a cold blast: it goes either
 * to a member who switched on "open to work" — an explicit "please contact me
 * about roles" — or to an address the employer typed themselves. Both are
 * narrower than "everyone in my address book", which is why the caps are
 * per-posting rather than lifetime.
 *
 * WHAT IS THE SAME. The global do-not-contact list is honoured. Somebody who
 * told Topezia to stop emailing them meant all of it, not just network
 * invitations, and a job ad is still mail they did not ask for.
 */
import { randomBytes } from "crypto";
import { escapeHtml, siteUrl } from "@/lib/alerts/send";
import { jobPath } from "@/lib/seo/job-slug";

export const JOB_INVITE_LIMITS = {
  /** Invitations sent from one posting in a single submission. */
  PER_BATCH: 25,
  /** Invitations one posting may ever send. A posting that has written to 200
   *  people is not recruiting, it is broadcasting. */
  PER_POSTING: 200,
  /** Characters in the employer's optional note. */
  NOTE_MAX: 400,
  /** How long the link in the mail stays good. */
  TTL_DAYS: 30,
} as const;

/** Hourly / daily windows, keyed per employer. [max, windowMs]. */
export const JOB_INVITE_RATE = {
  hour: [40, 60 * 60 * 1000],
  day: [120, 24 * 60 * 60 * 1000],
} as const satisfies Record<string, readonly [number, number]>;

export const JOB_INVITE_FROM =
  process.env.NETWORK_FROM_EMAIL ?? "Topezia <invites@mail.topezia.com>";

export function newJobInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function jobInviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + JOB_INVITE_LIMITS.TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Where the mail points. The token rides along so opening it can be recorded
 *  without asking a stranger to sign in first. */
export function jobInviteUrl(job: { id: string; titleRaw: string; companyName: string | null }, token: string): string {
  return `${siteUrl()}${jobPath({ ...job, companyName: job.companyName ?? "" })}?invite=${token}`;
}

export function jobInviteUnsubscribeUrl(token: string): string {
  return `${siteUrl()}/api/network/unsubscribe?jobInvite=${token}`;
}

export function renderJobInviteEmail(opts: {
  inviterName: string;
  /** The company, when posted under one; otherwise the inviter is the employer. */
  companyName: string | null;
  jobTitle: string;
  jobKind: string;
  location: string | null;
  salary: string | null;
  note: string | null;
  recipientName: string | null;
  job: { id: string; titleRaw: string; companyName: string | null };
  token: string;
}): { subject: string; html: string } {
  const { inviterName, companyName, jobTitle, jobKind, location, salary, note, recipientName, job, token } = opts;
  const who = companyName?.trim() || inviterName;
  const hi = recipientName ? `Hi ${escapeHtml(recipientName.split(" ")[0]!)},` : "Hi,";
  const thing = jobKind === "PROJECT" ? "project" : "role";

  const facts = [location, salary].filter(Boolean).map((f) => escapeHtml(f!)).join(" · ");

  return {
    // Names the role and the employer. "You have a new opportunity!" tells the
    // reader nothing and is indistinguishable from every recruiting blast they
    // already ignore.
    subject: `${escapeHtml(who)} would like you to apply: ${jobTitle}`,
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 14px;">${hi}</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;"><strong>${escapeHtml(inviterName)}</strong>${
        companyName ? ` at <strong>${escapeHtml(companyName)}</strong>` : ""
      } thinks you'd be a good fit for a ${thing} they're hiring for, and would like you to apply.</p>
      <div style="border:1px solid #ececf2;border-radius:12px;padding:16px;margin:0 0 18px;">
        <div style="font-size:16px;font-weight:700;color:#1a1a2e;">${escapeHtml(jobTitle)}</div>
        ${facts ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">${facts}</div>` : ""}
      </div>
      ${note ? `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 18px;border-left:3px solid #C7D2FE;padding-left:12px;">${escapeHtml(note)}</p>` : ""}
      <a href="${jobInviteUrl(job, token)}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">See the ${thing}</a>
      <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:20px 0 0;">Looking is not applying — nothing is sent to ${escapeHtml(who)} unless you choose to apply.</p>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">
      You're getting this because an employer on Topezia invited you to apply.<br>
      <a href="${jobInviteUnsubscribeUrl(token)}" style="color:#9ca3af;">Don't email me again</a> — one click, and no Topezia member or employer can write to this address after that.
    </p>
  </div></body></html>`,
  };
}
