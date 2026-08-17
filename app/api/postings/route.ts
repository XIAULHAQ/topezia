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
import { hashDescription } from "@/lib/ingestion/llm-extract";
import { resolveRole, resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { enrichInBackground } from "@/lib/employer/enrich";
import { jobPath } from "@/lib/seo/job-slug";
import { extractCountry } from "@/lib/ingestion/normalize-rules";
import { activeCompany, ownedCompanies, ownedCompanyById } from "@/lib/company/active";
import { ownedPostingsWhere } from "@/lib/employer/stats";

// The request itself is now just validation and a write; the model call and
// the embedding run after the response (lib/employer/enrich.ts), and that
// background work is what still needs the headroom.
export const maxDuration = 60;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
const UNSORTED = "unsorted";

const EMPLOYMENT = new Set(["FULL_TIME", "PART_TIME", "CONTRACT", "HOURLY", "TEMP"]);
// The employer's own answer, when they give one. Their word beats a guess,
// and it costs a dropdown — see the picker in app/employer/new/posting-form.
const SENIORITY = new Set(["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC", "NOT_APPLICABLE"]);
const REMOTE = new Set(["ONSITE", "HYBRID", "REMOTE_GLOBAL", "REMOTE_INTL"]);
const PERIODS = new Set(["YEAR", "HOUR", "DAY", "PROJECT"]);

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "";
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

const COMPANY_SELECT = { id: true, name: true, slug: true, website: true, location: true } as const;

/**
 * Who a posting is published AS. The account may own several companies
 * (migration 076) or none, so the form sends `postAs`:
 *   - a company id  → that company (must be one you own, else 404)
 *   - "self"        → yourself, under your profile name, no company branding
 *   - absent        → the active company if you have one, else yourself —
 *                     what every pre-076 client sent, and what it meant.
 */
async function posterCompany(userId: string, postAs: unknown) {
  if (postAs === "self") return { ok: true as const, company: null };
  if (typeof postAs === "string" && postAs) {
    const company = await ownedCompanyById(userId, postAs, COMPANY_SELECT);
    return company ? { ok: true as const, company } : { ok: false as const };
  }
  return { ok: true as const, company: await activeCompany(userId, COMPANY_SELECT) };
}

/** GET — the ACTIVE company's postings, plus any posted under the account's
 *  own name, with pipeline counts per stage.
 *
 *  Scoped exactly like the Overview dashboard (ownedPostingsWhere), and for
 *  the same reason: /employer wears one company at a time, so a list that
 *  answered account-wide put Rodeo Graphics' posting on Bing Chun Pakistan's
 *  page. A posting made under another company belongs on THAT company's
 *  page — switch to it. */
export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [company, companies] = await Promise.all([activeCompany(userId, COMPANY_SELECT), ownedCompanies(userId)]);

  const rows = await prisma.job.findMany({
    where: ownedPostingsWhere(userId, company?.id ?? null),
    orderBy: { createdAt: "desc" },
    select: {
      id: true, kind: true, titleRaw: true, status: true, createdAt: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
      companyId: true, companyName: true,
      applications: { select: { stage: true } },
      _count: { select: { views: true } },
    },
  });
  const postings = rows.map((r) => {
    const by: Record<string, number> = {};
    for (const a of r.applications) by[a.stage] = (by[a.stage] ?? 0) + 1;
    const { applications, _count, ...rest } = r;
    return { ...rest, total: applications.length, byStage: by, views: _count.views };
  });
  // Scoping to one company is right, but silence about the rest is how
  // "where did my posting go?" happens — so say how many are elsewhere.
  const elsewhere = company
    ? await prisma.job.count({
        where: { company: { ownerUserId: userId }, companyId: { not: company.id } },
      })
    : 0;

  return NextResponse.json({ postings, company, companies, elsewhere });
}

/** POST — publish a job or project. Live immediately: the poster is an
 *  accountable signed-in company, and the feed's honest scoring is the
 *  quality gate a crawled job gets — no more, no less. */
