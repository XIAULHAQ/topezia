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

/* ── Suggested defaults ───────────────────────────────────────────────────
 * A blank config box asks the owner to invent form design on the spot; these
 * seed it from what their page already says about them. Deliberately
 * DETERMINISTIC — an LLM call to draft three dropdown options would be spend
 * without judgement, and the signals are unambiguous: showing client work or
 * taking project bids means services; live job postings mean hiring.
 *
 * Only ever a SUGGESTION: the API returns it alongside the config, the
 * editor seeds from it while the config is untouched, and nothing is written
 * until the owner saves. Saved-then-cleared fields stay cleared.
 */
export type ContactSignals = {
  liveJobs: number; // kind JOB, status LIVE
  liveProjects: number; // kind PROJECT, status LIVE
  work: number; // published case studies
  clients: number;
};

export function suggestContactConfig(s: ContactSignals): { reasons: string[]; questions: string[] } {
  // Showing work, listing clients, or taking bids = a services business.
  const services = s.work > 0 || s.clients > 0 || s.liveProjects > 0;
  const hiring = s.liveJobs > 0;

  const reasons: string[] = [];
  if (services) reasons.push("New project inquiry", "Request a quote");
  if (hiring) reasons.push("About a role you're hiring for");
  reasons.push("Partnership", "Press", "Something else");

  // Questions only where the answers change how the company responds. For a
  // services shop, budget and timing decide whether a lead is real; for
  // everyone else, the message field already asks the only question there is.
  const questions: string[] = services
    ? ["What do you need, in a sentence?", "Rough budget, if you have one?", "When would you want to start?"]
    : [];

  return {
    reasons: reasons.slice(0, INQUIRY_LIMITS.reasons),
    questions: questions.slice(0, INQUIRY_LIMITS.questions),
  };
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

/** The same, WITHOUT the 180-character snippet. What someone actually wrote
 *  belongs in the notification about it — an owner should not have to open a
 *  browser to read a four-line question. Line breaks survive. */
const fullQuote = (s: string) =>
  `<div style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 18px;border-left:3px solid #e5e7eb;padding-left:12px;white-space:pre-wrap;">${escapeHtml(s)}</div>`;

export type InquiryBrief = {
  summary: string;
  wants: string[];
  budget: string | null;
  timeline: string | null;
  openQuestions: string[];
};
export type InquiryTranscript = { role: "visitor" | "bot"; text: string }[];

/** Mail clients clip long messages (Gmail at ~102KB) and a clipped email hides
 *  the end of the conversation without saying so. Budget the transcript, drop
 *  the OLDEST turns first, and say plainly that it happened. */
const TRANSCRIPT_BUDGET = 36_000;

function transcriptBlock(turns: InquiryTranscript, who: string, companyName: string): string {
  if (!turns.length) return "";

  const rendered: string[] = [];
  let used = 0;
  let dropped = 0;
  // Newest first while budgeting, so what survives is the end of the
  // conversation — where the decision usually is.
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const visitor = t.role === "visitor";
    const label = visitor ? who : `${companyName} assistant`;
    const text = t.text.length > 1500 ? `${t.text.slice(0, 1500)}…` : t.text;
    const html =
      `<div style="margin:0 0 10px;">
         <div style="font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:${visitor ? "#4f46e5" : "#94a3b8"};margin:0 0 3px;">${escapeHtml(label)}</div>
         <div style="color:#334155;font-size:14px;line-height:1.55;background:${visitor ? "#f5f3ff" : "#f8fafc"};border-radius:10px;padding:9px 12px;white-space:pre-wrap;">${escapeHtml(text)}</div>
       </div>`;
    if (used + html.length > TRANSCRIPT_BUDGET && rendered.length) { dropped = i + 1; break; }
    used += html.length;
    rendered.unshift(html);
  }

  return `<div style="border-top:1px solid #ececf2;margin:20px 0 0;padding-top:18px;">
      <div style="font-size:13px;font-weight:700;color:#1a1a2e;margin:0 0 12px;">The whole conversation</div>
      ${dropped ? `<p style="color:#9ca3af;font-size:12px;margin:0 0 12px;">The first ${dropped} message${dropped === 1 ? "" : "s"} ${dropped === 1 ? "is" : "are"} not shown here to keep this email from being clipped — open your inbox for all of it.</p>` : ""}
      ${rendered.join("")}
    </div>`;
}

