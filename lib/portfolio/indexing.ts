/**
 * May a published portfolio page enter the index?
 *
 * Portfolio writes are already refused at SPAM_REJECT (lib/portfolio/save.ts),
 * so this catches the band in between: content clean enough to publish but not
 * clean enough to put our domain behind. Failing it is `noindex, follow` and
 * removal from sitemap.xml — the page still works and the member sees no
 * difference, exactly as with profiles.
 *
 * Shared by BOTH the page's generateMetadata and app/sitemap.ts on purpose. A
 * sitemap that advertises a URL the page then refuses to be indexed is the
 * kind of contradiction Search Console reports back as an error, so the two
 * must be decided by one function rather than two similar-looking copies.
 */
import { scoreUgcFields, isSuspect } from "@/lib/ugc";

export interface IndexableWork {
  title: string;
  description: string | null;
  skills: string[];
  technologies: string[];
  captions?: (string | null)[];
}

/** Everything a visitor reads, scored as one document. Links are expected in a
 *  portfolio description, so they count at half weight — see lib/ugc.ts. */
export function portfolioIndexable(w: IndexableWork): boolean {
  const verdict = scoreUgcFields(
    [w.title, w.description, ...w.skills, ...w.technologies, ...(w.captions ?? [])],
    { linksExpected: true }
  );
  return !isSuspect(verdict);
}

/** The columns portfolioIndexable needs — so callers can't quietly select less
 *  and get a different answer than the other call site. */
export const INDEXABLE_WORK_SELECT = {
  title: true,
  description: true,
  skills: true,
  technologies: true,
} as const;
