/**
 * POST /api/testimonial/{token} — a client submits the testimonial they were
 * asked for.
 *
 * PUBLIC and unauthenticated by design: the client has no Topezia account and
 * shouldn't need one to answer a favour. The token is the authorization, and
 * it is consumed here — one invitation, one testimonial.
 *
 * What that buys, precisely: whoever controlled the invited email address
 * wrote these words. Not identity, and the public page never claims more.
 *
 * The company cannot edit what arrives (see the PATCH guard in
 * /api/company/testimonials/[id]). That asymmetry is the entire point — a
 * quote a company can rewrite is a quote the company wrote.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { validateTestimonial } from "@/lib/company/save";
import { rateLimit, clientIp, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  // Guessing a 24-byte token is hopeless, but an unbounded public write
  // endpoint is still a free database round-trip per request.
  if (!rateLimit(`testimonial-submit:${clientIp(req)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const invite = await prisma.companyTestimonialInvite.findUnique({
    where: { token: params.token },
    select: {
      id: true, companyId: true, status: true, expiresAt: true,
      company: { select: { name: true, slug: true } },
    },
  });
  if (!invite || invite.status !== "PENDING") {
    return NextResponse.json({ error: "This request has already been answered or withdrawn." }, { status: 404 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired — ask them to send a new one." }, { status: 410 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Same validation and the same spam scoring the company's own path uses —
  // being invited is not a reason to skip either.
  const result = validateTestimonial(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const position = await prisma.companyTestimonial.count({ where: { companyId: invite.companyId } });

  const testimonial = await prisma.$transaction(async (tx) => {
    const created = await tx.companyTestimonial.create({
      data: {
        ...result.value,
        companyId: invite.companyId,
        position,
        origin: "INVITED",
        submittedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.companyTestimonialInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", submittedAt: new Date(), testimonialId: created.id },
    });
    return created;
  });

  revalidatePath(`/company/${invite.company.slug}`);
  return NextResponse.json({ ok: true, company: invite.company, testimonialId: testimonial.id });
}
