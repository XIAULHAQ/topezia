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

export function jobPostingLd(job: JobLdInput): Record<string, unknown> {
  const isRemote = job.remoteType.startsWith("REMOTE");

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
    ld.jobLocationType = "TELECOMMUTE";
    // Where someone may actually be to take it. Google expects this on a
    // TELECOMMUTE posting instead of a physical address; "GLOBAL" means no
    // restriction we know of, so it stays unset rather than claiming one.
    const scope = job.remoteScope && job.remoteScope !== "GLOBAL" ? job.remoteScope : null;
    const where = scope ?? (job.remoteType === "REMOTE_US" ? "US" : null) ?? job.country;
    if (where) ld.applicantLocationRequirements = { "@type": "Country", name: where };
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
