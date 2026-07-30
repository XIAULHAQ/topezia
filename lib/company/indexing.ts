/**
 * May a company's public pages enter the index?
 *
 * The same question app/p/profile-data.ts asks about members and
 * lib/portfolio/indexing.ts asks about their work, now that a company page
 * carries user-generated text, outbound client links and testimonial copy.
 * Before migration 045 a company page was a name, a tagline and a list of
 * postings — there was nothing on it worth farming.
 *
 * Two gates, and they are different things:
 *
 *  - SUBSTANCE. A page that is a name and nothing else is thin content. It
 *    still works, it is still linkable, it just doesn't earn a place in the
 *    index. Being generous here is deliberate: anything a real employer has
 *    bothered to fill in clears it.
 *  - SPAM. Scored across everything a visitor reads. `spamCleared` (set only
 *    from /hq) overrides the SCORE, never the substance bar — an override is
 *    "the scorer got this wrong", not "index an empty page".
 *
 * Failing either is `noindex, follow`. The page renders exactly as before and
 * the employer sees no difference, same as with profiles.
 */
import { scoreUgcFields, isSuspect } from "@/lib/ugc";

export interface IndexableCompany {
  name: string;
  tagline: string | null;
  about: string | null;
  website: string | null;
  spamCleared: boolean;
  liveJobCount: number;
  /** Everything else on the page: testimonial quotes, client names, work titles. */
  extraText?: (string | null)[];
}

export function companyIndexable(c: IndexableCompany): boolean {
  // Substance: a real page says something about the company, or has a live
  // role on it. A website link on its own does NOT count — a name plus a link
  // out is exactly the shape of a page that exists only to pass the link.
  const hasSubstance = Boolean((c.about?.trim().length ?? 0) >= 40 || (c.tagline?.trim().length ?? 0) >= 20 || c.liveJobCount > 0);
  if (!hasSubstance) return false;
  if (c.spamCleared) return true;

  const verdict = scoreUgcFields(
    [c.name, c.tagline, c.about, ...(c.extraText ?? [])],
    // A company page is expected to link out — to its own site, to clients.
    { linksExpected: true }
  );
  return !isSuspect(verdict);
}

export interface IndexableCompanyWork {
  title: string;
  summary: string | null;
  description: string | null;
  clientName: string | null;
  tags: string[];
  captions?: (string | null)[];
}

/** A case study earns indexing on its own words, not its parent's. Callers
 *  must AND this with companyIndexable — a sub-page of a page we decline to
 *  index has no business being indexed by itself. */
export function companyWorkIndexable(w: IndexableCompanyWork, spamCleared: boolean): boolean {
  // Thin: a title and a picture is a moodboard, not a page worth ranking.
  const words = `${w.summary ?? ""} ${w.description ?? ""}`.trim().split(/\s+/).filter(Boolean).length;
  if (words < 25) return false;
  if (spamCleared) return true;

  const verdict = scoreUgcFields(
    [w.title, w.summary, w.description, w.clientName, ...w.tags, ...(w.captions ?? [])],
    { linksExpected: true }
  );
  return !isSuspect(verdict);
}

export interface IndexableCompanyArticle {
  title: string;
  excerpt: string | null;
  /** The article body as plain text — see lib/company/article.ts htmlToText. */
  bodyText: string;
  tags: string[];
}

export function companyArticleIndexable(a: IndexableCompanyArticle, spamCleared: boolean): boolean {
  // 150 words is a low bar for an article and a high one for a link post,
  // which is the shape we are trying to keep out of the index.
  if (a.bodyText.split(/\s+/).filter(Boolean).length < 150) return false;
  if (spamCleared) return true;

  const verdict = scoreUgcFields([a.title, a.excerpt, a.bodyText, ...a.tags], { linksExpected: true });
  return !isSuspect(verdict);
}
