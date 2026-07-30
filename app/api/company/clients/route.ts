/**
 * GET  /api/company/clients — the client logos on the company page.
 * POST /api/company/clients — add one.
 *
 * A client entry is a name, an optional logo, and an optional link to that
 * client's own site. The link is the point of the feature and also its only
 * real risk: it is an outbound, user-supplied URL on a page we host. It is
 * validated here (http/https, real hostname) and rendered with
 * rel="ugc nofollow" everywhere — see lib/ugc.ts UGC_REL.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { validateClient } from "@/lib/company/save";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A logo wall stops meaning anything past a few dozen, and an unbounded one
 *  is a link directory with pictures. */
const MAX_CLIENTS = 40;

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const clients = await prisma.companyClient.findMany({
    where: { companyId: auth.owner.companyId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, slug: companySlug } = auth.owner;

  if (!rateLimit(`company-client:${userId}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const count = await prisma.companyClient.count({ where: { companyId } });
  if (count >= MAX_CLIENTS) {
    return NextResponse.json({ error: `You can list up to ${MAX_CLIENTS} clients.` }, { status: 409 });
  }

  const result = validateClient(body, companyId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const client = await prisma.companyClient.create({ data: { ...result.value, companyId, position: count } });

  revalidatePath(`/company/${companySlug}`);
  return NextResponse.json({ client });
}
