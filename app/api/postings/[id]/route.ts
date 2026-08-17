/**
 * PATCH /api/postings/{id} — change the employer's own posting status.
 *
 * Closing sets JobStatus EXPIRED: it leaves the feed the same way a dead
 * crawled job does, and its pipeline stays readable.
 *
 * Publishing a DRAFT is NOT a flag flip. A draft deliberately skipped the
 * LLM extraction and the embedding (see lib/employer/publish.ts), so going
 * live has to run that enrichment first — otherwise the posting would enter
 * the feed with no embedding and never rank, or rank on junk extracted from
 * half-written text. That path also re-checks the publish bar, so a thin
 * draft can't sneak past the rules a direct publish enforces.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { publishDraft } from "@/lib/employer/publish";
import { hashDescription } from "@/lib/ingestion/llm-extract";
import { resolveRole, resolveSkills } from "@/lib/ingestion/resolve-taxonomy";
import { extractCountry } from "@/lib/ingestion/normalize-rules";
import { enrichInBackground } from "@/lib/employer/enrich";

const UNSORTED = "unsorted";
const EMPLOYMENT = new Set(["FULL_TIME", "PART_TIME", "CONTRACT", "HOURLY", "TEMP"]);
const REMOTE = new Set(["ONSITE", "HYBRID", "REMOTE_GLOBAL", "REMOTE_INTL"]);
const PERIODS = new Set(["YEAR", "HOUR", "DAY", "PROJECT"]);
const SENIORITY = new Set(["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC", "NOT_APPLICABLE"]);

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "";
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

export const maxDuration = 60; // publishing a draft runs extraction + embedding

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status =
    body.status === "LIVE" ? "LIVE" : body.status === "EXPIRED" ? "EXPIRED" : body.status === "DRAFT" ? "DRAFT" : null;
  if (!status) return NextResponse.json({ error: "status must be LIVE, EXPIRED or DRAFT." }, { status: 400 });

  // Any of the caller's companies — a posting under company B is still theirs
  // while company A is the active one.
  const owned = { id: params.id, OR: [{ postedByUserId: userId }, { company: { ownerUserId: userId } }] };

  // Read-then-act, but the WRITE below is still owner-scoped — this lookup
  // only decides which path to take, it isn't the authorization.
  const current = await prisma.job.findFirst({ where: owned, select: { id: true, status: true } });
  if (!current) return NextResponse.json({ error: "Not your posting." }, { status: 404 });

  if (current.status === "DRAFT" && status === "LIVE") {
    const res = await publishDraft(current.id);
    if (!res.ok) return NextResponse.json({ error: res.blockers.join(" "), blockers: res.blockers }, { status: 400 });
    return NextResponse.json({ ok: true, status: "LIVE" });
  }

  // A held posting is waiting on a role WE owe it (migration 079). The
  // employer may withdraw it; they cannot flip it live, because "live" with
  // no role means a posting nothing can route. /hq/pending is the release.
  if (current.status === "PENDING_ROLE" && status === "LIVE") {
    return NextResponse.json(
      { error: "This one is waiting on a category from us — it goes live by itself once that's in." },
      { status: 409 }
    );
  }

  // Un-publishing back to draft is deliberately not offered: the posting has
  // already been seen, and applicants may already sit in its pipeline. Close
  // it instead — that keeps the pipeline readable.
  if (status === "DRAFT") {
    return NextResponse.json({ error: "A published posting can be closed, but not returned to draft." }, { status: 400 });
  }

  const r = await prisma.job.updateMany({ where: owned, data: { status } });
  if (r.count === 0) return NextResponse.json({ error: "Not your posting." }, { status: 404 });
  return NextResponse.json({ ok: true, status });
}

/**
 * GET /api/postings/{id} — one of the employer's own postings, shaped for the
 * edit form. Owner-scoped: `owned` below IS the authorization.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const job = await prisma.job.findFirst({
    where: { id: params.id, OR: [{ postedByUserId: userId }, { company: { ownerUserId: userId } }] },
    select: {
      id: true, kind: true, titleRaw: true, descriptionRaw: true, status: true,
      employmentType: true, remoteType: true, seniority: true, locationRaw: true,
      salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
      role: { select: { name: true } },
      vertical: { select: { slug: true } },
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
  if (!job) return NextResponse.json({ error: "Not your posting." }, { status: 404 });

  return NextResponse.json({
    posting: {
      id: job.id,
      kind: job.kind,
      title: job.titleRaw,
      description: job.descriptionRaw,
      status: job.status,
      // The picker speaks in role NAMES, falling back to the category marker
      // for a posting that has no role yet — the same value it would post.
      role: job.role?.name ?? (job.vertical ? `vertical:${job.vertical.slug}` : ""),
      skills: job.skills.map((s) => s.skill.name),
      employmentType: job.employmentType,
      remoteType: job.remoteType,
      seniority: job.seniority === "NOT_APPLICABLE" ? "" : job.seniority,
      location: job.locationRaw ?? "",
      salaryMin: job.salaryMin ?? "",
      salaryMax: job.salaryMax ?? "",
      salaryCurrency: job.salaryCurrency,
      salaryPeriod: job.salaryPeriod ?? "YEAR",
    },
  });
}

/**
 * PUT /api/postings/{id} — edit the employer's own posting.
 *
 * Editing was simply missing: once published, a typo in the title or a wrong
 * salary was permanent, and the only remedy was to close the posting and
 * write it again — losing its pipeline with it.
 *
 * A LIVE posting must still clear the publish bar after the edit, so this
 * can't be used to hollow out a posting that applicants can already see.
 * Changing the words changes what the posting MEANS, so the description hash
 * is recomputed and the embedding is rebuilt in the background — otherwise
 * the posting would keep matching on text it no longer contains.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const owned = { id: params.id, OR: [{ postedByUserId: userId }, { company: { ownerUserId: userId } }] };
  const current = await prisma.job.findFirst({
    where: owned,
    select: { id: true, status: true, kind: true, seniority: true },
  });
  if (!current) return NextResponse.json({ error: "Not your posting." }, { status: 404 });

  const title = str(body.title, 140);
  const description = text(body.description, 12000);
  const pickedRole = str(body.role, 80);
  const pickedVertical = str(body.vertical, 60).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const pickedSkills = Array.isArray(body.skills)
    ? [...new Set(body.skills.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean))].slice(0, 20)
    : [];

  // A draft may be saved half-written; anything visible must clear the bar.
  if (current.status !== "DRAFT") {
    if (title.length < 8) return NextResponse.json({ error: "Give it a real title (8+ characters)." }, { status: 400 });
    if (!pickedRole && !pickedVertical) return NextResponse.json({ error: "Pick a category — it routes the right people to you." }, { status: 400 });
    if (description.length < 200) return NextResponse.json({ error: "The description needs at least 200 characters." }, { status: 400 });
    if (pickedSkills.length < 2) return NextResponse.json({ error: "List at least 2 required skills." }, { status: 400 });
  } else if (!title) {
    return NextResponse.json({ error: "Give the draft a title so you can find it again." }, { status: 400 });
  }

  const roleId = pickedRole ? await resolveRole(pickedRole, pickedRole) : null;
  const chosenVertical = pickedVertical && pickedVertical !== UNSORTED
    ? await prisma.vertical.findUnique({ where: { slug: pickedVertical }, select: { id: true } })
    : null;
  const role = roleId ? await prisma.role.findUnique({ where: { id: roleId }, select: { verticalId: true } }) : null;
  const verticalId =
    role?.verticalId ??
    chosenVertical?.id ??
    (await prisma.vertical.findUnique({ where: { slug: UNSORTED }, select: { id: true } }))!.id;

  const kind = current.kind; // changing job ↔ project would rewrite what applicants replied to
  const employmentType = kind === "PROJECT" ? "CONTRACT" : EMPLOYMENT.has(str(body.employmentType, 20)) ? str(body.employmentType, 20) : "FULL_TIME";
  const remoteType = REMOTE.has(str(body.remoteType, 20)) ? str(body.remoteType, 20) : "ONSITE";
  const salaryPeriod = PERIODS.has(str(body.salaryPeriod, 20)) ? str(body.salaryPeriod, 20) : kind === "PROJECT" ? "PROJECT" : null;
  const currency = /^[A-Z]{3}$/.test(str(body.salaryCurrency, 3).toUpperCase()) ? str(body.salaryCurrency, 3).toUpperCase() : "USD";
  const pickedSeniority = SENIORITY.has(str(body.seniority, 20).toUpperCase()) ? str(body.seniority, 20).toUpperCase() : null;
  const locationRaw = str(body.location, 140) || null;
  const country = remoteType === "REMOTE_GLOBAL" ? null : locationRaw ? extractCountry(locationRaw) : null;

  const skillIds = await resolveSkills(pickedSkills);

  // A posting held for a missing role is released by the edit itself if the
  // employer has now picked a real one — nothing else is waiting on it.
  const status =
    current.status === "PENDING_ROLE" && roleId ? "LIVE"
    : current.status === "LIVE" && !roleId ? "PENDING_ROLE"
    : current.status;

  await prisma.$transaction([
    prisma.jobSkill.deleteMany({ where: { jobId: current.id } }),
    prisma.job.update({
      where: { id: current.id },
      data: {
        titleRaw: title,
        descriptionRaw: description,
        descriptionHash: hashDescription(`${title}\n${description}`),
        roleId,
        verticalId,
        status,
        seniority: (pickedSeniority ?? "NOT_APPLICABLE") as never,
        employmentType: employmentType as never,
        remoteType: remoteType as never,
        remoteScope: remoteType === "REMOTE_GLOBAL" ? "GLOBAL" : null,
        salaryMin: int(body.salaryMin),
        salaryMax: int(body.salaryMax),
        salaryCurrency: currency,
        salaryPeriod: salaryPeriod as never,
        locationRaw,
        country,
        lastVerifiedAt: new Date(),
        skills: { create: skillIds.map((skillId) => ({ skillId })) },
      },
    }),
  ]);

  // The words changed, so the vector must too — in the background, exactly as
  // on publish, so saving an edit never waits on a model.
  if (status === "LIVE") enrichInBackground(current.id, { seniorityIsTheirs: pickedSeniority !== null });

  return NextResponse.json({ ok: true, status });
}
