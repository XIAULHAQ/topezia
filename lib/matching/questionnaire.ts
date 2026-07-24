/**
 * Trucking questionnaire → Profile (spec §3.4, "alternate entry path").
 *
 * The resume path runs an LLM to guess structure; a driver's profile is fully
 * determined by 8 answers, so this maps them DETERMINISTICALLY into the exact
 * same ParsedResume + preferences shape createOrUpdateProfile already writes —
 * no model call (no Anthropic spend), just the Voyage embedding downstream. The
 * driver lands on the same /feed, matched by the same engine, as everyone else.
 */
import type { Seniority, SkillProficiency, SalaryPeriod } from "@prisma/client";
import type { ParsedResume } from "./parse-resume";
import type { ProfilePreferences } from "./profile";

export type CdlClass = "A" | "B" | "C" | "NONE";
export type RoutePreference = "OTR" | "REGIONAL" | "LOCAL";
export type HomeTime = "DAILY" | "WEEKLY" | "BIWEEKLY";
export type Endorsement = "HAZMAT" | "TANKER" | "DOUBLES_TRIPLES" | "PASSENGER" | "SCHOOL_BUS";
export type Freight = "DRY_VAN" | "REEFER" | "FLATBED" | "TANKER" | "AUTO_CARRIER" | "INTERMODAL" | "OVERSIZE";
export type PayPeriod = "YEAR" | "HOUR" | "PER_MILE";

/** The 8 answers, spec §3.4. */
export interface TruckingAnswers {
  fullName?: string | null;
  location?: string | null; // "Dallas, TX" — scopes the feed by country, like a resume's header
  cdlClass: CdlClass;
  endorsements: Endorsement[];
  yearsDriving: number;
  routePreference: RoutePreference;
  homeTime: HomeTime;
  freight: Freight[];
  cleanRecord: boolean;
  payFloor: number | null;
  payPeriod: PayPeriod;
}

// Route → the taxonomy role. NB the OTR role's slug is "otr-driver", so the
// label here must be "OTR Driver" (it slugifies to that), not "OTR Truck
// Driver". Regional/Local slugify to their exact seed slugs.
const ROUTE_ROLE: Record<RoutePreference, string> = {
  OTR: "OTR Driver",
  REGIONAL: "Regional CDL Driver",
  LOCAL: "Local CDL Driver",
};
const ROUTE_SKILL: Record<RoutePreference, string> = {
  OTR: "OTR / Long-Haul",
  REGIONAL: "Regional Routes",
  LOCAL: "Local Delivery",
};
export const ENDORSEMENT_LABEL: Record<Endorsement, string> = {
  HAZMAT: "Hazmat Endorsement",
  TANKER: "Tanker Endorsement",
  DOUBLES_TRIPLES: "Doubles/Triples Endorsement",
  PASSENGER: "Passenger Endorsement",
  SCHOOL_BUS: "School Bus Endorsement",
};
export const FREIGHT_LABEL: Record<Freight, string> = {
  DRY_VAN: "Dry Van",
  REEFER: "Reefer (Refrigerated)",
  FLATBED: "Flatbed",
  TANKER: "Tanker Freight",
  AUTO_CARRIER: "Auto Hauling",
  INTERMODAL: "Intermodal",
  OVERSIZE: "Oversize / Heavy Haul",
};
const HOME_TIME_PROSE: Record<HomeTime, string> = {
  DAILY: "home daily",
  WEEKLY: "home weekly",
  BIWEEKLY: "home every 2–3 weeks",
};

// Driving experience → seniority. It caps at SENIOR: there is no "lead"/"exec"
// driver, and inflating it would distort the seniority-fit stat on the feed.
function seniorityFor(years: number): Seniority {
  if (years >= 7) return "SENIOR";
  if (years >= 2) return "MID";
  return "JUNIOR";
}
function proficiencyFor(years: number): SkillProficiency {
  if (years >= 7) return "EXPERT";
  if (years >= 3) return "ADVANCED";
  return "PROFICIENT";
}

/**
 * Map the 8 answers to the canonical Profile inputs. Every skill is confidence
 * 1.0 (the driver asserted it directly — the strongest signal there is) and
 * gets source USER_ADDED at the call site.
 */
