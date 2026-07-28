/**
 * Job-specific skill coverage for the tailor panel's "What changed" stats —
 * how many of THIS posting's own required skills show up anywhere in a
 * resume's text (skills list, bullets, summary). Distinct from Career
 * Score's coveragePct (lib/career/score.ts / lib/matching/insights.ts),
 * which aggregates across every live posting in a person's whole target
 * field — never a single job — so it can't be relabeled as a per-job metric.
 */
import type { ResumeContent } from "@/lib/resume/doc";

export interface KeywordCoverage {
  covered: number;
  total: number;
  missing: string[];
}

export function keywordCoverage(jobSkills: string[], content: ResumeContent): KeywordCoverage {
  const haystack = [...content.skills, ...content.experience.flatMap((e) => e.bullets), content.summary]
    .join(" \n ")
    .toLowerCase();
  const missing: string[] = [];
  let covered = 0;
  for (const skill of jobSkills) {
    const needle = skill.trim().toLowerCase();
    if (!needle) continue;
    if (haystack.includes(needle)) covered++;
    else missing.push(skill);
  }
  return { covered, total: jobSkills.length, missing };
}