export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in to post." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Anyone can post — a company page is optional branding. Individuals post
  // under their own profile name, and the posting says so.
  const poster = await posterCompany(userId, body.postAs);
  if (!poster.ok) return NextResponse.json({ error: "That isn't one of your companies." }, { status: 404 });
  const company = poster.company;
  const profile = company ? null : await prisma.profile.findUnique({ where: { userId }, select: { fullName: true } });
  const posterName = company?.name ?? profile?.fullName ?? null;
  if (!posterName) return NextResponse.json({ error: "Complete your profile (or create a company page) first — applicants must see who's posting." }, { status: 409 });

  const kind = body.kind === "PROJECT" ? "PROJECT" : "JOB";
  const title = str(body.title, 140);
  const description = text(body.description, 12000);
  const pickedRole = str(body.role, 100);
  const pickedSkills = Array.isArray(body.skills) ? body.skills.map((s) => str(s, 60)).filter(Boolean).slice(0, 20) : [];

  // A DRAFT is saved work-in-progress: invisible to seekers, the matcher and
  // every SEO surface (they all filter status = LIVE). It deliberately skips
  // the publish bar AND the LLM/embedding enrichment — see lib/employer/
  // publish.ts for why enriching half-written text is worse than not doing it.
  // A category with no matching role yet is a legitimate answer: the taxonomy
  // trails what people actually hire for, and that is ours to fix, not theirs
  // to work around. Such a posting carries the vertical with roleId null — it
  // still embeds, still matches, it simply isn't part of a role hub.
  const pickedVertical = str(body.vertical, 60).toLowerCase().replace(/[^a-z0-9-]/g, "");

  const asDraft = body.draft === true;

  if (asDraft) {
    if (!title) return NextResponse.json({ error: "Give the draft a title so you can find it again." }, { status: 400 });
  } else {
    // Posting requirements — enforced here, shown as a live checklist in the
    // form. A thin posting wastes every applicant's time and poisons matching.
    if (title.length < 8) return NextResponse.json({ error: "Give it a real title (8+ characters)." }, { status: 400 });
    if (!pickedRole && !pickedVertical) return NextResponse.json({ error: "Pick a category — it routes the right people to you." }, { status: 400 });
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

  // Enrichment does NOT run here — see lib/employer/enrich.ts. The posting is
  // built from what the employer typed and goes live immediately; the model's
  // extras land a moment later, after the response.
  const pickedSeniority = SENIORITY.has(str(body.seniority, 20).toUpperCase())
    ? str(body.seniority, 20).toUpperCase()
    : null;

  const roleId = pickedRole ? await resolveRole(pickedRole, pickedRole) : null;
  // Never "unsorted": that is the internal fallback for jobs we couldn't
  // classify, and choosing it explicitly would be a different claim.
  const chosenVertical = pickedVertical && pickedVertical !== UNSORTED
    ? await prisma.vertical.findUnique({ where: { slug: pickedVertical }, select: { id: true } })
    : null;
  const skillNames = [...new Set(pickedSkills)];
  const skillIds = await resolveSkills(skillNames);
  const role = roleId ? await prisma.role.findUnique({ where: { id: roleId }, select: { verticalId: true } }) : null;
  let verticalId = role?.verticalId ?? chosenVertical?.id ?? null;
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
      titleNormalized: null, // filled by enrichment, if the model is reachable
      roleId,
      verticalId,
      postedByUserId: userId,
      companyId: company?.id ?? null,
      companyName: posterName,
      companyDomain: company?.website ? new URL(company.website).hostname.replace(/^www\./, "") : null,
      // A posting we can't aim doesn't ship. With no role attached there is
      // nothing routing it to the right people, so it waits at PENDING_ROLE
      // until we add the role it needs (/hq/pending) — see migration 079.
      // Invisible everywhere in the meantime, exactly like a draft, but the
      // debt is ours and the dashboard says so.
      status: asDraft ? "DRAFT" : roleId ? "LIVE" : "PENDING_ROLE",
      descriptionRaw: description,
      descriptionHash: hashDescription(`${title}\n${description}`),
      seniority: (pickedSeniority ?? "NOT_APPLICABLE") as never,
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

  // Everything the model and the embedder add happens AFTER this response —
  // a live posting must never wait on a third party, and must never be lost
  // to one. Drafts are invisible to the matcher, so they wait for publish.
  // Held postings are enriched when they are released, not now: the model may
  // yet be the thing that identifies the role, and enrichment only ever runs
  // against something live.
  if (!asDraft && roleId) enrichInBackground(job.id, { seniorityIsTheirs: pickedSeniority !== null });

  return NextResponse.json({
    id: job.id,
    status: asDraft ? "DRAFT" : roleId ? "LIVE" : "PENDING_ROLE",
    // The form tells them plainly rather than letting a posting look live
    // when it isn't.
    held: !asDraft && !roleId,
  });
}
