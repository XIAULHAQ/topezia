/**
 * Work eligibility — where a person may WORK, which is not where they ARE.
 *
 * The feed used to scope on Profile.country, parsed from the résumé's address.
 * That silently conflated three different facts:
 *
 *   1. where you live      — timezone, commute, "local" jobs
 *   2. where you may work  — citizenship, permanent residency, a visa
 *   3. where you'd move to — relocation appetite, sponsorship needed
 *
 * A US citizen living in Karachi saw only Pakistani jobs. A Pakistani national
 * willing to relocate to the US never saw a US job at all. This module scopes
 * on (2) ∪ (3) and uses (1) only as the fallback when we've never asked.
 *
 * ── The sponsorship asymmetry ────────────────────────────────────────────
 * We cannot know which employers sponsor: almost none say so. But refusals ARE
 * stated, constantly and in stock phrases ("must be authorized to work without
 * sponsorship", "we are unable to sponsor"). So the evidence is one-sided, and
 * this module treats it that way: an explicit refusal HIDES the job from
 * someone who'd need sponsorship for it, while silence is reported honestly as
 * silence — never as a yes. Anything else would have us inventing an answer
 * the corpus doesn't contain.
 *
 * Both the SQL retrieval and the JS post-filter are generated from the
 * definitions here. They used to be two hand-synced copies carrying a "MUST
 * mirror eligibleIn() exactly" comment — exactly the kind of duplication that
 * drifts the first time someone edits one of them.
 */
import { REGION_MEMBERS } from "@/lib/ingestion/normalize-rules";
import { countryName } from "@/lib/countries";

export interface WorkContext {
  /** Where they are today (ISO-2) — Profile.country. */
  located: string | null;
  /** Where they may work with no sponsorship (ISO-2). */
  authorized: string[];
  /** Where they'd move for the right job, needing sponsorship (ISO-2). */
  relocate: string[];
}

export interface GeoJob {
  country: string | null;
  remoteScope: string | null;
  descriptionRaw?: string | null;
}

const up = (xs: string[]) => [...new Set(xs.map((c) => c.trim().toUpperCase()).filter(Boolean))];

export function workContext(p: {
  country: string | null;
  authorizedCountries?: string[] | null;
  relocateCountries?: string[] | null;
}): WorkContext {
  return {
    located: p.country ? p.country.toUpperCase() : null,
    authorized: up(p.authorizedCountries ?? []),
    relocate: up(p.relocateCountries ?? []),
  };
}

/**
 * The countries whose jobs belong in this feed. Falls back to where they live
 * when they've never told us — that is exactly the old behaviour, so existing
 * profiles see no change until they answer.
 */
export function targetCountries(ctx: WorkContext): string[] {
  const chosen = [...new Set([...ctx.authorized, ...ctx.relocate])];
  if (chosen.length) return chosen;
  return ctx.located ? [ctx.located] : [];
}

/** Targets where they would need sponsorship — i.e. relocation-only targets. */
export function sponsorshipCountries(ctx: WorkContext): string[] {
  return ctx.relocate.filter((c) => !ctx.authorized.includes(c));
}

/** Region codes (EMEA, APAC…) that cover ANY of the given countries. */
export function regionsCovering(countries: string[]): string[] {
  return Object.entries(REGION_MEMBERS)
    .filter(([, members]) => members.some((m) => countries.includes(m)))
    .map(([region]) => region);
}

/**
 * Stock refusals. Deliberately literal — only explicit statements, never
 * inferences. "Requires security clearance" implies citizenship in practice
 * but is NOT a sponsorship statement, and hiding jobs on an inference is the
 * mistake this whole module exists to avoid.
 */
const REFUSAL_PATTERNS = [
  "unable to (?:provide |offer |support )?(?:visa |work |employment )?sponsor",
  "(?:cannot|can not|does not|do not) (?:provide |offer |currently )?sponsor",
  "not (?:able|willing|in a position) to sponsor",
  "\\yno (?:visa |work |employment )?sponsorship\\y",
  "sponsorship (?:is )?not (?:available|offered|provided|possible)",
  "without (?:the )?(?:need for |requiring |needing )?(?:visa |work |employment )?sponsorship",
  "\\yu\\.?s\\.? citizens? only\\y",
  "must be (?:a )?u\\.?s\\.? citizen",
];

/** POSIX alternation for Postgres `~*` (word boundaries use \y). */
export const NO_SPONSORSHIP_RX = `(${REFUSAL_PATTERNS.join("|")})`;
/** The same thing for JS, where the word boundary is \b. */
const NO_SPONSORSHIP_JS = new RegExp(NO_SPONSORSHIP_RX.replace(/\\y/g, "\\b"), "i");

