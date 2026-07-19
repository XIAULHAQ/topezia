/**
 * Rules-first normalization — spec §4.2, rung 1.
 *
 * Every field resolved here is a field the LLM never has to touch. Target
 * from the spec: ≥50% of fields resolved with zero model calls. This file
 * is where that target lives or dies — invest iteration time here before
 * reaching for the model.
 */

import { EmploymentType, RemoteType } from "@prisma/client";
import { decodeHtmlEntities } from "@/lib/sanitize";

const US_STATE_ABBR = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
  "DC", // not a state, but a real place people search for
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

// Metro phrases that carry no state token. Without these, "San Francisco Bay
// Area" resolves to no state and no country — which would hide real US jobs
// once the feed filters on geography. Only distinctive multi-word phrases:
// bare "bay area" would swallow "Tampa Bay area".
const US_METRO_TO_STATE: Record<string, string> = {
  "san francisco bay area": "CA", "silicon valley": "CA", "greater los angeles": "CA",
  "new york city": "NY", nyc: "NY", "greater boston": "MA", "greater seattle": "WA",
  "greater chicago": "IL", "greater denver": "CO", "greater atlanta": "GA",
  // Bare US city names. Only consulted when no state token is present, so
  // "Portland, ME" is still ME; a lone "Portland" takes the larger city.
  "san francisco": "CA", "los angeles": "CA", "san diego": "CA", "san jose": "CA",
  "palo alto": "CA", "santa monica": "CA", oakland: "CA", sacramento: "CA",
  "new york": "NY", brooklyn: "NY", austin: "TX", dallas: "TX", houston: "TX",
  seattle: "WA", denver: "CO", boulder: "CO", chicago: "IL", boston: "MA",
  cambridge_ma: "MA", atlanta: "GA", miami: "FL", orlando: "FL", tampa: "FL",
  phoenix: "AZ", portland: "OR", "salt lake city": "UT", "las vegas": "NV",
  philadelphia: "PA", pittsburgh: "PA", detroit: "MI", minneapolis: "MN",
  nashville: "TN", charlotte: "NC", raleigh: "NC", columbus: "OH", cleveland: "OH",
  "kansas city": "MO", "st. louis": "MO", indianapolis: "IN", "san antonio": "TX",
};

// Country names -> ISO-3166 alpha-2. Full names only (plus the few unambiguous
// abbreviations); matching "CA" as Canada would collide with California.
// Deliberately NOT here: Georgia, which is a US state far more often than the
// country on these boards.
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", "u.s.": "US",
  "u.s.a.": "US", us: "US",
  "united kingdom": "GB", uk: "GB", "u.k.": "GB", england: "GB", scotland: "GB",
  wales: "GB", "northern ireland": "GB", "great britain": "GB",
  canada: "CA", mexico: "MX", ireland: "IE", poland: "PL", germany: "DE",
  france: "FR", spain: "ES", portugal: "PT", netherlands: "NL", "the netherlands": "NL",
  belgium: "BE", italy: "IT", sweden: "SE", norway: "NO", denmark: "DK",
  finland: "FI", iceland: "IS", switzerland: "CH", austria: "AT", greece: "GR",
  hungary: "HU", romania: "RO", bulgaria: "BG", croatia: "HR", slovenia: "SI",
  slovakia: "SK", serbia: "RS", "bosnia and herzegovina": "BA", albania: "AL",
  estonia: "EE", latvia: "LV", lithuania: "LT", czechia: "CZ", "czech republic": "CZ",
  ukraine: "UA", moldova: "MD", belarus: "BY", russia: "RU", turkey: "TR", türkiye: "TR",
  cyprus: "CY", malta: "MT", luxembourg: "LU",
  india: "IN", pakistan: "PK", bangladesh: "BD", "sri lanka": "LK", nepal: "NP",
  china: "CN", "hong kong": "HK", taiwan: "TW", japan: "JP", "south korea": "KR",
  korea: "KR", singapore: "SG", malaysia: "MY", indonesia: "ID", thailand: "TH",
  vietnam: "VN", philippines: "PH", "the philippines": "PH",
  australia: "AU", "new zealand": "NZ",
  brazil: "BR", argentina: "AR", chile: "CL", colombia: "CO", peru: "PE",
  uruguay: "UY", ecuador: "EC", "costa rica": "CR", panama: "PA", guatemala: "GT",
  "dominican republic": "DO",
  kazakhstan: "KZ", azerbaijan: "AZ", armenia: "AM", uzbekistan: "UZ", georgia_country: "GE",
  israel: "IL", uae: "AE", "united arab emirates": "AE", "saudi arabia": "SA",
  qatar: "QA", kuwait: "KW", bahrain: "BH", oman: "OM", jordan: "JO", lebanon: "LB",
  egypt: "EG", morocco: "MA", tunisia: "TN", algeria: "DZ",
  "south africa": "ZA", nigeria: "NG", kenya: "KE", ghana: "GH", ethiopia: "ET",
  uganda: "UG", tanzania: "TZ", rwanda: "RW",
};

