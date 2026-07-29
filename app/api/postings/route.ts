/**
 * /api/postings — native job/project postings by the signed-in employer.
 *
 * A native posting is a normal Job row (source NATIVE) that walks the SAME
 * pipeline as a crawled one: LLM extraction → taxonomy resolution → embedding.
 * That single decision means the feed, matching, insights, SEO pages and
 * alerts all see it with zero extra code.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { extractWithLlm, hashDescription } from "@/lib/ingestion/llm-extract";
import { resolveRole, resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { embedText, buildJobEmbeddingInput, writeJobEmbedding } from "@/lib/ingestion/embed";
import { jobPath } from "@/lib/seo/job-slug";
import { extractCountry } from "@/lib/ingestion/normalize-rules";

export const maxDuration = 60; // LLM extraction + embedding on create

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
const UNSORTED = "unsorted";

const EMPLOYMENT = new Set(["FULL_TIME", "PART_TIME", "CONTRACT", "HOURLY", "TEMP"]);
const REMOTE = new Set(["ONSITE", "HYBRID", "REMOTE_GLOBAL", "REMOTE_INTL"]);
const PERIODS = new Set(["YEAR", "HOUR", "DAY", "PROJECT"]);

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "";
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

async function ownCompany(userId: string) {
  return prisma.company.findUnique({ where: { ownerUserId: userId }, select: { id: true, name: true, slug: true, website: true, location: true } });
}

/** GET — the poster's own postings, with pipeline counts per stage. */
export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const company = await ownCompany(userId);

  const rows = await prisma.job.findMany({
    where: { OR: [{ postedByUserId: userId }, ...(company ? [{ companyId: company.id }] : [])] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, kind: true, titleRaw: true, status: true, createdAt: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
      applications: { select: { stage: true } },
    },
  });
  const postings = rows.map((r) => {
    const by: Record<string, number> = {};
    for (const a of r.applications) by[a.stage] = (by[a.stage] ?? 0) + 1;
    return { ...r, applications: undefined, total: r.applications.length, byStage: by };
  });
  return NextResponse.json({ postings, company });
}

/** POST — publish a job or project. Live immediately: the poster is an
 *  accountable signed-in company, and the feed's honest scoring is the
 *  quality gate a crawled job gets — no more, no less. */
