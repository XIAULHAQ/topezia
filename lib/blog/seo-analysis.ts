/**
 * Yoast-style on-page SEO analysis, run entirely client-side (pure text
 * analysis, no server round-trip) as the admin writes a post in /hq/posts.
 *
 * Deliberately approximate, not a reimplementation of Yoast's Flesch-reading-
 * ease engine: the checks below are simple, explainable heuristics (length
 * ranges, keyword presence, sentence/paragraph length) that cover the same
 * ground Yoast's SEO + Readability analyses cover, without needing a
 * linguistics library for a single admin-only editor.
 */
import { headingText, paragraphs, plainText, sentences, wordCount } from "./html-text";

export type SeoStatus = "good" | "ok" | "bad";
export type SeoGroup = "seo" | "readability";

export interface SeoCheck {
  id: string;
  group: SeoGroup;
  status: SeoStatus;
  message: string;
}

export interface SeoAnalysisInput {
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  slug: string;
  focusKeyword?: string | null;
  contentHtml: string;
  siteOrigin?: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const re = new RegExp(escapeRe(needle), "gi");
  return (haystack.match(re) ?? []).length;
}

function isInternalHref(href: string, siteOrigin: string): boolean {
  return href.startsWith("/") || href.startsWith("#") || href.startsWith(siteOrigin);
}

function check(id: string, group: SeoGroup, status: SeoStatus, message: string): SeoCheck {
  return { id, group, status, message };
}