// Major world cities -> country. Global boards overwhelmingly name a CITY and
// no country ("Berlin", "London - The River Building HQ", "AU - Sydney"), which
// left 25% of real non-US postings with no country at all — and unknown
// geography passes the feed filter, so they'd have quietly reached everyone.
//
// Safe against US collisions ONLY because extractCountry resolves a US state
// first: "Paris, TX" is TX->US before "paris" is ever consulted. Bare foreign
// city names are all that reach this map.
const CITY_TO_COUNTRY: Record<string, string> = {
  // UK / IE
  london: "GB", manchester: "GB", birmingham: "GB", leeds: "GB", glasgow: "GB",
  edinburgh: "GB", cardiff: "GB", bristol: "GB", cambridge: "GB", oxford: "GB",
  swansea: "GB", newcastle: "GB", sheffield: "GB", nottingham: "GB", brighton: "GB",
  dublin: "IE", cork: "IE", belfast: "GB",
  // DE / AT / CH
  berlin: "DE", munich: "DE", münchen: "DE", hamburg: "DE", frankfurt: "DE",
  cologne: "DE", köln: "DE", stuttgart: "DE", düsseldorf: "DE", dusseldorf: "DE",
  vienna: "AT", wien: "AT", zurich: "CH", zürich: "CH", geneva: "CH", basel: "CH",
  // FR / BE / NL / LU
  paris: "FR", lyon: "FR", marseille: "FR", toulouse: "FR", bordeaux: "FR",
  lille: "FR", nantes: "FR", brussels: "BE", bruxelles: "BE", antwerp: "BE",
  amsterdam: "NL", rotterdam: "NL", utrecht: "NL", "the hague": "NL", eindhoven: "NL",
  luxembourg: "LU",
  // ES / PT / IT / GR
  madrid: "ES", barcelona: "ES", valencia: "ES", seville: "ES", málaga: "ES", malaga: "ES",
  lisbon: "PT", lisboa: "PT", porto: "PT", milan: "IT", milano: "IT", rome: "IT",
  roma: "IT", turin: "IT", athens: "GR", thessaloniki: "GR",
  // Nordics
  stockholm: "SE", gothenburg: "SE", malmö: "SE", oslo: "NO", copenhagen: "DK",
  københavn: "DK", helsinki: "FI", tallinn: "EE", riga: "LV", vilnius: "LT",
  reykjavik: "IS",
  // CEE
  warsaw: "PL", warszawa: "PL", krakow: "PL", kraków: "PL", wroclaw: "PL",
  gdansk: "PL", prague: "CZ", praha: "CZ", brno: "CZ", budapest: "HU",
  bucharest: "RO", sofia: "BG", belgrade: "RS", beograd: "RS", zagreb: "HR",
  ljubljana: "SI", bratislava: "SK", kyiv: "UA", kiev: "UA", lviv: "UA",
  // Middle East / Africa
  dubai: "AE", "abu dhabi": "AE", doha: "QA", riyadh: "SA", "tel aviv": "IL",
  jerusalem: "IL", haifa: "IL", cairo: "EG", casablanca: "MA", nairobi: "KE",
  lagos: "NG", johannesburg: "ZA", "cape town": "ZA", accra: "GH", kampala: "UG",
  // South Asia
  bangalore: "IN", bengaluru: "IN", mumbai: "IN", delhi: "IN", "new delhi": "IN",
  gurugram: "IN", gurgaon: "IN", noida: "IN", hyderabad: "IN", chennai: "IN",
  pune: "IN", kolkata: "IN", ahmedabad: "IN", jaipur: "IN",
  karachi: "PK", lahore: "PK", islamabad: "PK", rawalpindi: "PK", dhaka: "BD",
  colombo: "LK", kathmandu: "NP",
  // East / SE Asia
  singapore: "SG", "kuala lumpur": "MY", jakarta: "ID", bangkok: "TH",
  manila: "PH", "makati": "PH", cebu: "PH", hanoi: "VN", "ho chi minh city": "VN",
  tokyo: "JP", osaka: "JP", kyoto: "JP", seoul: "KR", shanghai: "CN",
  beijing: "CN", shenzhen: "CN", guangzhou: "CN", "hong kong": "HK", taipei: "TW",
  // ANZ
  sydney: "AU", melbourne: "AU", brisbane: "AU", perth: "AU", adelaide: "AU",
  canberra: "AU", auckland: "NZ", wellington: "NZ", christchurch: "NZ",
  // Canada — listed so "Toronto" doesn't fall through to unknown
  toronto: "CA", vancouver: "CA", montreal: "CA", montréal: "CA", ottawa: "CA",
  calgary: "CA", edmonton: "CA", waterloo: "CA", kitchener: "CA", halifax: "CA",
  // LatAm
  "mexico city": "MX", guadalajara: "MX", monterrey: "MX", "são paulo": "BR",
  "sao paulo": "BR", "rio de janeiro": "BR", "buenos aires": "AR", santiago: "CL",
  bogota: "CO", "bogotá": "CO", lima: "PE", montevideo: "UY",
};

