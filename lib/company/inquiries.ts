/**
 * Contact form + inquiry inbox (migration 050).
 *
 * The design in one sentence: the contact form is the ONLY way a member can
 * start contact with a company, a submission is an inbox item rather than a
 * chat, and a thread exists only once the company replies. The sender cannot
 * follow up, bump, or re-send while it sits unanswered — candidate-initiated
 * open messaging is the LinkedIn-InMail failure mode this feature exists to
 * avoid.
 *
 * What the sender is never told: that they were marked spam. Their view shows
 * "Sent" for NEW, ARCHIVED and SPAM alike — the mark is the company's private
 * judgement and feeds the platform-wide lockout, nothing else. Routes that
 * serve the sender must map status down (see /api/inquiries) rather than
 * exposing the enum.
 */
import { escapeHtml, siteUrl } from "@/lib/alerts/send";

export const INQUIRY_LIMITS = {
  message: 2000,
  messageMin: 20, // "hi" is not an inquiry; a floor this low blocks only noise
  reason: 60,
  reasons: 6,
  question: 120,
  questions: 3,
  answer: 600,
  reply: 2000,
  thread: 60, // messages per thread — a conversation this long belongs in email
};

/** Distinct companies whose SPAM mark locks a sender out platform-wide.
 *  Computed from CompanyInquiry rows at submit time — no counter to drift.
 *  Three, not one: a single company's mark may just be a bad fit. */
export const SPAM_MARK_LOCKOUT = 3;

/** Days before a sender may contact the same company again after a submission
 *  that never got a reply (archived, marked spam, or still just old). A reply
 *  clears this — the thread is the channel from then on. */
export const RESUBMIT_COOLDOWN_DAYS = 30;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Single-line field: collapse whitespace, trim, cap. */
const line = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line field: keep newlines, trim, cap. */
const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "";

export type ContactConfig = {
  contactEnabled: boolean;
  contactReasons: string[];
  contactQuestions: string[];
};

export function validateContactConfig(body: Record<string, unknown>): Result<ContactConfig> {
  const enabled = body.contactEnabled;
  if (typeof enabled !== "boolean") return { ok: false, error: "contactEnabled must be true or false." };

  const rawReasons = Array.isArray(body.contactReasons) ? body.contactReasons : [];
  const reasons = Array.from(new Set(rawReasons.map((r) => line(r, INQUIRY_LIMITS.reason)).filter(Boolean)));
  if (reasons.length > INQUIRY_LIMITS.reasons) {
    return { ok: false, error: `Keep it to ${INQUIRY_LIMITS.reasons} reasons — a longer list is a form nobody reads.` };
  }

  const rawQuestions = Array.isArray(body.contactQuestions) ? body.contactQuestions : [];
  const questions = Array.from(new Set(rawQuestions.map((q) => line(q, INQUIRY_LIMITS.question)).filter(Boolean)));
  if (questions.length > INQUIRY_LIMITS.questions) {
    return { ok: false, error: `Up to ${INQUIRY_LIMITS.questions} extra questions.` };
  }

  return { ok: true, value: { contactEnabled: enabled, contactReasons: reasons, contactQuestions: questions } };
}

export type InquirySubmission = {
  reason: string | null;
  message: string;
  /** Snapshot of the company's questions at submit time, paired with answers.
   *  The config can change later without corrupting history. */
  answers: { question: string; answer: string }[] | null;
};

export function validateSubmission(
  body: Record<string, unknown>,
  config: { contactReasons: string[]; contactQuestions: string[] }
): Result<InquirySubmission> {
  const message = text(body.message, INQUIRY_LIMITS.message);
  if (message.length < INQUIRY_LIMITS.messageMin) {
    return { ok: false, error: "Say a little more — a sentence or two about why you're reaching out." };
  }

  let reason: string | null = null;
  if (config.contactReasons.length) {
    reason = line(body.reason, INQUIRY_LIMITS.reason);
    if (!config.contactReasons.includes(reason)) {
      return { ok: false, error: "Pick a reason for reaching out." };
    }
  }

  let answers: { question: string; answer: string }[] | null = null;
  if (config.contactQuestions.length) {
    const given = (body.answers ?? {}) as Record<string, unknown>;
    const pairs = config.contactQuestions
      .map((q) => ({ question: q, answer: text(given[q], INQUIRY_LIMITS.answer) }))
      .filter((p) => p.answer.length > 0); // every extra question is optional
    answers = pairs.length ? pairs : null;
  }

  return { ok: true, value: { reason, message, answers } };
}

