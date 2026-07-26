/**
 * Profile assembly — spec §3.4.
 *
 * Takes a parsed resume + the three preference answers from Screen A and
 * writes the canonical Profile: resolved headline role, taxonomy-resolved
 * skills (with per-skill confidence for the confirm chips), and the profile
 * embedding the matcher retrieves against (§5 stage 1).
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { EmploymentType, EntryPath, RemoteType, SalaryPeriod, SkillSource, SkillTier, WorkAuthorization } from "@prisma/client";
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

/**
 * Text the profile embedding is derived from — spec §3.4 (headline + skills +
 * condensed history). Core skills lead; secondary ones trail behind an "also
 * familiar with" clause, so the vector leans toward what the person IS (a
 * marketing director) rather than everything they can do (also builds
 * websites) — that's what keeps the feed on their actual field.
 */
export function buildProfileEmbeddingInput(parsed: ParsedResume): string {
  const core = parsed.skills.filter((s) => s.tier !== "SECONDARY").map((s) => s.name);
  const secondary = parsed.skills.filter((s) => s.tier === "SECONDARY").map((s) => s.name);
  return [
    parsed.headlineRole || "",
    core.join(", "),
    secondary.length ? `also familiar with: ${secondary.join(", ")}` : "",
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
   *  a questionnaire answer is USER_ADDED (the person asserted it), a resume
   *  parse is RESUME (we read it off the page). Defaults to the resume path. */
  entryPath?: EntryPath;
  /** Profile photo (data URI) extracted from the CV. Only set on create or when
   *  a fresh upload provides one — a re-parse without a photo won't wipe an
   *  existing one. */
  photoUrl?: string | null;
}): Promise<{ profileId: string; embedded: boolean }> {
  const { userId, resumeText, resumeFileUrl, parsed, preferences, entryPath = "RESUME", photoUrl } = params;
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
  const bySkill = new Map<string, { confidence: number; proficiency: ParsedResume["skills"][number]["proficiency"]; tier: "CORE" | "SECONDARY" }>();
  for (const s of parsed.skills) {
    const id = idByName.get(s.name.trim());
    if (!id) continue;
    const prev = bySkill.get(id);
    // Two raw names can collapse to one canonical skill — keep the strongest
    // evidence of each, independently. CORE beats SECONDARY for the same skill.
    const proficiency =
      !prev?.proficiency ? s.proficiency
      : !s.proficiency ? prev.proficiency
      : RANK[s.proficiency] > RANK[prev.proficiency] ? s.proficiency : prev.proficiency;
    const tier = prev?.tier === "CORE" || s.tier === "CORE" ? ("CORE" as const) : ("SECONDARY" as const);
    bySkill.set(id, { confidence: Math.max(prev?.confidence ?? 0, s.confidence), proficiency, tier });
  }

  // New match version on every save → transparently invalidates cached
  // rerank scores for this profile (spec §5, see match.ts).
  const matchVersion = randomUUID();

  // Where they are, as a country — this is what scopes their feed. Derived from
  // the resume's own location line, so most people never answer a question for
  // it. null just means we don't know, and the matcher then filters nothing.
  const country = extractCountry(parsed.currentLocation);

  const profile = await prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      resumeText,
      resumeFileUrl: resumeFileUrl ?? null,
      photoUrl: photoUrl ?? null,
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
      // Only overwrite the photo when this upload actually carried one.
      ...(photoUrl ? { photoUrl } : {}),
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
        tier: v.tier,
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

  await ensurePublicSlug(profile.id, parsed.fullName); // stable /p/{slug} URL

  return { profileId: profile.id, embedded: Boolean(embedding) };
}

