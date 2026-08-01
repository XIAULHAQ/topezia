/**
 * GET    /api/company/facts — taught answers + the questions worth teaching.
 * POST   /api/company/facts — teach (or re-teach) one answer.
 * DELETE /api/company/facts?id= — forget one.
 *
 * Owner only. These rows are the one piece of site knowledge a human wrote,
 * and they outrank the crawl at answer time (lib/widget/answer.ts) — so this
 * route is also the reason crawls must never touch SiteFact.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { scoreUgc, isSpam, spamMessage } from "@/lib/ugc";
import { saveFact, listFacts, deleteFact, unansweredQuestions, FACT_LIMITS } from "@/lib/widget/facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function siteFor(companyId: string) {
  return prisma.widgetSite.findUnique({ where: { companyId }, select: { id: true } });
}

export async function GET() {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const site = await siteFor(auth.owner.companyId);
  if (!site) return NextResponse.json({ facts: [], unanswered: [], limits: FACT_LIMITS });

  const [facts, unanswered] = await Promise.all([listFacts(site.id), unansweredQuestions(site.id)]);
  return NextResponse.json({ facts, unanswered, limits: FACT_LIMITS });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  // Each save costs an embedding call; a human teaching answers by hand
  // never comes close to this.
  if (!rateLimit(`facts-write:${auth.owner.userId}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const site = await siteFor(auth.owner.companyId);
  if (!site) return NextResponse.json({ error: "Set up the widget first." }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const question = typeof body.question === "string" ? body.question : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  if (!question.trim() || !answer.trim()) {
    return NextResponse.json({ error: "Both the question and the answer are needed." }, { status: 400 });
  }
  // The owner's own words go on their own website — links are normal here.
  const verdict = scoreUgc(answer, { linksExpected: true });
  if (isSpam(verdict)) return NextResponse.json({ error: spamMessage(verdict) }, { status: 422 });

  const fact = await saveFact(site.id, {
    id: typeof body.id === "string" && body.id ? body.id : undefined,
    question,
    answer,
  });
  if (!fact) {
    return NextResponse.json(
      { error: `You can teach up to ${FACT_LIMITS.perSite} answers. Delete one to add another.` },
      { status: 409 }
    );
  }
  return NextResponse.json({ fact });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const site = await siteFor(auth.owner.companyId);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!site || !id || !(await deleteFact(site.id, id))) {
    return NextResponse.json({ error: "That answer no longer exists." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
