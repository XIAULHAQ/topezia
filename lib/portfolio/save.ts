/**
 * Validating and persisting a portfolio.
 *
 * Everything arriving here is untrusted: this is member-authored content that
 * will be rendered publicly and indexed. Caps exist so one member cannot make a
 * page that breaks the grid, blows up a row, or degrades every listing query.
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { parseCategory, type PortfolioCategoryValue } from "./categories";
import { youTubeId } from "./video";

export const LIMITS = {
  title: 120,
  description: 4000,
  tag: 40,
  skills: 20,
  technologies: 20,
  media: 30,
  caption: 200,
};

export type MediaInput = {
  kind: "IMAGE" | "VIDEO";
  /** IMAGE: storage path from the upload route. VIDEO: a pasted YouTube URL. */
  path: string;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
};

export type PortfolioInput = {
  title: string;
  description?: string | null;
  category: string;
  coverPath?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
  skills?: unknown;
  technologies?: unknown;
  media?: unknown;
  publish?: boolean;
};

export type CleanMedia = {
  kind: "IMAGE" | "VIDEO";
  path: string;
  videoId: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  position: number;
};

export type CleanPortfolio = {
  title: string;
  description: string | null;
  category: PortfolioCategoryValue;
  coverPath: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  skills: string[];
  technologies: string[];
  media: CleanMedia[];
  publish: boolean;
};

export type ValidationResult = { ok: false; error: string } | { ok: true; value: CleanPortfolio };

/** Trim, drop empties, cap length, de-duplicate case-insensitively, cap count. */
function cleanTags(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().replace(/\s+/g, " ").slice(0, LIMITS.tag);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** A positive, sane pixel count — or null. Guards against absurd aspect ratios. */
function dim(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 && n <= 30000 ? n : null;
}

/**
 * Storage paths are `{profileId}/{uuid}.{ext}` and are minted by the upload
 * route. Re-checking the shape here stops a caller from posting an arbitrary
 * string — or another member's path — straight into their own portfolio.
 */
function isOwnedPath(path: string, profileId: string): boolean {
  return new RegExp(`^${profileId}/[0-9a-f-]{36}\\.(jpg|png|webp|avif)$`, "i").test(path);
}

export function validate(input: PortfolioInput, profileId: string): ValidationResult {
  const title = (input.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) return { ok: false, error: "Give your work a title." };
  if (title.length > LIMITS.title) return { ok: false, error: `Title is longer than ${LIMITS.title} characters.` };

  const category = parseCategory(input.category);
  if (!category) return { ok: false, error: "Choose a category." };

  const description = (input.description ?? "").trim().slice(0, LIMITS.description) || null;

  const coverPath = input.coverPath ?? null;
  if (coverPath && !isOwnedPath(coverPath, profileId)) {
    return { ok: false, error: "That cover image isn't one of your uploads." };
  }

  const rawMedia = Array.isArray(input.media) ? input.media.slice(0, LIMITS.media) : [];
  const cleanMedia: CleanMedia[] = [];

  for (const [i, m] of (rawMedia as MediaInput[]).entries()) {
    if (!m || typeof m !== "object") continue;
    const caption = typeof m.caption === "string" ? m.caption.trim().slice(0, LIMITS.caption) || null : null;

    if (m.kind === "VIDEO") {
      const id = youTubeId(String(m.path ?? ""));
      if (!id) return { ok: false, error: "One of the video links isn't a YouTube URL we recognise." };
      // Store the id, never the pasted URL — see lib/portfolio/video.ts.
      cleanMedia.push({ kind: "VIDEO", path: id, videoId: id, width: null, height: null, caption, position: i });
      continue;
    }

    const path = String(m.path ?? "");
    if (!isOwnedPath(path, profileId)) {
      return { ok: false, error: "One of those images isn't one of your uploads." };
    }
    cleanMedia.push({ kind: "IMAGE", path, videoId: null, width: dim(m.width), height: dim(m.height), caption, position: i });
  }

  const publish = input.publish === true;
  if (publish && !coverPath && !cleanMedia.some((m) => m.kind === "IMAGE")) {
    return { ok: false, error: "Add at least one image before publishing." };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      category,
      coverPath,
      coverWidth: dim(input.coverWidth),
      coverHeight: dim(input.coverHeight),
      skills: cleanTags(input.skills, LIMITS.skills),
      technologies: cleanTags(input.technologies, LIMITS.technologies),
      media: cleanMedia,
      publish,
    },
  };
}

/**
 * "monolab-branding-k3m9x2" — readable, and unique without a retry loop. The
 * random suffix also stops slugs from being guessable, so an unpublished draft
 * can't be found by enumerating titles.
 */
export function makeSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "work";
  return `${base}-${crypto.randomBytes(4).toString("hex").slice(0, 6)}`;
}

/** Replaces media wholesale — simpler and less error-prone than diffing rows. */
export async function writeMedia(portfolioId: string, media: CleanMedia[]) {
  await prisma.$transaction([
    prisma.portfolioMedia.deleteMany({ where: { portfolioId } }),
    ...(media.length
      ? [prisma.portfolioMedia.createMany({ data: media.map((m) => ({ ...m, portfolioId })) })]
      : []),
  ]);
}
