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

export async function resolveSkills(skillNames: string[]): Promise<string[]> {
  const resolvedIds: string[] = [];

  for (const raw of skillNames) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const exact = await prisma.skillAlias.findUnique({
      where: { rawText: trimmed },
      select: { skillId: true },
    });
    if (exact) {
      resolvedIds.push(exact.skillId);
      continue;
    }

    const slug = slugify(trimmed);
    const bySlug = await prisma.skill.findUnique({ where: { slug }, select: { id: true } });
    if (bySlug) {
      await prisma.skillAlias.upsert({
        where: { rawText: trimmed },
        update: {},
        create: { rawText: trimmed, skillId: bySlug.id, resolvedBy: "LLM" },
      });
      resolvedIds.push(bySlug.id);
      continue;
    }

    // Genuinely new skill — create it. Skills taxonomy is meant to grow;
    // unlike roles, we don't want to silently drop unrecognized skills,
    // since under-counting skills directly weakens matching quality.
    const created = await prisma.skill.create({
      data: { slug, name: trimmed },
    });
    await prisma.skillAlias.create({
      data: { rawText: trimmed, skillId: created.id, resolvedBy: "LLM" },
    });
    resolvedIds.push(created.id);
  }

  return resolvedIds;
}
