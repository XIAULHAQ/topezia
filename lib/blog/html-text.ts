/**
 * Plain-text helpers shared by the SEO analysis panel and reading-time calc.
 * All pure string transforms — no DOM, so these run identically in the
 * browser (the live SEO panel) and on the server (reading time at render).
 */

export function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'");
}

export function plainText(html: string): string {
  return stripHtml(html).replace(/\s+/g, " ").trim();
}

export function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Text inside every <h2>...</h2>, concatenated — used for the keyword-in-subheading check. */
export function headingText(html: string, level: 2 | 3 | 4 = 2): string[] {
  const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(plainText(m[1]));
  return out;
}

/** Rough sentence split — good enough for a length heuristic, not linguistics. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Paragraph text content, in document order. */
export function paragraphs(html: string): string[] {
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = plainText(m[1]);
    if (t) out.push(t);
  }
  return out;
}
