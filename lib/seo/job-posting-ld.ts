/**
 * JobPosting structured data — the machine-readable half of a job page.
 *
 * Search Console flags six "improve item appearance" fields on our postings:
 * addressLocality, streetAddress, postalCode, addressRegion, validThrough and
 * baseSalary. Three of those we can fix with data we genuinely hold and simply
 * weren't emitting. Three we cannot, and this file deliberately leaves them
 * out rather than filling them in:
 *
 * - streetAddress / postalCode: we aggregate postings from company career
 *   pages, which publish "San Francisco, CA" — not a door number. Inventing a
 *   street or a postcode would be false data in a feed Google trusts, and
 *   structured data that contradicts the visible page is exactly what earns a
 *   manual action. The warning is correct and stays.
 * - validThrough: we don't know when a posting closes. We detect that it HAS
 *   closed (re-crawl, then status EXPIRED), which is backward-looking. Google's
 *   own guidance is to omit the property when the expiry is unknown, and a
 *   guessed date is actively harmful: it would drop a still-open role out of
 *   search on the day we made up.
 *
 * Everything below is derived from a real column.
 */
import { isCountryName, isUsStateName } from "@/lib/ingestion/normalize-rules";
import { COUNTRY_NAMES } from "@/lib/countries";

/** schema.org accepts only these for QuantitativeValue.unitText. */
const SALARY_UNIT: Record<string, string> = { YEAR: "YEAR", HOUR: "HOUR", DAY: "DAY", MONTH: "MONTH", WEEK: "WEEK" };

/** Multi-location strings ("A • B • C") list the same role in several places;
 *  schema.org wants one jobLocation, so we describe the first. */
const FIRST_LOCATION = /\s*[•|]\s*/;

/** Unanchored on purpose: boards write "Remote US" and "Remote - Poland", and
 *  neither is a city. Anchoring this to the whole string let "Remote US"
 *  through as an addressLocality. */
const NON_PLACE = /\b(remote|anywhere|worldwide|global|hybrid|on-?site|distributed|flexible|multiple|various|virtual)\b/i;

/**
 * The city, when the location string actually names one.
 *
 * "San Francisco, CA • New York, NY" -> "San Francisco"
 * "Tokyo, Japan"                     -> "Tokyo"
 * "Remote"                           -> null  (not a place)
 * "United States"                    -> null  (a country, not a locality)
 * "CA"                               -> null  (a region, not a locality)
 */
export function addressLocality(locationRaw: string | null): string | null {
  if (!locationRaw) return null;
  const first = locationRaw.split(FIRST_LOCATION)[0]?.trim();
  if (!first) return null;
  // " - " too: "Remote - Poland" and "London - The River Building HQ" both put
  // the qualifier after a dash.
  const candidate = first.split(/[,;\/]|\s+-\s+/)[0]?.trim();
  if (!candidate || candidate.length < 2 || candidate.length > 80) return null;
  if (NON_PLACE.test(candidate)) return null;
  // "Japan" is a country and "CA" is a region — neither is a locality, and
  // publishing them as one would be wrong rather than merely incomplete.
  // Note this uses isUsStateName, NOT extractLocationState: the latter maps
  // metros to states, so it rejects "San Francisco" as if it were a region.
  if (isCountryName(candidate)) return null;
  if (isUsStateName(candidate)) return null;
  return candidate;
}

export interface JobLdInput {
  /** PROJECT rows never produce JobPosting markup — see the guard below. */
  kind: string;
  titleRaw: string;
  descriptionClean: string;
  postedAt: Date | null;
  lastVerifiedAt: Date;
  employmentType: string;
  companyName: string;
  locationRaw: string | null;
  locationState: string | null;
  country: string | null;
  remoteType: string;
  remoteScope: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string | null;
  sourceUrl: string;
  isNative: boolean;
}

/**
 * The one country we can honestly name as an applicant-location requirement, or
 * null when we can't name any.
 *
 * Google requires at least one REAL country on a TELECOMMUTE posting, and its
 * vocabulary has no "worldwide" value (confirmed against the JobPosting docs).
 * So `remoteScope` is only usable when it's an actual ISO-2 country code —
 * `COUNTRY_NAMES` is the authority. The scope column also carries multi-country
 * regions (GLOBAL, EMEA, EUROPE, NORTH_AMERICA, APAC), and those used to be
 * passed straight through as `{"@type":"Country","name":"NORTH_AMERICA"}`, which
 * is not a country and not valid. They now fail this check on purpose.
 */
function applicantCountry(job: JobLdInput): string | null {
  const candidates = [
    job.remoteScope,
    job.remoteType === "REMOTE_US" ? "US" : null,
    job.country,
  ];
  for (const c of candidates) if (c && COUNTRY_NAMES[c]) return c;
  return null;
}

/**
 * Returns null when we cannot produce a VALID posting, and the caller must then
 * emit no JobPosting markup at all.
 *
 * This costs nothing: an item Google rejects generates no rich result anyway, so
 * the only thing the invalid version bought us was a Search Console error and a
 * feed that looks careless. Omitting is also the same principle the rest of this
 * file already follows — describe what we hold, never invent the rest.
 */
export function jobPostingLd(job: JobLdInput): Record<string, unknown> | null {
  const isRemote = job.remoteType.startsWith("REMOTE");

  // A freelance brief you bid on elsewhere is not a job posting. The detail page
  // already skipped these; the guard lives here now so no future caller can
  // reintroduce it.
  if (job.kind === "PROJECT") return null;

  // Only the address parts we actually hold. An empty PostalAddress is worse
  // than none — it's what makes a remote posting look like it's missing every
  // address field rather than legitimately having no fixed workplace.
  const address: Record<string, string> = {};
  const locality = addressLocality(job.locationRaw);
  if (locality) address.addressLocality = locality;
  if (job.locationState) address.addressRegion = job.locationState;
  if (job.country) address.addressCountry = job.country;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.titleRaw,
    description: job.descriptionClean,
    datePosted: (job.postedAt ?? job.lastVerifiedAt).toISOString(),
    employmentType: job.employmentType,
    hiringOrganization: { "@type": "Organization", name: job.companyName },
    directApply: job.isNative,
    url: job.sourceUrl,
  };

  if (Object.keys(address).length > 0) {
    ld.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", ...address } };
  }

  if (isRemote) {
    // Google treats a TELECOMMUTE posting with no applicantLocationRequirements
    // as an INVALID item, not merely an incomplete one — this was the Search
    // Console error. If we can't name a real country, emit nothing.
    const where = applicantCountry(job);
    if (!where) return null;
    ld.jobLocationType = "TELECOMMUTE";
    ld.applicantLocationRequirements = { "@type": "Country", name: where };
  } else if (!ld.jobLocation) {
    // Non-remote and no address at all: Google needs jobLocation on a posting
    // that isn't marked remote, so this would be invalid for the mirror-image
    // reason. Same treatment.
    return null;
  }

  // Real pay only. ~16% of live postings publish a range; the rest genuinely
  // don't, and a made-up band would be the single most damaging thing we could
  // put in this feed.
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin > 0) {
    const unit = job.salaryPeriod ? SALARY_UNIT[job.salaryPeriod] : undefined;
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency,
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        ...(unit ? { unitText: unit } : {}),
      },
    };
  }

  return ld;
}
