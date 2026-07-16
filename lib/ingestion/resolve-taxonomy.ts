/**
 * Taxonomy resolution — spec §3.3, §4.2.
 *
 * Converts free-text (raw title, LLM's skill guesses) into canonical
 * Role/Skill ids via the alias tables. Alias lookups are cheap (indexed
 * DB reads); this is what makes "React dev" and "Frontend Engineer" match
 * the same role without a model call every time.
 *
 * Unresolved strings get auto-added as MANUAL... actually LLM-sourced
 * aliases (resolvedBy: LLM) so the SAME unresolved string never needs
 * re-resolution — the alias table grows itself over time.
 */

import { prisma } from "@/lib/prisma";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Skill slugs must not collapse distinct technologies. Plain slugify maps
// "C", "C++", and "C#" all to "c" (punctuation stripped), silently merging
// three languages into one skill. Map the collision-causing symbols
// explicitly first. We deliberately do NOT remap ".": seed slugs use the
// plain form (e.g. "Node.js" -> "node-js"), so remapping it would miss the
// seeded skill and create a duplicate instead of resolving to it.
function skillSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\+\+/g, "pp") // C++ -> cpp
    .replace(/#/g, "sharp") // C#  -> csharp
    .replace(/\+/g, "plus") // trailing "+" (e.g. "Notepad++")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function resolveRole(rawTitle: string, roleGuessFromLlm: string | null): Promise<string | null> {
  // 1. Exact alias match on the raw title (cheapest, most common case for
  //    ATS-sourced jobs where titles are fairly standardized).
  const exact = await prisma.roleAlias.findUnique({
    where: { rawText: rawTitle },
    select: { roleId: true },
  });
  if (exact) return exact.roleId;

  // 2. Try the LLM's normalized guess against role slugs directly.
  if (roleGuessFromLlm) {
    const slug = slugify(roleGuessFromLlm);
    const bySlug = await prisma.role.findUnique({ where: { slug }, select: { id: true } });
    if (bySlug) {
      // Record this raw title as a new alias so future identical titles
      // skip the LLM guess entirely (rung 1 rules effectively grow).
      await prisma.roleAlias.upsert({
        where: { rawText: rawTitle },
        update: {},
        create: { rawText: rawTitle, roleId: bySlug.id, resolvedBy: "LLM" },
      });
      return bySlug.id;
    }
  }

  // 3. No match — leave roleId null rather than force a bad mapping. A
  // nightly review job (not built here) can surface unresolved titles
  // for a human to add to the taxonomy.
  return null;
}

/**
 * Resolve a single raw skill name to a canonical Skill id, creating it
 * (reviewed=false, behind the §3.3 review flag) when genuinely new. Returns
 * null for junk the taxonomy shouldn't absorb.
 */
export async function resolveSkill(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Guard against junk before it becomes a permanent taxonomy row. A real
  // skill has at least one letter and isn't a whole sentence. Without this,
  // symbol-only strings slugified to "" and all collapsed into a single
  // empty-slug skill, and long LLM ramblings became "skills".
  if (trimmed.length > 64) return null;
  if (!/[a-z]/i.test(trimmed)) return null;

  const exact = await prisma.skillAlias.findUnique({
    where: { rawText: trimmed },
    select: { skillId: true },
  });
  if (exact) return exact.skillId;

  const slug = skillSlug(trimmed);
  if (!slug) return null; // defensive: nothing usable left after normalization

  const bySlug = await prisma.skill.findUnique({ where: { slug }, select: { id: true } });
  if (bySlug) {
    await prisma.skillAlias.upsert({
      where: { rawText: trimmed },
      update: {},
      create: { rawText: trimmed, skillId: bySlug.id, resolvedBy: "LLM" },
    });
    return bySlug.id;
  }

  // Genuinely new skill — create it. Skills taxonomy is meant to grow; unlike
  // roles, we don't want to silently drop unrecognized skills, since
  // under-counting skills directly weakens matching quality. reviewed defaults
  // to false (schema) — stays behind the review flag (spec §3.3) until vetted.
  const created = await prisma.skill.create({ data: { slug, name: trimmed } });
  await prisma.skillAlias.create({
    data: { rawText: trimmed, skillId: created.id, resolvedBy: "LLM" },
  });
  return created.id;
}