export function analyzeSeo(input: SeoAnalysisInput): SeoCheck[] {
  const {
    title,
    metaTitle,
    metaDescription,
    slug,
    focusKeyword,
    contentHtml,
    siteOrigin = "https://www.topezia.com",
  } = input;

  const checks: SeoCheck[] = [];
  const kw = (focusKeyword ?? "").trim();
  const effectiveTitle = (metaTitle ?? "").trim() || title.trim();
  const effectiveDescription = (metaDescription ?? "").trim();
  const text = plainText(contentHtml);
  const words = wordCount(text);

  // ── SEO title ──────────────────────────────────────────────────────────
  if (!effectiveTitle) {
    checks.push(check("title-length", "seo", "bad", "Give the post a title."));
  } else if (effectiveTitle.length >= 50 && effectiveTitle.length <= 60) {
    checks.push(check("title-length", "seo", "good", `SEO title is ${effectiveTitle.length} characters — a good length.`));
  } else if (effectiveTitle.length < 50) {
    checks.push(check("title-length", "seo", "ok", `SEO title is ${effectiveTitle.length} characters — a bit short, aim for 50–60.`));
  } else {
    checks.push(check("title-length", "seo", "bad", `SEO title is ${effectiveTitle.length} characters — likely to be cut off in search results (aim for 50–60).`));
  }

  // ── Meta description ──────────────────────────────────────────────────
  if (!effectiveDescription) {
    checks.push(check("description-length", "seo", "bad", "Write a meta description (or an excerpt to fall back to)."));
  } else if (effectiveDescription.length >= 120 && effectiveDescription.length <= 156) {
    checks.push(check("description-length", "seo", "good", `Meta description is ${effectiveDescription.length} characters — a good length.`));
  } else if (effectiveDescription.length < 120) {
    checks.push(check("description-length", "seo", "ok", `Meta description is ${effectiveDescription.length} characters — a bit short, aim for 120–156.`));
  } else {
    checks.push(check("description-length", "seo", "bad", `Meta description is ${effectiveDescription.length} characters — likely to be cut off (aim for 120–156).`));
  }

  // ── Focus keyword presence ────────────────────────────────────────────
  if (!kw) {
    checks.push(check("focus-keyword", "seo", "bad", "Set a focus keyword to unlock the rest of the SEO checks."));
  } else {
    checks.push(check("focus-keyword", "seo", "good", `Focus keyword: "${kw}".`));

    // Keyword in SEO title, ideally near the start.
    if (effectiveTitle.toLowerCase().includes(kw.toLowerCase())) {
      const nearStart = effectiveTitle.toLowerCase().indexOf(kw.toLowerCase()) < effectiveTitle.length / 2;
      checks.push(check("keyword-in-title", "seo", nearStart ? "good" : "ok", nearStart
        ? "The focus keyword appears near the start of the SEO title."
        : "The focus keyword is in the SEO title, but try moving it closer to the start."));
    } else {
      checks.push(check("keyword-in-title", "seo", "bad", "The focus keyword doesn't appear in the SEO title."));
    }

    // Keyword in meta description.
    if (effectiveDescription && effectiveDescription.toLowerCase().includes(kw.toLowerCase())) {
      checks.push(check("keyword-in-description", "seo", "good", "The focus keyword appears in the meta description."));
    } else {
      checks.push(check("keyword-in-description", "seo", "bad", "The focus keyword doesn't appear in the meta description."));
    }

    // Keyword in slug.
    const slugWords = slug.toLowerCase().split("-");
    const kwSlug = kw.toLowerCase().replace(/\s+/g, "-");
    if (slug.toLowerCase().includes(kwSlug) || kw.toLowerCase().split(/\s+/).every((w) => slugWords.includes(w))) {
      checks.push(check("keyword-in-slug", "seo", "good", "The focus keyword appears in the slug."));
    } else {
      checks.push(check("keyword-in-slug", "seo", "ok", "The focus keyword doesn't appear in the slug."));
    }

    // Keyword in the first ~100 words.
    const firstWords = text.split(/\s+/).slice(0, 100).join(" ");
    if (firstWords.toLowerCase().includes(kw.toLowerCase())) {
      checks.push(check("keyword-in-intro", "seo", "good", "The focus keyword appears early in the post."));
    } else {
      checks.push(check("keyword-in-intro", "seo", "bad", "The focus keyword doesn't appear in the first 100 words."));
    }

    // Keyword in at least one H2.
    const h2s = headingText(contentHtml, 2);
    if (h2s.some((h) => h.toLowerCase().includes(kw.toLowerCase()))) {
      checks.push(check("keyword-in-subheading", "seo", "good", "The focus keyword appears in a subheading."));
    } else {
      checks.push(check("keyword-in-subheading", "seo", "ok", "The focus keyword doesn't appear in any subheading (H2)."));
    }

    // Keyword density.
    const occurrences = countOccurrences(text, kw);
    const density = words > 0 ? (occurrences / words) * 100 : 0;
    if (occurrences === 0) {
      checks.push(check("keyword-density", "seo", "bad", "The focus keyword doesn't appear in the body text at all."));
    } else if (density > 3) {
      checks.push(check("keyword-density", "seo", "bad", `Keyword density is ${density.toFixed(1)}% — that reads as keyword stuffing (aim for 0.5–3%).`));
    } else if (density >= 0.5) {
      checks.push(check("keyword-density", "seo", "good", `Keyword density is ${density.toFixed(1)}% — a healthy range.`));
    } else {
      checks.push(check("keyword-density", "seo", "ok", `Keyword density is ${density.toFixed(1)}% — a little low, consider using it a bit more.`));
    }
  }

  // ── Content length ────────────────────────────────────────────────────
  if (words < 300) {
    checks.push(check("word-count", "seo", "bad", `${words} words — under 300 is thin content for search.`));
  } else if (words < 600) {
    checks.push(check("word-count", "seo", "ok", `${words} words — solid, though 600+ tends to do better on competitive topics.`));
  } else {
    checks.push(check("word-count", "seo", "good", `${words} words — a healthy length.`));
  }

  // ── Links ──────────────────────────────────────────────────────────────
  const hrefs = [...contentHtml.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const hasInternal = hrefs.some((h) => isInternalHref(h, siteOrigin));
  const hasOutbound = hrefs.some((h) => /^https?:\/\//i.test(h) && !isInternalHref(h, siteOrigin));
  checks.push(hasInternal
    ? check("internal-link", "seo", "good", "The post links to at least one other page on the site.")
    : check("internal-link", "seo", "bad", "Add at least one internal link (to another /blog, /jobs or /portfolio page)."));
  checks.push(hasOutbound
    ? check("outbound-link", "seo", "good", "The post links out to at least one external source.")
    : check("outbound-link", "seo", "ok", "Consider linking to a relevant external source."));

  // ── Image alt text ────────────────────────────────────────────────────
  const imgs = [...contentHtml.matchAll(/<img\s[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = imgs.filter((img) => !/alt=["'][^"']+["']/i.test(img));
  if (imgs.length === 0) {
    checks.push(check("image-alt", "seo", "ok", "No images in the post yet — consider adding at least one."));
  } else if (missingAlt.length > 0) {
    checks.push(check("image-alt", "seo", "bad", `${missingAlt.length} of ${imgs.length} image(s) are missing alt text.`));
  } else {
    checks.push(check("image-alt", "seo", "good", "Every image has alt text."));
  }

  // ── Readability ───────────────────────────────────────────────────────
  const paras = paragraphs(contentHtml);
  const longParas = paras.filter((p) => wordCount(p) > 150);
  checks.push(longParas.length === 0
    ? check("paragraph-length", "readability", "good", "No paragraph is too long.")
    : check("paragraph-length", "readability", "bad", `${longParas.length} paragraph(s) are over 150 words — consider breaking them up.`));

  const allSentences = sentences(text);
  const verylong = allSentences.filter((s) => wordCount(s) > 30).length;
  const long = allSentences.filter((s) => wordCount(s) > 24).length;
  if (verylong > 0) {
    checks.push(check("sentence-length", "readability", "bad", `${verylong} sentence(s) are over 30 words — hard to read, consider shortening.`));
  } else if (long > 0) {
    checks.push(check("sentence-length", "readability", "ok", `${long} sentence(s) are over 24 words — a few could be tightened.`));
  } else {
    checks.push(check("sentence-length", "readability", "good", "Sentence lengths look reasonable."));
  }

  const h2Count = headingText(contentHtml, 2).length + headingText(contentHtml, 3).length;
  if (words >= 600 && h2Count === 0) {
    checks.push(check("subheadings", "readability", "bad", "Long post with no subheadings — add H2s to break it up."));
  } else {
    checks.push(check("subheadings", "readability", "good", h2Count > 0 ? "The post uses subheadings." : "Short enough that subheadings aren't essential yet."));
  }

  return checks;
}
