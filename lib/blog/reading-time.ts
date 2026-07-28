import { plainText, wordCount } from "./html-text";

/** Minutes, rounded up, minimum 1 — computed at render time so it can never go stale. */
export function readingTime(html: string): number {
  const words = wordCount(plainText(html));
  return Math.max(1, Math.ceil(words / 200));
}
