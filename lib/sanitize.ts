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
 * Render a job description for display, whichever shape the source gave us.
 *
 * Greenhouse returns HTML; Ashby returns plain text. Feeding plain text through
 * an HTML sanitizer yields one giant unreadable paragraph, so detect that case
 * and rebuild paragraphs/line breaks from the newlines instead. Plain text is
 * escaped, so this stays XSS-safe either way.
 */
export function renderJobDescription(raw: string): string {
  const looksLikeHtml = /<(p|div|ul|ol|li|br|h[1-6]|strong|em|b|i)\b[^>]*>/i.test(raw);
  if (looksLikeHtml) return sanitizeJobHtml(raw);

  return raw
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
