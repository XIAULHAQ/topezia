/**
 * Pull plain text out of an uploaded résumé (spec §3.4).
 *
 * Supports PDF, DOCX and plain text. PDF matters most: it's what people
 * actually have, AND it's the practical "connect LinkedIn" path — LinkedIn
 * gives no profile API to apps like us (Sign in with LinkedIn returns only
 * name/email/photo), but a user can export their own profile via
 * More → Save to PDF and upload that.
 *
 * Files are parsed in memory and never stored. A résumé is sensitive personal
 * data; we only need the text, so keeping the file would be liability with no
 * upside (Profile.resumeFileUrl stays null until there's a reason).
 */

export const MAX_RESUME_BYTES = 4 * 1024 * 1024; // 4MB — comfortably under the serverless body limit
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;

export class ResumeExtractError extends Error {}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

/** Collapse the whitespace soup PDF extraction produces into readable text. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractResumeText(file: {
  buffer: Buffer;
  filename: string;
  type?: string;
}): Promise<string> {
  if (file.buffer.length === 0) throw new ResumeExtractError("That file is empty.");
  if (file.buffer.length > MAX_RESUME_BYTES) {
    throw new ResumeExtractError("That file is over 4MB — try exporting a smaller PDF.");
  }

  const ext = extensionOf(file.filename);
  let text: string;

  try {
    if (ext === ".pdf" || file.type === "application/pdf") {
      // Import inside the branch: these are heavy (pdf-parse pulls in pdfjs),
      // and a DOCX upload shouldn't pay to load a PDF engine.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
      try {
        const result = await parser.getText();
        text = result.text ?? "";
      } finally {
        await parser.destroy(); // pdfjs holds workers/memory open otherwise
      }
    } else if (ext === ".docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value ?? "";
    } else if (ext === ".txt" || ext === ".md" || file.type?.startsWith("text/")) {
      text = file.buffer.toString("utf8");
    } else {
      throw new ResumeExtractError(`We can read PDF, DOCX and plain text — not ${ext || "that file type"}.`);
    }
  } catch (err) {
    if (err instanceof ResumeExtractError) throw err;
    // Log the real cause server-side — the user gets a friendly message, but
    // swallowing the actual error makes this impossible to debug.
    console.error("resume extraction failed:", err);
    // A corrupt/encrypted file shouldn't 500 — tell the person what to do.
    throw new ResumeExtractError(
      "We couldn't read that file. If it's a scanned or password-protected PDF, try exporting a fresh copy — or paste the text instead."
    );
  }

  const clean = tidy(text);

  // Scanned/image-only PDFs extract to almost nothing. Say so plainly rather
  // than sending 3 characters to the model and returning a nonsense profile.
  if (clean.length < 100) {
    throw new ResumeExtractError(
      "We couldn't find readable text in that file — it may be a scan or an image. Try a text-based PDF, or paste your résumé instead."
    );
  }

  return clean;
}
