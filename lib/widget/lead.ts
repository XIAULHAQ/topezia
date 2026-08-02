/**
 * Turning a website visitor into a lead — the ONE place it happens.
 *
 * There are two ways a visitor hands over their details, and they have to end
 * in exactly the same row, the same email and the same spam posture:
 *
 *   1. They fill in the card (the "who are you" invite, or the message form
 *      after a handoff) — POST /api/widget/{token}/inquiry.
 *   2. THEY JUST TYPE IT INTO THE CHAT. "Name: … Email: … Phone: …", or a bare
 *      address in a sentence, because the assistant asked and a chat box is
 *      right there. This is the common case, not the edge case, and until
 *      lib/widget/contact.ts + this module existed it went NOWHERE: the
 *      details were answered like any other question and the lead was lost.
 *
 * Both paths call createWidgetLead. It validates, scores for spam, enforces
 * the one-open-inquiry rule, builds the intake brief where the plan allows,
 * writes the row and mails the owner. THE LEAD ITSELF IS NEVER GATED — the
 * brief is the paid part; losing a customer's customer is not a plan feature.
 *
 * Callers own their own rate limiting: the two entry points have different
 * abuse shapes (a form post versus a sentence in a conversation).
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { scoreUgcFields, isSpam, spamMessage } from "@/lib/ugc";
import { isDisposableEmail } from "@/lib/email-domains";
import { userEmail } from "@/lib/company/owner";
import { sendEmail } from "@/lib/alerts/send";
import { INQUIRY_LIMITS, INQUIRY_FROM, renderNewInquiryEmail } from "@/lib/company/inquiries";
import { planFor } from "@/lib/billing/plans";
import { buildBrief } from "./intake";
import type { ChatTurn } from "./answer";

export type LeadSite = {
  id: string;
  company: { id: string; name: string; ownerUserId: string; plan: string };
};

export type LeadInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
  message: string;
  transcript?: ChatTurn[];
};

export type LeadResult =
  | { ok: true; id: string; threadToken: string; emailed: boolean }
  /** `open` marks the one-open-inquiry case: nothing was written because the
   *  team already has this person's message. It is a refusal to the form and
   *  a shrug to the chat, which is why callers get to tell them apart. */
  | { ok: false; status: number; error: string; open?: boolean };

/** Everything except the message — shared so the chat can decide whether it
 *  has enough to make a lead before it bothers composing one. */
export function normalizeLead(input: LeadInput) {
  const email = input.email.trim().toLowerCase();
  const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  // Optional, and gently: keep only phone-shaped characters and drop the
  // field rather than refuse the lead over a typo'd number.
  const rawPhone = (input.phone ?? "").replace(/[^\d+()\-. ]/g, "").trim().slice(0, 30);
  return {
    email,
    name,
    phone: /\d{5,}/.test(rawPhone.replace(/\D/g, "")) ? rawPhone : null,
    validEmail: Boolean(email) && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email),
  };
}

export async function createWidgetLead(site: LeadSite, input: LeadInput): Promise<LeadResult> {
  const { email, name, phone, validEmail } = normalizeLead(input);
  if (!validEmail) {
    return { ok: false, status: 400, error: "Enter a real email — it's how the reply reaches you." };
  }
  if (isDisposableEmail(email)) {
    return { ok: false, status: 400, error: "Use an address you actually read — the reply goes there." };
  }

  const message = input.message.replace(/\r\n/g, "\n").trim().slice(0, INQUIRY_LIMITS.message);
  if (message.length < INQUIRY_LIMITS.messageMin) {
    return { ok: false, status: 400, error: "Say a little more so the team can actually help." };
  }

  const transcript: ChatTurn[] = (input.transcript ?? [])
    .slice(-30)
    .flatMap((t) =>
      (t.role === "visitor" || t.role === "bot") && typeof t.text === "string" && t.text.trim()
        ? [{ role: t.role, text: t.text.trim().slice(0, 1500) }]
        : []
    );

  const verdict = scoreUgcFields([name, message]);
  if (isSpam(verdict)) return { ok: false, status: 422, error: spamMessage(verdict) };

  // Per SITE, not per company: on an agency account, writing to two
  // different client sites is two conversations, not a duplicate.
  const open = await prisma.companyInquiry.findFirst({
    where: { siteId: site.id, visitorEmail: email, status: "NEW", source: "WIDGET" },
    select: { id: true },
  });
  if (open) {
    return {
      ok: false,
      status: 409,
      error: "You already have a message waiting with the team — they'll reply to your email.",
      open: true,
    };
  }

  // Concierge intake: read the chat once and hand the owner a brief. Paid
  // (a model call per lead) and best effort — without it the lead is
  // delivered exactly as it always was.
  const brief = planFor(site.company).aiAssist
    ? await buildBrief(site.company.name, transcript, message, { name: name || null, email })
    : null;

  let inquiry;
  try {
    inquiry = await prisma.companyInquiry.create({
      data: {
        companyId: site.company.id,
        siteId: site.id,
        source: "WIDGET",
        visitorEmail: email,
        visitorName: name || null,
        visitorPhone: phone,
        threadToken: randomBytes(24).toString("base64url"),
        transcript: transcript.length ? transcript : undefined,
        brief: brief ?? undefined,
        message,
      },
      select: { id: true, threadToken: true },
    });
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
      return { ok: false, status: 409, error: "You already have a message waiting with the team.", open: true };
    }
    throw err;
  }

  let emailed = false;
  try {
    const to = await userEmail(site.company.ownerUserId);
    if (to) {
      // The brief goes in the email too — the owner often decides whether to
      // act from their phone, before they ever open the inbox.
      const briefLines = brief
        ? [
            ``,
            `— What they're after —`,
            brief.summary,
            ...(brief.wants.length ? [`Wants: ${brief.wants.join(", ")}`] : []),
            ...(brief.budget ? [`Budget: ${brief.budget}`] : []),
            ...(brief.timeline ? [`Timing: ${brief.timeline}`] : []),
            ...(brief.openQuestions.length ? [`Still to ask: ${brief.openQuestions.join(" · ")}`] : []),
          ].join("\n")
        : "";
      const { subject, html } = renderNewInquiryEmail({
        companyName: site.company.name,
        senderName: name || email,
        reason: "Website chat",
        message: `${message}\n${briefLines}\n\nReach them: ${email}${phone ? ` · ${phone}` : ""}`,
      });
      await sendEmail({ to, subject, html, from: INQUIRY_FROM });
      emailed = true;
    }
  } catch (err) {
    console.error("[widget/lead] delivery failed:", err instanceof Error ? err.message : err);
  }

  return { ok: true, id: inquiry.id, threadToken: inquiry.threadToken!, emailed };
}
