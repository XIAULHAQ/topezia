/**
 * POST /api/resume/focus — the Focus Check: which professions does this
 * resume's skill list point at?
 *
 * Zero AI cost, pure counting: every ingested job already links its skills to
 * a vertical (JobSkill → Job.verticalId), so each resume skill is classified
 * by which vertical's LIVE postings demand it most. Skills the corpus can't
 * place (no taxonomy match, or fewer than MIN_EVIDENCE postings) stay
 * unclassified and NEVER count toward a direction — we never invent a cluster.
 *
 * A "direction" is a vertical claiming 2+ of the resume's skills. Two or more
 * directions = the resume reads as several different people; the client asks
 * which one this resume is for.
 *
 * POST (not GET) because the skill list is the CLIENT's live editing state,
 * not what's saved — the check must reflect the resume as it looks right now.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { LIMITS } from "@/lib/resume/doc";

export const maxDuration = 30;

/** A skill needs this many live postings in a vertical to be classified. */
const MIN_EVIDENCE = 3;
/** A vertical needs this many of the resume's skills to be a direction. */
const MIN_DIRECTION_SKILLS = 2;

export interface FocusDirection {
  label: string; // vertical name, e.g. "Marketing & Growth"
  skills: string[]; // the resume's skill names (original casing) it claims
}

export async function POST(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const names = [...new Set(
    (Array.isArray((body as { skills?: unknown }).skills) ? (body as { skills: unknown[] }).skills : [])
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.replace(/\s+/g, " ").trim().slice(0, 60))
      .filter(Boolean)
  )].slice(0, LIMITS.skills);
  if (names.length < 2) return NextResponse.json({ directions: [] });

  try {
    // Resume skills are free text — match to the taxonomy by name,
    // case-insensitively. Unmatched names are simply unclassified.
    const skillRows = await prisma.skill.findMany({
      where: { OR: names.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })) },
      select: { id: true, name: true },
    });
    if (skillRows.length < 2) return NextResponse.json({ directions: [] });
    const originalName = new Map(names.map((n) => [n.toLowerCase(), n]));

    // Each skill's demand per vertical, counted from live postings.
    const counts = await prisma.$queryRawUnsafe<{ skillId: string; verticalId: string; n: number }[]>(
      `SELECT js."skillId", j."verticalId", COUNT(*)::int AS n
       FROM "JobSkill" js JOIN "Job" j ON j.id = js."jobId"
       WHERE js."skillId" = ANY($1::text[]) AND j.status = 'LIVE' AND j."verticalId" IS NOT NULL
       GROUP BY js."skillId", j."verticalId"`,
      skillRows.map((s) => s.id)
    );

    // Dominant vertical per skill, with an evidence floor.
    const topByVertical = new Map<string, string[]>(); // verticalId → skill names
    for (const s of skillRows) {
      const mine = counts.filter((c) => c.skillId === s.id).sort((a, b) => b.n - a.n);
      if (!mine.length || mine[0].n < MIN_EVIDENCE) continue;
      const list = topByVertical.get(mine[0].verticalId) ?? [];
      list.push(originalName.get(s.name.toLowerCase()) ?? s.name);
      topByVertical.set(mine[0].verticalId, list);
    }

    const verticals = await prisma.vertical.findMany({
      where: { id: { in: [...topByVertical.keys()] }, slug: { not: "unsorted" } },
      select: { id: true, name: true },
    });
    const directions: FocusDirection[] = verticals
      .map((v) => ({ label: v.name, skills: topByVertical.get(v.id) ?? [] }))
      .filter((d) => d.skills.length >= MIN_DIRECTION_SKILLS)
      .sort((a, b) => b.skills.length - a.skills.length);

    return NextResponse.json({ directions });
  } catch (err) {
    console.error("focus check failed:", err);
    return NextResponse.json({ error: "Couldn't run the focus check." }, { status: 502 });
  }
}
