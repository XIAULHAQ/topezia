/**
 * Loaders for the resume sections that come from OTHER tables, not the doc.
 *
 * Extracted from /api/resume so the Career Score can score the same resume
 * the builder shows — same projects, same recommendations — without the two
 * surfaces drifting apart.
 */
import { prisma } from "@/lib/prisma";
import { portfolioImageUrl } from "@/lib/portfolio/storage";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

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
