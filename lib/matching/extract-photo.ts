/**
 * Best-effort profile photo extraction from an uploaded CV (spec §3.4).
 *
 * Résumé photos are almost always embedded as JPEGs (PDF: DCTDecode streams;
 * DOCX: word/media files). So rather than decode pages to a canvas (which
 * doesn't exist in a serverless function), we pull the embedded image bytes
 * straight out:
 *   - PDF  → scan the raw file for self-contained JPEG (and raw-PNG) streams.
 *   - DOCX → mammoth hands us each embedded image.
 * Then we pick the one shaped like a headshot (portrait/square, not an icon,
 * not a full-page scan) and return it as a small data URI, or null.
 *
 * This never throws: a missing/odd photo must not break résumé parsing. Most
 * US/tech résumés have no photo at all, and that's fine — we return null.
 */

const MAX_PHOTO_BYTES = 700 * 1024; // don't store a huge image in the row / response

type Candidate = { mime: string; bytes: Buffer; width: number; height: number };

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

/** A résumé headshot: not a tiny icon, not a full-page scan, portrait-ish. */
function looksLikeHeadshot(w: number, h: number): boolean {
  if (w < 80 || h < 80) return false; // icons, bullets, logos
  if (w > 1400 || h > 1400) return false; // full-page scans / banners
  const aspect = w / h;
  return aspect >= 0.55 && aspect <= 1.45; // portrait or square
}

/** Score candidates and return the best headshot as a data URI (or null). */
function pickBest(cands: Candidate[]): string | null {
  const ok = cands.filter((c) => looksLikeHeadshot(c.width, c.height) && c.bytes.length <= MAX_PHOTO_BYTES);
  if (ok.length === 0) return null;
  // Prefer the largest by area — the headshot dwarfs decorative icons.
  ok.sort((a, b) => b.width * b.height - a.width * a.height);
  const best = ok[0];
  return `data:${best.mime};base64,${best.bytes.toString("base64")}`;
}

/** Walk one JPEG from its SOI marker; return its byte-range end + dimensions. */
function parseJpeg(buf: Buffer, start: number): { end: number; width: number; height: number } | null {
  let i = start + 2; // past FF D8
  let width = 0, height = 0;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd9) return { end: i + 2, width, height }; // EOI
    if (marker === 0xff) { i++; continue; } // fill byte
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0x00) { i += 2; continue; } // standalone
    if (i + 3 >= buf.length) return null;
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (len < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // SOF marker — dimensions live here
      height = (buf[i + 5] << 8) | buf[i + 6];
      width = (buf[i + 7] << 8) | buf[i + 8];
    }
    if (marker === 0xda) {
      // Start of scan — entropy data runs until the next real marker.
      i += 2 + len;
      while (i < buf.length - 1) {
        if (buf[i] === 0xff && buf[i + 1] !== 0x00 && !(buf[i + 1] >= 0xd0 && buf[i + 1] <= 0xd7)) break;
        i++;
      }
      continue;
    }
    i += 2 + len;
  }
  return null;
}

/** Find every self-contained JPEG in a buffer (PDFs embed them verbatim). */
function scanJpegs(buf: Buffer): Candidate[] {
  const out: Candidate[] = [];
  let i = 0;
  while (i < buf.length - 3) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      const p = parseJpeg(buf, i);
      if (p && p.width > 0 && p.height > 0 && p.end > i) {
        out.push({ mime: "image/jpeg", bytes: buf.subarray(i, p.end), width: p.width, height: p.height });
        i = p.end;
        continue;
      }
    }
    i++;
  }
  return out;
}

/** Find raw (uncompressed-in-container) PNGs — rarer in PDF, common in DOCX. */
function scanPngs(buf: Buffer): Candidate[] {
  const out: Candidate[] = [];
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let from = 0;
  for (;;) {
    const start = buf.indexOf(SIG, from);
    if (start === -1) break;
    // IHDR follows the signature: length(4) "IHDR"(4) width(4) height(4)
    const width = buf.readUInt32BE(start + 16);
    const height = buf.readUInt32BE(start + 20);
    const end = buf.indexOf(Buffer.from("IEND"), start);
    if (end !== -1 && width > 0 && height > 0) {
      out.push({ mime: "image/png", bytes: buf.subarray(start, end + 8), width, height });
      from = end + 8;
    } else {
      from = start + 8;
    }
  }
  return out;
}

function dimsOf(bytes: Buffer, mime: string): { width: number; height: number } | null {
  if (mime.includes("png") && bytes.length > 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    const p = parseJpeg(bytes, 0);
    if (p) return { width: p.width, height: p.height };
  }
  return null;
}

async function docxPhoto(buffer: Buffer): Promise<string | null> {
  const mammoth = await import("mammoth");
  const cands: Candidate[] = [];
  await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        try {
          const mime = image.contentType || "image/jpeg";
          if (/jpe?g|png/i.test(mime)) {
            const bytes = Buffer.from(await image.read("base64"), "base64");
            const d = dimsOf(bytes, mime);
            if (d) cands.push({ mime, bytes, width: d.width, height: d.height });
          }
        } catch { /* skip this image */ }
        return { src: "" }; // we don't emit the image into HTML; we only harvest it
      }),
    }
  );
  return pickBest(cands);
}

export async function extractResumePhoto(file: { buffer: Buffer; filename: string; type?: string }): Promise<string | null> {
  try {
    const ext = extensionOf(file.filename);
    if (ext === ".pdf" || file.type === "application/pdf") {
      return pickBest([...scanJpegs(file.buffer), ...scanPngs(file.buffer)]);
    }
    if (ext === ".docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return await docxPhoto(file.buffer);
    }
    return null; // pasted text / txt — no photo to pull
  } catch (err) {
    console.error("photo extraction failed (non-fatal):", err);
    return null;
  }
}
