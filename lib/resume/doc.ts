/**
 * The Resume Builder document: shape, caps, seeding.
 *
 * The PROFILE stores facts — roles, dates, skills. This document stores the
 * WRITTEN resume built on those facts: a professional summary and per-role
 * achievement bullets, which exist nowhere else in the product. It is stored
 * as one JSON blob on ResumeDoc; this module is the shape's only authority.
 *
 * Everything arriving here is member-authored and will be rendered back to
 * them (and printed), so caps exist for the same reason as portfolio's: one
 * runaway field must not break a layout or bloat a row.
 */
import type { Prisma } from "@prisma/client";

export type ResumeExperience = { title: string; company: string; years: string; bullets: string[] };
export type ResumeEducation = { degree: string; institution: string; year: string };

export interface ResumeContent {
  contact: {
    name: string;
    headline: string;
    location: string;
    /** Typed by the member — the Profile deliberately stores no email/phone. */
    email: string;
    phone: string;
    link: string;
  };
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  certifications: string[];
}

export const LIMITS = {
  contactField: 120,
  summary: 900,
  roles: 10,
  bulletsPerRole: 8,
  bullet: 260,
  education: 6,
  skills: 30,
  certifications: 15,
} as const;

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line text (the summary) keeps its paragraph breaks. */
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "";

/**
 * Coerce arbitrary JSON into a valid ResumeContent. Never throws — anything
 * malformed degrades to empty, because this also runs on rows read back from
 * the DB, and a bad historical write must not brick the page.
 */
export function sanitizeContent(raw: unknown): ResumeContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const contact = (r.contact ?? {}) as Record<string, unknown>;

  const experience = (Array.isArray(r.experience) ? r.experience : [])
    .slice(0, LIMITS.roles)
    .map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return {
        title: str(x.title, LIMITS.contactField),
        company: str(x.company, LIMITS.contactField),
        years: str(x.years, 60),
        bullets: (Array.isArray(x.bullets) ? x.bullets : [])
          .map((b) => str(b, LIMITS.bullet))
          .filter(Boolean)
          .slice(0, LIMITS.bulletsPerRole),
      };
    })
    .filter((e) => e.title || e.company);

  const education = (Array.isArray(r.education) ? r.education : [])
    .slice(0, LIMITS.education)
    .map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return { degree: str(x.degree, LIMITS.contactField), institution: str(x.institution, LIMITS.contactField), year: str(x.year, 20) };
    })
    .filter((e) => e.degree || e.institution);

  const strList = (v: unknown, max: number, cap: number) =>
    [...new Set((Array.isArray(v) ? v : []).map((s) => str(s, max)).filter(Boolean))].slice(0, cap);

  return {
    contact: {
      name: str(contact.name, LIMITS.contactField),
      headline: str(contact.headline, LIMITS.contactField),
      location: str(contact.location, LIMITS.contactField),
      email: str(contact.email, LIMITS.contactField),
      phone: str(contact.phone, 40),
      link: str(contact.link, LIMITS.contactField),
    },
    summary: text(r.summary, LIMITS.summary),
    experience,
    education,
    skills: strList(r.skills, 60, LIMITS.skills),
    certifications: strList(r.certifications, LIMITS.contactField, LIMITS.certifications),
  };
}

/** The profile fields seeding needs — matches the select in the API route. */
export interface SeedProfile {
  fullName: string | null;
  headlineName: string | null; // resolved Role name, not the id
  currentLocation: string | null;
  workHistory: unknown;
  education: unknown;
  certifications: string[];
  skills: { name: string; tier: string }[];
}

/**
 * First-open seeding: the resume starts as the profile's facts, so nobody
 * begins from a blank page. Bullets and summary start EMPTY on purpose —
 * they are the written layer this tool exists to add, and pre-filling them
 * with generated prose before the person asked would put words in their
 * mouth. The assist endpoint drafts them on request instead.
 */
export function seedFromProfile(p: SeedProfile): ResumeContent {
  const wh = Array.isArray(p.workHistory) ? p.workHistory : [];
  const edu = Array.isArray(p.education) ? p.education : [];
  // Core skills lead — same ordering logic as the profile's Top skills rail.
  const core = p.skills.filter((s) => s.tier !== "SECONDARY").map((s) => s.name);
  const secondary = p.skills.filter((s) => s.tier === "SECONDARY").map((s) => s.name);

  return sanitizeContent({
    contact: {
      name: p.fullName ?? "",
      headline: p.headlineName ?? "",
      location: p.currentLocation ?? "",
      email: "",
      phone: "",
      link: "",
    },
    summary: "",
    experience: wh.map((w) => {
      const x = (w ?? {}) as Record<string, unknown>;
      return { title: x.title ?? "", company: x.company ?? "", years: x.years ?? "", bullets: [] };
    }),
    education: edu.map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return { degree: x.degree ?? "", institution: x.institution ?? "", year: x.year ?? "" };
    }),
    skills: [...core, ...secondary],
    certifications: p.certifications,
  });
}

/** Prisma-typed helper so routes don't hand-cast the JSON column. */
export const asJson = (c: ResumeContent) => c as unknown as Prisma.InputJsonValue;
