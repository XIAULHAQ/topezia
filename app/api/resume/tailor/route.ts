/**
 * POST /api/resume/tailor — generate (and save) a resume version tailored to
 * one specific job posting: skills reordered/selected toward what the
 * posting asks for, experience bullets re-emphasized, summary adjusted to
 * speak to it. Saved straight to TailoredResumeDoc — unlike /api/resume/assist,
 * this isn't a per-click suggestion the person accepts into a draft; it's a
 * persistent artifact they come back to and download. Clicking Tailor again
 * for the same job simply regenerates it, the same way re-uploading a resume
 * already silently overwrites the profile's parsed data.
 *
 * Premium-only (Brandon's call): tailoring is the concrete feature behind the
 * sidebar's existing "unlimited resume versions" pitch, so it's the one AI
 * resume feature that doesn't share the free-tier assist quota.
 *
 * Grounding discipline is identical to /api/resume/assist: the model sees
 * only the person's current main resume + their original resumeText + this
 * job's own title/description/skills, and is told never to invent employers,
 * dates, metrics or tools that appear in none of those.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sanitizeContent, asJson } from "@/lib/resume/doc";
import { loadResumeProfile, loadMainResumeContent } from "@/lib/resume/load";
import { jobDescriptionText } from "@/lib/sanitize";

export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You tailor a resume to one specific job posting. You will be given the person's current resume (JSON), possibly the raw text of an earlier resume they uploaded, and the job posting's title, description and requested skills.

Hard rules:
- Ground every claim in the provided material. NEVER invent employers, job titles, dates, metrics, percentages, team sizes, tools or skills that appear in neither source — tailoring means REORDERING and RE-EMPHASIZING what's true, never adding what isn't.
- skills: return the SAME set of skill names the person already has (you may drop ones clearly irrelevant to this job, never add new ones), reordered so the ones this job asks for lead.
- experience: same roles, same titles/companies/years — you may reorder each role's existing bullets and lightly tighten their wording, and you may leave a role's bullets unchanged, but never add a bullet describing something not already in the source material.
- summary: 2-3 sentences, written for THIS job specifically, grounded in what the person has actually done. Do not use the words "passionate", "results-driven", "dynamic" or "synergy".
- Return ONLY valid JSON: {"skills": string[], "experience": [{"title": string, "company": string, "years": string, "bullets": string[]}], "summary": string}, no prose around it.`;

async function callModel(user: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0.3,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`tailor model call failed: ${res.status}`);
  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export async function POST(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await loadResumeProfile(userId);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Tailoring isn't available right now." }, { status: 503 });
  if (profile.tier !== "PREMIUM") {
    return NextResponse.json({ error: "Tailoring a resume to a specific job is a Premium feature.", upgrade: true }, { status: 402 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const jobId = typeof (body as { jobId?: unknown }).jobId === "string" ? (body as { jobId: string }).jobId : null;
  if (!jobId) return NextResponse.json({ error: "Missing jobId." }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      titleNormalized: true, titleRaw: true, companyName: true, descriptionRaw: true,
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
  if (!job) return NextResponse.json({ error: "That job wasn't found." }, { status: 404 });

  const { content: main } = await loadMainResumeContent(profile);
  const jobText = [
    `Job title: ${job.titleNormalized ?? job.titleRaw}`,
    `Company: ${job.companyName}`,
    job.skills.length ? `Requested skills: ${job.skills.map((s) => s.skill.name).join(", ")}` : "",
    `Description:\n${jobDescriptionText(job.descriptionRaw, 4000)}`,
  ].filter(Boolean).join("\n\n");
  const source = profile.resumeText ? `\n\nORIGINAL RESUME TEXT:\n${profile.resumeText.slice(0, 8000)}` : "";

  try {
    const out = await callModel(
      `Tailor this resume to the job below. Return {"skills": string[], "experience": [...], "summary": string} as specified.\n\nCURRENT RESUME:\n${JSON.stringify({ skills: main.skills, experience: main.experience, summary: main.summary })}\n\nJOB:\n${jobText}${source}`
    );

    const skills = Array.isArray(out.skills) ? out.skills.filter((s): s is string => typeof s === "string" && !!s.trim()) : main.skills;
    // Never trust the model's own facts back for title/company/years — only
    // its bullet reordering. A wrong title/company here would misrepresent
    // the person's actual work history on a document they send to an employer.
    const experience = Array.isArray(out.experience)
      ? main.experience.map((role, i) => {
          const t = (out.experience as unknown[])[i] as { bullets?: unknown } | undefined;
          const bullets = t && Array.isArray(t.bullets) ? t.bullets.filter((b): b is string => typeof b === "string" && !!b.trim()) : role.bullets;
          // Only accept a reordering/subset of bullets that actually exist —
          // never a bullet the model introduced with no match in the source.
          const known = new Set(role.bullets.map((b) => b.trim()));
          return { ...role, bullets: bullets.every((b) => known.has(b.trim())) ? bullets : role.bullets };
        })
      : main.experience;
    const summary = typeof out.summary === "string" && out.summary.trim() ? out.summary.trim() : main.summary;

    const content = sanitizeContent({ ...main, skills, experience, summary });
    const saved = await prisma.tailoredResumeDoc.upsert({
      where: { profileId_jobId: { profileId: profile.id, jobId } },
      create: { profileId: profile.id, jobId, content: asJson(content) },
      update: { content: asJson(content) },
      select: { updatedAt: true },
    });

    return NextResponse.json({
      content, updatedAt: saved.updatedAt,
      job: { title: job.titleNormalized ?? job.titleRaw, company: job.companyName },
    });
  } catch (err) {
    console.error("resume tailor failed:", err);
    return NextResponse.json({ error: "Couldn't tailor that resume — try again." }, { status: 502 });
  }
}