function briefBlock(brief: InquiryBrief): string {
  const line = (label: string, value: string) =>
    `<p style="margin:0 0 5px;color:#334155;font-size:13px;line-height:1.5;"><span style="color:#6b7280;">${label}:</span> ${escapeHtml(value)}</p>`;
  return `<div style="background:#fbfbfe;border:1px solid #ececf2;border-radius:12px;padding:14px 16px;margin:0 0 18px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:#6b7280;margin:0 0 8px;">What they're after</div>
      <p style="margin:0 0 8px;color:#1a1a2e;font-size:14px;line-height:1.5;font-weight:600;">${escapeHtml(brief.summary)}</p>
      ${brief.wants.length ? line("Wants", brief.wants.join(", ")) : ""}
      ${brief.budget ? line("Budget", brief.budget) : ""}
      ${brief.timeline ? line("Timing", brief.timeline) : ""}
      ${brief.openQuestions.length ? line("Still to ask", brief.openQuestions.join(" · ")) : ""}
    </div>`;
}

/**
 * To the company owner when someone writes to them — the contact form, or the
 * site chat.
 *
 * The whole thing goes in the email: their message in full, how to reach them,
 * the intake brief, and THE ENTIRE CONVERSATION, both sides. An owner reads
 * this on a phone and decides whether to drop what they're doing; a truncated
 * message and a missing chat is how a lead gets misjudged.
 */
export function renderNewInquiryEmail(opts: {
  companyName: string;
  senderName: string;
  reason: string | null;
  message: string;
  /** Site-chat leads: how to reach a visitor who has no account. */
  contact?: { email: string; phone: string | null } | null;
  /** Site-chat leads, where the plan builds one. */
  brief?: InquiryBrief | null;
  /** Site-chat leads: every turn, visitor and assistant, in order. */
  transcript?: InquiryTranscript | null;
}): { subject: string; html: string } {
  const url = `${siteUrl()}/employer/inquiries`;
  const who = escapeHtml(opts.senderName);
  const about = opts.reason ? ` about <strong>${escapeHtml(opts.reason)}</strong>` : "";
  const reach = opts.contact
    ? `<p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">Reach them: <a href="mailto:${escapeHtml(opts.contact.email)}" style="color:#4f46e5;font-weight:600;">${escapeHtml(opts.contact.email)}</a>${
        opts.contact.phone ? ` · <a href="tel:${escapeHtml(opts.contact.phone.replace(/[^\d+]/g, ""))}" style="color:#4f46e5;font-weight:600;">${escapeHtml(opts.contact.phone)}</a>` : ""
      }</p>`
    : "";
  return {
    subject: `${opts.senderName} contacted ${opts.companyName} on Topezia`,
    html: emailShell(
      `<h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">New message in your company inbox</h1>
       <p style="color:#6b7280;font-size:15px;line-height:1.55;margin:0 0 14px;">${who} wrote to ${escapeHtml(opts.companyName)}${about}:</p>
       ${fullQuote(opts.message)}
       ${reach}
       ${opts.brief ? briefBlock(opts.brief) : ""}
       ${button(url, "Open your inbox")}
       ${opts.transcript?.length ? transcriptBlock(opts.transcript, opts.senderName, opts.companyName) : ""}`,
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

/**
 * To an anonymous WIDGET visitor when the company replies. Unlike the member
 * variant, the reply text and the thread link do all the work — the visitor
 * has no Topezia account and never needs one. Holding the link is the proof
 * this mailbox is theirs.
 */
export function renderVisitorReplyEmail(opts: {
  companyName: string;
  body: string;
  threadToken: string;
}): { subject: string; html: string } {
  const url = `${siteUrl()}/i/${opts.threadToken}`;
  return {
    subject: `${opts.companyName} replied to your message`,
    html: emailShell(
      `<h1 style="font-size:20px;margin:0 0 8px;color:#1a1a2e;">${escapeHtml(opts.companyName)} wrote back</h1>
       ${quoteBlock(opts.body)}
       ${button(url, "Read and reply")}
       <p style="color:#9ca3af;font-size:13px;line-height:1.55;margin:20px 0 0;">This private link is your conversation — anyone with it can read and reply, so don't forward it.</p>`,
      `You get this because you left a message in the chat on ${escapeHtml(opts.companyName)}'s website.`
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
