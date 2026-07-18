/**
 * Profile assembly — spec §3.4.
 *
 * Takes a parsed résumé + the three preference answers from Screen A and
 * writes the canonical Profile: resolved headline role, taxonomy-resolved
 * skills (with per-skill confidence for the confirm chips), and the profile
 * embedding the matcher retrieves against (§5 stage 1).
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { EmploymentType, EntryPath, RemoteType, SalaryPeriod, SkillSource, WorkAuthorization } from "@prisma/client";
import { resolveRole, resolveSkillsMap } from "@/lib/ingestion/resolve-taxonomy";
import { extractCountry } from "@/lib/ingestion/normalize-rules";
import { embedText, writeProfileEmbedding } from "@/lib/ingestion/embed";
import type { ParsedResume } from "./parse-resume";

export interface ProfilePreferences {
  employmentTypes: EmploymentType[];
  remoteTypes: RemoteType[];
  locations: string[];
  salaryFloor?: number | null; // walk-away minimum — the hard filter
  salaryTarget?: number | null; // what they're aiming for — scoring signal only
  salaryPeriod?: SalaryPeriod | null;
  workAuthorization?: WorkAuthorization | null;
  verticalsOptIn?: string[];
}

/** Text the profile embedding is derived from — spec §3.4 (headline + skills + condensed history). */
export function buildProfileEmbeddingInput(parsed: ParsedResume): string {
  return [
    parsed.headlineRole || "",
    parsed.skills.map((s) => s.name).join(", "),
    parsed.workHistory.map((w) => `${w.title} at ${w.company}`).join("; "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function createOrUpdateProfile(params: {
  userId: string;
  resumeText: string | null;
  resumeFileUrl?: string | null;
  parsed: ParsedResume;
  preferences: ProfilePreferences;
  /** How this profile was built. Drives entryPath + the skills' source badge:
   *  a questionnaire answer is USER_ADDED (the person asserted it), a résumé
   *  parse is RESUME (we read it off the page). Defaults to the résumé path. */
  entryPath?: EntryPath;
}): Promise<{ profileId: string; embedded: boolean }> {
  const { userId, resumeText, resumeFileUrl, parsed, preferences, entryPath = "RESUME" } = params;
  const skillSource: SkillSource = entryPath === "QUESTIONNAIRE" ? "USER_ADDED" : "RESUME";

  // Resolve headline role against the taxonomy (null is fine — matching still
  // works off the embedding + skills).
  const headlineRoleId = parsed.headlineRole
    ? await resolveRole(parsed.headlineRole, parsed.headlineRole)
    : null;

  // Resolve skills in one batch (fast), keeping the highest confidence when two
  // raw names collapse to one canonical skill.
  const idByName = await resolveSkillsMap(parsed.skills.map((s) => s.name));
  const RANK = { FAMILIAR: 1, PROFICIENT: 2, ADVANCED: 3, EXPERT: 4 } as const;
  const bySkill = new Map<string, { confidence: number; proficiency: ParsedResume["skills"][number]["proficiency"] }>();
  for (const s of parsed.skills) {
    const id = idByName.get(s.name.trim());
    if (!id) continue;
    const prev = bySkill.get(id);
    // Two raw names can collapse to one canonical skill — keep the strongest
    // evidence of each, independently.
    const proficiency =
      !prev?.proficiency ? s.proficiency
      : !s.proficiency ? prev.proficiency
      : RANK[s.proficiency] > RANK[prev.proficiency] ? s.proficiency : prev.proficiency;
    bySkill.set(id, { confidence: Math.max(prev?.confidence ?? 0, s.confidence), proficiency });
  }

  // New match version on every save → transparently invalidates cached
  // rerank scores for this profile (spec §5, see match.ts).
  const matchVersion = randomUUID();

  // Where they are, as a country — this is what scopes their feed. Derived from
  // the résumé's own location line, so most people never answer a question for
  // it. null just means we don't know, and the matcher then filters nothing.
  const country = extractCountry(parsed.currentLocation);

  const profile = await prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      resumeText,
      resumeFileUrl: resumeFileUrl ?? null,
      fullName: parsed.fullName,
      headlineRoleId,
      seniority: parsed.seniority,
      yearsExperience: parsed.yearsExperience,
      currentLocation: parsed.currentLocation,
      country,
      industries: parsed.industries,
      workHistory: parsed.workHistory as unknown as Prisma.InputJsonValue,
      education: parsed.education as unknown as Prisma.InputJsonValue,
      certifications: parsed.certifications,
      employmentTypes: preferences.employmentTypes,
      remoteTypes: preferences.remoteTypes,
      locations: preferences.locations,
      salaryFloor: preferences.salaryFloor ?? null,
      salaryTarget: preferences.salaryTarget ?? null,
      salaryPeriod: preferences.salaryPeriod ?? null,
      workAuthorization: preferences.workAuthorization ?? "NOT_SPECIFIED",
      verticalsOptIn: preferences.verticalsOptIn ?? [],
      entryPath,
      matchVersion,
    },
    update: {
      resumeText,
      resumeFileUrl: resumeFileUrl ?? null,
      fullName: parsed.fullName,
      headlineRoleId,
      seniority: parsed.seniority,
      yearsExperience: parsed.yearsExperience,
      currentLocation: parsed.currentLocation,
      country,
      industries: parsed.industries,
      workHistory: parsed.workHistory as unknown as Prisma.InputJsonValue,
      education: parsed.education as unknown as Prisma.InputJsonValue,
      certifications: parsed.certifications,
      employmentTypes: preferences.employmentTypes,
      remoteTypes: preferences.remoteTypes,
      locations: preferences.locations,
      salaryFloor: preferences.salaryFloor ?? null,
      salaryTarget: preferences.salaryTarget ?? null,
      salaryPeriod: preferences.salaryPeriod ?? null,
      workAuthorization: preferences.workAuthorization ?? "NOT_SPECIFIED",
      verticalsOptIn: preferences.verticalsOptIn ?? [],
      entryPath,
      matchVersion,
    },
    select: { id: true },
  });

  // Replace skills wholesale (idempotent re-parse / re-confirm).
  await prisma.profileSkill.deleteMany({ where: { profileId: profile.id } });
  if (bySkill.size > 0) {
    await prisma.profileSkill.createMany({
      data: [...bySkill.entries()].map(([skillId, v]) => ({
        profileId: profile.id,
        skillId,
        confidence: v.confidence,
        proficiency: v.proficiency,
        source: skillSource,
      })),
      skipDuplicates: true,
    });
  }

  // Embedding (skipped gracefully if Voyage isn't configured — matcher then
  // falls back to a skill/keyword path; see match.ts).
  const embedding = await embedText(buildProfileEmbeddingInput(parsed));
  if (embedding) {
    await writeProfileEmbedding(prisma, profile.id, embedding);
  }

  return { profileId: profile.id, embedded: Boolean(embedding) };
}