/**
 * Batched skill resolution — maps each (trimmed) raw name to a canonical Skill
 * id, creating new skills as needed. Uses a fixed handful of queries instead of
 * ~2-3 per skill, which is what made résumé parse / ingestion slow against a
 * high-latency DB. Returns a Map so callers that need per-skill data (e.g.
 * profile confidence) can look ids up by name.
 */
export async function resolveSkillsMap(skillNames: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>(); // trimmed name -> skillId

  const cleaned = [...new Set(skillNames.map((n) => n.trim()))].filter(
    (n) => n && n.length <= 64 && /[a-z]/i.test(n)
  );
  if (cleaned.length === 0) return result;

  // 1. Existing aliases (exact raw text).
  const aliases = await prisma.skillAlias.findMany({
    where: { rawText: { in: cleaned } },
    select: { rawText: true, skillId: true },
  });
  const aliasMap = new Map(aliases.map((a) => [a.rawText, a.skillId]));
  const remaining = cleaned.filter((n) => {
    const id = aliasMap.get(n);
    if (id) result.set(n, id);
    return !id;
  });
  if (remaining.length === 0) return result;

  // 2. Existing skills by slug.
  const slugOf = new Map(remaining.map((n) => [n, skillSlug(n)]));
  const slugs = [...new Set([...slugOf.values()].filter(Boolean))];
  const bySlug = slugs.length
    ? await prisma.skill.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })
    : [];
  const slugToId = new Map(bySlug.map((s) => [s.slug, s.id]));

  const newAliases: { rawText: string; skillId: string; resolvedBy: "LLM" }[] = [];
  const newSkillBySlug = new Map<string, string>(); // slug -> name (first wins)
  const needsSkill: string[] = [];
  for (const n of remaining) {
    const slug = slugOf.get(n)!;
    if (!slug) continue;
    const id = slugToId.get(slug);
    if (id) {
      result.set(n, id);
      newAliases.push({ rawText: n, skillId: id, resolvedBy: "LLM" });
    } else {
      if (!newSkillBySlug.has(slug)) newSkillBySlug.set(slug, n);
      needsSkill.push(n);
    }
  }

  // 3. Create genuinely-new skills in one batch, then fetch their ids.
  if (newSkillBySlug.size > 0) {
    await prisma.skill.createMany({
      data: [...newSkillBySlug.entries()].map(([slug, name]) => ({ slug, name })),
      skipDuplicates: true,
    });
    const created = await prisma.skill.findMany({
      where: { slug: { in: [...newSkillBySlug.keys()] } },
      select: { id: true, slug: true },
    });
    const createdSlugToId = new Map(created.map((s) => [s.slug, s.id]));
    for (const n of needsSkill) {
      const id = createdSlugToId.get(slugOf.get(n)!);
      if (id) {
        result.set(n, id);
        newAliases.push({ rawText: n, skillId: id, resolvedBy: "LLM" });
      }
    }
  }

  // 4. Persist all the new aliases in one batch.
  if (newAliases.length > 0) {
    await prisma.skillAlias.createMany({ data: newAliases, skipDuplicates: true });
  }

  return result;
}

export async function resolveSkills(skillNames: string[]): Promise<string[]> {
  const map = await resolveSkillsMap(skillNames);
  // De-duplicate: two raw names can resolve to one skill ("JavaScript" and
  // "javascript"). The caller feeds these into a nested JobSkill create whose
  // PK is (jobId, skillId), so a repeated id would violate the constraint.
  return [...new Set(map.values())];
}
