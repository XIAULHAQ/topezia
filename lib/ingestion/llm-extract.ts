/**
 * Small-model extraction — spec §4.2, rung 2.
 *
 * Only called for what rules (rung 1) couldn't resolve: skills, seniority,
 * role/title mapping when the alias table misses, and Layout B vertical
 * fields (credentials, CDL class, etc.). Always check the cache first —
 * `description_hash` means identical postings (same job on 5 boards) never
 * pay twice, which is most of what keeps this affordable at $1k.
 *
 * Uses Haiku-class model per spec — cheap, fast, good enough for structured
 * extraction. Temperature 0, forced JSON output.
 *
 * Three ways a posting gets extracted, cheapest first (strategy §3.4):
 *   cache   byte-identical title+text already extracted → reuse (free)
 *   rules   title marker + role alias + skill dictionary all agree → no
 *           model (rules-extract.ts; strict, returns null when unsure)
 *   model   synchronously (extractWithLlm — employer publish, reclassify) or
 *           through the Message Batches API at half price (extractMany —
 *           the ingestion script, where nothing needs an answer in seconds).
 * Every path is recorded on the cost page: cache and rules as zero-cost
 * rows (`cache:extract`, `rule:extract`), the model at list or batch price.
 */

import { prisma } from "@/lib/prisma";
import { llm, llmBatch, llmAvailable, recordNoModel, HAIKU, type LlmRequest } from "@/lib/llm";
import { rulesFirstExtraction } from "./rules-extract";
import crypto from "crypto";

const EXTRACTION_MODEL = HAIKU;

// The vertical slugs the model may classify into (must match seeded
// Vertical.slug values, minus the "unsorted" fallback which the pipeline
// assigns itself — never ask the model to pick it).
export const CLASSIFIABLE_VERTICALS = [
  "tech-software",
  "marketing",
  "design-creative",
  "healthcare-allied",
  "trucking-logistics",
  "sales",
  "finance-accounting",
  "customer-support",
  "retail-hospitality",
  "operations-hr",
] as const;

export interface LlmExtraction {
  skills: string[]; // free-text skill names — resolved against the Skill
                     // taxonomy by resolve-taxonomy.ts, not here
  seniority: "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "EXEC" | "NOT_APPLICABLE";
  roleGuess: string; // free-text normalized title, e.g. "backend engineer"
  vertical: string | null; // one of CLASSIFIABLE_VERTICALS, or null if unsure —
                           // drives categorization when the specific role can't
                           // be resolved against the taxonomy (validated by caller)
  verticalFields: Record<string, unknown> | null; // Layout B extras, when relevant
}

export function hashDescription(text: string): string {
  return crypto.createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}

const EXTRACTION_PROMPT = `You extract structured hiring data from a job posting. Return ONLY valid JSON, no prose, matching exactly this shape:

{
  "skills": string[],       // 3-10 concrete skills/tools/technologies mentioned. ATOMIC canonical short names:
                            // one skill per entry — split compounds ("PPC & Google Ads" -> "PPC", "Google Ads");
                            // the shortest standard industry term ("SEO" not "SEO optimization" or "search engine optimization",
                            // "Python" not "experience with Python programming", "Digital Marketing" not "digital marketing strategies")
  "seniority": "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "EXEC" | "NOT_APPLICABLE",
  "roleGuess": string,      // normalized job function in 2-4 words, lowercase, e.g. "backend engineer"
  "vertical": string,       // the single best-fit category for this job, EXACTLY one of:
                            //   "tech-software"      (engineering, data, IT, product, design-in-tech; INCLUDING fleet/telematics/logistics SOFTWARE, hardware & IoT roles)
                            //   "marketing"          (marketing, growth, content, brand, PR, SEO, social)
                            //   "design-creative"    (product/UX design, graphic design, video, illustration)
                            //   "healthcare-allied"  (clinical/allied health: therapy, imaging, lab, pharmacy, nursing)
                            //   "trucking-logistics" (COMMERCIAL DRIVING ONLY: people who physically operate a commercial vehicle — CDL truck drivers (OTR/regional/local), delivery & route drivers, owner-operators, autonomous-vehicle safety/test drivers — and the dispatchers/load planners who route those drivers. If nobody is driving, it is NOT this vertical.)
                            //   "sales"              (account executives, SDRs, sales management, sales engineering)
                            //   "finance-accounting" (accounting, finance, FP&A, bookkeeping)
                            //   "customer-support"   (support, customer success)
                            //   "retail-hospitality" (retail, food service, hospitality, front-of-house)
                            //   "operations-hr"      (operations, HR/people, recruiting, program/project mgmt, admin; INCLUDING warehouse/fulfillment/distribution-center work, inventory, supply-chain planning, and last-mile/logistics OPERATIONS MANAGEMENT that is not itself driving)
                            // Choose the closest fit by the actual work, not the company's industry. Use the exact slug string.
                            // COMMONLY MIS-FILED — read carefully:
                            //   * "Warehouse Associate", "Fulfillment Lead", "Cluster Head - Last Mile", "Inventory Manager", "Supply Chain Planner" -> "operations-hr" (they manage/move goods but do NOT drive commercially).
                            //   * "Telematics Systems Specialist", "Fleet Software Engineer", "Logistics Platform PM" -> "tech-software" (software/hardware for logistics, not driving).
                            //   * Only put a job in "trucking-logistics" when the core duty is driving a commercial vehicle (or dispatching drivers).
  "verticalFields": object | null   // if this is a healthcare or trucking role, extract relevant fields:
                                     // healthcare: { credentialsRequired: string[], shiftType: string|null, contractLengthWeeks: number|null }
                                     // trucking: { cdlClass: string|null, endorsements: string[], payStructure: string|null, homeTime: string|null }
                                     // otherwise: null
}`;