export function refusesSponsorship(text: string | null | undefined): boolean {
  return !!text && NO_SPONSORSHIP_JS.test(text);
}

/**
 * The SQL half of the same rule, as a composable clause.
 *
 * Params, by the indices the caller passes: targets text[], regions text[],
 * sponsorship-needed text[], refusal regex text. An empty target array filters
 * nothing — we don't know enough to hide anything.
 */
export function eligibilitySql(p: { targets: number; regions: number; sponsorNeeded: number; rx: number }): string {
  return `(
      cardinality($${p.targets}::text[]) = 0
      OR j."remoteScope" = 'GLOBAL'
      OR j.country = ANY($${p.targets}::text[])
      OR j."remoteScope" = ANY($${p.targets}::text[])
      OR j."remoteScope" = ANY($${p.regions}::text[])
      OR (j.country IS NULL AND j."remoteScope" IS NULL)
    )
    AND NOT (
      COALESCE(j.country, j."remoteScope") = ANY($${p.sponsorNeeded}::text[])
      AND j."descriptionRaw" ~* $${p.rx}
    )`;
}

/** The parameter values for eligibilitySql, in the same order. */
export function eligibilityParams(ctx: WorkContext): [string[], string[], string[], string] {
  const targets = targetCountries(ctx);
  return [targets, regionsCovering(targets), sponsorshipCountries(ctx), NO_SPONSORSHIP_RX];
}

/**
 * Could this person actually take this job, geographically?
 *
 * Note that unknown geography PASSES. Absence of evidence isn't evidence of
 * ineligibility, and hiding a job because we failed to parse its location
 * would be our bug punishing the seeker. Only positive evidence hides: a
 * mismatched country, or a posting that explicitly refuses the sponsorship
 * this person would need.
 */
export function eligibleIn(job: GeoJob, ctx: WorkContext): boolean {
  const targets = targetCountries(ctx);
  if (!targets.length) return true; // we know nothing — filter nothing

  const place = job.country ?? job.remoteScope;
  if (place && sponsorshipCountries(ctx).includes(place) && refusesSponsorship(job.descriptionRaw)) {
    return false; // they said no, in writing
  }

  if (job.remoteScope === "GLOBAL") return true;
  if (job.country && targets.includes(job.country)) return true;
  if (job.remoteScope && targets.includes(job.remoteScope)) return true;
  const region = job.remoteScope ? REGION_MEMBERS[job.remoteScope] : undefined;
  if (region?.some((m) => targets.includes(m))) return true;
  if (!job.country && !job.remoteScope) return true; // genuinely unknown
  return false;
}

export type GeoNoteKind = "sponsorship" | "residence";
export interface GeoNote {
  kind: GeoNoteKind;
  /** Short chip text. */
  label: string;
  /** The full, honest sentence. */
  text: string;
}

/**
 * The honest caveat for a job that is eligible but not straightforward — shown
 * on the card so nobody discovers the catch only at the rejection email.
 *
 * Two cases, in priority order:
 *  - sponsorship: it's in a country they'd need sponsoring for, and the posting
 *    is silent about it (explicit refusals never get here — they're filtered).
 *  - residence: a country-scoped remote job ("Remote — US") while they live
 *    elsewhere. Most of these mean "remote, but you must reside here" for
 *    payroll and tax reasons, so citizenship alone doesn't make it takeable.
 */
export function geoNote(job: GeoJob, ctx: WorkContext): GeoNote | null {
  const place = job.country ?? (job.remoteScope !== "GLOBAL" ? job.remoteScope : null);
  if (place && sponsorshipCountries(ctx).includes(place)) {
    return {
      kind: "sponsorship",
      label: "Sponsorship needed",
      text: `You'd need sponsorship to work in ${countryName(place)}, and this posting doesn't say whether they offer it.`,
    };
  }

  const scope = job.remoteScope;
  if (
    scope && scope !== "GLOBAL" && !REGION_MEMBERS[scope] && // a country-scoped remote job
    ctx.located && scope !== ctx.located &&
    ctx.authorized.includes(scope) // they may work there, they just don't live there
  ) {
    return {
      kind: "residence",
      label: `Usually requires living in ${countryName(scope)}`,
      text: `Remote within ${countryName(scope)} — roles like this usually require living there for payroll and tax, even for citizens.`,
    };
  }
  return null;
}
