/**
 * /api/hq/ai-cost — the AI cost breakdown behind /hq/ai-cost.
 *
 * GET ?days=7|30|90 → CostReport (lib/llm-report.ts)
 *
 * Same /hq session-cookie gate as every other /api/hq route.
 */
import { NextRequest, NextResponse } from "next/server";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";
import { costReport } from "@/lib/llm-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const days = [7, 30, 90].includes(raw) ? raw : 7;
  return NextResponse.json(await costReport(days));
}