export interface ProfileFieldEdit {
  headline?: string | null;
  seniority?: import("@prisma/client").Seniority;
  yearsExperience?: number | null;
  currentLocation?: string | null;
  industries?: string[];
  employmentTypes?: EmploymentType[];
  remoteTypes?: RemoteType[];
  locations?: string[];
  salaryFloor?: number | null;
  salaryTarget?: number | null;
  salaryPeriod?: SalaryPeriod | null;
  workAuthorization?: WorkAuthorization;
  skills?: { name: string; proficiency: import("@prisma/client").SkillProficiency | null; source?: SkillSource }[];
  // Résumé-derived history the profile view/edit surfaces. Stored as-is; these
  // don't affect matching (the embedding is built from headline + skills), so
  // editing them never triggers a re-embed.
  workHistory?: { title?: string; company?: string; years?: string }[];
  education?: { degree?: string; institution?: string; year?: string }[];
  certifications?: string[];
}

/**
 * Edit a profile's structured fields directly — the profile page's save path.
 *
 * Distinct from createOrUpdateProfile, which rebuilds everything from a fresh
 * résumé parse. This applies a partial edit to an existing profile: only the
 * keys present in `edit` change. Any edit that touches the matcher's inputs
 * (headline, skills) re-embeds; every edit bumps matchVersion so cached scores
 * are invalidated (§5). Skills edited by hand are marked source=MANUAL and
 * confidence 1.0 — the user asserting a skill is the strongest signal there is.
 */