/* ── Notification emails ──────────────────────────────────────────────────
 * Same posture as the invite family (lib/company/invites.ts): the row is the
 * artifact, the email is a convenience — callers catch delivery failures and
 * report `emailed: false` rather than failing the request. All content is a
 * short escaped snippet plus a link; the inbox is the product surface, the
 * email is not.
 */

/** Sender for inquiry mail. NOT the job-alerts identity: "Topezia Job Alerts"
 *  on a "so-and-so replied to you" envelope reads like a broadcast and gets
 *  the open rate of one. The domain is Resend-verified, so no dashboard work
 *  is needed for a second address on it. */
export const INQUIRY_FROM = process.env.INQUIRY_FROM_EMAIL ?? "Topezia <messages@mail.topezia.com>";

const snippet = (s: string) => escapeHtml(s.length > 180 ? `${s.slice(0, 180)}…` : s);

const emailShell = (inner: string, footer: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">${inner}</div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">${footer}</p>
  </div></body></html>`;

const button = (url: string, label: string) =>
  `<a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">${label}</a>`;

const quoteBlock = (s: string) =>
  `<p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 18px;border-left:3px solid #e5e7eb;padding-left:12px;">${snippet(s)}</p>`;

/** To the company owner when a member submits the contact form. */
export function renderNewInquiryEmail(opts: {
  companyName: string;
  senderName: string;
  reason: string | null;
  message: string;
}): { subject: string; html: string } {
  const url = `${siteUrl()}/employer/inquiries`;
  const who = escapeHtml(opts.senderName);
  const about = opts.reason ? ` about <strong>${escapeHtml(opts.reason)}</strong>` : "";
  return {
    subject: `${opts.senderName} contacted ${opts.companyName} on Topezia`,
    html: emailShell(
      `<h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">New message in your company inbox</h1>
       <p style="color:#6b7280;font-size:15px;line-height:1.55;margin:0 0 14px;">${who} wrote to ${escapeHtml(opts.companyName)}${about}:</p>
       ${quoteBlock(opts.message)}
       ${button(url, "Open your inbox")}`,
      `You get this because your company's contact form is on. Turn it off any time from your inbox page — nothing else changes.`
    ),
  };
}

/** To the sender when the company replies — the moment a thread exists. */
export function renderCompanyReplyEmail(opts: {
  companyName: string;
  body: string;
}): { subject: string; html: string } {
  const url = `${siteUrl()}/messages`;
  return {
    subject: `${opts.companyName} replied to you on Topezia`,
    html: emailShell(
      `<h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">${escapeHtml(opts.companyName)} wrote back</h1>
       ${quoteBlock(opts.body)}
       ${button(url, "Read and reply")}`,
      `You get this because you contacted ${escapeHtml(opts.companyName)} through their Topezia page.`
    ),
  };
}

/** To the company owner when the sender answers inside an open thread. */
export function renderCandidateReplyEmail(opts: {
  companyName: string;
  senderName: string;
  body: string;
}): { subject: string; html: string } {
  const url = `${siteUrl()}/employer/inquiries`;
  return {
    subject: `${opts.senderName} replied on Topezia`,
    html: emailShell(
      `<h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">${escapeHtml(opts.senderName)} replied</h1>
       ${quoteBlock(opts.body)}
       ${button(url, "Open the conversation")}`,
      `You get this because you replied to ${escapeHtml(opts.senderName)} from your ${escapeHtml(opts.companyName)} inbox.`
    ),
  };
}