const FAIL_SOFT = (titleRaw: string): LlmExtraction => ({
  skills: [], seniority: "NOT_APPLICABLE", roleGuess: titleRaw.toLowerCase(), vertical: null, verticalFields: null,
});

/** The request the model gets — one place, so sync and batch send the same thing. */
function extractionRequest(titleRaw: string, descriptionText: string): LlmRequest {
  return {
    model: EXTRACTION_MODEL,
    max_tokens: 500,
    temperature: 0,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content: `Title: ${titleRaw}\n\nDescription:\n${descriptionText.slice(0, 4000)}` }], // cap tokens in
  };
}

/** Model text → extraction. Fail soft: an unparseable answer ships the job
 *  with fewer enriched fields rather than dropping it from the index. */
function parseExtraction(text: string, titleRaw: string): LlmExtraction {
  // Model occasionally wraps JSON in a code fence despite instructions —
  // strip defensively rather than let one malformed response kill the run.
  const cleaned = (text || "{}").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned) as LlmExtraction;
  } catch {
    return FAIL_SOFT(titleRaw);
  }
}

/**
 * Cache check — this is the line that keeps ingestion inside budget. Reuses
 * any prior extraction for byte-identical title+description text, regardless
 * of which board it came from.
 */
async function cachedExtraction(hash: string): Promise<LlmExtraction | null> {
  const cached = await prisma.job.findFirst({
    where: { descriptionHash: hash, titleNormalized: { not: null } },
    select: { titleNormalized: true, seniority: true, verticalFields: true, vertical: { select: { slug: true } }, skills: { select: { skill: { select: { name: true } } } } },
  });
  if (!cached) return null;
  return {
    skills: cached.skills.map((s) => s.skill.name),
    seniority: cached.seniority as LlmExtraction["seniority"],
    roleGuess: cached.titleNormalized || "",
    vertical: cached.vertical?.slug ?? null,
    verticalFields: (cached.verticalFields as Record<string, unknown>) || null,
  };
}

export type ExtractionVia = "cache" | "rules" | "model" | "batch" | "failed";

/**
 * Cache → rules → model, for ONE posting, synchronously. The employer publish
 * path and the reclassify script use this; the ingestion script uses
 * extractMany below.
 *
 * skipCache forces a fresh model call (and skips the rules too). The cache
 * returns a prior row's stored vertical/skills/seniority, so after the
 * classifier PROMPT changes it would otherwise keep handing back stale
 * classifications for jobs whose text is unchanged — a re-classification
 * pass must bypass it (see scripts/reclassify-*).
 */
export async function extractWithLlm(
  titleRaw: string,
  descriptionText: string,
  opts: { skipCache?: boolean } = {}
): Promise<LlmExtraction> {
  const hash = hashDescription(`${titleRaw}\n${descriptionText}`);
  if (!opts.skipCache) {
    const cached = await cachedExtraction(hash);
    if (cached) { recordNoModel("ingest.extract", "cache:extract"); return cached; }
    const ruled = await rulesFirstExtraction(titleRaw, descriptionText);
    if (ruled) { recordNoModel("ingest.extract", "rule:extract"); return ruled; }
  }
  const { text } = await llm("ingest.extract", extractionRequest(titleRaw, descriptionText));
  return parseExtraction(text, titleRaw);
}

export type ExtractItem = { key: string; titleRaw: string; descriptionText: string };
export type ExtractManyResult = Map<string, { extraction: LlmExtraction; via: ExtractionVia }>;

/**
 * The same, for a whole run at once. Cache and rules first (cheap DB work,
 * bounded concurrency), then ONE Message Batch for everything left — half
 * price, all features, results usually in minutes — and, if the batch runs
 * past `waitMs`, whatever is still unfinished is done synchronously so the
 * run always completes with every posting extracted.
 *
 * `batch: false` keeps the old per-posting synchronous path (still cache and
 * rules first) — for smoke tests and for when a batch is the wrong tool.
 */
