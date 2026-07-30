/**
 * Team invitations — the token, the email, and the rules around both.
 *
 * This is the one feature in the company dashboard that makes Topezia send
 * mail to an address a user chose, which makes it the one feature that can be
 * turned into a spam cannon. What holds that shut:
 *
 *  - Only a signed-in company OWNER can send one (lib/company/owner.ts).
 *  - Rate limits at the route: a handful per hour, and a hard cap on how many
 *    invites can be outstanding at once.
 *  - The email carries NO free-text message. An invite that let the sender
 *    type a paragraph would be an open relay with our reputation on it. The
 *    company name is the only attacker-influenced string in the body, it is
 *    HTML-escaped, and it was already spam-scored when the company was saved.
 *  - Disposable addresses are refused (lib/email-domains.ts) — an invite to a
 *    throwaway inbox is either a mistake or a way to farm team rows.
 *
 * Accepting is a separate gate again: the signed-in account's email must match
 * the address the invite was sent to. See app/api/company/invites/accept.
 */
import { randomBytes } from "crypto";
import { escapeHtml, siteUrl } from "@/lib/alerts/send";
import { isDisposableEmail } from "@/lib/email-domains";

/** 30 days. Long enough that a forwarded invite still works after a holiday,
 *  short enough that a leaked link doesn't stay live forever. */
export const INVITE_TTL_DAYS = 30;

/** How many invites may be outstanding at once, per company. Not a licence
 *  tier — a blast radius. */
export const MAX_PENDING_INVITES = 25;

/** 24 bytes of entropy, URL-safe. Same shape as the endorsement token. */
export const newInviteToken = () => randomBytes(24).toString("base64url");

export const inviteUrl = (token: string) => `${siteUrl()}/join/${token}`;

export function inviteExpiry(from: Date): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Is this something we should send mail to?
 *
 * Deliberately a shape check, not a validity check: the only way to know an
 * address exists is to send to it, and pretending otherwise just rejects real
 * people with unusual addresses.
 */
export function checkInviteEmail(raw: unknown): { ok: true; email: string } | { ok: false; error: string } {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email) return { ok: false, error: "Enter an email address." };
  if (email.length > 254) return { ok: false, error: "That address is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  if (isDisposableEmail(email)) {
    return { ok: false, error: "That looks like a disposable address — invite a real work address instead." };
  }
  return { ok: true, email };
}

/**
 * The invite email.
 *
 * Says who is inviting and to what, and nothing else. No urgency, no fake
 * personalisation, and a plain statement of what happens next — including that
 * they need an account, because finding that out after clicking is the moment
 * most invites die.
 */
export function renderInviteEmail(opts: {
  companyName: string;
  inviterName: string | null;
  token: string;
}): { subject: string; html: string } {
  const url = inviteUrl(opts.token);
  const company = escapeHtml(opts.companyName);
  const who = opts.inviterName ? `${escapeHtml(opts.inviterName)} at ${company}` : company;

  return {
    subject: `Join ${opts.companyName} on Topezia`,
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">You've been invited to ${company}</h1>
      <p style="color:#6b7280;font-size:15px;line-height:1.55;margin:0 0 18px;">${who} invited you to be listed as part of their team on Topezia — the job platform that scores how well you actually fit a role instead of guessing.</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">Accept the invitation</a>
      <p style="color:#6b7280;font-size:13.5px;line-height:1.6;margin:20px 0 0;">You'll need a Topezia account, and it has to use this email address — that's how we know the invitation reached the right person. Creating one is free.</p>
      <p style="color:#9ca3af;font-size:13px;line-height:1.55;margin:14px 0 0;">Or paste this into your browser:<br/><span style="color:#6b7280;word-break:break-all;">${escapeHtml(url)}</span></p>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">This invitation expires in ${INVITE_TTL_DAYS} days. If you weren't expecting it, ignore it — nothing happens until you accept, and we won't email you again about it.</p>
  </div></body></html>`,
  };
}
