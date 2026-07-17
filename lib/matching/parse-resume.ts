/**
 * Résumé parsing — spec §3.4, §6.1 (parse-confirmation screen).
 *
 * Turns raw résumé text into the structured Profile shape the confirm screen
 * edits and the matcher reads. Haiku-class model, temperature 0, JSON output —
 * same cost discipline as ingestion (§4.2). Per-skill confidence drives the
 * solid-vs-dashed "confirm?" chips on Screen A.
 */

import type { Seniority, SkillProficiency } from "@prisma/client";

const PARSE_MODEL = "claude-haiku-4-5-20251001";

const VALID_PROFICIENCY: SkillProficiency[] = ["FAMILIAR", "PROFICIENT", "ADVANCED", "EXPERT"];

export interface ParsedSkill {
  name: string;
  /** 0-1: did the résumé actually SAY this? Drives the "confirm?" chip. */
  confidence: number;
  /** How good are they? Inferred from years, seniority and depth of use.
   *  Deliberately separate from confidence — a résumé can state a skill
   *  unambiguously (confidence 1.0) that the person has barely touched. */
  proficiency: SkillProficiency | null;
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

const PARSE_PROMPT = `You parse a job seeker's résumé into structured JSON. Return ONLY valid JSON, no prose, matching exactly:

{
  "fullName": string | null,
  "headlineRole": string,            // their primary job function in 2-4 words, lowercase, e.g. "backend engineer", "physical therapist", "account executive"
  "seniority": "INTERN" | "JUNIOR" | "MID" | "SENIOR" | "LEAD" | "EXEC" | "NOT_APPLICABLE",
  "yearsExperience": number | null,  // total years of relevant professional experience
  "currentLocation": string | null,  // where THEY are (e.g. "San Diego, CA"), from the résumé header. null if absent — never guess from employer locations
  "industries": string[],            // 1-4 sectors they've actually worked in, lowercase (e.g. "healthcare", "b2b saas", "logistics")
  "skills": [ { "name": string, "confidence": number, "proficiency": "FAMILIAR" | "PROFICIENT" | "ADVANCED" | "EXPERT" } ],
                                     // 5-15 concrete skills.
                                     // confidence = did the résumé SAY it: 1.0 explicitly listed/used, 0.5-0.7 only implied by their roles.
                                     // proficiency = how GOOD they are, inferred from years using it, the seniority of roles where it appears, and depth of described work.
                                     //   FAMILIAR = mentioned in passing; PROFICIENT = used regularly; ADVANCED = deep sustained use; EXPERT = leads/teaches it.
                                     // These are independent: a résumé can clearly list a skill (confidence 1.0) the person has barely used (FAMILIAR).
  "workHistory": [ { "title": string, "company": string, "years": string } ],  // most recent first, up to 5
  "education": [ { "degree": string, "institution": string, "year": string } ],
  "certifications": string[]
}

Base everything strictly on the résumé text. Do not invent skills or roles the résumé does not support.`;

export async function parseResume(resumeText: string): Promise<ParsedResume> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: PARSE_MODEL,
      max_tokens: 1500,
      temperature: 0,
      system: PARSE_PROMPT,
      messages: [{ role: "user", content: resumeText.slice(0, 12000) }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Résumé parse failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "{}";
  const cleaned = text.replace(/```json|```/g, "").trim();

  const parsed = JSON.parse(cleaned) as Partial<ParsedResume>;

  // Normalize / guard the shape so downstream code can trust it.
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
      })),
    workHistory: (parsed.workHistory ?? []).filter((w) => w && w.title),
    education: (parsed.education ?? []).filter((e) => e && e.degree),
    certifications: (parsed.certifications ?? []).filter((c): c is string => typeof c === "string"),
  };
}
