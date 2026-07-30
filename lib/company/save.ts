/**
 * Validating what a company types in — work, testimonials, client logos.
 *
 * All of it is user-generated content that ends up on a public, indexable page
 * we host, so every field goes through the same three gates:
 *
 *   1. Shape — trimmed, collapsed, length-capped. A 200KB paste in a "client
 *      name" is not a mistake worth storing.
 *   2. URLs — parsed, scheme-checked, http(s) only. Anything that survives is
 *      rendered with rel="ugc nofollow" (lib/ugc.ts UGC_REL) at every call
 *      site; validation here is what stops `javascript:` from reaching one.
 *   3. Spam — scored as ONE document per record (lib/ugc.ts), because signals
 *      compound: someone who splits a payload across a title and a description
 *      should not get scored twice as clean.
 *
 * Article bodies are validated in lib/company/article.ts — they need HTML
 * sanitizing, which pulls in sanitize-html, and this module is imported by
 * routes that have no business loading it.
 */
import crypto from "crypto";
import { scoreUgcFields, isSpam, spamMessage } from "@/lib/ugc";

export const LIMITS = {
  title: 140,
  summary: 200,
  description: 6000,
  clientName: 120,
  quote: 1200,
  authorName: 120,
  authorRole: 120,
  tag: 40,
  tags: 12,
  caption: 200,
  url: 300,
};

export type Result<T> = { ok: false; error: string } | { ok: true; value: T };

/* ── Field helpers ──────────────────────────────────────────────────────── */

/** Single-line: whitespace collapsed to one space. */
export const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line: paragraphs survive, runs of spaces don't. */
export const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

/**
 * A usable http(s) URL, or null. A bare "acme.com" is assumed https rather
 * than rejected — people type domains, and refusing them teaches nothing.
 * A hostname with no dot is refused: it can only be an intranet name or a typo.
 */
export function httpUrl(v: unknown): string | null {
  let s = str(v, LIMITS.url);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Trim, drop empties, cap length, de-duplicate case-insensitively, cap count. */
export function cleanTags(raw: unknown, max = LIMITS.tags): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.replace(/\s+/g, " ").trim().slice(0, LIMITS.tag);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Slug for a piece of work: readable, with a short random suffix.
 *
 * Same reasoning as lib/portfolio/save.ts makeSlug — the suffix removes the
 * collision retry loop entirely, and it stops an unpublished draft from being
 * findable by guessing titles.
 */
export function makeSlug(title: string, fallback: string): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback;
  return `${base}-${crypto.randomBytes(4).toString("hex").slice(0, 6)}`;
}

/** A storage path we wrote: "{companyId}/{uuid}.{ext}", optionally in a folder. */
export function isOwnedPath(path: string, companyId: string): boolean {
  return new RegExp(`^${companyId}/(?:[a-z]+/)?[0-9a-f-]{36}\\.(jpg|png|webp|avif)$`, "i").test(path);
}

/* ── Work ───────────────────────────────────────────────────────────────── */

export type WorkInput = {
  title?: unknown;
  summary?: unknown;
  description?: unknown;
  clientName?: unknown;
  projectUrl?: unknown;
  tags?: unknown;
  coverPath?: unknown;
  coverWidth?: unknown;
  coverHeight?: unknown;
  status?: unknown;
  images?: unknown;
};

export type CleanWorkImage = { path: string; width: number | null; height: number | null; caption: string | null; position: number };

export type CleanWork = {
  title: string;
  summary: string | null;
  description: string | null;
  clientName: string | null;
  projectUrl: string | null;
  tags: string[];
  coverPath: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  status: "DRAFT" | "PUBLISHED";
  images: CleanWorkImage[];
};

const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

