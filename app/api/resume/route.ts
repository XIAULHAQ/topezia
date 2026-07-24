/**
 * /api/resume — load and save the Resume Builder document.
 *
 * GET returns the saved doc, or a profile-seeded draft when none exists yet.
 * The seed is NOT saved on read: a row appears only when the person actually
 * saves, so opening the page once doesn't mint DB rows for every looker.
 *
 * PUT upserts the whole document. Whole-doc on purpose — the resume is edited
 * as one thing and is small; per-field patching would buy nothing but bugs.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sanitizeContent, seedFromProfile, asJson, type ResumeContent } from "@/lib/resume/doc";
import { peekAssistStatus } from "@/lib/resume/assist-quota";
import { portfolioImageUrl } from "@/lib/portfolio/storage";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

const PROFILE_SELECT = {
  id: true, tier: true, fullName: true, headlineRoleId: true, currentLocation: true,
  workHistory: true, education: true, certifications: true, languages: true, recommendations: true,
  skills: { select: { tier: true, skill: { select: { name: true } } } },
} as const;

/** Published portfolio pieces as resume-project rows — absolute URLs, since
 *  the printed PDF's links must work from anyone's machine. */
async function loadProjects(profileId: string) {
  const rows = await prisma.portfolio.findMany({
    where: { profileId, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: { title: true, slug: true, coverPath: true },
  });
  return rows.map((r) => ({ title: r.title, url: `${SITE}/portfolio/${r.slug}`, thumb: portfolioImageUrl(r.coverPath) }));
}

async function loadProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId }, select: PROFILE_SELECT });
}

export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await loadProfile(userId);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const assist = await peekAssistStatus(profile.id, profile.tier);

  const doc = await prisma.resumeDoc.findUnique({ where: { profileId: profile.id }, select: { content: true, updatedAt: true } });
  if (doc) {
    const content = sanitizeContent(doc.content);
    // Docs saved before projects/languages/recommendations existed have no
    // such keys. Fill those sections from the profile ON READ — but only when
    // the key is genuinely absent. A saved `projects: []` means the person
    // deleted them from their resume, and refilling would override that.
    const raw = (doc.content ?? {}) as Record<string, unknown>;
    const fill: Partial<ResumeContent> = {};
    if (!("projects" in raw)) fill.projects = await loadProjects(profile.id);
    if (!("languages" in raw)) fill.languages = sanitizeContent({ languages: profile.languages }).languages;
    if (!("recommendations" in raw)) fill.recommendations = sanitizeContent({ recommendations: profile.recommendations }).recommendations;
    return NextResponse.json({ content: { ...content, ...fill }, saved: true, updatedAt: doc.updatedAt, assist });
  }

  const headlineName = profile.headlineRoleId
    ? (await prisma.role.findUnique({ where: { id: profile.headlineRoleId }, select: { name: true } }))?.name ?? null
    : null;

  const content = seedFromProfile({
    fullName: profile.fullName,
    headlineName,
    currentLocation: profile.currentLocation,
    workHistory: profile.workHistory,
    education: profile.education,
    certifications: profile.certifications,
    skills: profile.skills.map((s) => ({ name: s.skill.name, tier: s.tier })),
    languages: profile.languages,
    recommendations: profile.recommendations,
    projects: await loadProjects(profile.id),
  });
  return NextResponse.json({ content, saved: false, updatedAt: null, assist });
}

export async function PUT(req: NextRequest) {
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

  // sanitizeContent is the entire validation story: unknown fields drop,
  // strings cap, lists cap — nothing user-supplied reaches the row unchecked.
  const content = sanitizeContent((body as { content?: unknown }).content);

  try {
    const saved = await prisma.resumeDoc.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id, content: asJson(content) },
      update: { content: asJson(content) },
      select: { updatedAt: true },
    });
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (err) {
    console.error("resume save failed:", err);
    return NextResponse.json({ error: "Couldn't save — try again." }, { status: 502 });
  }
}
