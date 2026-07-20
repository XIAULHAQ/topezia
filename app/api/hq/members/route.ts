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

export const dynamic = "force-dynamic";

const LIST_LIMIT = 500;

type MemberRow = {
  id: string;
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