/** Multi-country regions. Not countries — a job "Remote (EMEA)" has no single one. */
const REGION_PATTERNS: [RegExp, string][] = [
  [/\bemea\b/i, "EMEA"], [/\bapac\b/i, "APAC"], [/\blatam\b/i, "LATAM"],
  [/\banz\b/i, "ANZ"], [/\bnorth america\b/i, "NORTH_AMERICA"],
  [/\beurope\b|\beu\b/i, "EUROPE"],
];

// Only ever tested against the LOCATION field. In description prose "global"
// almost always describes the company ("a global leader", "our global team"),
// not who may hold the job — trusting prose turned a bare "Remote" into
// REMOTE_GLOBAL and offered it to the entire planet.
const GLOBAL_LOCATION = /\b(anywhere|global(ly)?|worldwide|international|any country)\b/i;

// Phrases explicit enough to trust from the description itself.
const GLOBAL_PROSE = /\b(work from anywhere|remote from anywhere|anywhere in the world|fully distributed)\b/i;

// Which countries a region actually covers, for feed eligibility. Without this
// a US seeker would never see a job posted for "North America".
export const REGION_MEMBERS: Record<string, string[]> = {
  NORTH_AMERICA: ["US", "CA", "MX"],
  LATAM: ["MX", "BR", "AR", "CL", "CO", "PE", "UY", "EC", "CR", "PA", "GT", "DO"],
  EUROPE: ["GB", "IE", "DE", "FR", "ES", "PT", "NL", "BE", "IT", "SE", "NO", "DK", "FI", "CH", "AT", "PL", "RO", "CZ", "UA", "RS"],
  EMEA: ["GB", "IE", "DE", "FR", "ES", "PT", "NL", "BE", "IT", "SE", "NO", "DK", "FI", "CH", "AT", "PL", "RO", "CZ", "UA", "RS", "IL", "AE", "ZA"],
  APAC: ["IN", "PK", "BD", "LK", "CN", "HK", "TW", "JP", "KR", "SG", "MY", "ID", "TH", "VN", "PH", "AU", "NZ"],
  ANZ: ["AU", "NZ"],
};

