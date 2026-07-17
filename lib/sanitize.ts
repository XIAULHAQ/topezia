/**
 * Sanitize third-party job description HTML before rendering it.
 *
 * Descriptions come from ATS APIs (Greenhouse returns raw HTML). Rendering that
 * with dangerouslySetInnerHTML unsanitized would be a straight XSS hole — a
 * hostile or compromised job post could run script in our origin, against a
 * logged-in user's session. Allow only formatting tags; drop everything else.
 */
import sanitizeHtml from "sanitize-html";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Decode HTML entities. `&amp;` MUST go last, or `&amp;lt;` would decode twice
 * and resurrect a tag we never had.
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * Render a job description for display, whichever shape the source gave us.
 *
 * Three shapes in the wild:
 *  - Greenhouse: HTML that is entity-ENCODED (`&lt;p&gt;…`). Decode it first or
 *    we escape it a second time and the visitor reads raw markup.
 *  - Real HTML: sanitize it.
 *  - Ashby: plain text — through an HTML sanitizer that's one unreadable blob,
 *    so rebuild paragraphs/breaks from the newlines.
 *
 * Safe in every branch: decoded HTML still goes through the sanitizer (so
 * `&lt;script&gt;` becomes `<script>` and is then stripped), and plain text is
 * escaped.
 */
export function renderJobDescription(raw: string): string {
  const src = /&lt;\/?[a-z][a-z0-9]*/i.test(raw) ? decodeHtmlEntities(raw) : raw;

  const looksLikeHtml = /<(p|div|ul|ol|li|br|h[1-6]|strong|em|b|i)\b[^>]*>/i.test(src);
  if (looksLikeHtml) return sanitizeJobHtml(src);

  return src
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function sanitizeJobHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a", "code", "pre", "hr", "span", "div"],
    allowedAttributes: {
      a: ["href", "title"],
    },
    // Only real web links; no javascript:/data: URIs.
    allowedSchemes: ["http", "https", "mailto"],
    // Outbound links from someone else's copy: don't leak referrer or window.opener.
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener noreferrer", target: "_blank" }),
    },
    // Strip style/class so foreign CSS can't fight our layout.
    allowedStyles: {},
  });
}
