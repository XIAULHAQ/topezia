/**
 * Greenhouse crawler — spec §4.1
 *
 * Greenhouse's public board API needs no auth and no scraping: every
 * company on Greenhouse exposes their live jobs at a predictable URL.
 * This is the cheapest, cleanest source in the pipeline — build and trust
 * this one first, use it to validate the rest of the ladder.
 *
 * Endpoint: https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 *
 * `token` is the company's Greenhouse board slug — visible in their careers
 * URL, e.g. boards.greenhouse.io/stripe -> token = "stripe". Founding-employer
 * signups won't always hand you this directly (they give a careers page URL);
 * a small resolver step (not in this file) can detect Greenhouse-hosted pages
 * and extract the token from the URL or page source.
 */

export interface RawGreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  location: { name: string };
  absolute_url: string;
  content: string; // HTML description
  departments: { name: string }[];
  offices: { name: string }[];
}

export interface CrawledJob {
  externalId: string;
  titleRaw: string;
  descriptionRaw: string; // HTML stripped to text by the caller's normalize step
  sourceUrl: string;
  locationRaw: string | null;
  postedAt: Date | null;
  raw: unknown; // kept for debugging / re-processing without re-fetching
}

export async function crawlGreenhouseBoard(companySlug: string): Promise<CrawledJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) {
    // Board doesn't exist or company isn't on Greenhouse under this slug.
    // Not an error worth throwing on — the caller should mark the Source
    // as unresolvable rather than crash the whole ingestion run.
    return [];
  }
  if (!res.ok) {
    throw new Error(`Greenhouse fetch failed for ${companySlug}: ${res.status}`);
  }

  const data = (await res.json()) as { jobs: RawGreenhouseJob[] };

  return data.jobs.map((j) => ({
    externalId: String(j.id),
    titleRaw: j.title,
    descriptionRaw: j.content, // HTML — normalize-rules.ts strips tags
    sourceUrl: j.absolute_url,
    locationRaw: j.location?.name || null,
    postedAt: j.updated_at ? new Date(j.updated_at) : null,
    raw: j,
  }));
}
