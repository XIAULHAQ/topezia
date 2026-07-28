/**
 * Loaders for the resume sections that come from OTHER tables, not the doc.
 *
 * Extracted from /api/resume so the Career Score can score the same resume
 * the builder shows — same projects, same recommendations — without the two
 * surfaces drifting apart.
 */
import { prisma } from "@/lib/prisma";
import { portfolioImageUrl } from "@/lib/portfolio/storage";
import { sanitizeContent, seedFromProfile, type ResumeContent } from "./doc";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

export const RESUME_PROFILE_SELECT = {
  id: true, tier: true, fullName: true, headlineRoleId: true, currentLocation: true,
  workHistory: true, education: true, certifications: true, languages: true,
  photoUrl: true, publicSlug: true, resumeText: true,
  skills: { select: { tier: true, skill: { select: { name: true } } } },
} as const;

export type ResumeProfile = NonNullable<Awaited<ReturnType<typeof loadResumeProfile>>>;

export async function loadResumeProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId }, select: RESUME_PROFILE_SELECT });
}

/**
 * The person's MAIN resume content — the saved ResumeDoc (experience/
 * recommendations refreshed live — see the fill logic below) if one exists,
 * or a profile-seeded draft otherwise. Shared by GET /api/resume (jobId
 * absent) and POST /api/resume/tailor, which grounds its generation in this.
 */
export async function loadMainResumeContent(
  profile: ResumeProfile
): Promise<{ content: ResumeContent; saved: boolean; updatedAt: Date | null }> {
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
    // Recommendations are never the doc's to keep: always the live set of
    // received endorsements, so nothing self-typed can survive in old rows.
    fill.recommendations = sanitizeContent({ recommendations: await loadQuotes(profile.id) }).recommendations;
    // Same for experience: it's profile-owned now (title/company/years/
    // bullets), so this loads whatever /profile or the last resume upload
    // last wrote — not whatever happened to be in this doc's last save.
    fill.experience = sanitizeContent({ experience: profile.workHistory }).experience;
    return { content: { ...content, ...fill }, saved: true, updatedAt: doc.updatedAt };
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
    recommendations: await loadQuotes(profile.id),
    projects: await loadProjects(profile.id),
  });
  return { content, saved: false, updatedAt: null };
}

/** Published portfolio pieces as resume-project rows — absolute URLs, since
 *  the printed PDF's links must work from anyone's machine. */
export async function loadProjects(profileId: string) {
  const rows = await prisma.portfolio.findMany({
    where: { profileId, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 8,
    select: { title: true, slug: true, coverPath: true },
  });
  return rows.map((r) => ({ title: r.title, url: `${SITE}/portfolio/${r.slug}`, thumb: portfolioImageUrl(r.coverPath) }));
}

/** The resume's Recommendations section — sourced ONLY from endorsements
 *  other people wrote through a request link, never member-typed. Overridden
 *  on every read and every save, so a hand-crafted PUT can't plant one. */
export async function loadQuotes(profileId: string) {
  const rows = await prisma.endorsement.findMany({
    where: { profileId, status: "SUBMITTED", visible: true },
    orderBy: { submittedAt: "desc" },
    take: 4,
    select: { text: true, authorName: true, authorRole: true },
  });
  return rows
    .filter((r) => r.text && r.authorName)
    .map((r) => ({ text: r.text as string, author: r.authorName as string, role: r.authorRole ?? "" }));
}
