/**
 * Ashby crawler — spec §4.1
 *
 * Endpoint: https://api.ashbyhq.com/posting-api/job-board/{boardName}
 * `boardName` is the company's Ashby job-board slug, visible at
 * jobs.ashbyhq.com/{boardName}.
 *
 * NOTE: Ashby's public API has shifted shape before (they've offered both
 * a REST posting-api and a GraphQL non-user endpoint at different times).
 * Verify this response shape against a live board before trusting it in
 * production — the field names below are correct as of this spec's writing,
 * but this is the one crawler in the set most worth a live smoke-test first.
 */

import type { CrawledJob } from "./greenhouse";

export interface RawAshbyJob {
  id: string;
  title: string;
  location: string;
  department?: string;
  employmentType?: string; // e.g. "FullTime", "PartTime", "Contract"
  isRemote?: boolean;
  publishedAt: string;
  jobUrl: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
}

export async function crawlAshbyBoard(boardName: string): Promise<CrawledJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${boardName}`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw new Error(`Ashby fetch failed for ${boardName}: ${res.status}`);
  }

  const data = (await res.json()) as { jobs: RawAshbyJob[] };

  return (data.jobs || []).map((j) => ({
    externalId: j.id,
    titleRaw: j.title,
    descriptionRaw: j.descriptionPlain || j.descriptionHtml || "",
    sourceUrl: j.jobUrl,
    locationRaw: j.location || null,
    postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
    raw: j,
  }));
}
