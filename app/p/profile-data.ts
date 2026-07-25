/**
 * Server data layer for the public profile (/p/{slug}[/{tab}]): the prisma
 * fetch, the metadata builder, and the shared types. Kept out of
 * PublicProfile.tsx so the view can be a client component (instant tab
 * switching) without dragging prisma into the client bundle.
 */
import { cache } from "react";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { portfolioImageUrl } from "@/lib/portfolio/storage";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com";
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

export type PublicTab = "overview" | "experience" | "skills" | "projects" | "education";
export const TAB_SLUGS: Exclude<PublicTab, "overview">[] = ["experience", "skills", "projects", "education"];
export interface PubProfile {
  slug: string;
  fullName: string | null;
  photoUrl: string | null;
  headline: string | null;
  field: string | null;
  yearsExperience: number | null;
  currentLocation: string | null;
  isRemote: boolean;
  industries: string[];
  skills: { name: string; proficiency: string | null; tier: string }[];
  workHistory: { title?: string; company?: string; years?: string }[];
  education: { degree?: string; institution?: string; year?: string }[];
  certifications: string[];
  languages: { name: string; level?: string }[];
  /** Member-entered quotes — the UI labels them as added by the member. */
  recommendations: { text: string; author?: string; role?: string }[];
  /** Written by someone else through a request link — never by the member.
   *  Kept separate from `recommendations` because the claim is different. */
  endorsements: {
    id: string; kind: "RECOMMENDATION" | "REVIEW";
    authorName: string; authorRole: string | null;
    /** Did the author hold an account when they wrote it? Endorsements from
     *  before sign-in was required have none, and must not be described as
     *  though they did. */
    signedIn: boolean;
    text: string; rating: number | null;
    work: { title: string; slug: string } | null;
  }[];
  employmentTypes: string[];
  remoteTypes: string[];
  locations: string[];
  /** Published work only — drafts never appear on a public profile. */
  portfolios: { slug: string; title: string; coverUrl: string | null }[];
  /** Papers, books, theses — member-entered, shown with their checkable
   *  identifiers (DOI/ISBN/link) so a reader can verify what we cannot. */
  publications: {
    id: string; type: string; title: string; authors: string[];
    venue: string | null; year: number | null;
    doi: string | null; isbn: string | null; url: string | null;
    abstract: string | null;
  }[];
}

/** Fetch a public profile by slug (cached so page + generateMetadata share one query). */
export const getPublicProfile = cache(async (slug: string): Promise<PubProfile | null> => {
  const p = await prisma.profile.findUnique({
    where: { publicSlug: slug },
    select: {
      publicSlug: true, fullName: true, photoUrl: true, headlineRoleId: true, yearsExperience: true,
      currentLocation: true, industries: true, employmentTypes: true, remoteTypes: true, locations: true,
      workHistory: true, education: true, certifications: true, languages: true, recommendations: true,
      // Only what the member chose to display, newest first.
      endorsements: {
        where: { status: "SUBMITTED" as const, visible: true },
        orderBy: { submittedAt: "desc" as const },
        take: 20,
        select: {
          id: true, kind: true, authorName: true, authorRole: true, text: true, rating: true,
          authorUserId: true,
          portfolio: { select: { title: true, slug: true } },
        },
      },
      skills: { select: { proficiency: true, tier: true, skill: { select: { name: true } } } },
      // PUBLISHED only. A draft is private to its author and must never leak
      // onto their public page.
      portfolios: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 12,
        select: { slug: true, title: true, coverPath: true },
      },
      publications: {
        orderBy: [{ position: "asc" as const }, { createdAt: "desc" as const }],
        take: 25,
        select: {
          id: true, type: true, title: true, authors: true, venue: true,
          year: true, doi: true, isbn: true, url: true, abstract: true,
        },
      },
    },
  });
  if (!p || !p.publicSlug) return null;
  const headline = p.headlineRoleId ? (await prisma.role.findUnique({ where: { id: p.headlineRoleId }, select: { name: true } }))?.name ?? null : null;
  return {
    slug: p.publicSlug,
    fullName: p.fullName,
    photoUrl: p.photoUrl,
    headline,
    field: p.industries[0] ? label(p.industries[0]) : null,
    yearsExperience: p.yearsExperience,
    currentLocation: p.currentLocation,
    isRemote: p.remoteTypes.some((r) => r.startsWith("REMOTE")),
    industries: p.industries,
    skills: p.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency, tier: s.tier })),
    workHistory: (p.workHistory as PubProfile["workHistory"]) ?? [],
    education: (p.education as PubProfile["education"]) ?? [],
    certifications: p.certifications,
    languages: Array.isArray(p.languages) ? (p.languages as PubProfile["languages"]) : [],
    recommendations: Array.isArray(p.recommendations) ? (p.recommendations as PubProfile["recommendations"]) : [],
    endorsements: (p.endorsements ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      authorName: e.authorName ?? "",
      authorRole: e.authorRole,
      signedIn: !!e.authorUserId,
      text: e.text ?? "",
      rating: e.rating,
      work: e.portfolio,
    })).filter((e) => e.text && e.authorName),
    employmentTypes: p.employmentTypes,
    remoteTypes: p.remoteTypes,
    locations: p.locations,
    portfolios: p.portfolios.map((w) => ({ slug: w.slug, title: w.title, coverUrl: portfolioImageUrl(w.coverPath) })),
    publications: p.publications,
  };
});

export function profileMetadata(p: PubProfile, tab: PublicTab): Metadata {
  const name = p.fullName ?? "Topezia member";
  const role = p.headline ?? p.field ?? "professional";
  const tabName = tab === "overview" ? "" : ` · ${label(tab)}`;
  const title = `${name} — ${role}${tabName} | Topezia`;
  const desc = `${name} is ${p.headline ? `a ${p.headline}` : "a professional"}${p.yearsExperience ? ` with ${p.yearsExperience}+ years of experience` : ""}${p.industries.length ? ` in ${p.industries.map(label).join(", ")}` : ""}. See their skills, experience and background on Topezia.`;
  const path = tab === "overview" ? `/p/${p.slug}` : `/p/${p.slug}/${tab}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title, description: desc, url: `${SITE}${path}`, type: "profile", images: p.photoUrl ? [p.photoUrl] : undefined },
    robots: { index: true, follow: true },
  };
}

