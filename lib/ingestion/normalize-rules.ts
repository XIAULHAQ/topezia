/**
 * Rules-first normalization — spec §4.2, rung 1.
 *
 * Every field resolved here is a field the LLM never has to touch. Target
 * from the spec: ≥50% of fields resolved with zero model calls. This file
 * is where that target lives or dies — invest iteration time here before
 * reaching for the model.
 */

import { EmploymentType, RemoteType } from "@prisma/client";

const US_STATE_ABBR = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export function stripHtml(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractLocationState(locationRaw: string | null): string | null {
  if (!locationRaw) return null;
  const cleaned = locationRaw.trim();

  // "City, ST" or "City, ST, USA"
  const abbrMatch = cleaned.match(/,\s*([A-Z]{2})\b/);
  if (abbrMatch && US_STATE_ABBR.includes(abbrMatch[1])) {
    return abbrMatch[1];
  }

  // "City, Full State Name"
  const lower = cleaned.toLowerCase();
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    if (lower.includes(name)) return abbr;
  }

  return null;
}

export function extractRemoteType(locationRaw: string | null, descriptionText: string): RemoteType {
  const haystack = `${locationRaw || ""} ${descriptionText.slice(0, 500)}`.toLowerCase();

  if (/\bremote\b/.test(haystack)) {
    if (/\b(us only|united states only|us-based|within the us|us residents)\b/.test(haystack)) {
      return RemoteType.REMOTE_US;
    }
    if (/\b(anywhere|global|worldwide|international)\b/.test(haystack)) {
      return RemoteType.REMOTE_GLOBAL;
    }
    // Default remote-but-unspecified-scope to US — safest default for a
    // US-first launch (spec §2). Revisit if global remote volume grows.
    return RemoteType.REMOTE_US;
  }
  if (/\bhybrid\b/.test(haystack)) {
    return RemoteType.HYBRID;
  }
  return RemoteType.ONSITE;
}

export function extractEmploymentType(
  titleRaw: string,
  descriptionText: string,
  commitmentHint?: string // Lever's `categories.commitment` field, when present
): EmploymentType {
  const haystack = `${titleRaw} ${commitmentHint || ""} ${descriptionText.slice(0, 800)}`.toLowerCase();

  if (/\bintern(ship)?\b/.test(haystack)) return EmploymentType.TEMP;
  if (/\bpart[\s-]?time\b/.test(haystack)) return EmploymentType.PART_TIME;
  if (/\bcontract(or)?\b|\bfreelance\b|\b1099\b/.test(haystack)) return EmploymentType.CONTRACT;
  if (/\bhourly\b|\/\s?hr\b|\bper hour\b/.test(haystack)) return EmploymentType.HOURLY;
  if (/\btemp(orary)?\b|\bseasonal\b/.test(haystack)) return EmploymentType.TEMP;

  // Default assumption for ATS-sourced tech/creative roles unless flagged
  // otherwise — most Greenhouse/Lever/Ashby postings are full-time.
  return EmploymentType.FULL_TIME;
}

export interface ExtractedSalary {
  min: number | null;
  max: number | null;
  period: "YEAR" | "HOUR" | "DAY" | null;
}

export function extractSalary(descriptionText: string): ExtractedSalary {
  // Matches: "$120,000 - $150,000", "$120k-$150k", "$45/hr - $60/hr",
  // "$45 - $60 per hour".
  //
  // The leading `$` is REQUIRED (not optional). Without it, this matched any
  // bare number range in the text — "5-10 years of experience" became
  // salaryMin 5 / salaryMax 10 (tagged HOURLY by the sub-$500 heuristic),
  // "8-12 weeks" became a wage, etc. Since salaryMax feeds a hard filter in
  // the matching engine (spec §5), a fabricated salary is worse than a
  // missing one — honesty over coverage. A currency sign anchors the match
  // to something that is actually money.
  // The `(?:...)` after the first number is non-capturing so capture-group
  // indices stay 1=min, 2=min-k, 3=max, 4=max-k, 5=suffix. It lets a per-unit
  // token sit on the FIRST amount too ("$45/hr - $60/hr"), which the dash-only
  // form otherwise couldn't reach past.
  const rangePattern =
    /\$\s?(\d{2,3}(?:,\d{3})?|\d+)(k)?(?:\s?\/\s?(?:hr|hour|yr|year))?\s?(?:-|to|–|—)\s?\$?\s?(\d{2,3}(?:,\d{3})?|\d+)(k)?\s?(\/\s?(hr|hour)|per hour|k|USD|\/yr|\/year|annually)?/i;

  const match = descriptionText.match(rangePattern);
  if (!match) return { min: null, max: null, period: null };

  const parseNum = (raw: string, hasK: boolean) => {
    const n = parseFloat(raw.replace(/,/g, ""));
    return hasK ? n * 1000 : n;
  };

  const min = parseNum(match[1], Boolean(match[2]));
  const max = parseNum(match[3], Boolean(match[4]));

  if (min < 5 || max < 5) return { min: null, max: null, period: null }; // guards against unrelated number pairs
  if (max < min) return { min: null, max: null, period: null }; // not a valid ascending range

  const suffix = (match[5] || "").toLowerCase();
  const period: ExtractedSalary["period"] =
    suffix.includes("hr") || suffix.includes("hour")
      ? "HOUR"
      : min < 500 // heuristic: sub-$500 range with no suffix is almost certainly hourly
      ? "HOUR"
      : "YEAR";

  return { min: Math.round(min), max: Math.round(max), period };
}

/**
 * Runs the full rules pass and reports what's still missing — the caller
 * (run-ingestion.ts) only escalates unresolved fields to the LLM (§4.2 rung 2).
 */
export function applyRulesPass(input: {
  titleRaw: string;
  descriptionRaw: string;
  locationRaw: string | null;
  leverCommitment?: string;
}) {
  const descriptionText = stripHtml(input.descriptionRaw);

  return {
    descriptionText,
    locationState: extractLocationState(input.locationRaw),
    remoteType: extractRemoteType(input.locationRaw, descriptionText),
    employmentType: extractEmploymentType(input.titleRaw, descriptionText, input.leverCommitment),
    salary: extractSalary(descriptionText),
  };
}
