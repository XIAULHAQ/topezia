/**
 * Profile-completion checklist — single source of truth for both /profile's
 * own completion meter and the /feed sidebar's missing-info nudge cards.
 * Each item knows where to fix itself: a SectionKey opens that edit-in-place
 * modal, an href goes to a standalone page (e.g. portfolio has no modal).
 */
import type { SectionKey } from "@/app/profile/edit-in-place";

export interface ChecklistProfile {
  headline: string | null;
  photoUrl: string | null;
  currentLocation: string | null;
  skills: unknown[];
  workHistory: unknown[];
  education: unknown[];
  languages?: unknown[] | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
  section?: SectionKey;
  /** Matches a data-field attribute in edit-in-place.tsx, for the /feed nudge
   *  deep link to focus the exact input once the modal opens. */
  field?: string;
  href?: string;
}

export function buildChecklist(p: ChecklistProfile, opts?: { hasPublishedWork?: boolean }): ChecklistItem[] {
  return [
    { label: "Role & field", done: !!p.headline, section: "intro", field: "role" },
    { label: "Photo", done: !!p.photoUrl, section: "intro", field: "photo" },
    { label: "Location", done: !!p.currentLocation, section: "intro", field: "location" },
    { label: "Skills", done: p.skills.length > 0, section: "skills", field: "skills-add" },
    { label: "Experience", done: p.workHistory.length > 0, section: "experience", field: "experience-add" },
    { label: "Education", done: p.education.length > 0, section: "education", field: "education-add" },
    { label: "Languages", done: (p.languages ?? []).length > 0, section: "languages", field: "languages-add" },
    { label: "Links", done: !!(p.linkedinUrl || p.githubUrl || p.websiteUrl), section: "links", field: "links-linkedin" },
    { label: "Published work", done: !!opts?.hasPublishedWork, href: "/portfolio/new" },
  ];
}
