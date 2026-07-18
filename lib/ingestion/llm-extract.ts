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
 */

import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

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
  "skills": string[],       // 3-10 concrete skills/tools/technologies mentioned, canonical short names (e.g. "Python" not "experience with Python programming")
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

export async function extractWithLlm(
  titleRaw: string,
  descriptionText: string,
  opts: { skipCache?: boolean } = {}
): Promise<LlmExtraction> {
  const hash = hashDescription(`${titleRaw}\n${descriptionText}`);

  // Cache check — this is the line that keeps Slice 2 inside budget.
  // Reuses any prior extraction for byte-identical title+description text,
  // regardless of which board it came from.
  //
  // skipCache forces a fresh model call. The cache returns a prior row's stored
  // vertical/skills/seniority, so after the classifier PROMPT changes it would
  // otherwise keep handing back stale classifications for jobs whose text is
  // unchanged — a re-classification pass must bypass it (see scripts/reclassify-*).
  const cached = opts.skipCache
    ? null
    : await prisma.job.findFirst({
        where: { descriptionHash: hash, titleNormalized: { not: null } },
        select: { titleNormalized: true, seniority: true, verticalFields: true, vertical: { select: { slug: true } }, skills: { select: { skill: { select: { name: true } } } } },
      });

  if (cached) {
    return {
      skills: cached.skills.map((s) => s.skill.name),
      seniority: cached.seniority as LlmExtraction["seniority"],
      roleGuess: cached.titleNormalized || "",
      vertical: cached.vertical?.slug ?? null,
      verticalFields: (cached.verticalFields as Record<string, unknown>) || null,
    };
  }

  const truncatedDescription = descriptionText.slice(0, 4000); // cap tokens in

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 500,
      temperature: 0,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Title: ${titleRaw}\n\nDescription:\n${truncatedDescription}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM extraction failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "{}";

  // Model occasionally wraps JSON in a code fence despite instructions —
  // strip defensively rather than let one malformed response kill the run.
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned) as LlmExtraction;
  } catch {
    // Fail soft — an unparseable extraction shouldn't drop the job from the
    // index, it should just ship with fewer enriched fields.
    return { skills: [], seniority: "NOT_APPLICABLE", roleGuess: titleRaw.toLowerCase(), vertical: null, verticalFields: null };
  }
}
