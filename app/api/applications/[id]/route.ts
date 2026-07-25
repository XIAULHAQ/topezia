/**
 * PATCH /api/applications/{id} — move an application through the pipeline.
 *
 * The employer (owner of the posting's company) may move it between
 * APPLIED → SHORTLISTED → INTERVIEW → SELECTED, or REJECT from anywhere.
 * The applicant may only WITHDRAW their own. Nobody else touches it.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

const EMPLOYER_STAGES = new Set(["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED"]);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { stage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const stage = body.stage ?? "";

  const app = await prisma.application.findUnique({
    where: { id: params.id },
    select: {
      stage: true,
      profile: { select: { userId: true } },
      job: { select: { company: { select: { ownerUserId: true } } } },
    },
  });
  if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isEmployer = app.job.company?.ownerUserId === userId;
  const isApplicant = app.profile.userId === userId;

  // A withdrawn application stays withdrawn — the applicant left the process,
  // and an employer "un-withdrawing" someone would put words in their mouth.
  if (app.stage === "WITHDRAWN") return NextResponse.json({ error: "This application was withdrawn." }, { status: 409 });

  if (isApplicant && stage === "WITHDRAWN") {
    await prisma.application.update({ where: { id: params.id }, data: { stage: "WITHDRAWN" } });
    return NextResponse.json({ ok: true, stage });
  }
  if (isEmployer && EMPLOYER_STAGES.has(stage)) {
    await prisma.application.update({ where: { id: params.id }, data: { stage: stage as never } });
    return NextResponse.json({ ok: true, stage });
  }
  return NextResponse.json({ error: "Not allowed." }, { status: 403 });
}
