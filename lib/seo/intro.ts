/**
 * LLM-written page intros (spec §7).
 *
 * Two rules shape this:
 *  1. Pages NEVER block on the model. resolveSeoPage reads the cache; a miss
 *     just falls back to the templated intro. Copy is generated out of band by
 *     scripts/generate-page-intros.ts.
 *  2. The copy must be honest. It's fed real counts and real sample titles, and
 *     told not to invent numbers — an SEO page that oversells is the same lie
 *     as an inflated match score.
 */
import { prisma } from "@/lib/prisma";

export const INTRO_MODEL = "claude-haiku-4-5-20251001";
export const INTRO_MAX_AGE_DAYS = 30; // §7: "regenerated monthly"

export interface IntroContext {
  pageKey: string; // canonical path — the cache key
  heading: string;
  jobCount: number;
  sampleTitles: string[];
  sampleCompanies: string[];
}

/** Cached intro for a page, or null. Cheap read — safe on the render path. */
export async function getCachedIntro(pageKey: string): Promise<string | null> {
  const row = await prisma.seoPageIntro.findUnique({
    where: { pageKey },
    select: { intro: true },
  });
  return row?.intro ?? null;
}

const PROMPT = `You write the short intro paragraph at the top of a job-search landing page for Topezia, an honest AI job-matching aggregator.

Rules:
- 2-3 sentences. Plain, specific, human. No marketing fluff, no "unlock", no "dive into", no exclamation marks.
- Use ONLY the facts given. Never invent numbers, salaries, companies or claims.
- You may reference the real job count and the kinds of employers/roles listed.
- Topezia's actual promises, which you may draw on: jobs are aggregated from company career pages and re-verified so listings aren't dead; upload a resume once and get an honest match score INCLUDING low ones, with visible skill gaps; we send people to the original posting and never trap the application.
- Write for someone searching for this exact kind of job. Address them as "you".
- Return ONLY the paragraph text. No quotes, no preamble, no markdown.`;

/** Generate intro copy. Throws on API failure — callers decide what to do. */
export async function generateIntro(ctx: IntroContext): Promise<string> {
  const user = `Page heading: ${ctx.heading}
Live jobs on this page: ${ctx.jobCount}
Example job titles: ${ctx.sampleTitles.slice(0, 6).join("; ") || "(none)"}
Example employers: ${[...new Set(ctx.sampleCompanies)].slice(0, 6).join("; ") || "(none)"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: INTRO_MODEL,
      max_tokens: 300,
      temperature: 0.7, // some variety, or every page reads identically
      system: PROMPT,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Intro generation failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const text: string = data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
  const clean = text.trim().replace(/^["']|["']$/g, "");
  if (!clean) throw new Error("Intro generation returned empty text");
  return clean;
}

export async function saveIntro(pageKey: string, intro: string, jobCount: number): Promise<void> {
  await prisma.seoPageIntro.upsert({
    where: { pageKey },
    create: { pageKey, intro, jobCount, model: INTRO_MODEL },
    update: { intro, jobCount, model: INTRO_MODEL, generatedAt: new Date() },
  });
}