export function validateWork(input: WorkInput, companyId: string): Result<CleanWork> {
  const title = str(input.title, LIMITS.title);
  if (!title) return { ok: false, error: "Give this piece of work a title." };

  const summary = str(input.summary, LIMITS.summary) || null;
  const description = text(input.description, LIMITS.description) || null;
  const clientName = str(input.clientName, LIMITS.clientName) || null;
  const projectUrl = httpUrl(input.projectUrl);
  const tags = cleanTags(input.tags);

  const coverRaw = typeof input.coverPath === "string" ? input.coverPath : null;
  if (coverRaw && !isOwnedPath(coverRaw, companyId)) {
    return { ok: false, error: "That cover image isn't one of your uploads." };
  }

  const images: CleanWorkImage[] = [];
  if (Array.isArray(input.images)) {
    for (const raw of input.images.slice(0, 12)) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;
      const path = typeof m.path === "string" ? m.path : "";
      // Silently dropping a bad path would leave the employer staring at an
      // image that vanished on save with no explanation.
      if (!path) continue;
      if (!isOwnedPath(path, companyId)) return { ok: false, error: "One of those images isn't one of your uploads." };
      images.push({
        path,
        width: int(m.width),
        height: int(m.height),
        caption: str(m.caption, LIMITS.caption) || null,
        position: images.length,
      });
    }
  }

  const status = input.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  if (status === "PUBLISHED" && !coverRaw && images.length === 0) {
    return { ok: false, error: "Add at least one image before publishing this work." };
  }

  // Scored as one document — title, summary, body, client and tags together.
  // Links are EXPECTED in a case study, so they count at half weight; a link
  // to a throwaway domain still counts full (see lib/ugc.ts).
  const verdict = scoreUgcFields([title, summary, description, clientName, projectUrl, ...tags], {
    linksExpected: true,
  });
  if (isSpam(verdict)) return { ok: false, error: spamMessage(verdict) };

  return {
    ok: true,
    value: {
      title, summary, description, clientName, projectUrl, tags,
      coverPath: coverRaw,
      coverWidth: int(input.coverWidth),
      coverHeight: int(input.coverHeight),
      status,
      images,
    },
  };
}

/* ── Testimonials ───────────────────────────────────────────────────────── */

export type CleanTestimonial = {
  quote: string;
  authorName: string;
  authorRole: string | null;
  authorCompany: string | null;
  authorUrl: string | null;
  rating: number | null;
  visible: boolean;
};

export function validateTestimonial(input: Record<string, unknown>): Result<CleanTestimonial> {
  const quote = text(input.quote, LIMITS.quote);
  if (!quote) return { ok: false, error: "Add the quote itself." };
  if (quote.length < 15) return { ok: false, error: "That quote is too short to tell anyone anything." };

  const authorName = str(input.authorName, LIMITS.authorName);
  if (!authorName) return { ok: false, error: "Who said it? An unattributed quote persuades nobody." };

  const ratingRaw = input.rating;
  const rating =
    typeof ratingRaw === "number" && Number.isFinite(ratingRaw)
      ? Math.min(5, Math.max(1, Math.round(ratingRaw)))
      : null;

  // A testimonial is a quote, not a listing: links are NOT expected here, so
  // they carry full weight.
  const verdict = scoreUgcFields([quote, authorName, str(input.authorRole, LIMITS.authorRole), str(input.authorCompany, LIMITS.clientName)]);
  if (isSpam(verdict)) return { ok: false, error: spamMessage(verdict) };

  return {
    ok: true,
    value: {
      quote,
      authorName,
      authorRole: str(input.authorRole, LIMITS.authorRole) || null,
      authorCompany: str(input.authorCompany, LIMITS.clientName) || null,
      authorUrl: httpUrl(input.authorUrl),
      rating,
      visible: input.visible !== false,
    },
  };
}

/* ── Client logos ───────────────────────────────────────────────────────── */

export type CleanClient = { name: string; websiteUrl: string | null; logoPath: string | null };

export function validateClient(input: Record<string, unknown>, companyId: string): Result<CleanClient> {
  const name = str(input.name, LIMITS.clientName);
  if (!name) return { ok: false, error: "Give the client a name — the logo alone isn't readable to a screen reader." };

  const logoRaw = typeof input.logoPath === "string" && input.logoPath ? input.logoPath : null;
  if (logoRaw && !isOwnedPath(logoRaw, companyId)) {
    return { ok: false, error: "That logo isn't one of your uploads." };
  }

  const verdict = scoreUgcFields([name], { linksExpected: true });
  if (isSpam(verdict)) return { ok: false, error: spamMessage(verdict) };

  return { ok: true, value: { name, websiteUrl: httpUrl(input.websiteUrl), logoPath: logoRaw } };
}
