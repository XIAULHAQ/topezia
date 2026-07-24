/**
 * /api/resume/assist — AI drafting for the Resume Builder.
 *
 * Two kinds: a professional summary, or achievement bullets for one role.
 * The model is grounded in exactly two sources — the current draft the client
 * sends, and the original resumeText stored on the profile — and the system
 * prompt forbids inventing employers, dates, metrics or tools that appear in
 * neither. A resume with fabricated numbers is worse than a thin one; this
 * whole product's stance is honest signals, and its writing tool doesn't get
 * an exemption.
 *
 * Suggestions are returned, never saved: the person accepts them into their
 * draft and saves the draft. The model writes; the member decides.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sanitizeContent, type ResumeContent } from "@/lib/resume/doc";
import { consumeAssist, blockedMessage } from "@/lib/resume/assist-quota";

export const maxDuration = 60;

// Same model tier as resume parsing — drafting three bullets doesn't need a
// frontier model, and this endpoint fires per click.
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You draft resume content. You will be given the person's current resume draft (JSON) and possibly the raw text of an earlier resume they uploaded.

Hard rules:
- Ground every claim in the provided material. NEVER invent employers, job titles, dates, metrics, percentages, team sizes, or tools that appear in neither source. A number you were not given does not exist.
- If the material is thin, write fewer, plainer lines rather than padding. Do not use the words "passionate", "results-driven", "dynamic" or "synergy".
- Write in the first person implied style of resumes: no "I", start bullets with a strong verb, past tense for past roles, present for current.
- Return ONLY valid JSON, no prose around it.`;

type AssistBody = { kind: "summary" | "bullets"; roleIndex?: number; content?: unknown };

async function callModel(user: string, maxTokens: number): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.4, // some phrasing variety; facts are constrained by the prompt
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`assist model call failed: ${res.status}`);
  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export async function POST(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true, resumeText: true, tier: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Writing help isn't available right now." }, { status: 503 });

  let body: AssistBody;
  try {
    body = (await req.json()) as AssistBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // The draft the person is looking at, not the saved row — assist must work
  // on unsaved edits or the button would silently ignore what's on screen.
  const draft: ResumeContent = sanitizeContent(body.content);
  const source = profile.resumeText ? `\n\nORIGINAL RESUME TEXT:\n${profile.resumeText.slice(0, 8000)}` : "";

  // Validate the request FULLY before touching the quota — consuming a
  // window on a request that 400s would spend a free month's allowance on
  // a malformed click.
  const roleIdx = Number(body.roleIndex);
  if (body.kind !== "summary" && body.kind !== "bullets") {
    return NextResponse.json({ error: "Unknown assist kind." }, { status: 400 });
  }
  if (body.kind === "bullets" && (!Number.isInteger(roleIdx) || !draft.experience[roleIdx])) {
    return NextResponse.json({ error: "That role wasn't found in your draft." }, { status: 400 });
  }

  // Quota gate — the model call is the thing being metered. consumeAssist
  // opens a window only when needed; every call inside an open window rides
  // free, so one "update" covers a whole editing session. A failed model
  // call after this point is retryable inside the same 24h window, so
  // nothing is lost to a transient 502.
  const quota = await consumeAssist(profile.id, profile.tier);
  if (!quota.allowed) {
    return NextResponse.json({ error: blockedMessage(quota), assist: quota }, { status: 429 });
  }

  try {
    if (body.kind === "summary") {
      const out = await callModel(
        `Write a 2–3 sentence professional summary for this resume. Return {"summary": string}.\n\nCURRENT DRAFT:\n${JSON.stringify(draft)}${source}`,
        400
      );
      const summary = typeof out.summary === "string" ? out.summary.trim() : null;
      if (!summary) throw new Error("no summary in response");
      return NextResponse.json({ summary, assist: quota });
    }

    if (body.kind === "bullets") {
      const role = draft.experience[roleIdx];
      const out = await callModel(
        `Write 3–4 achievement bullets for this role: ${JSON.stringify(role)}. Use the draft and original text for context. Return {"bullets": string[]}.\n\nCURRENT DRAFT:\n${JSON.stringify(draft)}${source}`,
        600
      );
      const bullets = Array.isArray(out.bullets) ? out.bullets.filter((b): b is string => typeof b === "string" && !!b.trim()).slice(0, 4) : [];
      if (bullets.length === 0) throw new Error("no bullets in response");
      return NextResponse.json({ bullets, assist: quota });
    }

    // Unreachable — kind was validated above — but TypeScript can't see that.
    return NextResponse.json({ error: "Unknown assist kind." }, { status: 400 });
  } catch (err) {
    console.error("resume assist failed:", err);
    return NextResponse.json({ error: "Couldn't draft that — try again." }, { status: 502 });
  }
}