export async function updateProfileFields(
  userId: string,
  edit: ProfileFieldEdit
): Promise<{ profileId: string; embedded: boolean } | null> {
  const existing = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, headlineRoleId: true, workHistory: true },
  });
  if (!existing) return null;

  const data: Prisma.ProfileUpdateInput = { matchVersion: randomUUID() };

  if (edit.headline !== undefined) {
    data.headlineRoleId = edit.headline ? await resolveRole(edit.headline, edit.headline) : null;
  }
  if (edit.seniority !== undefined) data.seniority = edit.seniority;
  if (edit.yearsExperience !== undefined) data.yearsExperience = edit.yearsExperience;
  if (edit.currentLocation !== undefined) {
    data.currentLocation = edit.currentLocation;
    data.country = extractCountry(edit.currentLocation); // keep feed scope honest
  }
  if (edit.industries !== undefined) data.industries = edit.industries;
  if (edit.employmentTypes !== undefined) data.employmentTypes = edit.employmentTypes;
  if (edit.remoteTypes !== undefined) data.remoteTypes = edit.remoteTypes;
  if (edit.locations !== undefined) data.locations = edit.locations;
  if (edit.salaryFloor !== undefined) data.salaryFloor = edit.salaryFloor;
  if (edit.salaryTarget !== undefined) data.salaryTarget = edit.salaryTarget;
  if (edit.salaryPeriod !== undefined) data.salaryPeriod = edit.salaryPeriod;
  if (edit.workAuthorization !== undefined) data.workAuthorization = edit.workAuthorization;
  if (edit.workHistory !== undefined) data.workHistory = edit.workHistory as unknown as Prisma.InputJsonValue;
  if (edit.education !== undefined) data.education = edit.education as unknown as Prisma.InputJsonValue;
  if (edit.certifications !== undefined) data.certifications = edit.certifications;

  await prisma.profile.update({ where: { id: existing.id }, data });

  let skillNames: string[] | null = null;
  if (edit.skills !== undefined) {
    // Preserve provenance: a skill already on the profile keeps its source and
    // confidence (so the "you told us / we inferred" badge survives an edit);
    // one the user just typed is USER_ADDED at confidence 1.0 — asserting a
    // skill is the strongest signal there is.
    const prior = await prisma.profileSkill.findMany({
      where: { profileId: existing.id },
      select: { skillId: true, source: true, confidence: true },
    });
    const priorById = new Map(prior.map((p) => [p.skillId, p]));
    const idByName = await resolveSkillsMap(edit.skills.map((s) => s.name));
    const bySkill = new Map<string, { proficiency: import("@prisma/client").SkillProficiency | null; source: SkillSource; confidence: number }>();
    for (const s of edit.skills) {
      const id = idByName.get(s.name.trim());
      if (!id || bySkill.has(id)) continue;
      const was = priorById.get(id);
      bySkill.set(id, {
        proficiency: s.proficiency,
        source: was?.source ?? s.source ?? ("USER_ADDED" as SkillSource),
        confidence: was?.confidence ?? 1.0,
      });
    }
    await prisma.profileSkill.deleteMany({ where: { profileId: existing.id } });
    if (bySkill.size > 0) {
      await prisma.profileSkill.createMany({
        data: [...bySkill.entries()].map(([skillId, v]) => ({
          profileId: existing.id, skillId, confidence: v.confidence, proficiency: v.proficiency, source: v.source,
        })),
        skipDuplicates: true,
      });
    }
    skillNames = edit.skills.map((s) => s.name);
  }

  // Re-embed only when an input the embedding is built from changed.
  let embedded = false;
  if (edit.headline !== undefined || edit.skills !== undefined) {
    const roleName = data.headlineRoleId !== undefined
      ? edit.headline ?? ""
      : existing.headlineRoleId
        ? (await prisma.role.findUnique({ where: { id: existing.headlineRoleId }, select: { name: true } }))?.name ?? ""
        : "";
    if (skillNames === null) {
      const cur = await prisma.profileSkill.findMany({ where: { profileId: existing.id }, select: { skill: { select: { name: true } } } });
      skillNames = cur.map((c) => c.skill.name);
    }
    const history = (existing.workHistory as { title: string; company: string }[] | null) ?? [];
    const input = buildProfileEmbeddingInput({
      headlineRole: roleName,
      skills: skillNames.map((name) => ({ name, confidence: 1, proficiency: null })),
      workHistory: history,
    } as ParsedResume);
    const embedding = await embedText(input);
    if (embedding) {
      await writeProfileEmbedding(prisma, existing.id, embedding);
      embedded = true;
    }
  }

  return { profileId: existing.id, embedded };
}
