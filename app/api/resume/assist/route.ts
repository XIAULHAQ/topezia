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
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true, resumeText: true } });
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

  try {
    if (body.kind === "summary") {
      const out = await callModel(
        `Write a 2–3 sentence professional summary for this resume. Return {"summary": string}.\n\nCURRENT DRAFT:\n${JSON.stringify(draft)}${source}`,
        400
      );
      const summary = typeof out.summary === "string" ? out.summary.trim() : null;
      if (!summary) throw new Error("no summary in response");
      return NextResponse.json({ summary });
    }

    if (body.kind === "bullets") {
      const i = Number(body.roleIndex);
      const role = Number.isInteger(i) ? draft.experience[i] : undefined;
      if (!role) return NextResponse.json({ error: "That role wasn't found in your draft." }, { status: 400 });
      const out = await callModel(
        `Write 3–4 achievement bullets for this role: ${JSON.stringify(role)}. Use the draft and original text for context. Return {"bullets": string[]}.\n\nCURRENT DRAFT:\n${JSON.stringify(draft)}${source}`,
        600
      );
      const bullets = Array.isArray(out.bullets) ? out.bullets.filter((b): b is string => typeof b === "string" && !!b.trim()).slice(0, 4) : [];
      if (bullets.length === 0) throw new Error("no bullets in response");
      return NextResponse.json({ bullets });
    }

    return NextResponse.json({ error: "Unknown assist kind." }, { status: 400 });
  } catch (err) {
    console.error("resume assist failed:", err);
    return NextResponse.json({ error: "Couldn't draft that — try again." }, { status: 502 });
  }
}
