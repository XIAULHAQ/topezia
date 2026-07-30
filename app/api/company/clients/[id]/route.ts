/**
 * PATCH  /api/company/clients/{id} — edit a client entry.
 * DELETE /api/company/clients/{id} — remove it, and its logo from storage.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateClient } from "@/lib/company/save";
import { removeObjects } from "@/lib/company/cleanup";
import { LOGO_BUCKET } from "@/lib/company/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId, slug: companySlug } = auth.owner;

  const existing = await prisma.companyClient.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, logoPath: true },
  });
  if (!existing) return NextResponse.json({ error: "That client no longer exists." }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateClient(body, companyId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const client = await prisma.companyClient.update({ where: { id: existing.id }, data: result.value });

  // Replaced logo: the row already points at the new object, so the old one is
  // now unreferenced. Removed after the update, never before.
  if (existing.logoPath && existing.logoPath !== result.value.logoPath) {
    await removeObjects(LOGO_BUCKET, [existing.logoPath]);
  }

  revalidatePath(`/company/${companySlug}`);
  return NextResponse.json({ client });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const existing = await prisma.companyClient.findFirst({
    where: { id: params.id, companyId: auth.owner.companyId },
    select: { id: true, logoPath: true },
  });
  if (!existing) return NextResponse.json({ error: "That client no longer exists." }, { status: 404 });

  await prisma.companyClient.delete({ where: { id: existing.id } });
  await removeObjects(LOGO_BUCKET, [existing.logoPath]);

  revalidatePath(`/company/${auth.owner.slug}`);
  return NextResponse.json({ deleted: true });
}
