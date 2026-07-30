/**
 * PATCH  /api/company/team/{id} — set someone's title or hide them from the
 *                                 public page.
 * DELETE /api/company/team/{id} — remove them from the team.
 *
 * The OWNER row cannot be removed through here. Not a permissions subtlety —
 * the owner IS the company (Company.ownerUserId), so a roster without them
 * would be a page nobody is accountable for. Deleting the company is the way
 * to end that relationship.
 *
 * Removing a member deletes a listing, never an account. Their Topezia profile,
 * their applications and their saved jobs are untouched, and the DELETE
 * response says so, because "remove" reads like something much larger than it
 * is.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { str } from "@/lib/company/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { title?: string | null; visible?: boolean } = {};
  if ("title" in body) data.title = str(body.title, 120) || null;
  if ("visible" in body) data.visible = body.visible !== false;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const r = await prisma.companyTeamMember.updateMany({
    where: { id: params.id, companyId: auth.owner.companyId },
    data,
  });
  if (r.count === 0) return NextResponse.json({ error: "That team member is no longer listed." }, { status: 404 });

  revalidatePath(`/company/${auth.owner.slug}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const member = await prisma.companyTeamMember.findFirst({
    where: { id: params.id, companyId: auth.owner.companyId },
    select: { id: true, role: true, name: true },
  });
  if (!member) return NextResponse.json({ error: "That team member is no longer listed." }, { status: 404 });
  if (member.role === "OWNER") {
    return NextResponse.json({ error: "The owner can't be removed from their own company." }, { status: 400 });
  }

  await prisma.companyTeamMember.delete({ where: { id: member.id } });

  revalidatePath(`/company/${auth.owner.slug}`);
  return NextResponse.json({
    removed: member.name,
    note: "They're no longer listed on your company page. Their Topezia account is untouched.",
  });
}
