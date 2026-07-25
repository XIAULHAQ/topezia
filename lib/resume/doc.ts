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
/** A portfolio piece: url/thumb are BUILT server-side from the slug/cover —
 *  never member-typed, so the printed link can't be pointed anywhere else. */
export type ResumeProject = { title: string; url: string; thumb: string | null };
export type ResumeLanguage = { name: string; level: string };
export type ResumeRecommendation = { text: string; author: string; role: string };

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
  /** Whether the profile photo (never stored here — always read live from the
   *  profile) appears on the resume. Defaults true; photo-less resumes are a
   *  deliberate choice in many markets, so the preference persists. */
  showPhoto: boolean;
  /** "styled" = the designed navy-header sheet; "ats" = plain single-column
   *  serif with no photo/graphics, for parsers that choke on layout. Same
   *  content either way — this only picks the rendering. */
  template: "styled" | "ats";
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
  certifications: string[];
  projects: ResumeProject[];
  languages: ResumeLanguage[];
  recommendations: ResumeRecommendation[];
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
  projects: 8,
  languages: 8,
  recommendations: 4,
  recommendationText: 500,
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

  // Only OUR portfolio URLs and OUR storage thumbs survive. The rows come
  // from the seed originally, but the saved doc round-trips through the
  // client, so re-checking on every write keeps a tampered payload from
  // planting an arbitrary link or image in a printed document.
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
  const storagePrefix = process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/` : null;
  const projects = (Array.isArray(r.projects) ? r.projects : [])
    .slice(0, LIMITS.projects)
    .map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      const url = typeof x.url === "string" ? x.url.trim() : "";
      const thumb = typeof x.thumb === "string" ? x.thumb.trim() : "";
      const urlOk = url.startsWith(`${site}/portfolio/`) && /^[a-z0-9-]+$/i.test(url.slice(`${site}/portfolio/`.length));
      return {
        title: str(x.title, LIMITS.contactField),
        url: urlOk ? url : "",
        thumb: storagePrefix && thumb.startsWith(storagePrefix) ? thumb : null,
      };
    })
    .filter((e) => e.title && e.url);

  const languages = (Array.isArray(r.languages) ? r.languages : [])
    .slice(0, LIMITS.languages)
    .map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return { name: str(x.name, 60), level: str(x.level, 60) };
    })
    .filter((e) => e.name);

  const recommendations = (Array.isArray(r.recommendations) ? r.recommendations : [])
    .slice(0, LIMITS.recommendations)
    .map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      return { text: str(x.text, LIMITS.recommendationText), author: str(x.author, LIMITS.contactField), role: str(x.role, LIMITS.contactField) };
    })
    .filter((e) => e.text);

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
    // Absent on docs saved before the field existed — default to shown.
    showPhoto: r.showPhoto !== false,
    template: r.template === "ats" ? "ats" : "styled",
    experience,
    education,
    skills: strList(r.skills, 60, LIMITS.skills),
    certifications: strList(r.certifications, LIMITS.contactField, LIMITS.certifications),
    projects,
    languages,
    recommendations,
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
  languages: unknown;
  recommendations: unknown;
  /** Published portfolio pieces, with url/thumb already built by the caller. */
  projects: { title: string; url: string; thumb: string | null }[];
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
    projects: p.projects,
    languages: p.languages,
    recommendations: p.recommendations,
  });
}

/** Prisma-typed helper so routes don't hand-cast the JSON column. */
export const asJson = (c: ResumeContent) => c as unknown as Prisma.InputJsonValue;
