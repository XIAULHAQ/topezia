/**
 * GET /api/company/team — the roster plus outstanding invitations.
 *
 * The owner's own row is created here on first read (lib/company/team.ts), so
 * a company that existed before migration 045 gains one the moment its owner
 * opens the page rather than needing a backfill that would have to guess at
 * names.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner, userEmail } from "@/lib/company/owner";
import { ensureOwnerRow } from "@/lib/company/team";
import { MAX_PENDING_INVITES } from "@/lib/company/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId } = auth.owner;

  await ensureOwnerRow(companyId, userId, await userEmail(userId));

  const [members, invites] = await Promise.all([
    prisma.companyTeamMember.findMany({
      where: { companyId },
      // Owner first, then longest-serving — a roster reads as a hierarchy
      // whether or not you meant it to.
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      select: {
        id: true, userId: true, name: true, title: true, role: true, visible: true,
        invitedEmail: true, joinedAt: true,
        profile: { select: { id: true, fullName: true, publicSlug: true, publicVisible: true, headlineRoleId: true } },
      },
    }),
    prisma.companyInvite.findMany({
      where: { companyId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true, expiresAt: true },
    }),
  ]);

  // Each member's role from their OWN profile, so the dashboard shows what the
  // public page shows. Profile.headlineRoleId has no Prisma relation (a bare
  // column — /hq reaches Role by raw SQL for the same reason), so it is one
  // extra lookup rather than an include.
  const roleIds = Array.from(new Set(members.map((m) => m.profile?.headlineRoleId).filter((x): x is string => !!x)));
  const roleNames = new Map(
    roleIds.length
      ? (await prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })).map((r) => [r.id, r.name])
      : []
  );

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      name: m.profile?.fullName?.trim() || m.name,
      title: m.title,
      // What the public page will show if no title is set here.
      profileRole: m.profile?.headlineRoleId ? roleNames.get(m.profile.headlineRoleId) ?? null : null,
      role: m.role,
      visible: m.visible,
      email: m.invitedEmail,
      joinedAt: m.joinedAt,
      isYou: m.userId === userId,
      // Only offer a profile link when there is actually a page behind it —
      // same rule the /hq members table follows.
      publicSlug: m.profile?.publicVisible ? m.profile.publicSlug : null,
      hasProfile: Boolean(m.profile),
    })),
    invites: invites.map((i) => ({ ...i, expired: i.expiresAt.getTime() < Date.now() })),
    maxPendingInvites: MAX_PENDING_INVITES,
  });
}
