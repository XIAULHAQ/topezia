/**
 * POST /api/parse — spec §6.1
 *
 * Accepts either a résumé FILE (multipart: pdf/docx/txt) or pasted text (JSON).
 * Returns the structured parse. Stateless: it does NOT write a Profile, and it
 * does NOT store the uploaded file — /api/profile commits the (edited) result.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseResume } from "@/lib/matching/parse-resume";
import { extractResumeText, ResumeExtractError, MAX_RESUME_BYTES } from "@/lib/matching/extract-text";

export const maxDuration = 60;
export const runtime = "nodejs"; // pdf/docx parsing needs Node, not edge

async function resumeTextFrom(req: NextRequest): Promise<string> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new ResumeExtractError("No file received.");
    if (file.size > MAX_RESUME_BYTES) throw new ResumeExtractError("That file is over 4MB.");
    const buffer = Buffer.from(await file.arrayBuffer());
    return extractResumeText({ buffer, filename: file.name, type: file.type });
  }

  const body = (await req.json()) as { resumeText?: string };
  const text = (body.resumeText ?? "").trim();
  if (text.length < 40) throw new ResumeExtractError("Please paste your full résumé text.");
  return text;
}

export async function POST(req: NextRequest) {
  let resumeText: string;
  try {
    resumeText = await resumeTextFrom(req);
  } catch (err) {
    // Extraction problems are the user's to fix (wrong file, a scan, too big),
    // so they get a real message rather than a generic 500.
    const message = err instanceof ResumeExtractError ? err.message : "Couldn't read that — try pasting your résumé text.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const parsed = await parseResume(resumeText);
    // Hand the text back so the client can submit it with the profile — it's
    // already in the browser's hands, and this saves re-extracting the file.
    return NextResponse.json({ parsed, resumeText });
  } catch (err) {
    console.error("parse failed:", err);
    return NextResponse.json({ error: "Couldn't parse that résumé — try again." }, { status: 502 });
  }
}
