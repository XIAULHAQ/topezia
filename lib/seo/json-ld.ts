/**
 * Serialize structured data for a <script type="application/ld+json"> block.
 *
 * JSON.stringify alone is NOT safe there: the HTML parser ends a <script>
 * element at the first literal "</script>" regardless of JS string context,
 * so any user-supplied string containing it (a native job title, a portfolio
 * title) would break out of the block and execute as markup. Escaping every
 * "<" as its unicode JSON escape (see the replace below) keeps the parsed JSON
 * identical while making breakout
 * impossible.
 */
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
