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
import { saveFact, listFacts, deleteFact, unansweredQuestions, factCap, FACT_LIMITS } from "@/lib/widget/facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The named site, or the company's only one when it has just the one.
 *  Scoped by companyId, so another company's site id reads as absent. */
async function siteFor(companyId: string, siteId?: string | null) {
  if (siteId) return prisma.widgetSite.findFirst({ where: { id: siteId, companyId }, select: { id: true } });
  const sites = await prisma.widgetSite.findMany({ where: { companyId }, take: 2, select: { id: true } });
  return sites.length === 1 ? sites[0] : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const site = await siteFor(auth.owner.companyId, new URL(req.url).searchParams.get("siteId"));
  if (!site) return NextResponse.json({ facts: [], unanswered: [], limits: { ...FACT_LIMITS, perSite: 0 } });

  const [facts, unanswered, perSite] = await Promise.all([listFacts(site.id), unansweredQuestions(site.id), factCap(site.id)]);
  return NextResponse.json({ facts, unanswered, limits: { ...FACT_LIMITS, perSite } });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  // Each save costs an embedding call; a human teaching answers by hand
  // never comes close to this.
  if (!rateLimit(`facts-write:${auth.owner.userId}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const site = await siteFor(auth.owner.companyId, typeof body.siteId === "string" ? body.siteId : null);
  if (!site) return NextResponse.json({ error: "Which website is this answer for?" }, { status: 404 });

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
      { error: `You can teach up to ${await factCap(site.id)} answers on your plan. Delete one, or upgrade for more.`, upgrade: true },
      { status: 409 }
    );
  }
  return NextResponse.json({ fact });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const site = await siteFor(auth.owner.companyId, url.searchParams.get("siteId"));
  const id = url.searchParams.get("id") ?? "";
  if (!site || !id || !(await deleteFact(site.id, id))) {
    return NextResponse.json({ error: "That answer no longer exists." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
