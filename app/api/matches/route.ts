/**
 * GET /api/matches — spec §5, §6.2 (Stage 1, fast)
 *
 * Returns retrieval + hard-filtered matches with any already-cached LLM scores;
 * uncached jobs come back with a provisional (similarity) score and pending=true.
 * No LLM call here, so it returns in ~2s. The feed then calls POST
 * /api/matches/rerank to enrich the pending ones (progressive loading).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { getMatches, eligibleLiveCount, type JobMatch } from "@/lib/matching/match";
import { countrySlugFor, countryName } from "@/lib/seo/pages";

export const maxDuration = 60;

async function resolveIdentity(): Promise<{ profileId: string | null; authed: boolean }> {
  const { userId, authed } = await currentIdentity();
  if (!userId) return { profileId: null, authed };
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  return { profileId: profile?.id ?? null, authed };
}

/**
 * The saved-search this profile would subscribe to from the feed — their field
 * (headline role, else its vertical) scoped to their country. Reuses the same
 * alert plumbing as the SEO pages via slug + place. null when we can't name a
 * field (no resolved role) — then the feed nudges them to set one first.
 */
async function feedAlert(profileId: string): Promise<{ slug: string; place?: string; label: string } | null> {
  const p = await prisma.profile.findUnique({ where: { id: profileId }, select: { headlineRoleId: true, country: true } });
  if (!p?.headlineRoleId) return null;
  const role = await prisma.role.findUnique({ where: { id: p.headlineRoleId }, select: { name: true, slug: true } });
  if (!role) return null;
  const place = p.country ? countrySlugFor(p.country) : undefined;
  const where = p.country ? ` in ${countryName(p.country)}` : "";
  return { slug: role.slug, place, label: `${role.name} jobs${where}` };
}

function respond(matches: JobMatch[], totalLive: number, authed: boolean, alert: Awaited<ReturnType<typeof feedAlert>>) {
  return NextResponse.json({
    matches,
    stats: { strong: matches.filter((m) => m.score >= 70).length, totalLive },
    pending: matches.some((m) => m.pending),
    authed,
    alert,
  });
}

export async function GET(req: NextRequest) {
  const { profileId, authed } = await resolveIdentity();
  if (!profileId) return NextResponse.json({ error: "no-profile" }, { status: 401 });

  // ?kind=PROJECT — the feed's Projects pill: retrieval scoped to projects so
  // the user's nearest projects surface even though jobs dominate raw similarity.
  const kind = req.nextUrl.searchParams.get("kind") === "PROJECT" ? ("PROJECT" as const) : undefined;

  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { country: true } });
  const matches = await getMatches(profileId, { rerankN: 12, rerank: false, kind });
  const totalLive = await eligibleLiveCount(profile?.country ?? null); // jobs open to them, not the whole corpus
  const alert = await feedAlert(profileId);
  return respond(matches, totalLive, authed, alert);
}
