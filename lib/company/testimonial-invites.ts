/**
 * Asking a client to write the testimonial themselves.
 *
 * The second thing on this product that emails an address a user chose, so it
 * inherits the team-invite posture wholesale (lib/company/invites.ts): owner
 * only, rate limited at the route, a cap on outstanding requests, disposable
 * addresses refused, and NO free-text message from the sender — an invite that
 * let someone type a paragraph would be an open relay with our sending
 * reputation on it.
 *
 * What differs from the team invite: the client does NOT need a Topezia
 * account. Requiring one would kill the response rate — a design client has no
 * reason to hold an account here — and it would not buy much, because the
 * meaningful check is that they received the email, which the token already
 * proves. It is NOT proof of identity, and the public label says only what is
 * true: written by the client through an invitation, not verified by us.
 */
import { randomBytes } from "crypto";
import { escapeHtml, siteUrl } from "@/lib/alerts/send";
import { isDisposableEmail } from "@/lib/email-domains";

/** 60 days. Longer than a team invite on purpose: "write me a testimonial" is
 *  a favour that waits for a quiet afternoon, not a decision someone makes the
 *  day they read it. */
export const TESTIMONIAL_INVITE_TTL_DAYS = 60;

/** Outstanding requests per company. A blast radius, not a plan tier. */
export const MAX_PENDING_TESTIMONIAL_INVITES = 25;

export const newTestimonialToken = () => randomBytes(24).toString("base64url");

export const testimonialInviteUrl = (token: string) => `${siteUrl()}/t/${token}`;

export function testimonialInviteExpiry(from: Date): Date {
  return new Date(from.getTime() + TESTIMONIAL_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The invitation email.
 *
 * Names the company, says plainly what is being asked and how long it takes,
 * and states that the words will be published as theirs. No urgency and no
 * fake personalisation — this is a favour being asked, and dressing it up as
 * anything else is how these get marked as spam.
 */
export function renderTestimonialInviteEmail(opts: {
  companyName: string;
  inviterName: string | null;
  token: string;
}): { subject: string; html: string } {
  const url = testimonialInviteUrl(opts.token);
  const company = escapeHtml(opts.companyName);
  const who = opts.inviterName ? `${escapeHtml(opts.inviterName)} at ${company}` : company;

  return {
    subject: `${opts.companyName} would like your feedback`,
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">Would you say a few words about ${company}?</h1>
      <p style="color:#6b7280;font-size:15px;line-height:1.55;margin:0 0 18px;">${who} asked if you'd write a short testimonial about working with them. It takes a minute, you don't need an account, and you write it in your own words — they can't edit what you say.</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">Write a testimonial</a>
      <p style="color:#6b7280;font-size:13.5px;line-height:1.6;margin:20px 0 0;">It will appear on their public page on Topezia, credited to the name you give. If you'd rather not, just ignore this — nothing happens either way.</p>
      <p style="color:#9ca3af;font-size:13px;line-height:1.55;margin:14px 0 0;">Or paste this into your browser:<br/><span style="color:#6b7280;word-break:break-all;">${escapeHtml(url)}</span></p>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">This link expires in ${TESTIMONIAL_INVITE_TTL_DAYS} days. We won't email you about it again.</p>
  </div></body></html>`,
  };
}

/** Shape check, same rules as the team invite. */
export function checkTestimonialEmail(raw: unknown): { ok: true; email: string } | { ok: false; error: string } {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email) return { ok: false, error: "Enter an email address." };
  if (email.length > 254) return { ok: false, error: "That address is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "That doesn't look like an email address." };
  if (isDisposableEmail(email)) {
    return { ok: false, error: "That looks like a disposable address — use the client's real one." };
  }
  return { ok: true, email };
}
