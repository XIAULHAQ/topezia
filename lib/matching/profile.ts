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
import type { EmploymentType, RemoteType, SalaryPeriod, SkillSource, WorkAuthorization } from "@prisma/client";
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
}): Promise<{ profileId: string; embedded: boolean }> {
  const { userId, resumeText, resumeFileUrl, parsed, preferences } = params;

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
      entryPath: "RESUME",
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
        source: "RESUME" as SkillSource,
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
