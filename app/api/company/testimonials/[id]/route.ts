/**
 * PATCH  /api/company/testimonials/{id} — edit one.
 * DELETE /api/company/testimonials/{id} — remove it.
 *
 * `where: { id, companyId }` is the authorization, not a filter applied after
 * loading — the same posture as every other company write route.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateTestimonial } from "@/lib/company/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId, slug: companySlug } = auth.owner;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.companyTestimonial.findFirst({
    where: { id: params.id, companyId },
    select: { id: true, origin: true },
  });
  if (!existing) return NextResponse.json({ error: "That testimonial no longer exists." }, { status: 404 });

  // A client wrote this one. The company may HIDE it — an unverified link
  // could otherwise be used to plant something damaging — but never edit it.
  // A quote the subject can rewrite is a quote the subject wrote, and the
  // public page says a client wrote it. Same asymmetry as lib/endorsements.
  if (existing.origin === "INVITED") {
    const visibleOnly = { visible: body.visible !== false };
    if (Object.keys(body).some((k) => k !== "visible")) {
      return NextResponse.json(
        { error: "This testimonial was written by your client, so it can't be edited. You can hide it instead." },
        { status: 403 }
      );
    }
    await prisma.companyTestimonial.update({ where: { id: existing.id }, data: visibleOnly });
    revalidatePath(`/company/${companySlug}`);
    return NextResponse.json({ testimonial: await prisma.companyTestimonial.findUnique({ where: { id: existing.id } }) });
  }

  const result = validateTestimonial(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await prisma.companyTestimonial.update({ where: { id: existing.id }, data: result.value });

  revalidatePath(`/company/${companySlug}`);
  const testimonial = await prisma.companyTestimonial.findUnique({ where: { id: params.id } });
  return NextResponse.json({ testimonial });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const existing = await prisma.companyTestimonial.findFirst({
    where: { id: params.id, companyId: auth.owner.companyId },
    select: { id: true, origin: true },
  });
  if (!existing) return NextResponse.json({ error: "That testimonial no longer exists." }, { status: 404 });

  // Hiding, not deleting. Hiding is reversible and achieves the same thing a
  // company legitimately wants; deleting would let one quietly bin every
  // response it didn't like and leave no trace that it ever asked.
  if (existing.origin === "INVITED") {
    return NextResponse.json(
      { error: "This testimonial was written by your client and can't be deleted. Hide it if you don't want it shown." },
      { status: 403 }
    );
  }

  await prisma.companyTestimonial.delete({ where: { id: existing.id } });

  revalidatePath(`/company/${auth.owner.slug}`);
  return NextResponse.json({ deleted: true });
}
