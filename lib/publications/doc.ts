/**
 * Publications / Research — shape, caps, labels.
 *
 * Member-entered, like education: we verify nothing, so the section's honesty
 * comes from showing reader-checkable identifiers (DOI, ISBN, a link) rather
 * than any claim of our own. Everything is rendered as text, never markup,
 * and links are normalised to http(s) so a stored value can't smuggle a
 * javascript: URL onto a public page.
 */

export const PUBLICATION_LIMITS = {
  perProfile: 25,
  title: 300,
  authors: 15,
  authorName: 120,
  venue: 200,
  doi: 100,
  isbn: 25,
  url: 300,
  abstract: 2000,
} as const;

export const PUBLICATION_TYPES = [
  "JOURNAL_ARTICLE",
  "CONFERENCE_PAPER",
  "BOOK",
  "BOOK_CHAPTER",
  "THESIS",
  "REPORT",
  "PREPRINT",
  "OTHER",
] as const;
export type PublicationTypeId = (typeof PUBLICATION_TYPES)[number];

export const PUBLICATION_TYPE_LABELS: Record<PublicationTypeId, string> = {
  JOURNAL_ARTICLE: "Journal article",
  CONFERENCE_PAPER: "Conference paper",
  BOOK: "Book",
  BOOK_CHAPTER: "Book chapter",
  THESIS: "Thesis",
  REPORT: "Report",
  PREPRINT: "Preprint",
  OTHER: "Publication",
};

/** What the venue field means for each type — drives the form placeholder. */
export const VENUE_LABELS: Record<PublicationTypeId, string> = {
  JOURNAL_ARTICLE: "Journal",
  CONFERENCE_PAPER: "Conference",
  BOOK: "Publisher",
  BOOK_CHAPTER: "Book / publisher",
  THESIS: "Institution",
  REPORT: "Institution / publisher",
  PREPRINT: "Repository (e.g. arXiv, SSRN)",
  OTHER: "Where it appeared",
};

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line (the abstract) keeps its paragraph breaks. */
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

/** http(s) only, or nothing. A stored URL lands on a public page as a real
 *  link, so anything else (javascript:, data:) must die here. */
const httpUrl = (v: unknown, max: number): string => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return /^https?:\/\/\S+$/i.test(s) ? s : "";
};

/** A DOI as people paste it: "10.1234/..." or a full doi.org URL. Stored
 *  bare, rendered as https://doi.org/{doi}. */
const cleanDoi = (v: unknown): string => {
  let s = typeof v === "string" ? v.trim() : "";
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s.slice(0, PUBLICATION_LIMITS.doi) : "";
};

/** ISBN-10/13 with or without hyphens — kept as typed if it looks right. */
const cleanIsbn = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim().slice(0, PUBLICATION_LIMITS.isbn) : "";
  const digits = s.replace(/[-\s]/g, "");
  return /^(97[89])?\d{9}[\dXx]$/.test(digits) ? s : "";
};

export interface PublicationInput {
  type: PublicationTypeId;
  title: string;
  authors: string[];
  venue: string | null;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  url: string | null;
  abstract: string | null;
}

/** Coerce arbitrary JSON into a valid publication. Returns null when there is
 *  no usable title — the one thing a publication cannot be without. */
export function sanitizePublication(raw: unknown): PublicationInput | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = str(r.title, PUBLICATION_LIMITS.title);
  if (!title) return null;

  const type = PUBLICATION_TYPES.includes(r.type as PublicationTypeId)
    ? (r.type as PublicationTypeId)
    : "OTHER";

  const authors = [...new Set(
    (Array.isArray(r.authors) ? r.authors : [])
      .map((a) => str(a, PUBLICATION_LIMITS.authorName))
      .filter(Boolean)
  )].slice(0, PUBLICATION_LIMITS.authors);

  const yearN = typeof r.year === "number" ? Math.round(r.year) : typeof r.year === "string" ? parseInt(r.year, 10) : NaN;
  const year = Number.isFinite(yearN) && yearN >= 1500 && yearN <= new Date().getFullYear() + 1 ? yearN : null;

  return {
    type,
    title,
    authors,
    venue: str(r.venue, PUBLICATION_LIMITS.venue) || null,
    year,
    doi: cleanDoi(r.doi) || null,
    isbn: cleanIsbn(r.isbn) || null,
    url: httpUrl(r.url, PUBLICATION_LIMITS.url) || null,
    abstract: text(r.abstract, PUBLICATION_LIMITS.abstract) || null,
  };
}