/**
 * The most postings the synchronous fallback will do at full price in one
 * run. On 2026-08-19 a batch failure fell back to 2,304 synchronous calls
 * ($5.23, full price) inside a run the 60-minute timeout then killed before
 * anything was written — the exact bill the batch exists to avoid. Past this
 * many, the rest are left un-extracted (and therefore unwritten), so the
 * next run picks them up through a batch again. Tunable per run.
 */
export const SYNC_FALLBACK_MAX = 200;

export async function extractMany(
  items: ExtractItem[],
  opts: { batch?: boolean; concurrency?: number; waitMs?: number; syncFallbackMax?: number; log?: (line: string) => void } = {}
): Promise<ExtractManyResult> {
  const out: ExtractManyResult = new Map();
  const log = opts.log ?? (() => {});
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const useBatch = opts.batch !== false;
  const syncMax = opts.syncFallbackMax ?? SYNC_FALLBACK_MAX;

  // Pass 1: cache and rules, concurrently.
  const needModel: ExtractItem[] = [];
  await pool(items, concurrency, async (it) => {
    try {
      const hash = hashDescription(`${it.titleRaw}\n${it.descriptionText}`);
      const cached = await cachedExtraction(hash);
      if (cached) { recordNoModel("ingest.extract", "cache:extract"); out.set(it.key, { extraction: cached, via: "cache" }); return; }
      const ruled = await rulesFirstExtraction(it.titleRaw, it.descriptionText);
      if (ruled) { recordNoModel("ingest.extract", "rule:extract"); out.set(it.key, { extraction: ruled, via: "rules" }); return; }
    } catch (err) {
      // A lookup failing (pool timeout, blip) is not a reason to drop the
      // posting or the run — the model can still answer it.
      log(`extraction: lookup failed for ${it.key} (${err instanceof Error ? err.message : err}) — sending to the model`);
    }
    needModel.push(it);
  });
  log(`extraction: ${items.length} postings — ${items.length - needModel.length} from cache/rules, ${needModel.length} for the model`);
  if (needModel.length === 0) return out;

  if (!llmAvailable("ingest.extract")) {
    for (const it of needModel) out.set(it.key, { extraction: FAIL_SOFT(it.titleRaw), via: "failed" });
    log("extraction: model unavailable — shipping the rest with rules-only fields");
    return out;
  }

  // Pass 2: the batch. One retry on a submission failure before giving up
  // on it — a transient 5xx or a network blip should not turn a $0.40 batch
  // into a $5 synchronous run.
  let leftover = needModel;
  if (useBatch) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const outcome = await llmBatch(
          "ingest.extract",
          needModel.map((it) => ({ id: it.key, req: extractionRequest(it.titleRaw, it.descriptionText) })),
          { waitMs: opts.waitMs, log }
        );
        const byKey = new Map(needModel.map((it) => [it.key, it]));
        for (const [key, r] of outcome.results) out.set(key, { extraction: parseExtraction(r.text, byKey.get(key)!.titleRaw), via: "batch" });
        for (const [key, err] of outcome.errors) { log(`extraction: batch error for ${key}: ${err}`); }
        leftover = needModel.filter((it) => !outcome.results.has(it.key));
        if (leftover.length) log(`extraction: ${leftover.length} not finished by the batch`);
        break;
      } catch (err) {
        log(`extraction: batch attempt ${attempt} failed (${err instanceof Error ? err.message : err})`);
      }
    }
  }

  // Pass 3: whatever is left, one call each — but bounded. Beyond syncMax the
  // rest stay un-extracted (so unwritten, so retried next run via a batch);
  // say so loudly, because this is the line between a cheap run and a bill.
  if (leftover.length > syncMax) {
    log(`extraction: ${leftover.length} postings would need synchronous calls at full price — doing ${syncMax}, leaving ${leftover.length - syncMax} for the next run's batch (SYNC_FALLBACK_MAX)`);
    leftover = leftover.slice(0, syncMax);
  } else if (leftover.length) {
    log(`extraction: ${leftover.length} running synchronously`);
  }
  await pool(leftover, concurrency, async (it) => {
    try {
      const { text } = await llm("ingest.extract", extractionRequest(it.titleRaw, it.descriptionText));
      out.set(it.key, { extraction: parseExtraction(text, it.titleRaw), via: "model" });
    } catch (err) {
      log(`extraction: model failed for ${it.key}: ${err instanceof Error ? err.message : err}`);
      out.set(it.key, { extraction: FAIL_SOFT(it.titleRaw), via: "failed" });
    }
  });
  return out;
}

/** Fixed-size worker pool over a list; a slow item never blocks the others. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
