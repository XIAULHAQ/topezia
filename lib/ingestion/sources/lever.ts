/**
 * Lever crawler — spec §4.1
 *
 * Endpoint: https://api.lever.co/v0/postings/{account}?mode=json
 * `account` is the company's Lever slug, visible at jobs.lever.co/{account}.
 *
 * Lever's response is a flat array (no wrapper object), and gives both HTML
 * and plain-text description fields — we take plain text where available to
 * skip an HTML-stripping step.
 */

export interface RawLeverPosting {
  id: string;
  text: string; // job title
  hostedUrl: string;
  applyUrl: string;
  createdAt: number; // epoch ms
  categories: {
    location?: string;
    team?: string;
    commitment?: string; // often maps to employment type
  };
  descriptionPlain?: string;
  description?: string; // HTML fallback
  lists?: { text: string; content: string }[]; // requirements/responsibilities sections
}

import type { CrawledJob } from "./greenhouse";

export async function crawlLeverBoard(companySlug: string): Promise<CrawledJob[]> {
  const url = `https://api.lever.co/v0/postings/${companySlug}?mode=json`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw new Error(`Lever fetch failed for ${companySlug}: ${res.status}`);
  }

  const postings = (await res.json()) as RawLeverPosting[];

  return postings.map((p) => {
    // Lever splits description across `description` + `lists` sections;
    // concatenate for a single blob the normalization ladder can read.
    const listText = (p.lists || [])
      .map((l) => `${l.text}\n${l.content}`)
      .join("\n\n");
    const description = [p.descriptionPlain || p.description || "", listText]
      .filter(Boolean)
      .join("\n\n");

    return {
      externalId: p.id,
      titleRaw: p.text,
      descriptionRaw: description,
      sourceUrl: p.hostedUrl,
      locationRaw: p.categories?.location || null,
      postedAt: p.createdAt ? new Date(p.createdAt) : null,
      raw: p,
    };
  });
}
