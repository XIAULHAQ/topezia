import { slugify } from "./slugify";

export type TocItem = { id: string; text: string; level: 2 | 3 };

/**
 * One pass over the post body: assigns a stable, unique id to every H2/H3,
 * returns the flat list for the sidebar TOC, and injects those same ids into
 * the HTML so the TOC's anchor links actually land somewhere. Doing both in
 * one function (instead of extracting a TOC and separately re-deriving ids
 * for rendering) keeps the two guaranteed in sync — there's only one place
 * that decides what a heading's id is.
 */
export function processHeadings(html: string): { toc: TocItem[]; html: string } {
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();

  const outHtml = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, levelStr, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!text) return full;

    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n + 1}`;

    toc.push({ id, text, level: Number(levelStr) as 2 | 3 });

    // Drop any id the editor might already have left on the tag, so ours is
    // the only one and there's no chance of a mismatched duplicate.
    const cleanAttrs = String(attrs).replace(/\sid="[^"]*"/i, "");
    return `<h${levelStr}${cleanAttrs} id="${id}">${inner}</h${levelStr}>`;
  });

  return { toc, html: outHtml };
}
