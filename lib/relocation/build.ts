/**
 * Assembles the Relocation fit card for one (job, profile) pair, or returns
 * null when there's nothing honest to show.
 *
 * Gating went through two wrong drafts before this one, both caught by
 * testing against a real profile rather than trusting the reasoning:
 *
 *  1. geoNote() — too narrow. Its sponsorship branch only fires once someone
 *     has explicitly added a country to the relocate-countries picker, which
 *     most profiles never do.
 *  2. eligibleIn() — also too narrow, for the same root cause. It requires
 *     the job's country to be in targetCountries() (authorized ∪ relocate),
 *     falling back to `[located]` ONLY when both arrays are empty. A profile
 *     with even one authorized country set (e.g. their own — the common
 *     case) fails eligibleIn() for every other country, which made the card
 *     vanish for exactly the ordinary "curious about a job elsewhere" case
 *     it exists for. Caught by testing against my own profile (authorized:
 *     ["US"]) on a Canada job — the real bug this document is warning about.
 *
 * The actual rule needed is narrower and simpler than either: hide the card
 * only when the posting EXPLICITLY refuses the sponsorship this viewer would
 * need. That's refusesSponsorship() directly, not the feed-filtering
 * machinery built around targetCountries().
 */
import type { SalaryPeriod } from "@prisma/client";
import { workContext, refusesSponsorship } from "@/lib/matching/eligibility";
import { countryName } from "@/lib/countries";
import { currencyOf } from "@/lib/relocation/currency";
import { visaResourceFor, type VisaResource } from "@/lib/relocation/visa-resources";
import { convert } from "@/lib/relocation/fx";

export interface RelocationJob {
  country: string | null;
  remoteScope: string | null;
  descriptionRaw: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod | null;
}

export interface RelocationProfile {
  country: string | null;
  authorizedCountries?: string[] | null;
  relocateCountries?: string[] | null;
  relocateAnywhere?: boolean | null;
}

export interface RelocationSalary {
  min: number | null;
  max: number | null;
  currency: string;
  originalCurrency: string;
  period: SalaryPeriod | null;
}

export interface RelocationCard {
  originCountry: string;
  destCountry: string;
  salary: RelocationSalary | null;
  visa: VisaResource | null;
}

/** The country this job is actually IN, for relocation purposes — same derivation geoNote() uses. */
function destinationOf(job: Pick<RelocationJob, "country" | "remoteScope">): string | null {
  if (job.country) return job.country;
  return job.remoteScope && job.remoteScope !== "GLOBAL" ? job.remoteScope : null;
}

export async function buildRelocationCard(job: RelocationJob, profile: RelocationProfile): Promise<RelocationCard | null> {
  const dest = destinationOf(job);
  const ctx = workContext(profile);
  if (!dest || !ctx.located || ctx.located === dest) return null;
  // Only an EXPLICIT refusal hides the card — and not even that if they're
  // already authorized in dest (a dual citizen doesn't need sponsorship).
  if (!ctx.authorized.includes(dest) && refusesSponsorship(job.descriptionRaw)) return null;

  let salary: RelocationSalary | null = null;
  const homeCurrency = currencyOf(ctx.located);
  if (homeCurrency && homeCurrency !== job.salaryCurrency && (job.salaryMin != null || job.salaryMax != null)) {
    const [min, max] = await Promise.all([
      job.salaryMin != null ? convert(job.salaryMin, job.salaryCurrency, homeCurrency) : Promise.resolve(null),
      job.salaryMax != null ? convert(job.salaryMax, job.salaryCurrency, homeCurrency) : Promise.resolve(null),
    ]);
    if (min != null || max != null) {
      salary = {
        min: min != null ? Math.round(min) : null,
        max: max != null ? Math.round(max) : null,
        currency: homeCurrency,
        originalCurrency: job.salaryCurrency,
        period: job.salaryPeriod,
      };
    }
  }

  const visa = visaResourceFor(dest);
  if (!salary && !visa) return null; // nothing to show is not a hollow card, it's no card

  return { originCountry: countryName(ctx.located), destCountry: countryName(dest), salary, visa };
}
