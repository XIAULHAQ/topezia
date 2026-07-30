/**
 * Member stats — GET /api/hq/members
 *
 * Requires the signed /hq session cookie (password sign-in, lib/hq-auth.ts).
 *
 * This returns real personal data (names, emails, countries), so it is
 * force-dynamic and never cached, and the gate fails closed when no dashboard
 * password is configured.
 *
 * Emails come from Supabase's `auth.users`, which lives in the same Postgres
 * we already connect to — no service-role key needed. A profile whose userId
 * has no auth row is an ANONYMOUS visitor (parsed a resume, never signed up),
 * which is worth seeing on its own: it is the signup-conversion gap.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";
import { purgeProfile, PURGE_REMAINDER } from "@/lib/account/purge";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 500;

type MemberRow = {
  id: string;
  userId: string;
  publicSlug: string | null;
  publicVisible: boolean;
  fullName: string | null;
  country: string | null;
  createdAt: Date;
  email: string | null;
  headline: string | null;
  skillCount: number;
};

export async function GET(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.$queryRawUnsafe<MemberRow[]>(
    `SELECT p.id,
            p."userId",
            p."publicSlug",
            p."publicVisible",
            p."fullName",
            p.country,
            p."createdAt",
            u.email,
            r.name AS headline,
            (SELECT COUNT(*)::int FROM "ProfileSkill" ps WHERE ps."profileId" = p.id) AS "skillCount"
       FROM "Profile" p
       LEFT JOIN auth.users u ON u.id::text = p."userId"
       LEFT JOIN "Role" r ON r.id = p."headlineRoleId"
      ORDER BY p."createdAt" DESC
      LIMIT ${LIST_LIMIT}`
  );

  const total = await prisma.profile.count();
  const withAccount = rows.filter((r) => !!r.email).length;

  // Country split across everyone, not just the returned page.
  const byCountryRaw = await prisma.profile.groupBy({
    by: ["country"],
    _count: { _all: true },
    orderBy: { _count: { country: "desc" } },
  });
  const byCountry = byCountryRaw.map((c) => ({ country: c.country ?? "Unknown", count: c._count._all }));

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const newLast7d = await prisma.profile.count({ where: { createdAt: { gt: weekAgo } } });

  const members = rows.map((r) => {
    const parts = (r.fullName ?? "").trim().split(/\s+/).filter(Boolean);
    return {
      id: r.id,
      firstName: parts[0] ?? null,
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
      email: r.email,
      country: r.country,
      headline: r.headline,
      skillCount: r.skillCount,
      hasAccount: !!r.email,
      createdAt: r.createdAt,
      // Only offer a "view profile" link when there is actually a public page
      // behind it — publicVisible false means /p/{slug} 404s for everyone.
      publicSlug: r.publicVisible ? r.publicSlug : null,
      publicHidden: Boolean(r.publicSlug) && !r.publicVisible,
    };
  });

  return NextResponse.json({
    total,
    // Of the rows returned; `total` may exceed LIST_LIMIT on a large table.
    withAccount,
    anonymous: rows.length - withAccount,
    newLast7d,
    byCountry,
    listedCount: rows.length,
    listLimit: LIST_LIMIT,
    members,
  });
}

/**
 * DELETE /api/hq/members?id={profileId} — remove a member entirely.
 *
 * IRREVERSIBLE, and the most destructive thing anyone can do from /hq, so:
 *
 *  - It takes the profile id in the query string AND requires the caller to
 *    echo back the member's email (or the literal "anonymous") in the body.
 *    A confirmation dialog alone protects against a misclick; it does nothing
 *    against a stale row index after the list re-sorts, which is how the wrong
 *    person actually gets deleted.
 *  - The response reports whether the LOGIN went too. Without
 *    SUPABASE_SERVICE_ROLE_KEY the profile data is gone but the account can
 *    still sign in and start over, and the UI has to say so rather than
 *    claiming a deletion that only half happened.
 */
export async function DELETE(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Which member?" }, { status: 400 });

  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const rows = await prisma.$queryRawUnsafe<{ userId: string; email: string | null; fullName: string | null }[]>(
    `SELECT p."userId", p."fullName", u.email
       FROM "Profile" p LEFT JOIN auth.users u ON u.id::text = p."userId"
      WHERE p.id = $1 LIMIT 1`,
    id
  );
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "That member no longer exists." }, { status: 404 });

  // The echo check. Compared case-insensitively so retyping an address isn't a
  // puzzle, but it still has to be the RIGHT one.
  const expected = (target.email ?? "anonymous").trim().toLowerCase();
  const given = (typeof body.confirm === "string" ? body.confirm : "").trim().toLowerCase();
  if (given !== expected) {
    return NextResponse.json(
      { error: `To delete this member, type ${target.email ?? "anonymous"} to confirm.` },
      { status: 400 }
    );
  }

  const { authUserDeleted, authError } = await purgeProfile({
    profileId: id,
    // An anonymous profile's userId is a random uuid, not a Supabase account —
    // there is no login to remove and asking Supabase to delete one errors.
    userId: target.email ? target.userId : null,
  });

  return NextResponse.json({
    ok: true,
    deleted: { fullName: target.fullName, email: target.email },
    authUserDeleted,
    authError,
    remainder: PURGE_REMAINDER,
  });
}
