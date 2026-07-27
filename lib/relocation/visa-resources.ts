/**
 * Official government immigration/work-visa resource per destination country.
 *
 * Deliberately small and hand-curated, not generated: every URL here was
 * opened in a real browser during development and confirmed to be the
 * country's own official portal, not guessed from a template. A country
 * missing from this table simply gets no visa link on its Relocation fit
 * card — never a guessed one. Seeded for lib/countries.ts's PICKER_ORDER
 * lead markets ("markets with real inventory"), i.e. where this card will
 * actually fire today; extend as new countries earn real posting volume.
 *
 * This is a pointer, not advice: the label names the authority, never
 * claims a pathway exists or that the viewer qualifies for one. Visa rules
 * change fast and unevenly (India revoked visas for Pakistani nationals in
 * 2025 with no notice reflected anywhere but the source itself) — the only
 * honest thing to link to is the live official page, never a cached claim.
 */
export interface VisaResource {
  label: string;
  url: string;
}

export const VISA_RESOURCES: Record<string, VisaResource> = {
  US: { label: "US Citizenship and Immigration Services", url: "https://www.uscis.gov/working-in-the-united-states" },
  GB: { label: "UK work visas — GOV.UK", url: "https://www.gov.uk/browse/visas-immigration/work-visas" },
  CA: { label: "Immigration, Refugees and Citizenship Canada", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada.html" },
  AU: { label: "Australian Department of Home Affairs", url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-finder/work" },
  AE: { label: "UAE Government — jobs and work", url: "https://u.ae/en/information-and-services/jobs" },
  SA: { label: "Saudi Ministry of Human Resources and Social Development", url: "https://www.hrsd.gov.sa/en" },
  PK: { label: "Pakistan Directorate General of Immigration and Passports", url: "https://dgip.gov.pk" },
  IN: { label: "India Bureau of Immigration", url: "https://boi.gov.in" },
  DE: { label: "Make it in Germany — federal government portal", url: "https://www.make-it-in-germany.com/en/" },
  NL: { label: "Netherlands Immigration and Naturalisation Service", url: "https://ind.nl/en" },
  IE: { label: "Ireland employment permits — Dept. of Enterprise", url: "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/" },
  SG: { label: "Singapore Ministry of Manpower — passes and permits", url: "https://www.mom.gov.sg/passes-and-permits" },
};

export const visaResourceFor = (iso: string): VisaResource | null => VISA_RESOURCES[iso.toUpperCase()] ?? null;
