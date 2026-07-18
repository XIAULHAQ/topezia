/**
 * Best-effort profile photo extraction from an uploaded CV (spec §3.4).
 *
 * How we pull the embedded image without a canvas (serverless has none):
 *   - PDF  → decode image XObjects through pdfjs (already bundled via unpdf),
 *            which handles every filter/colorspace (FlateDecode pixels, JPEG,
 *            predictors…) and hands back raw RGB(A); we re-encode the headshot
 *            to PNG. Falls back to a raw JPEG/PNG byte-scan if pdfjs finds none.
 *   - DOCX → mammoth hands us each embedded image.
 * Then we pick the one shaped like a headshot (portrait/square, not an icon,
 * not a full-page scan) and return it as a small data URI, or null.
 *
 * This never throws: a missing/odd photo must not break résumé parsing. Most
 * US/tech résumés have no photo at all, and that's fine — we return null.
 */
import zlib from "zlib";

const MAX_PHOTO_BYTES = 700 * 1024; // don't store a huge image in the row / response
const MAX_THUMB_DIM = 480; // downscale bigger photos so the data URI stays small

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

// ── PNG encoding (pure Node, no canvas) ──────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Buffer): number { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
/** Encode raw 8-bit pixels (channels 3=RGB or 4=RGBA) to a PNG buffer. */
function encodePng(w: number, h: number, data: Buffer, channels: 3 | 4): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  const rowLen = w * channels;
  const raw = Buffer.alloc((rowLen + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (rowLen + 1)] = 0; data.copy(raw, y * (rowLen + 1) + 1, y * rowLen, y * rowLen + rowLen); }
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })), pngChunk("IEND", Buffer.alloc(0))]);
}
/** Nearest-neighbour downscale so a big photo doesn't bloat the data URI. */
function downscale(data: Buffer, w: number, h: number, channels: number, maxDim: number): { data: Buffer; w: number; h: number } {
  if (Math.max(w, h) <= maxDim) return { data, w, h };
  const scale = maxDim / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
  const out = Buffer.alloc(nw * nh * channels);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / scale));
      const si = (sy * w + sx) * channels, di = (y * nw + x) * channels;
      for (let c = 0; c < channels; c++) out[di + c] = data[si + c];
    }
  }
  return { data: out, w: nw, h: nh };
}

/** Resolve a pdfjs image object, waiting for async-decoded (large) ones. */
function resolvePdfImage(page: { objs: { get: (n: string, cb?: (v: unknown) => void) => unknown } }, name: string, ms = 5000): Promise<{ width: number; height: number; kind: number; data: Uint8ClampedArray } | null> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: unknown) => { if (!done) { done = true; resolve((v as { width?: number })?.width ? (v as { width: number; height: number; kind: number; data: Uint8ClampedArray }) : null); } };
    try { const im = page.objs.get(name); if (im) return fin(im); } catch { /* not ready — wait via callback */ }
    try { page.objs.get(name, fin); } catch { fin(null); }
    setTimeout(() => fin(null), ms);
  });
}

/**
 * Decode PDF image XObjects via pdfjs and return the best headshot as a PNG
 * data URI. Handles FlateDecode pixels, JPEGs, predictors — everything, because
 * pdfjs does the decoding for us and hands back plain RGB(A).
 */
async function pdfPhotoViaPdfjs(buffer: Buffer): Promise<string | null> {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const OPS = (await getResolvedPDFJS()).OPS as { paintImageXObject: number };
  type Img = { width: number; height: number; kind: number; data: Uint8ClampedArray };
  const imgs: Img[] = [];
  const pages = Math.min(pdf.numPages, 2); // headshots live on page 1 (occasionally 2)
  for (let pn = 1; pn <= pages; pn++) {
    const page = await pdf.getPage(pn);
    const ops = await page.getOperatorList();
    const names = new Set<string>();
    for (let i = 0; i < ops.fnArray.length; i++) if (ops.fnArray[i] === OPS.paintImageXObject) names.add(ops.argsArray[i][0] as string);
    const resolved = await Promise.all([...names].map((n) => resolvePdfImage(page as never, n)));
    for (const im of resolved) if (im && looksLikeHeadshot(im.width, im.height) && (im.kind === 2 || im.kind === 3)) imgs.push(im);
  }
  if (imgs.length === 0) return null;
  imgs.sort((a, b) => b.width * b.height - a.width * a.height);
  const best = imgs[0];
  const channels: 3 | 4 = best.kind === 3 ? 4 : 3;
  const scaled = downscale(Buffer.from(best.data.buffer, best.data.byteOffset, best.data.byteLength), best.width, best.height, channels, MAX_THUMB_DIM);
  const png = encodePng(scaled.w, scaled.h, scaled.data, channels);
  if (png.length > MAX_PHOTO_BYTES) return null;
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function extractResumePhoto(file: { buffer: Buffer; filename: string; type?: string }): Promise<string | null> {
  try {
    const ext = extensionOf(file.filename);
    if (ext === ".pdf" || file.type === "application/pdf") {
      // pdfjs decodes every image format; the raw byte-scan is a cheap fallback.
      const viaPdfjs = await pdfPhotoViaPdfjs(file.buffer).catch((e) => { console.error("pdfjs photo decode failed:", e); return null; });
      return viaPdfjs ?? pickBest([...scanJpegs(file.buffer), ...scanPngs(file.buffer)]);
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
