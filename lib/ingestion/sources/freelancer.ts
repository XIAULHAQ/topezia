/**
 * Freelancer.com project crawler — the click-out freelance-projects source
 * (pre-Phase-3: we aggregate and match; people bid on Freelancer.com itself).
 *
 * Endpoint: https://www.freelancer.com/api/projects/0.1/projects/active/
 * Publicly readable (no OAuth needed for browsing); their API T&Cs still
 * apply — notably: refresh cached data at least every 24h, which our re-crawl
 * cadence satisfies, and every card click-outs to the original project page.
 *
 * Unlike the ATS sources, projects arrive with their OWN skill labels
 * ("Graphic Design", "Figma", …) — the ingestion script resolves those against
 * our taxonomy directly and skips the LLM extraction rung entirely.
 */

interface RawFreelancerProject {
  id: number;
  title: string;
  seo_url: string; // "figma/Figma-Joomla-Helix-Integration"
  status: string;
  type: "fixed" | "hourly";
  description?: string;
  preview_description?: string;
  submitdate?: number; // epoch seconds
  budget?: { minimum?: number | null; maximum?: number | null };
  currency?: { code?: string };
  jobs?: { name?: string }[]; // their skill taxonomy
  language?: string;
  nonpublic?: boolean;
  hireme?: boolean;
  local?: boolean;
  bid_stats?: { bid_count?: number; bid_avg?: number };
  bidperiod?: number; // days
}

export interface CrawledProject {
  externalId: string;
  titleRaw: string;
  descriptionRaw: string;
  sourceUrl: string;
  skills: string[]; // source-labeled skill names, pre-taxonomy
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  isHourly: boolean;
  postedAt: Date | null;
  bidCount: number | null;
  raw: unknown;
}

const API = "https://www.freelancer.com/api/projects/0.1/projects/active/";

/**
 * Fetch active projects for one search query. English, public, non-local
 * projects only — local ones need physical presence and can't be matched
 * globally, and hireme posts are directed at a specific freelancer.
 */
export async function crawlFreelancerProjects(
  query: string,
  limit = 50
): Promise<CrawledProject[]> {
  const url =
    `${API}?query=${encodeURIComponent(query)}&limit=${limit}` +
    `&full_description=true&job_details=true&languages[]=en`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Freelancer.com fetch failed for "${query}": ${res.status}`);
  }

  const data = (await res.json()) as {
    status: string;
    result?: { projects?: RawFreelancerProject[] };
  };
  const projects = data.result?.projects ?? [];

  return projects
    .filter(
      (p) =>
        p.status === "active" &&
        !p.nonpublic &&
        !p.hireme &&
        !p.local &&
        (p.language ?? "en") === "en" &&
        p.seo_url
    )
    .map((p) => ({
      externalId: String(p.id),
      titleRaw: p.title,
      descriptionRaw: p.description || p.preview_description || "",
      sourceUrl: `https://www.freelancer.com/projects/${p.seo_url}`,
      skills: (p.jobs ?? []).map((j) => j.name).filter((n): n is string => !!n),
      budgetMin: p.budget?.minimum ?? null,
      budgetMax: p.budget?.maximum ?? null,
      currency: p.currency?.code || "USD",
      isHourly: p.type === "hourly",
      postedAt: p.submitdate ? new Date(p.submitdate * 1000) : null,
      bidCount: p.bid_stats?.bid_count ?? null,
      raw: p,
    }));
}
