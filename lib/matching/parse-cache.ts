/**
 * Parse each resume once — Phase 1 §3.5 of docs/ai-cost-strategy.md.
 *
 * Keyed by a hash of the CONTENT (the text, or the PDF bytes) plus the parse
 * prompt version — never by a person or a session. Identical input returns
 * the stored structured output; a prompt edit bumps PARSE_PROMPT_VERSION and
 * every old row is simply never hit again (and expires). No file is stored,
 * only what the model returned, and rows expire after 30 days so a parse
 * that never became a profile doesn't linger.
 *
 * Misses and errors are the same thing here: null, and the caller parses.
 * The cache is a saving, never a dependency.
 */
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Bump when PARSE_PROMPT, PARSE_MODEL or the normalisation in
 *  parse-resume.ts changes meaning — old rows stop matching automatically. */
export const PARSE_PROMPT_VERSION = "2026-08-19";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ParseKind = "text" | "scanned";

export function parseCacheKey(kind: ParseKind, content: string | Buffer): string {
  const h = createHash("sha256");
  h.update(`${PARSE_PROMPT_VERSION}\n${kind}\n`);
  h.update(content);
  return h.digest("hex");
}

export type CachedParse = { parsed: unknown; transcription: string | null; photoBox: unknown | null };

export async function lookupParse(hash: string): Promise<CachedParse | null> {
  try {
    const row = await prisma.resumeParseCache.findUnique({
      where: { hash },
      select: { parsed: true, transcription: true, photoBox: true, expiresAt: true },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    prisma.resumeParseCache.update({ where: { hash }, data: { hits: { increment: 1 } } }).catch(() => {});
    return { parsed: row.parsed, transcription: row.transcription, photoBox: row.photoBox ?? null };
  } catch (err) {
    console.error("[parse-cache] lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function storeParse(hash: string, kind: ParseKind, value: CachedParse): Promise<void> {
  try {
    const data = {
      kind,
      parsed: value.parsed as Prisma.InputJsonValue,
      transcription: value.transcription,
      photoBox: (value.photoBox ?? undefined) as Prisma.InputJsonValue | undefined,
      expiresAt: new Date(Date.now() + TTL_MS),
    };
    await prisma.resumeParseCache.upsert({ where: { hash }, create: { hash, ...data }, update: data });
    // Sweep the expired on the way, cheaply — the table stays "last 30 days".
    await prisma.resumeParseCache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch (err) {
    console.error("[parse-cache] store failed:", err instanceof Error ? err.message : err);
  }
}
