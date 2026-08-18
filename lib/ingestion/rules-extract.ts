/**
 * Rules-first extraction — Phase 1 §3.4 of docs/ai-cost-strategy.md.
 *
 * The extraction model answers four things per posting: skills, seniority,
 * a normalised role, and a vertical. For a good share of ATS postings all
 * four are already knowable from what we have on disk:
 *
 *   role + vertical  the RoleAlias table (2.5k exact titles → 65 roles, each
 *                    hand-mapped to a vertical) — the same rung 1 the pipeline
 *                    already trusts OVER the model's vertical guess;
 *   seniority        a title marker, but only the ones that agree with the
 *                    model ≥ 85% of the time on the 20k jobs it has already
 *                    labelled (measured 2026-08-19: intern 100%, junior 88%,
 *                    senior 89%, "head of" 89%, VP 82% — while "lead",
 *                    "manager", "director" and "associate" split 40/60 and
 *                    stay with the model);
 *   skills           a dictionary pass over the Skill taxonomy and its
 *                    aliases (the model's own past output, canonicalised),
 *                    matched as whole-word n-grams in the posting text.
 *
 * When ALL of those resolve — and the vertical is not one that needs
 * Layout-B fields (healthcare, trucking) — the posting never reaches the
 * model. When any of them doesn't, return null and the model does the whole
 * job as before; a partial rules result is never mixed with a model result,
 * so there is exactly one author per posting.
 *
 * Deliberately strict: a wrong extraction lives on the job forever (the
 * hash cache serves it to every duplicate), so "not sure → model" is the
 * only safe default.
 *
 * OFF BY DEFAULT (INGEST_RULES_FIRST=1 to enable). Measured 2026-08-19 with
 * scripts/eval-rules-extract.ts on 200 model-labelled jobs: fires on 5%,
 * seniority agrees 80%, but only 12% of the dictionary's skills are ones the
 * model would have attached — the alias table is the model's raw output and
 * matches a different vocabulary than its curated answers. Until the skill
 * dictionary is curated (26 reviewed skills today) this would put worse
 * skills on 5% of jobs to save a rounding error; the Batch API is where the
 * §3.4 saving actually comes from. Re-run the eval after curating; ship it
 * when rules skills overlap the model's ≥70%.
 */
import { prisma } from "@/lib/prisma";
import { resolveRole } from "./resolve-taxonomy";
import type { LlmExtraction } from "./llm-extract";

/** Verticals whose postings carry extra structured fields only the model
 *  extracts (credentials, CDL class, ...). Always the model. */
const LAYOUT_B = new Set(["healthcare-allied", "trucking-logistics"]);

/** Fewer than this many specific skills → the model. */
const MIN_SKILLS = 3;
const MAX_SKILLS = 10;

/* ── seniority ─────────────────────────────────────────────────────────── */

const SENIORITY_RULES: [RegExp, LlmExtraction["seniority"]][] = [
  [/\b(?:intern|internship|trainee)\b/i, "INTERN"],
  [/\b(?:vp|vice president|svp|evp)\b/i, "EXEC"],
  [/\bhead of\b/i, "LEAD"],
  [/\b(?:junior|jr\.?|entry[- ]level|graduate|apprentice)\b/i, "JUNIOR"],
  [/\b(?:senior|sr\.?)\b/i, "SENIOR"],
];

/** Titles where a marker is present but the level is genuinely mixed
 *  ("Senior Engineering Manager" is LEAD to the model, "Senior Director"
 *  is not SENIOR) — leave those to the model. */
const AMBIGUOUS = /\b(?:manager|director|lead|principal|staff|architect|associate|supervisor|chief|c[etfom]o|partner)\b/i;

/** Null when the title carries no reliable marker. Ordered so a "Senior VP"
 *  is EXEC and a "Senior Intern" (they exist) is INTERN. */
export function seniorityFromTitle(titleRaw: string): LlmExtraction["seniority"] | null {
  for (const [re, s] of SENIORITY_RULES) {
    if (!re.test(titleRaw)) continue;
    if ((s === "SENIOR" || s === "JUNIOR") && AMBIGUOUS.test(titleRaw)) return null;
    return s;
  }
  return null;
}

/* ── skills dictionary ─────────────────────────────────────────────────── */

/** Terms that match nearly every posting and say nothing about it. Counted
 *  but never counted TOWARDS the minimum, and listed last. */
const GENERIC = new Set([
  "communication", "communication skills", "written communication", "verbal communication", "interpersonal skills",
  "teamwork", "collaboration", "leadership", "management", "organization", "organizational skills", "problem solving",
  "problem-solving", "time management", "attention to detail", "detail oriented", "customer service", "planning",
  "analysis", "analytical skills", "reporting", "training", "research", "writing", "presentation", "presentations",
  "negotiation", "flexibility", "multitasking", "adaptability", "creativity", "work ethic", "self motivated",
  "self-motivated", "fast paced", "fast-paced", "microsoft office", "ms office", "office", "excel", "word", "powerpoint",
  "outlook", "email", "english", "sales", "marketing", "support", "documentation", "scheduling", "coordination",
  "critical thinking", "decision making", "team player", "mentoring", "coaching", "strategy", "operations",
  "project management", "stakeholder management", "budgeting", "compliance", "process improvement", "quality",
]);

