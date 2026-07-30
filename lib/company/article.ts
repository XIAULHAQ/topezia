/**
 * Validating a company-authored article.
 *
 * The employer gets the same editor /hq gets, and deliberately not the same
 * write path. Three differences, all because this is UGC:
 *
 *  - sanitizeUgcHtml, not sanitizeBlogHtml: external links come out
 *    rel="ugc nofollow" and remote <img> is dropped. See lib/sanitize.ts.
 *  - The body is spam-scored as text, together with the title and tags. An
 *    article is long-form, so links are expected and weighted at half — but a
 *    link to a throwaway domain still counts full.
 *  - The slug is unique per COMPANY, not globally. Two agencies may both
 *    publish "how-we-work"; neither should have to discover the other did.
 */
import { sanitizeUgcHtml } from "@/lib/sanitize";
import { slugify } from "@/lib/blog/slugify";
import { scoreUgcFields, isSpam, spamMessage } from "@/lib/ugc";
import { cleanTags, isOwnedPath, str, text, type Result } from "./save";

export const ARTICLE_LIMITS = {
  title: 160,
  excerpt: 300,
  metaTitle: 70,
  metaDescription: 200,
  focusKeyword: 80,
  contentHtml: 200_000,
  tags: 10,
};

export type ArticleInput = {
  title?: unknown;
  slug?: unknown;
  excerpt?: unknown;
  contentHtml?: unknown;
  coverPath?: unknown;
  coverAlt?: unknown;
  focusKeyword?: unknown;
  metaTitle?: unknown;
  metaDescription?: unknown;
  tags?: unknown;
  status?: unknown;
};

export type CleanArticle = {
  title: string;
  slug: string;
  excerpt: string | null;
  contentHtml: string;
  coverPath: string | null;
  coverAlt: string | null;
  focusKeyword: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED";
};

/**
 * The words a reader actually sees, for scoring. Tags become spaces rather
 * than nothing, so "<p>free</p><p>casino</p>" can't be read as one word.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateArticle(input: ArticleInput, companyId: string): Result<CleanArticle> {
  const title = str(input.title, ARTICLE_LIMITS.title);
  if (!title) return { ok: false, error: "Give the article a title." };

  const slugRaw = typeof input.slug === "string" ? input.slug.trim() : "";
  const slug = slugify(slugRaw || title);
  if (!slug) return { ok: false, error: "The address must contain at least one letter or number." };

  const rawHtml = typeof input.contentHtml === "string" ? input.contentHtml.slice(0, ARTICLE_LIMITS.contentHtml) : "";
  if (!rawHtml.trim()) return { ok: false, error: "The article is empty." };
  const contentHtml = sanitizeUgcHtml(rawHtml);

  const excerpt = str(input.excerpt, ARTICLE_LIMITS.excerpt) || null;

  const coverRaw = typeof input.coverPath === "string" && input.coverPath ? input.coverPath : null;
  if (coverRaw && !isOwnedPath(coverRaw, companyId)) {
    return { ok: false, error: "That cover image isn't one of your uploads." };
  }

  const tags = cleanTags(input.tags, ARTICLE_LIMITS.tags);
  const status = input.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  if (status === "PUBLISHED" && !coverRaw) {
    return { ok: false, error: "Add a cover image before publishing." };
  }

  // Score what the page will show: the visible words, not the markup. The
  // sanitized HTML is used rather than the raw input so a payload hidden in a
  // stripped attribute can't inflate — or deflate — the score.
  const verdict = scoreUgcFields([title, excerpt, htmlToText(contentHtml), ...tags], { linksExpected: true });
  if (isSpam(verdict)) return { ok: false, error: spamMessage(verdict) };

  return {
    ok: true,
    value: {
      title,
      slug,
      excerpt,
      contentHtml,
      coverPath: coverRaw,
      coverAlt: str(input.coverAlt, 300) || null,
      focusKeyword: str(input.focusKeyword, ARTICLE_LIMITS.focusKeyword) || null,
      metaTitle: str(input.metaTitle, ARTICLE_LIMITS.metaTitle) || null,
      metaDescription: text(input.metaDescription, ARTICLE_LIMITS.metaDescription) || null,
      tags,
      status,
    },
  };
}
