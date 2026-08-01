/**
 * GET   /api/company/inquiries — the inbox: contact-form config + every
 *                                inquiry, newest first, with its thread.
 * PATCH /api/company/inquiries — update the contact-form config.
 *
 * Owner only, like every /api/company/* write — team members are listed on
 * the page, not given the inbox (see lib/company/owner.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { validateContactConfig, suggestContactConfig } from "@/lib/company/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inbox page size. Not pagination — a cap. A company inbox past this size is
 *  a product problem to solve when it exists. */
const MAX_INBOX = 200;

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.owner;

  const [config, inquiries, liveJobs, liveProjects, work, clients] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { contactEnabled: true, contactReasons: true, contactQuestions: true },
    }),
    prisma.companyInquiry.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: MAX_INBOX,
      select: {
        id: true, reason: true, message: true, answers: true,
        status: true, repliedAt: true, createdAt: true,
        source: true, visitorEmail: true, visitorName: true, transcript: true,
        profile: {
          select: {
            fullName: true, publicSlug: true, publicVisible: true,
            currentLocation: true, openToWork: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, sender: true, body: true, createdAt: true },
        },
      },
    }),
    prisma.job.count({ where: { companyId, status: "LIVE", kind: "JOB" } }),
    prisma.job.count({ where: { companyId, status: "LIVE", kind: "PROJECT" } }),
    prisma.companyWork.count({ where: { companyId, status: "PUBLISHED" } }),
    prisma.companyClient.count({ where: { companyId } }),
  ]);

  // What the setup editor seeds from when the config is still blank — derived
  // from the company's own page, never written until the owner saves.
  const suggested = suggestContactConfig({ liveJobs, liveProjects, work, clients });

  return NextResponse.json({ config, inquiries, suggested });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId, slug } = auth.owner;

  if (!rateLimit(`inquiry-config:${userId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const result = validateContactConfig(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const company = await prisma.company.update({
    where: { id: companyId },
    data: result.value,
    select: { contactEnabled: true, contactReasons: true, contactQuestions: true },
  });

  // The public page renders the form from ISR — flipping the switch must not
  // wait out the revalidate window.
  revalidatePath(`/company/${slug}`);

  return NextResponse.json({ config: company });
}
