/**
 * Profile assembly — spec §3.4.
 *
 * Takes a parsed résumé + the three preference answers from Screen A and
 * writes the canonical Profile: resolved headline role, taxonomy-resolved
 * skills (with per-skill confidence for the confirm chips), and the profile
 * embedding the matcher retrieves against (§5 stage 1).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { EmploymentType, RemoteType, SalaryPeriod, SkillSource } from "@prisma/client";
import { resolveRole, resolveSkill } from "@/lib/ingestion/resolve-taxonomy";
import { embedText, writeProfileEmbedding } from "@/lib/ingestion/embed";
import type { ParsedResume } from "./parse-resume";

export interface ProfilePreferences {
  employmentTypes: EmploymentType[];
  remoteTypes: RemoteType[];
  locations: string[];
  salaryFloor?: number | null;
  salaryPeriod?: SalaryPeriod | null;
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

  // Resolve skills, keeping the highest confidence when two raw names collapse
  // to one canonical skill.
  const skillConfidence = new Map<string, number>();
  for (const s of parsed.skills) {
    const id = await resolveSkill(s.name);
    if (!id) continue;
    skillConfidence.set(id, Math.max(skillConfidence.get(id) ?? 0, s.confidence));
  }

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
      workHistory: parsed.workHistory as unknown as Prisma.InputJsonValue,
      education: parsed.education as unknown as Prisma.InputJsonValue,
      certifications: parsed.certifications,
      employmentTypes: preferences.employmentTypes,
      remoteTypes: preferences.remoteTypes,
      locations: preferences.locations,
      salaryFloor: preferences.salaryFloor ?? null,
      salaryPeriod: preferences.salaryPeriod ?? null,
      verticalsOptIn: preferences.verticalsOptIn ?? [],
      entryPath: "RESUME",
    },
    update: {
      resumeText,
      resumeFileUrl: resumeFileUrl ?? null,
      fullName: parsed.fullName,
      headlineRoleId,
      seniority: parsed.seniority,
      yearsExperience: parsed.yearsExperience,
      workHistory: parsed.workHistory as unknown as Prisma.InputJsonValue,
      education: parsed.education as unknown as Prisma.InputJsonValue,
      certifications: parsed.certifications,
      employmentTypes: preferences.employmentTypes,
      remoteTypes: preferences.remoteTypes,
      locations: preferences.locations,
      salaryFloor: preferences.salaryFloor ?? null,
      salaryPeriod: preferences.salaryPeriod ?? null,
      verticalsOptIn: preferences.verticalsOptIn ?? [],
    },
    select: { id: true },
  });

  // Replace skills wholesale (idempotent re-parse / re-confirm).
  await prisma.profileSkill.deleteMany({ where: { profileId: profile.id } });
  if (skillConfidence.size > 0) {
    await prisma.profileSkill.createMany({
      data: [...skillConfidence.entries()].map(([skillId, confidence]) => ({
        profileId: profile.id,
        skillId,
        confidence,
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