export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in to post." }, { status: 401 });
  // Anyone can post — a company page is optional branding. Individuals post
  // under their own profile name, and the posting says so.
  const company = await ownCompany(userId);
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { fullName: true } });
  const posterName = company?.name ?? profile?.fullName ?? null;
  if (!posterName) return NextResponse.json({ error: "Complete your profile (or create a company page) first — applicants must see who's posting." }, { status: 409 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind === "PROJECT" ? "PROJECT" : "JOB";
  const title = str(body.title, 140);
  const description = text(body.description, 12000);
  const pickedRole = str(body.role, 100);
  const pickedSkills = Array.isArray(body.skills) ? body.skills.map((s) => str(s, 60)).filter(Boolean).slice(0, 20) : [];

  // A DRAFT is saved work-in-progress: invisible to seekers, the matcher and
  // every SEO surface (they all filter status = LIVE). It deliberately skips
  // the publish bar AND the LLM/embedding enrichment — see lib/employer/
  // publish.ts for why enriching half-written text is worse than not doing it.
  const asDraft = body.draft === true;

  if (asDraft) {
    if (!title) return NextResponse.json({ error: "Give the draft a title so you can find it again." }, { status: 400 });
  } else {
    // Posting requirements — enforced here, shown as a live checklist in the
    // form. A thin posting wastes every applicant's time and poisons matching.
    if (title.length < 8) return NextResponse.json({ error: "Give it a real title (8+ characters)." }, { status: 400 });
    if (!pickedRole) return NextResponse.json({ error: "Pick a category — it routes the right people to you." }, { status: 400 });
    if (description.length < 200) return NextResponse.json({ error: "The description needs at least 200 characters — use the AI writer if you're stuck." }, { status: 400 });
    if (pickedSkills.length < 2) return NextResponse.json({ error: "List at least 2 required skills." }, { status: 400 });
  }
  const employmentType = kind === "PROJECT"
    ? "CONTRACT" // projects are contract work by definition
    : EMPLOYMENT.has(body.employmentType as string) ? (body.employmentType as string) : "FULL_TIME";
  const remoteType = REMOTE.has(body.remoteType as string) ? (body.remoteType as string) : "ONSITE";
  const salaryPeriod = PERIODS.has(body.salaryPeriod as string) ? (body.salaryPeriod as string) : kind === "PROJECT" ? "PROJECT" : null;
  const salaryMin = int(body.salaryMin);
  const salaryMax = int(body.salaryMax);
  const currency = /^[A-Z]{3}$/.test(str(body.salaryCurrency, 3).toUpperCase()) ? str(body.salaryCurrency, 3).toUpperCase() : "USD";
  const locationRaw = str(body.location, 140) || company?.location || null;
  const country = remoteType === "REMOTE_GLOBAL" ? null : locationRaw ? extractCountry(locationRaw) : null;

  // Same enrichment a crawled job gets — the matcher must see this posting
  // exactly the way it sees every other one. The employer's explicit picks
  // WIN over extraction: they know their role and skills; the LLM only adds.
  //
  // Drafts skip all of it (no LLM call, no embedding) and get enriched by
  // lib/employer/publish.ts when they actually go live.
  const llm = asDraft ? null : await extractWithLlm(title, description);
  const roleId = pickedRole
    ? await resolveRole(pickedRole, pickedRole)
    : llm ? await resolveRole(title, llm.roleGuess) : null;
  const skillNames = [...new Set([...pickedSkills, ...(llm?.skills ?? [])])];
  const skillIds = await resolveSkills(skillNames);
  const role = roleId ? await prisma.role.findUnique({ where: { id: roleId }, select: { verticalId: true } }) : null;
  let verticalId = role?.verticalId ?? null;
  if (!verticalId && llm?.vertical) {
    verticalId = (await prisma.vertical.findUnique({ where: { slug: llm.vertical }, select: { id: true } }))?.id ?? null;
  }
  if (!verticalId) verticalId = (await prisma.vertical.findUnique({ where: { slug: UNSORTED }, select: { id: true } }))!.id;

  const id = randomUUID();
  const job = await prisma.job.create({
    data: {
      id,
      kind,
      source: "NATIVE",
      sourceUrl: `${SITE}${jobPath({ id, titleRaw: title, companyName: posterName })}`, // our own canonical detail page
      sourceCompanySlug: company?.slug ?? null,
      externalId: id,
      titleRaw: title,
      titleNormalized: llm?.roleGuess || null,
      roleId,
      verticalId,
      postedByUserId: userId,
      companyId: company?.id ?? null,
      companyName: posterName,
      companyDomain: company?.website ? new URL(company.website).hostname.replace(/^www\./, "") : null,
      status: asDraft ? "DRAFT" : "LIVE",
      descriptionRaw: description,
      descriptionHash: hashDescription(`${title}\n${description}`),
      seniority: llm?.seniority ?? "NOT_APPLICABLE",
      employmentType: employmentType as never,
      salaryMin,
      salaryMax,
      salaryCurrency: currency,
      salaryPeriod: salaryPeriod as never,
      locationRaw,
      country,
      remoteScope: remoteType === "REMOTE_GLOBAL" ? "GLOBAL" : null,
      remoteType: remoteType as never,
      // A draft was never posted, so it carries no posting date — publishing
      // stamps it (lib/employer/publish.ts). Otherwise a draft sitting for a
      // week would go live already looking a week stale.
      postedAt: asDraft ? null : new Date(),
      skills: { create: skillIds.map((skillId) => ({ skillId })) },
    },
    select: { id: true },
  });

  // Best-effort embed — a Voyage hiccup must not eat the posting. Unembedded
  // jobs simply don't rank until a later pass embeds them. Drafts aren't
  // embedded at all: they're invisible to the matcher until published, and
  // publish re-embeds from the finished text.
  if (!asDraft) {
    try {
      const embedding = await embedText(buildJobEmbeddingInput({
        titleNormalized: llm?.roleGuess || null, titleRaw: title,
        skills: skillNames, descriptionText: description,
      }));
      if (embedding) await writeJobEmbedding(prisma, job.id, embedding);
    } catch (err) {
      console.error("native posting embed failed:", err);
    }
  }

  return NextResponse.json({ id: job.id, status: asDraft ? "DRAFT" : "LIVE" });
}
