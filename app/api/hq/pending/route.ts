/**
 * /api/hq/pending — postings held because no role fits them yet (migration 079).
 *
 * GET   → { pending: [...], roles: [...] }  the queue, plus every role to assign from
 * PATCH → { id, roleSlug } | { id, newRoleName }  attach a role and release it live
 *
 * This is the other half of "a missing role never blocks a posting": the
 * employer is unblocked immediately, and the debt lands here. Creating the
 * role also fixes the taxonomy for everyone after them — including crawled
 * jobs, which resolve through the same table.
 *
 * Requires the signed /hq session cookie, like every other /api/hq route, and
 * re-checks it independently of the page's own gate.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";
import { enrichInBackground } from "@/lib/employer/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);

export async function GET(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return unauthorized();

  const [pending, roles] = await Promise.all([
    prisma.job.findMany({
      where: { status: "PENDING_ROLE" },
      orderBy: { createdAt: "asc" }, // oldest first: it has waited longest
      select: {
        id: true, titleRaw: true, descriptionRaw: true, companyName: true, createdAt: true,
        vertical: { select: { id: true, slug: true, name: true } },
        skills: { select: { skill: { select: { name: true } } } },
      },
      take: 200,
    }),
    prisma.role.findMany({
      select: { slug: true, name: true, vertical: { select: { slug: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    pending: pending.map((p) => ({
      id: p.id,
      title: p.titleRaw,
      excerpt: p.descriptionRaw.slice(0, 240),
      company: p.companyName,
      createdAt: p.createdAt,
      vertical: p.vertical,
      skills: p.skills.map((s) => s.skill.name),
    })),
    roles,
  });
}

export async function PATCH(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true, status: true, verticalId: true, seniority: true },
  });
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (job.status !== "PENDING_ROLE") return NextResponse.json({ error: "That posting isn't waiting." }, { status: 409 });

  // Either attach an existing role, or create the one the taxonomy is missing
  // — the second is the point of the queue.
  let role: { id: string; verticalId: string } | null = null;
  const roleSlug = typeof body.roleSlug === "string" ? body.roleSlug : "";
  const newRoleName = typeof body.newRoleName === "string" ? body.newRoleName.trim().slice(0, 80) : "";

  if (roleSlug) {
    role = await prisma.role.findUnique({ where: { slug: roleSlug }, select: { id: true, verticalId: true } });
    if (!role) return NextResponse.json({ error: "No such role." }, { status: 404 });
  } else if (newRoleName) {
    const base = slugify(newRoleName);
    if (!base) return NextResponse.json({ error: "Give the role a real name." }, { status: 400 });
    const existing = await prisma.role.findUnique({ where: { slug: base }, select: { id: true, verticalId: true } });
    role = existing ?? (await prisma.role.create({
      // New roles land in the posting's own category — that is the one thing
      // the employer did tell us.
      data: { slug: base, name: newRoleName, verticalId: job.verticalId },
      select: { id: true, verticalId: true },
    }));
  } else {
    return NextResponse.json({ error: "Pick a role or name a new one." }, { status: 400 });
  }

  await prisma.job.update({
    where: { id: job.id },
    data: { roleId: role.id, verticalId: role.verticalId, status: "LIVE", postedAt: new Date(), lastVerifiedAt: new Date() },
  });

  // Now that it is live it can be enriched and embedded like any other.
  enrichInBackground(job.id, { seniorityIsTheirs: job.seniority !== "NOT_APPLICABLE" });

  return NextResponse.json({ ok: true, released: job.id });
}