/**
 * Split a location into comparable components.
 *
 * Splits on punctuation and " - " so "Remote - New Mexico" yields ["Remote",
 * "New Mexico"] — that one matters: without it, "New Mexico" never matches a
 * state and then hits the substring "mexico" and becomes MX. Deliberately does
 * NOT split on " or ": "San Francisco Bay Area or New York" should stay one
 * ambiguous blob rather than silently resolving to whichever state is last.
 */
function locationParts(s: string): string[] {
  return s.split(/[,;()\/:]|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Last-resort scan for a dictionary key appearing as a whole word anywhere in
 * a string — for messy free-text like "utah united states" (no comma) that the
 * component-based matching above can't split. Longest key first so "west
 * virginia" beats "virginia" and "united states" beats a stray "us". Only ever
 * reached AFTER the precise component matching fails, so it can't corrupt the
 * clean job-board locations that resolve earlier.
 */
function scanWholeString(s: string, dict: Record<string, string>): string | null {
  const padded = ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  for (const key of Object.keys(dict).sort((a, b) => b.length - a.length)) {
    if (padded.includes(` ${key} `)) return dict[key];
  }
  return null;
}

export function stripHtml(input: string): string {
  // Decode entities FIRST. Greenhouse returns entity-ENCODED html
  // (`&lt;p class=&quot;author-d-1gg9uz…&quot;&gt;`), which has no literal tags
  // to strip — so without this we shipped the raw markup, including enormous
  // generated class attributes, straight into the LLM prompt and the embedding
  // input. Pure token cost and noise.
  return decodeHtmlEntities(input)
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

  // DC first: "Washington, D.C." contains the substring "washington" and would
  // otherwise resolve to Washington STATE — a real Palantir posting in D.C. was
  // being filed under WA, i.e. the wrong side of the country.
  if (/(^|[\s,])d\.?c\.?([\s,]|$)|district of columbia/i.test(cleaned)) return "DC";

  // Match components, not substrings, and read right-to-left because the state
  // sits at the end ("City, ST", "City, State, Country"). Substring matching
  // made "Kansas City, Missouri" → KS, "Delaware, Ohio" → DE, and (because
  // "virginia" was tested before "west virginia") "West Virginia" → VA.
  const parts = locationParts(cleaned);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];

    // "CA", "CA 94301", "CA USA"
    const abbr = part.match(/^([A-Z]{2})\b/);
    if (abbr && US_STATE_ABBR.includes(abbr[1])) return abbr[1];

    // The component must BE the state name, never merely contain it.
    const named = STATE_NAME_TO_ABBR[part.toLowerCase()];
    if (named) return named;

    const metro = US_METRO_TO_STATE[part.toLowerCase()];
    if (metro) return metro;
  }

  // Free-text fallback: a state name anywhere in the string ("utah united states").
  return scanWholeString(cleaned, STATE_NAME_TO_ABBR) ?? scanWholeString(cleaned, US_METRO_TO_STATE);
}

/**
 * ISO-3166 alpha-2 country for a job location. null = we genuinely don't know
 * (e.g. a bare "Remote"), which callers must treat as unknown rather than US.
 */
