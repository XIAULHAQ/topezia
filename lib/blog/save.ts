/**
 * Validating and persisting a blog post.
 *
 * Written by the /hq admin (a single shared password, not a member), but
 * still worth capping and cleaning here: this is content that gets rendered
 * publicly and indexed, and a typo'd giant paste shouldn't be able to blow up
 * a row or degrade the /blog listing query.
 */
import { sanitizeBlogHtml } from "@/lib/sanitize";
import { slugify } from "./slugify";

export const LIMITS = {
  title: 160,
  excerpt: 300,
  metaTitle: 70,
  metaDescription: 200,
  focusKeyword: 80,
  tag: 40,
  tags: 10,
  contentHtml: 200_000,
};

export type PostInput = {
  title: string;
  slug?: string;
  excerpt?: string | null;
  contentHtml: string;
  coverImage?: string | null;
  coverImageAlt?: string | null;
  focusKeyword?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  tags?: unknown;
  status?: "DRAFT" | "PUBLISHED";
};

export type CleanPost = {
  title: string;
  slug: string;
  excerpt: string | null;
  contentHtml: string;
  coverImage: string | null;
  coverImageAlt: string | null;
  focusKeyword: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED";
};

export type ValidationResult = { ok: false; error: string } | { ok: true; value: CleanPost };

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

/** Uploaded by /api/hq/blog/upload as "{uuid}.{ext}" — no other shape is ours. */
function isOwnedPath(path: string): boolean {
  return /^[0-9a-f-]{36}\.(jpg|png|webp|avif)$/i.test(path);
}

export function validate(input: PostInput): ValidationResult {
  const title = (input.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) return { ok: false, error: "Give the post a title." };
  if (title.length > LIMITS.title) return { ok: false, error: `Title is longer than ${LIMITS.title} characters.` };

  const slugRaw = (input.slug ?? "").trim();
  if (!slugRaw) return { ok: false, error: "Missing slug." };
  const slug = slugify(slugRaw);
  if (!slug) return { ok: false, error: "Slug must contain at least one letter or number." };

  const contentHtml = (input.contentHtml ?? "").slice(0, LIMITS.contentHtml);
  if (!contentHtml.trim()) return { ok: false, error: "The post body is empty." };
  const sanitized = sanitizeBlogHtml(contentHtml);

  const excerpt = (input.excerpt ?? "").trim().slice(0, LIMITS.excerpt) || null;

  const coverImage = input.coverImage ?? null;
  if (coverImage && !isOwnedPath(coverImage)) {
    return { ok: false, error: "That cover image isn't one of your uploads." };
  }
  const coverImageAlt = (input.coverImageAlt ?? "").trim().slice(0, 300) || null;

  const focusKeyword = (input.focusKeyword ?? "").trim().slice(0, LIMITS.focusKeyword) || null;
  const metaTitle = (input.metaTitle ?? "").trim().slice(0, LIMITS.metaTitle) || null;
  const metaDescription = (input.metaDescription ?? "").trim().slice(0, LIMITS.metaDescription) || null;

  const tags = cleanTags(input.tags, LIMITS.tags);

  const status = input.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  if (status === "PUBLISHED" && !coverImage) {
    return { ok: false, error: "Add a cover image before publishing." };
  }

  return {
    ok: true,
    value: {
      title,
      slug,
      excerpt,
      contentHtml: sanitized,
      coverImage,
      coverImageAlt,
      focusKeyword,
      metaTitle,
      metaDescription,
      tags,
      status,
    },
  };
}
