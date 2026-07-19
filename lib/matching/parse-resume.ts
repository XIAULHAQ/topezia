/**
 * Resume parsing — spec §3.4, §6.1 (parse-confirmation screen).
 *
 * Turns raw resume text into the structured Profile shape the confirm screen
 * edits and the matcher reads. Haiku-class model, temperature 0, JSON output —
 * same cost discipline as ingestion (§4.2). Per-skill confidence drives the
 * solid-vs-dashed "confirm?" chips on Screen A.
 */

import type { Seniority, SkillProficiency } from "@prisma/client";

const PARSE_MODEL = "claude-haiku-4-5-20251001";

const VALID_PROFICIENCY: SkillProficiency[] = ["FAMILIAR", "PROFICIENT", "ADVANCED", "EXPERT"];

export interface ParsedSkill {
  name: string;
  /** 0-1: did the resume actually SAY this? Drives the "confirm?" chip. */
  confidence: number;
  /** How good are they? Inferred from years, seniority and depth of use.
   *  Deliberately separate from confidence — a resume can state a skill
   *  unambiguously (confidence 1.0) that the person has barely touched. */
  proficiency: SkillProficiency | null;
  /** CORE = what their roles were hired to do (professional identity);
   *  SECONDARY = a real adjacent capability ("I also build websites").
   *  Matching and stats lead with CORE. */
  tier: "CORE" | "SECONDARY";
}

export interface ParsedResume {
  fullName: string | null;
  headlineRole: string | null; // free-text, e.g. "backend engineer" — resolved to a Role later
  seniority: Seniority;
  yearsExperience: number | null;
  currentLocation: string | null; // where they are now — not where they'd work
  industries: string[]; // sectors they've worked in
  skills: ParsedSkill[];
  workHistory: { title: string; company: string; years?: string }[];
  education: { degree: string; institution: string; year?: string }[];
  certifications: string[];
}

const PARSE_PROMPT = `You parse a job seeker's resume into structured JSON. Return ONLY valid JSON, no prose, matching exactly:

{
  "fullName": string | null,
  "headlineRole": string,            // their primary job function in 2-4 words, lowercase, e.g. "backend engineer", "physical therapist", "account executive"
  "seniority": "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "EXEC" | "NOT_APPLICABLE",
  "yearsExperience": number | null,  // total years of relevant professional experience
  "currentLocation": string | null,  // where THEY are (e.g. "San Diego, CA"), from the resume header. null if absent — never guess from employer locations
  "industries": string[],            // 1-4 sectors they've actually worked in, lowercase (e.g. "healthcare", "b2b saas", "logistics")
  "skills": [ { "name": string, "confidence": number, "proficiency": "FAMILIAR" | "PROFICIENT" | "ADVANCED" | "EXPERT", "tier": "CORE" | "SECONDARY" } ],
                                     // 5-15 concrete skills. name must be ATOMIC and CANONICAL:
                                     //   - one skill per entry — split compounds: "PPC & Google Adwords" -> two entries "PPC" and "Google Ads";
                                     //     "wordpress & woocommerce" -> "WordPress" and "WooCommerce".
                                     //   - use the shortest standard industry term: "SEO" (never "SEO optimization" / "search engine optimization"),
                                     //     "Digital Marketing" (never "digital marketing strategies"), "Google Ads" (never "Google Adwords").
                                     //     Job postings use these canonical names — matching depends on them being identical.
                                     // confidence = did the resume SAY it: 1.0 explicitly listed/used, 0.5-0.7 only implied by their roles.
                                     // proficiency = how GOOD they are, inferred from years using it, the seniority of roles where it appears, and depth of described work.
                                     //   FAMILIAR = mentioned in passing; PROFICIENT = used regularly; ADVANCED = deep sustained use; EXPERT = leads/teaches it.
                                     // These are independent: a resume can clearly list a skill (confidence 1.0) the person has barely used (FAMILIAR).
                                     // tier = is this skill WHAT THEY ARE, or something they also know?
                                     //   CORE = central to the jobs they were actually hired for — judge from their job TITLES, the work described
                                     //          in their most recent/senior roles, and their headline. These define their professional identity.
                                     //   SECONDARY = a genuine capability that is adjacent or supporting — tools/crafts they use or mention but were
                                     //          not the reason they were hired. Example: a Director of Digital Marketing who also builds websites,
                                     //          e-commerce stores and designs graphics -> SEO/PPC/marketing strategy are CORE; web development,
                                     //          e-commerce and graphic design are SECONDARY. When in doubt, ask: would their last two job titles
                                     //          exist without this skill? If yes, it's SECONDARY.
  "workHistory": [ { "title": string, "company": string, "years": string } ],  // most recent first, up to 5
  "education": [ { "degree": string, "institution": string, "year": string } ],
  "certifications": string[]
}

Base everything strictly on the resume text. Do not invent skills or roles the resume does not support.`;

