/**
 * Image sniffing and dimension reading, from the file's own bytes.
 *
 * The browser-declared Content-Type is attacker-controlled: anything can be sent
 * as "image/png". So the type is decided here, from magic bytes, and the
 * declared value is ignored entirely.
 *
 * SVG is absent on purpose. It is an executable document — script tags,
 * foreignObject, external references — and serving one from our own origin is
 * stored XSS against every visitor. Raster only.
 */

export type SniffedType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export function sniffImageType(buf: Buffer): SniffedType | null {
  if (buf.length < 16) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";

  // RIFF....WEBP
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";

  // ISO-BMFF: ....ftyp<brand>. avif/avis are the AVIF brands.
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
  }

  return null;
}

/**
 * Intrinsic size, so the masonry grid can reserve each tile's box BEFORE the
 * image loads. Without it a Pinterest layout reflows on every arriving image.
 *
 * Read server-side rather than trusting numbers from the client: a wrong
 * aspect ratio would shear the whole column. Returns null when the format
 * isn't parsed here (AVIF), and the grid falls back to a default ratio.
 */
export function imageDimensions(buf: Buffer, type: SniffedType): { width: number; height: number } | null {
  try {
    if (type === "image/png") {
      // IHDR is always the first chunk: width/height are big-endian at 16/20.
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    if (type === "image/jpeg") {
      // Walk the segment chain to a Start-Of-Frame marker, which carries the size.
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) { off++; continue; }
        const marker = buf[off + 1];
        // SOF0-SOF15, excluding DHT (c4), JPG (c8) and DAC (cc) which share the range.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
        }
        off += 2 + buf.readUInt16BE(off + 2);
      }
      return null;
    }

    if (type === "image/webp") {
      const fourcc = buf.subarray(12, 16).toString("ascii");
      if (fourcc === "VP8X") {
        // 24-bit little-endian, stored as (value - 1).
        return {
          width: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
          height: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
        };
      }
      if (fourcc === "VP8 ") {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fourcc === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      return null;
    }

    return null; // AVIF — box-walking for a cosmetic hint isn't worth it yet.
  } catch {
    return null; // Truncated or malformed: treat as unknown, never throw.
  }
}

const EXT: Record<SniffedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const extensionFor = (t: SniffedType) => EXT[t];