export function buildTruckingProfile(a: TruckingAnswers): {
  parsed: ParsedResume;
  preferences: ProfilePreferences;
  resumeText: string;
} {
  const prof = proficiencyFor(a.yearsDriving);
  const skills: ParsedResume["skills"] = [];
  const push = (name: string, proficiency: SkillProficiency = prof) =>
    skills.push({ name, confidence: 1, proficiency, tier: "CORE" }); // questionnaire skills ARE the person's line of work

  push("Commercial Driving", prof);
  if (a.cdlClass !== "NONE") push(`CDL Class ${a.cdlClass}`, prof);
  push(ROUTE_SKILL[a.routePreference]);
  for (const e of a.endorsements) push(ENDORSEMENT_LABEL[e]);
  for (const f of a.freight) push(FREIGHT_LABEL[f]);
  if (a.cleanRecord) push("Clean Driving Record", "PROFICIENT");

  // CDL + endorsements are licenses/certifications, so record them there too
  // (accurate, and where the profile page shows credentials).
  const certifications: string[] = [];
  if (a.cdlClass !== "NONE") certifications.push(`Commercial Driver's License (CDL) Class ${a.cdlClass}`);
  for (const e of a.endorsements) certifications.push(ENDORSEMENT_LABEL[e]);

  const parsed: ParsedResume = {
    fullName: a.fullName?.trim() || null,
    headlineRole: ROUTE_ROLE[a.routePreference],
    seniority: seniorityFor(a.yearsDriving),
    yearsExperience: a.yearsDriving,
    currentLocation: a.location?.trim() || null,
    industries: ["trucking", "transportation"],
    skills,
    workHistory: [],
    education: [],
    certifications,
  };

  const preferences: ProfilePreferences = {
    // Left EMPTY on purpose: employmentTypes and remoteTypes are HARD filters in
    // the matcher (match.ts), and the driver never chose them — assuming
    // "full-time only" / "onsite only" would silently hide part-time or
    // mislabeled driving jobs they'd actually take. Their answers drive matching
    // through skills + the embedding instead; they can add these filters later
    // from their profile. (Only the pay floor they explicitly gave stays a filter.)
    employmentTypes: [],
    remoteTypes: [],
    locations: a.location?.trim() ? [a.location.trim()] : [],
    salaryFloor: a.payFloor ?? null,
    salaryTarget: null,
    salaryPeriod: a.payFloor != null ? (a.payPeriod as SalaryPeriod) : null,
    workAuthorization: "NOT_SPECIFIED",
    verticalsOptIn: ["trucking-logistics"],
  };

  // A short prose summary so nothing the driver told us is lost — stored in
  // resumeText (shown honestly on the profile) and the only place home-time
  // lives, since the schema has no column for it.
  const resumeText = [
    `${a.cdlClass !== "NONE" ? `CDL Class ${a.cdlClass} ` : ""}commercial driver with ${a.yearsDriving} year${a.yearsDriving === 1 ? "" : "s"} of experience.`,
    a.endorsements.length
      ? `Endorsements: ${a.endorsements.map((e) => ENDORSEMENT_LABEL[e].replace(" Endorsement", "")).join(", ")}.`
      : "",
    `Prefers ${a.routePreference === "OTR" ? "long-haul (OTR)" : a.routePreference.toLowerCase()} routes, ${HOME_TIME_PROSE[a.homeTime]}.`,
    a.freight.length ? `Freight experience: ${a.freight.map((f) => FREIGHT_LABEL[f]).join(", ")}.` : "",
    a.cleanRecord ? "Clean driving record." : "",
    a.payFloor != null
      ? `Seeking at least $${a.payFloor.toLocaleString()} ${a.payPeriod === "PER_MILE" ? "per mile" : `per ${a.payPeriod.toLowerCase()}`}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { parsed, preferences, resumeText };
}

/* ────────────────────────────────────────────────────────────────────────────
 * General (no-resume) entry — the same pattern, without the vertical.
 *
 * The trucking questionnaire proved the shape: a handful of asserted answers
 * map deterministically into the exact Profile the resume flow produces, no
 * LLM call, same feed, same matcher. This generalises it for everyone else
 * who simply doesn't have a resume — students, career changers, people whose
 * work never needed one.
 *
 * It stays deliberately SMALL. The seed is role + seniority + years +
 * location + a few skills; everything else (experience, education,
 * certifications, photo) is added afterwards through the profile's
 * edit-in-place modals, which are a better form than any long signup page.
 * ──────────────────────────────────────────────────────────────────────── */

export interface GeneralAnswers {
  fullName?: string | null;
  location?: string | null;
  /** From the role picker (taxonomy names), so it resolves to a real Role. */
  role: string;
  seniority: Seniority;
  yearsExperience: number;
  /** Typed by the person. Each is asserted directly — confidence 1, CORE. */
  skills: string[];
}

export function buildGeneralProfile(a: GeneralAnswers): {
  parsed: ParsedResume;
  preferences: ProfilePreferences;
  resumeText: string;
} {
  const skills: ParsedResume["skills"] = a.skills.map((name) => ({
    name,
    confidence: 1,
    // Proficiency is left NULL, not derived: years-overall says how long
    // someone has worked, not how good they are at each individual skill they
    // typed. The trucking path derives it because driving IS the one skill —
    // that logic doesn't transfer. Levels are one tap away in edit-in-place.
    proficiency: null,
    tier: "CORE" as const,
  }));

  const parsed: ParsedResume = {
    fullName: a.fullName?.trim() || null,
    headlineRole: a.role,
    seniority: a.seniority,
    yearsExperience: a.yearsExperience,
    currentLocation: a.location?.trim() || null,
    industries: [],
    skills,
    workHistory: [],
    education: [],
    certifications: [],
  };

  // Same reasoning as the trucking path: employmentTypes and remoteTypes are
  // HARD filters the person never chose — leaving them empty hides nothing.
  const preferences: ProfilePreferences = {
    employmentTypes: [],
    remoteTypes: [],
    locations: a.location?.trim() ? [a.location.trim()] : [],
    salaryFloor: null,
    salaryTarget: null,
    salaryPeriod: null,
    workAuthorization: "NOT_SPECIFIED",
    verticalsOptIn: [],
  };

  const resumeText = [
    `${a.role} with ${a.yearsExperience} year${a.yearsExperience === 1 ? "" : "s"} of experience.`,
    a.skills.length ? `Skills: ${a.skills.join(", ")}.` : "",
    a.location?.trim() ? `Based in ${a.location.trim()}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { parsed, preferences, resumeText };
}