type Dictionary = { terms: Map<string, string>; maxWords: number; loadedAt: number };
let dictionary: Dictionary | null = null;
const DICTIONARY_TTL_MS = 10 * 60 * 1000;

const tokenize = (s: string): string[] => s.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*[a-z0-9+#]|[a-z0-9]/g) ?? [];
const canon = (s: string) => tokenize(s).join(" ");

/**
 * Every skill name and alias, canonicalised the same way the posting text
 * will be. Loaded once per process (refreshed every 10 min): ~30k terms.
 * Terms under 3 characters and terms with no letters are dropped — "R",
 * "Go" and "C" are real skills but match far too much prose to trust here.
 */
async function loadDictionary(): Promise<Dictionary> {
  if (dictionary && Date.now() - dictionary.loadedAt < DICTIONARY_TTL_MS) return dictionary;
  const [skills, aliases] = await Promise.all([
    prisma.skill.findMany({ select: { name: true } }),
    prisma.skillAlias.findMany({ select: { rawText: true, skill: { select: { name: true } } } }),
  ]);
  const terms = new Map<string, string>();
  let maxWords = 1;
  const add = (raw: string, name: string) => {
    const c = canon(raw);
    if (c.length < 3 || c.length > 40 || !/[a-z]/.test(c) || /^\d+\+? years?/.test(c)) return;
    const words = c.split(" ").length;
    if (words > 5) return;
    maxWords = Math.max(maxWords, words);
    if (!terms.has(c)) terms.set(c, name);
  };
  for (const s of skills) add(s.name, s.name);
  for (const a of aliases) add(a.rawText, a.skill.name);
  dictionary = { terms, maxWords, loadedAt: Date.now() };
  return dictionary;
}

/**
 * Whole-word n-gram lookup of the posting against the dictionary. Returns
 * canonical skill names, most specific (longest match) first, generic terms
 * last, capped. `specific` is how many non-generic terms matched — the
 * number the minimum is judged on.
 */
export async function skillsFromDictionary(text: string): Promise<{ skills: string[]; specific: number }> {
  const dict = await loadDictionary();
  const words = tokenize(text);
  const hits = new Map<string, { name: string; words: number; generic: boolean }>();
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= dict.maxWords && i + n <= words.length; n++) {
      const gram = words.slice(i, i + n).join(" ");
      const name = dict.terms.get(gram);
      if (name && !hits.has(name)) hits.set(name, { name, words: n, generic: GENERIC.has(gram) || GENERIC.has(name.toLowerCase()) });
    }
  }
  const all = [...hits.values()].sort((a, b) => Number(a.generic) - Number(b.generic) || b.words - a.words || a.name.localeCompare(b.name));
  return { skills: all.slice(0, MAX_SKILLS).map((h) => h.name), specific: all.filter((h) => !h.generic).length };
}

/* ── the rule ──────────────────────────────────────────────────────────── */

export type RulesExtraction = LlmExtraction & { roleId: string };

/**
 * The whole extraction from rules, or null. Null is the common case and the
 * safe one; see the file comment for what has to line up.
 */
export function rulesFirstEnabled(): boolean {
  return process.env.INGEST_RULES_FIRST === "1" || process.env.INGEST_RULES_FIRST === "true";
}

export async function rulesFirstExtraction(titleRaw: string, descriptionText: string): Promise<RulesExtraction | null> {
  if (!rulesFirstEnabled()) return null;
  return rulesFirstExtractionUnconditional(titleRaw, descriptionText);
}

/** The rule itself, flag ignored — what the eval script measures. */
export async function rulesFirstExtractionUnconditional(titleRaw: string, descriptionText: string): Promise<RulesExtraction | null> {
  const seniority = seniorityFromTitle(titleRaw);
  if (!seniority) return null;

  // Rungs 1–2 of resolveRole only (no model guess to try) — pure lookups.
  const roleId = await resolveRole(titleRaw, null);
  if (!roleId) return null;
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true, vertical: { select: { slug: true } } } });
  if (!role?.vertical || LAYOUT_B.has(role.vertical.slug)) return null;

  const { skills, specific } = await skillsFromDictionary(`${titleRaw}\n${descriptionText}`);
  if (specific < MIN_SKILLS) return null;

  return {
    skills,
    seniority,
    roleGuess: role.name.toLowerCase(),
    vertical: role.vertical.slug,
    verticalFields: null,
    roleId,
  };
}