export function extractCountry(locationRaw: string | null): string | null {
  if (!locationRaw) return null;

  // A resolvable US state (including D.C. and the metro phrases) IS the US
  // signal, and checking it first is what stops "Remote - New Mexico" from
  // matching the country Mexico.
  if (extractLocationState(locationRaw)) return "US";

  const parts = locationParts(locationRaw.trim());

  // An explicit country name is the strongest signal — take it before any city.
  for (let i = parts.length - 1; i >= 0; i--) {
    const iso = COUNTRY_NAME_TO_ISO[parts[i].toLowerCase()];
    if (iso) return iso;
  }

  // Then a known city. Left-to-right: boards write "AU - Sydney" and
  // "London - The River Building HQ", so the place leads and the office suffix
  // trails.
  for (const part of parts) {
    const city = CITY_TO_COUNTRY[part.toLowerCase()];
    if (city) return city;
  }

  // Last resort: leading words of a component ("Toronto Headquarters").
  for (const part of parts) {
    const words = part.toLowerCase().split(/\s+/);
    for (const n of [3, 2, 1]) {
      const head = words.slice(0, n).join(" ");
      if (CITY_TO_COUNTRY[head]) return CITY_TO_COUNTRY[head];
      if (US_METRO_TO_STATE[head]) return "US";
    }
  }

  // Free-text fallback: a country or city name anywhere in the string
  // ("somewhere in united kingdom", "based karachi pakistan").
  return scanWholeString(locationRaw, COUNTRY_NAME_TO_ISO) ?? scanWholeString(locationRaw, CITY_TO_COUNTRY);
}

/**
 * Where a remote job is actually open to: "GLOBAL", a region ("EMEA"), or an
 * ISO-2 country. null = unstated.
 *
 * This is the half of "remote" the old model couldn't express: it had only
 * REMOTE_US and REMOTE_GLOBAL, so "Remote - Poland" had nowhere to go and was
 * stamped REMOTE_US.
 */
export function extractRemoteScope(locationRaw: string | null, descriptionText: string): string | null {
  const loc = locationRaw || "";
  const prose = descriptionText.slice(0, 500);

  if (/\b(us only|united states only|us-based|within the us|us residents)\b/i.test(`${loc} ${prose}`)) return "US";
  if (GLOBAL_LOCATION.test(loc) || GLOBAL_PROSE.test(prose)) return "GLOBAL";

  // The location field is the only reliable evidence of scope.
  const country = extractCountry(locationRaw);
  if (country) return country;

  for (const [re, region] of REGION_PATTERNS) {
    if (loc && re.test(loc)) return region;
  }
  return null;
}

export function extractRemoteType(locationRaw: string | null, descriptionText: string): RemoteType {
  const haystack = `${locationRaw || ""} ${descriptionText.slice(0, 500)}`.toLowerCase();

  if (/\bremote\b/.test(haystack)) {
    const scope = extractRemoteScope(locationRaw, descriptionText);
    if (scope === "GLOBAL") return RemoteType.REMOTE_GLOBAL;
    if (scope === "US") return RemoteType.REMOTE_US;
    // A known non-US scope. This is the case that used to lie: "Remote -
    // Poland" and "Remote (EMEA)" fell through to REMOTE_US and were shown to
    // US seekers as jobs they could take.
    if (scope) return RemoteType.REMOTE_INTL;
    // Scope genuinely unstated. Keeping the historical US default rather than
    // claiming "global" (which would assert eligibility everywhere) — but it
    // IS a guess, and remoteScope stays null so it can be revisited.
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

  // remoteScope only means something for a REMOTE job. Extracting it
  // unconditionally let company boilerplate ("anywhere in the world") stamp
  // GLOBAL onto onsite postings — an onsite Gurugram job then passed the
  // "hireable from anywhere" eligibility check in every country's feed.
  const remoteType = extractRemoteType(input.locationRaw, descriptionText);
  const isRemote = remoteType === RemoteType.REMOTE_US || remoteType === RemoteType.REMOTE_GLOBAL || remoteType === RemoteType.REMOTE_INTL;

  return {
    descriptionText,
    locationState: extractLocationState(input.locationRaw),
    country: extractCountry(input.locationRaw),
    remoteScope: isRemote ? extractRemoteScope(input.locationRaw, descriptionText) : null,
    remoteType,
    employmentType: extractEmploymentType(input.titleRaw, descriptionText, input.leverCommitment),
    salary: extractSalary(descriptionText),
  };
}
