/**
 * POST /api/parse — spec §6.1
 *
 * Résumé text in, structured parse out. Stateless preview: it does NOT write a
 * Profile. The parse-confirmation screen shows this for editing; /api/profile
 * commits the (possibly edited) result.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseResume } from "@/lib/matching/parse-resume";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { resumeText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const resumeText = (body.resumeText ?? "").trim();
  if (resumeText.length < 40) {
    return NextResponse.json({ error: "Please paste your full résumé text." }, { status: 400 });
  }

  try {
    const parsed = await parseResume(resumeText);
    return NextResponse.json({ parsed });
  } catch (err) {
    console.error("parse failed:", err);
    return NextResponse.json({ error: "Couldn't parse that résumé — try again." }, { status: 502 });
  }
}