/** One call to the parse model; returns the raw JSON object the model produced. */
async function callParseModel(
  system: string,
  content: unknown,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: PARSE_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Resume parse failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "{}";
  return JSON.parse(text.replace(/```json|```/g, "").trim()) as Record<string, unknown>;
}

export async function parseResume(resumeText: string): Promise<ParsedResume> {
  const parsed = (await callParseModel(PARSE_PROMPT, resumeText.slice(0, 12000), 1500)) as Partial<ParsedResume>;
  return normalizeParsed(parsed);
}

/** Tight box around the headshot on a scanned page — fractions of page size. */
export interface ScannedPhotoBox {
  page: number; // 1-based
  x: number; y: number; w: number; h: number; // 0-1, origin top-left
}

/**
 * Vision fallback for scanned/image-only PDFs (no text layer). The model reads
 * the page images directly — the PDF goes as a native document block, so no
 * OCR service and no server-side page rendering. One call returns the
 * structured parse, a plain-text transcription (stored as resumeText, so
 * re-parse/export work the same as for text PDFs), and — when the scan shows a
 * headshot — its bounding box, so the photo cropper can cut the avatar out of
 * the page image.
 */
export async function parseScannedResume(
  pdfBuffer: Buffer
): Promise<{ parsed: ParsedResume; transcription: string; photoBox: ScannedPhotoBox | null }> {
  const system =
    PARSE_PROMPT +
    `\n\nThis resume is a SCANNED document — read the page images. Add two extra top-level fields to the JSON:\n` +
    `  "transcription": string   // the resume's full plain text, faithfully transcribed from the scan\n` +
    `  "photoBox": { "page": number, "x": number, "y": number, "w": number, "h": number } | null\n` +
    `                            // if the resume shows a photo/headshot of the person: page is 1-based,\n` +
    `                            // x,y is the box's TOP-LEFT corner and w,h its size, ALL as fractions (0-1)\n` +
    `                            // of the page width/height. Draw the box tightly around just the photo.\n` +
    `                            // null when there is no photo of the person (logos/icons don't count).\n` +
    `If the pages are illegible or clearly not a resume, return {"transcription": ""}.`;

  const raw = await callParseModel(
    system,
    [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") },
      },
      { type: "text", text: "Parse this scanned resume into the JSON schema." },
    ],
    4000 // transcription + parse for a few pages
  );

  const transcription = typeof raw.transcription === "string" ? raw.transcription.trim() : "";

  // Trust nothing about the box shape — clamp fractions, require a sane size
  // (a headshot is at least ~4% of the page in each direction, and never most
  // of the page).
  let photoBox: ScannedPhotoBox | null = null;
  const b = raw.photoBox as Partial<ScannedPhotoBox> | null | undefined;
  if (b && [b.page, b.x, b.y, b.w, b.h].every((v) => typeof v === "number" && Number.isFinite(v))) {
    const x = Math.max(0, Math.min(1, b.x!)), y = Math.max(0, Math.min(1, b.y!));
    const w = Math.min(1 - x, b.w!), h = Math.min(1 - y, b.h!);
    if (w >= 0.04 && h >= 0.04 && w <= 0.6 && h <= 0.6) {
      photoBox = { page: Math.max(1, Math.round(b.page!)), x, y, w, h };
    }
  }

  return { parsed: normalizeParsed(raw as Partial<ParsedResume>), transcription, photoBox };
}

// Normalize / guard the shape so downstream code can trust it.
function normalizeParsed(parsed: Partial<ParsedResume>): ParsedResume {
  return {
    fullName: parsed.fullName ?? null,
    headlineRole: parsed.headlineRole?.trim() || null,
    seniority: (parsed.seniority as Seniority) ?? "NOT_APPLICABLE",
    yearsExperience: typeof parsed.yearsExperience === "number" ? parsed.yearsExperience : null,
    currentLocation: parsed.currentLocation?.trim() || null,
    industries: (parsed.industries ?? [])
      .filter((i): i is string => typeof i === "string" && i.trim().length > 0)
      .map((i) => i.trim().toLowerCase())
      .slice(0, 4),
    skills: (parsed.skills ?? [])
      .filter((s) => s && typeof s.name === "string" && s.name.trim())
      .map((s) => ({
        name: s.name.trim(),
        confidence: Math.max(0, Math.min(1, typeof s.confidence === "number" ? s.confidence : 1)),
        proficiency: VALID_PROFICIENCY.includes(s.proficiency as SkillProficiency)
          ? (s.proficiency as SkillProficiency)
          : null, // never trust an unrecognized level into the DB enum
        tier: s.tier === "SECONDARY" ? ("SECONDARY" as const) : ("CORE" as const), // unknown -> CORE (safe default)
      })),
    workHistory: (parsed.workHistory ?? []).filter((w) => w && w.title),
    education: (parsed.education ?? []).filter((e) => e && e.degree),
    certifications: (parsed.certifications ?? []).filter((c): c is string => typeof c === "string"),
  };
}
