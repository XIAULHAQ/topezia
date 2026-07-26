/**
 * POST /api/postings/assist — the AI job-description writer.
 *
 * Employer-invoked, never automatic: it drafts FROM the employer's own notes,
 * and the result lands in an editable textarea — the employer publishes their
 * words, not the model's unreviewed ones. Honesty rules in the prompt: no
 * invented benefits, salaries, or company claims the notes don't contain.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const company = await prisma.company.findUnique({ where: { ownerUserId: userId }, select: { name: true, tagline: true, about: true, location: true } });
  if (!company) return NextResponse.json({ error: "Create your company page first." }, { status: 409 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI writing isn't available right now." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body.kind === "PROJECT" ? "project" : "job";
  const title = str(body.title, 140);
  const role = str(body.role, 100);
  const notes = str(body.notes, 3000);
  const skills = Array.isArray(body.skills) ? body.skills.map((s) => str(s, 60)).filter(Boolean).slice(0, 20) : [];
  if (!title || notes.length < 20) {
    return NextResponse.json({ error: "Give it a title and a few real notes to work from (20+ characters)." }, { status: 400 });
  }

  const system = `You write ${kind} descriptions for a job platform. Write ONLY from the facts provided — never invent benefits, salary, team size, funding, or company claims the notes don't contain. Plain text with short paragraphs and dash bullets (no markdown headers). Structure: 2-3 sentence opening on the ${kind} and company; "What you'll do" bullets; "What we're looking for" bullets${kind === "project" ? '; "Scope & deliverables" with timeline if the notes give one' : ""}. 150-350 words. Professional, direct, zero buzzword filler ("rockstar", "fast-paced", "wear many hats"). If the notes mention pay or location, keep those exact numbers/places; otherwise stay silent on them.`;

  const user = `Company: ${company.name}${company.tagline ? ` — ${company.tagline}` : ""}${company.location ? ` (${company.location})` : ""}
${company.about ? `About the company: ${company.about.slice(0, 600)}\n` : ""}Title: ${title}${role ? `\nRole category: ${role}` : ""}${skills.length ? `\nRequired skills: ${skills.join(", ")}` : ""}
Employer's notes:
${notes}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, temperature: 0.4, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`api ${res.status}`);
    const data = await res.json();
    const draft = (data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "").trim();
    if (!draft) throw new Error("empty");
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("posting assist failed:", err);
    return NextResponse.json({ error: "Couldn't draft that — try again." }, { status: 502 });
  }
}