/** name → "raheel-ali" (empty → "user"), capped so the slug stays sane. */
function slugifyName(name: string | null): string {
  const base = (name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  return base || "user";
}

/**
 * Give a profile a stable, unique public slug ("raheel-ali-k3m9x2") if it
 * doesn't have one. Retries on the (rare) suffix collision. Best-effort — a
 * failure here never blocks the save.
 */
export async function ensurePublicSlug(profileId: string, fullName: string | null): Promise<string | null> {
  try {
    const cur = await prisma.profile.findUnique({ where: { id: profileId }, select: { publicSlug: true } });
    if (cur?.publicSlug) return cur.publicSlug;
    const base = slugifyName(fullName);
    for (let i = 0; i < 6; i++) {
      const slug = `${base}-${randomUUID().replace(/-/g, "").slice(0, 6)}`;
      try {
        await prisma.profile.update({ where: { id: profileId }, data: { publicSlug: slug } });
        return slug;
      } catch { /* unique collision — try a new suffix */ }
    }
  } catch { /* non-fatal */ }
  return null;
}


export interface ProfileFieldEdit {
  fullName?: string | null;
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
  // Where they may work (no sponsorship) and where they'd move to. These SCOPE
  // THE FEED — see lib/matching/eligibility.ts — so they are normalised to
  // uppercase ISO-2 on write; a stray "us" would silently match nothing.
  authorizedCountries?: string[];
  relocateCountries?: string[];
  skills?: { name: string; proficiency: import("@prisma/client").SkillProficiency | null; source?: SkillSource; tier?: SkillTier }[];
  // Resume-derived history the profile view/edit surfaces. Stored as-is; these
  // don't affect matching (the embedding is built from headline + skills), so
  // editing them never triggers a re-embed.
  workHistory?: { title?: string; company?: string; years?: string }[];
  education?: { degree?: string; institution?: string; year?: string }[];
  certifications?: string[];
  languages?: { name: string; level?: string }[];
  // NOTE: no `recommendations` here, deliberately. Words about a member must
  // come from someone else, through the endorsement request flow — a field
  // the member could type into themselves would undercut every real one.
  photoUrl?: string | null; // set a new photo, or null to remove
  // Public-profile sections the member chose to HIDE — whitelisted keys only.
  hiddenSections?: string[];
  // Public links shown on the profile (own + /p). Display-only — matching
  // never reads them. Normalised/validated on write; null clears.
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
}

/** http(s) URLs only, "linkedin.com/in/x" tolerated (https:// prefixed).
 *  Anything that won't parse — or smuggles another scheme — becomes null
 *  rather than a broken/dangerous anchor on a public page. */
function cleanLinkUrl(v: string | null): string | null {
  if (!v) return null;
  let s = v.trim().slice(0, 300);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function cleanEmail(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/**
 * Edit a profile's structured fields directly — the profile page's save path.
 *
 * Distinct from createOrUpdateProfile, which rebuilds everything from a fresh
 * resume parse. This applies a partial edit to an existing profile: only the
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

  if (edit.fullName !== undefined) data.fullName = edit.fullName;
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
  // ISO-2, uppercased, deduped, capped. A country listed as "authorised" is
  // never also "would relocate" — authorisation already implies you can go.
  const isoList = (xs: string[]) =>
    [...new Set(xs.map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 40);
  if (edit.authorizedCountries !== undefined) data.authorizedCountries = isoList(edit.authorizedCountries);
  if (edit.relocateCountries !== undefined) {
    const authorized = data.authorizedCountries ?? (edit.authorizedCountries ? isoList(edit.authorizedCountries) : null);
    const relocate = isoList(edit.relocateCountries);
    data.relocateCountries = authorized ? relocate.filter((c) => !(authorized as string[]).includes(c)) : relocate;
  }
  if (edit.workHistory !== undefined) data.workHistory = edit.workHistory as unknown as Prisma.InputJsonValue;
  if (edit.education !== undefined) data.education = edit.education as unknown as Prisma.InputJsonValue;
  if (edit.certifications !== undefined) data.certifications = edit.certifications;
  if (edit.languages !== undefined) data.languages = edit.languages as unknown as Prisma.InputJsonValue;
  if (edit.photoUrl !== undefined) data.photoUrl = edit.photoUrl;
  if (edit.hiddenSections !== undefined) {
    const VALID = new Set(["experience", "skills", "education", "certifications", "languages", "publications", "portfolio", "endorsements"]);
    data.hiddenSections = [...new Set(edit.hiddenSections.filter((k) => VALID.has(k)))];
  }
  if (edit.linkedinUrl !== undefined) data.linkedinUrl = cleanLinkUrl(edit.linkedinUrl);
  if (edit.githubUrl !== undefined) data.githubUrl = cleanLinkUrl(edit.githubUrl);
  if (edit.websiteUrl !== undefined) data.websiteUrl = cleanLinkUrl(edit.websiteUrl);
  if (edit.contactEmail !== undefined) data.contactEmail = cleanEmail(edit.contactEmail);

  await prisma.profile.update({ where: { id: existing.id }, data });

  let skillNames: { name: string; tier: SkillTier }[] | null = null;
  if (edit.skills !== undefined) {
    // Preserve provenance: a skill already on the profile keeps its source and
    // confidence (so the "you told us / we inferred" badge survives an edit);
    // one the user just typed is USER_ADDED at confidence 1.0 — asserting a
    // skill is the strongest signal there is.
    const prior = await prisma.profileSkill.findMany({
      where: { profileId: existing.id },
      select: { skillId: true, source: true, confidence: true, tier: true },
    });
    const priorById = new Map(prior.map((p) => [p.skillId, p]));
    const idByName = await resolveSkillsMap(edit.skills.map((s) => s.name));
    const bySkill = new Map<string, { proficiency: import("@prisma/client").SkillProficiency | null; source: SkillSource; confidence: number; tier: SkillTier }>();
    for (const s of edit.skills) {
      const id = idByName.get(s.name.trim());
      if (!id || bySkill.has(id)) continue;
      const was = priorById.get(id);
      bySkill.set(id, {
        proficiency: s.proficiency,
        source: was?.source ?? s.source ?? ("USER_ADDED" as SkillSource),
        confidence: was?.confidence ?? 1.0,
        // The edit is authoritative when it names a tier (the editor's
        // core/secondary toggle); otherwise keep what we knew; brand-new
        // hand-added skills default to CORE — asserting a skill is identity.
        tier: (s.tier ?? was?.tier ?? "CORE") as SkillTier,
      });
    }
    await prisma.profileSkill.deleteMany({ where: { profileId: existing.id } });
    if (bySkill.size > 0) {
      await prisma.profileSkill.createMany({
        data: [...bySkill.entries()].map(([skillId, v]) => ({
          profileId: existing.id, skillId, confidence: v.confidence, proficiency: v.proficiency, source: v.source, tier: v.tier,
        })),
        skipDuplicates: true,
      });
    }
    skillNames = edit.skills.map((s) => ({ name: s.name, tier: (s.tier ?? "CORE") as "CORE" | "SECONDARY" }));
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
      const cur = await prisma.profileSkill.findMany({ where: { profileId: existing.id }, select: { tier: true, skill: { select: { name: true } } } });
      skillNames = cur.map((c) => ({ name: c.skill.name, tier: c.tier }));
    }
    const history = (existing.workHistory as { title: string; company: string }[] | null) ?? [];
    const input = buildProfileEmbeddingInput({
      headlineRole: roleName,
      skills: skillNames.map((s) => ({ name: s.name, confidence: 1, proficiency: null, tier: s.tier })),
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
