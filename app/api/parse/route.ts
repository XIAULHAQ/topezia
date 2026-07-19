/**
 * POST /api/parse — spec §6.1
 *
 * Accepts either a résumé FILE (multipart: pdf/docx/txt) or pasted text (JSON).
 * Returns the structured parse. Stateless: it does NOT write a Profile, and it
 * does NOT store the uploaded file — /api/profile commits the (edited) result.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseResume, parseScannedResume } from "@/lib/matching/parse-resume";
import { extractResumeText, ResumeExtractError, ResumeScannedError, MAX_RESUME_BYTES } from "@/lib/matching/extract-text";
import { extractResumePhoto } from "@/lib/matching/extract-photo";

export const maxDuration = 60;
export const runtime = "nodejs"; // pdf/docx parsing needs Node, not edge

type ResumeInput =
  | { text: string; photo: string | null }
  // A PDF with no text layer — vision-parse the pages instead of dead-ending.
  | { scannedPdf: Buffer };

async function resumeInputFrom(req: NextRequest): Promise<ResumeInput> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new ResumeExtractError("No file received.");
    if (file.size > MAX_RESUME_BYTES) throw new ResumeExtractError("That file is over 4MB.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const src = { buffer, filename: file.name, type: file.type };
    let text: string;
    try {
      text = await extractResumeText(src);
    } catch (err) {
      if (err instanceof ResumeScannedError) return { scannedPdf: buffer };
      throw err;
    }
    // Best-effort — a missing/odd photo never blocks the parse.
    const photo = await extractResumePhoto(src);
    return { text, photo };
  }

  const body = (await req.json()) as { resumeText?: string };
  const text = (body.resumeText ?? "").trim();
  if (text.length < 40) throw new ResumeExtractError("Please paste your full résumé text.");
  return { text, photo: null };
}

export async function POST(req: NextRequest) {
  let input: ResumeInput;
  try {
    input = await resumeInputFrom(req);
  } catch (err) {
    // Extraction problems are the user's to fix (wrong file, too big),
    // so they get a real message rather than a generic 500.
    const message = err instanceof ResumeExtractError ? err.message : "Couldn't read that — try pasting your résumé text.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if ("scannedPdf" in input) {
      // Scanned PDF: the model reads the page images and returns the parse plus
      // a transcription (stored as resumeText, same as a text PDF). No photo —
      // in a scan the "best embedded image" is the whole page, not a headshot.
      const { parsed, transcription } = await parseScannedResume(input.scannedPdf);
      if (transcription.length < 100) {
        return NextResponse.json(
          { error: "We couldn't read that scan — the pages may be blurry or incomplete. Try a clearer copy, or paste your résumé text instead." },
          { status: 400 }
        );
      }
      return NextResponse.json({ parsed, resumeText: transcription, photo: null, scanned: true });
    }

    const parsed = await parseResume(input.text);
    // Hand the text (and any extracted photo) back so the client can submit it
    // with the profile — it's already in the browser's hands, and this saves
    // re-extracting the file.
    return NextResponse.json({ parsed, resumeText: input.text, photo: input.photo });
  } catch (err) {
    console.error("parse failed:", err);
    return NextResponse.json({ error: "Couldn't parse that résumé — try again." }, { status: 502 });
  }
}
