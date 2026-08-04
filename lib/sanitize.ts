/**
 * Sanitize third-party job description HTML before rendering it.
 *
 * Descriptions come from ATS APIs (Greenhouse returns raw HTML). Rendering that
 * with dangerouslySetInnerHTML unsanitized would be a straight XSS hole — a
 * hostile or compromised job post could run script in our origin, against a
 * logged-in user's session. Allow only formatting tags; drop everything else.
 */
import sanitizeHtml from "sanitize-html";
import { UGC_REL } from "@/lib/ugc";
import { storageOrigin } from "@/lib/company/storage";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The named entities worth knowing. Anything not here is left as written
 *  rather than guessed at — a stray `&foo;` is likelier to be literal text. */
const NAMED_ENTITIES: Record<string, string> = {
  lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " ",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  mdash: "—", ndash: "–", hellip: "…", times: "×",
};

/**
 * Decode HTML entities.
 *
 * ONE PASS, deliberately. The old version chained six .replace() calls and
 * noted that `&amp;` had to go last or `&amp;lt;` would decode twice and
 * resurrect a tag we never had. Matching each entity once removes that hazard
 * outright instead of relying on the order being maintained.
 *
 * And it handles NUMERIC entities, which the old one did not beyond `&#39;`.
 * WordPress encodes with them constantly and with leading zeros — a real
 * crawled title came back as "Rigby &#038; Rexburg | Valorie&#8217;s List"
 * and would have been shown to visitors exactly like that, ampersand codes
 * and all.
 */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      // Surrogates and out-of-range values would throw or produce mojibake;
      // leaving the text as the page wrote it is the safer failure.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
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

/**
 * Flatten a job description to plain prose for meta/OG descriptions.
 *
 * MUST decode entities before stripping tags. Greenhouse serves entity-ENCODED
 * HTML, so its tags arrive as literal `&lt;div class=&quot;content-intro&quot;&gt;`
 * text that a tag regex cannot match — strip-first left the markup intact, and
 * link previews (WhatsApp, Slack, search results) decoded it back into visible
 * `<div class="content-intro"><p><span style=...>` where the summary should be.
 * Same trap already documented in normalize-rules.ts and match.ts.
 */
export function jobDescriptionText(raw: string, max = 155): string {
  const text = decodeHtmlEntities(raw)
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  // Cut on a word boundary so the preview doesn't end mid-word.
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, "")}…`;
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

function isInternalHref(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
  return href.startsWith(site);
}

/**
 * Sanitize blog post body HTML (admin-authored via the Tiptap editor in
 * /hq/posts), before storing and before rendering with
 * dangerouslySetInnerHTML. Wider allowlist than sanitizeJobHtml — posts need
 * images and h2/h3/h4 for real structure.
 *
 * Internal links (relative, or same-origin as NEXT_PUBLIC_SITE_URL) are left
 * plain: nofollow/target=_blank on our own /blog and /jobs links would be
 * self-defeating for both the reader and the SEO panel's internal-link
 * check. Only external links get target=_blank + noopener/noreferrer — no
 * nofollow, since this is first-party editorial content the site chose to
 * link to, not user-generated text.
 *
 * `rel` and `target` MUST be in allowedAttributes even though nothing but
 * transformTags ever sets them: sanitize-html filters attributes AFTER
 * transformTags runs, so anything the transform adds and the allow-list omits
 * is added and then immediately thrown away. Without them this function
 * silently emitted plain external links — reverse-tabnabbing and all.
 */
export function sanitizeBlogHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li",
      "h2", "h3", "h4",
      "blockquote", "a", "code", "pre", "hr", "span", "div",
      "img", "figure", "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "width", "height"],
    },
    // Only real web links/images; no javascript:/data: URIs.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        if (isInternalHref(href)) return { tagName, attribs };
        return { tagName, attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" } };
      },
    },
    // Strip style/class so foreign CSS can't fight our layout.
    allowedStyles: {},
  });
}

/**
 * Sanitize a COMPANY-authored article body (app/employer/articles), before
 * storing and before rendering.
 *
 * Same tag allow-list as sanitizeBlogHtml — a company article needs the same
 * structure a blog post does — and two deliberate differences, both because
 * this is user-generated content rather than first-party editorial:
 *
 *  1. Every EXTERNAL link gets rel="ugc nofollow noopener noreferrer"
 *     (lib/ugc.ts UGC_REL). sanitizeBlogHtml leaves external links dofollow on
 *     purpose: /hq chose those. Nobody at Topezia chose these, and a dofollow
 *     link from a page on our domain is precisely what a link farm signs up
 *     for. Internal links stay plain — nofollowing our own /jobs pages would
 *     only hurt us.
 *  2. <img> may only point at our own storage origin. The editor uploads
 *     through /api/company/image and inserts the URL it gets back, so a remote
 *     src can only have been hand-written — and a foreign image on a page we
 *     serve is a tracking pixel that reports every reader to a third party.
 *     A blocked image is dropped rather than left broken.
 */
export function sanitizeUgcHtml(dirty: string): string {
  const origin = storageOrigin();
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li",
      "h2", "h3", "h4",
      "blockquote", "a", "code", "pre", "hr", "span", "div",
      "img", "figure", "figcaption",
    ],
    // rel/target are allowed for the same reason as in sanitizeBlogHtml —
    // sanitize-html filters attributes after transformTags, so omitting them
    // here would throw away the nofollow this whole function exists to add.
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        // Author-supplied rel/target are dropped either way: on an internal
        // link there is no reason for them, and on an external one ours has to
        // be the last word.
        const { rel: _rel, target: _target, ...rest } = attribs;
        if (isInternalHref(href)) return { tagName, attribs: rest };
        return { tagName, attribs: { ...rest, rel: UGC_REL, target: "_blank" } };
      },
    },
    // Runs after the allow-lists. Returning TRUE discards the element.
    exclusiveFilter: (frame) => {
      if (frame.tag !== "img") return false;
      const src = frame.attribs.src ?? "";
      if (!origin) return true; // storage origin unknown — trust no image URL
      try {
        return new URL(src).origin !== origin;
      } catch {
        return true; // relative or unparseable: not one of ours
      }
    },
    allowedStyles: {},
  });
}
