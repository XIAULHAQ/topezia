/**
 * Mailing people who are not members yet.
 *
 * Read lib/network/doc.ts first — it explains why this file is as paranoid as
 * it is. The short version: this is the only place in the product that sends
 * mail in bulk to addresses a member supplied, and the guardrails are the whole
 * reason it is allowed to exist.
 *
 * THE EMAIL ITSELF. It is from a person, so it says who. It carries the
 * inviter's real name and a one-click unsubscribe that works with no login and
 * stops every future invitation from anyone, not just this one. Both are
 * required for bulk mail under Gmail's and Yahoo's sender rules anyway
 * (RFC 8058, enforced since Feb 2024) — see lib/alerts/send.ts.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { escapeHtml, siteUrl } from "@/lib/alerts/send";
import { NETWORK_LIMITS } from "@/lib/network/doc";

// Address parsing lives in a Prisma-free module so the invite form (a client
// component) can use it without pulling the database client into the browser
// bundle. Re-exported here so server callers have one import to reach for.
export { checkEmail, parseAddressList, type CheckedEmail } from "@/lib/network/addresses";

/** Invitations come from a person, not from the job-alerts robot. */
export const INVITE_FROM = process.env.NETWORK_FROM_EMAIL ?? "Topezia <invites@mail.topezia.com>";

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + NETWORK_LIMITS.INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function inviteUrl(token: string): string {
  return `${siteUrl()}/n/${token}`;
}

/** The unsubscribe link. Keyed by the token, so acting on it proves the person
 *  received the mail — we never take an address from a query string. */
export function unsubscribeUrl(token: string): string {
  return `${siteUrl()}/api/network/unsubscribe?token=${token}`;
}

/** Addresses on the global do-not-contact list, as a set for a batch check. */
export async function suppressedAmong(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await prisma.inviteSuppression.findMany({
    where: { email: { in: emails } },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
}

/** Put an address beyond reach of every member, forever. Idempotent. */
export async function suppress(email: string, reason = "unsubscribed"): Promise<void> {
  await prisma.inviteSuppression.upsert({
    where: { email },
    create: { email, reason },
    update: {},
  });
}

/**
 * How the inviter got this address. It changes what the email may truthfully
 * claim: "found you in their contacts" is a lie to someone whose address was
 * typed in by hand, and the sentence explaining WHY a stranger is being emailed
 * is the one sentence that must not be wrong.
 */
export type InviteSource = "contacts" | "typed";

export function renderInviteEmail(opts: {
  inviterName: string;
  inviterHeadline: string | null;
  recipientName: string | null;
  source: InviteSource;
  token: string;
}): { subject: string; html: string } {
  const { inviterName, inviterHeadline, recipientName, source, token } = opts;
  const name = escapeHtml(inviterName);
  const hi = recipientName ? `Hi ${escapeHtml(recipientName.split(" ")[0]!)},` : "Hi,";
  const who = inviterHeadline
    ? `${name} — ${escapeHtml(inviterHeadline)}`
    : name;

  return {
    // Their name in the subject, because that is the only thing that makes this
    // legitimate mail rather than a broadcast. No "You have 46 new connections
    // waiting!" — nobody has anything waiting, and saying so would be a lie.
    subject: `${inviterName} wants to connect with you on Topezia`,
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 14px;">${hi}</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;"><strong>${who}</strong> ${
        source === "contacts" ? "found you in their contacts and would like to connect" : "would like to connect with you"
      } on Topezia — where people keep a profile of their work, get matched to roles, and vouch for the people they've worked with.</p>
      <a href="${inviteUrl(token)}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">See ${name}'s invitation</a>
      <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:20px 0 0;">Connecting is mutual — nothing is shared with ${name} until you accept, and we never email your contacts without you asking us to.</p>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">
      You're getting this because ${
        source === "contacts" ? `${name} had your address in their contacts` : `${name} entered your address to invite you`
      }.<br>
      <a href="${unsubscribeUrl(token)}" style="color:#9ca3af;">Don't email me again</a> — one click, and no Topezia member can invite this address after that.
    </p>
  </div></body></html>`,
  };
}
