/**
 * Country names and the pickers built on them.
 *
 * Client-safe on purpose: this used to live in lib/seo/pages.ts, which imports
 * Prisma and so can never be pulled into a browser bundle. The work-eligibility
 * picker needs the same names the SEO pages use, and two copies of a country
 * list would drift the first time someone added a market.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", IE: "Ireland", DE: "Germany", FR: "France",
  ES: "Spain", PT: "Portugal", IT: "Italy", NL: "Netherlands", BE: "Belgium",
  AT: "Austria", CH: "Switzerland", LU: "Luxembourg", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", IS: "Iceland", EE: "Estonia", LV: "Latvia",
  LT: "Lithuania", PL: "Poland", CZ: "Czechia", SK: "Slovakia", HU: "Hungary",
  RO: "Romania", BG: "Bulgaria", HR: "Croatia", SI: "Slovenia", RS: "Serbia",
  BA: "Bosnia and Herzegovina", AL: "Albania", GR: "Greece", CY: "Cyprus",
  MT: "Malta", UA: "Ukraine", MD: "Moldova", TR: "Türkiye", RU: "Russia",
  KZ: "Kazakhstan", AZ: "Azerbaijan", AM: "Armenia", UZ: "Uzbekistan", GE: "Georgia (country)",
  CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina", CL: "Chile",
  CO: "Colombia", PE: "Peru", UY: "Uruguay", EC: "Ecuador", CR: "Costa Rica",
  PA: "Panama", GT: "Guatemala", DO: "Dominican Republic",
  IL: "Israel", AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar",
  KW: "Kuwait", BH: "Bahrain", OM: "Oman", JO: "Jordan", LB: "Lebanon",
  EG: "Egypt", MA: "Morocco", TN: "Tunisia", DZ: "Algeria",
  ZA: "South Africa", NG: "Nigeria", KE: "Kenya", GH: "Ghana", ET: "Ethiopia",
  UG: "Uganda", TZ: "Tanzania", RW: "Rwanda",
  IN: "India", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal",
  CN: "China", HK: "Hong Kong", TW: "Taiwan", JP: "Japan", KR: "South Korea",
  SG: "Singapore", MY: "Malaysia", ID: "Indonesia", TH: "Thailand", VN: "Vietnam",
  PH: "Philippines", AU: "Australia", NZ: "New Zealand",
};

export const countryName = (iso: string) => COUNTRY_NAMES[iso.toUpperCase()] ?? iso.toUpperCase();

/**
 * ISO-2 → URL slug ("DE" → "germany"). Lives here rather than in lib/seo/pages
 * so that background jobs can build the same canonical paths without importing
 * the render module — which pulls in React and cannot load in a plain script.
 * Both sides MUST use this one function: a second copy would drift, and a
 * PageStats row keyed by a slug the page doesn't use is a row nothing reads.
 */
export const countrySlugFor = (iso: string) =>
  (COUNTRY_NAMES[iso] ?? iso).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * One-tap groups for the eligibility picker. These are the cases where work
 * rights genuinely come as a bundle — an EU citizen may work in all 27 member
 * states, so making them tap 27 checkboxes would be our data model leaking
 * into their afternoon.
 */
export const COUNTRY_GROUPS: { label: string; hint: string; codes: string[] }[] = [
  {
    label: "EU / EEA",
    hint: "An EU citizenship lets you work in all of these",
    codes: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IS", "IT", "LV", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE"],
  },
  {
    label: "GCC",
    hint: "Gulf states",
    codes: ["AE", "SA", "QA", "KW", "BH", "OM"],
  },
];

/** Markets with real inventory first, then the rest alphabetically. */
export const PICKER_ORDER: string[] = (() => {
  const lead = ["US", "GB", "CA", "AU", "AE", "SA", "PK", "IN", "DE", "NL", "IE", "SG"];
  const rest = Object.keys(COUNTRY_NAMES)
    .filter((c) => !lead.includes(c))
    .sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b]));
  return [...lead, ...rest];
})();
