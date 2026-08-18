/**
 * matchVersion as a content hash (lib/matching/match-version.ts). Run with:
 *   npx tsx test/match-version.test.ts
 */
import { computeMatchVersion, type MatchVersionInputs } from "@/lib/matching/match-version";

let pass = 0, fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const base: MatchVersionInputs = {
  headlineRoleId: "role-1", seniority: "SENIOR", yearsExperience: 8, currentLocation: "Austin, TX",
  industries: ["SaaS", "Fintech"], salaryTarget: 150000, salaryPeriod: "YEAR", workAuthorization: "CITIZEN",
  skills: [
    { tier: "CORE", proficiency: "EXPERT", skill: { name: "TypeScript" } },
    { tier: "SECONDARY", proficiency: null, skill: { name: "Go" } },
  ],
};
const v = computeMatchVersion(base);

check("shape", /^h:[0-9a-f]{32}$/.test(v), true);
check("deterministic", computeMatchVersion({ ...base }), v);
check("skill order irrelevant", computeMatchVersion({ ...base, skills: [...base.skills].reverse() }), v);
check("industry order irrelevant", computeMatchVersion({ ...base, industries: ["Fintech", "SaaS"] }), v);
check("location whitespace irrelevant", computeMatchVersion({ ...base, currentLocation: "  Austin, TX " }), v);
check("null seniority == NOT_APPLICABLE", computeMatchVersion({ ...base, seniority: null }), computeMatchVersion({ ...base, seniority: "NOT_APPLICABLE" }));

// Every field the reranker reads must move the hash.
const moved = (patch: Partial<MatchVersionInputs>) => computeMatchVersion({ ...base, ...patch }) !== v;
check("headline moves", moved({ headlineRoleId: "role-2" }), true);
check("seniority moves", moved({ seniority: "MID" }), true);
check("years moves", moved({ yearsExperience: 9 }), true);
check("location moves", moved({ currentLocation: "Denver, CO" }), true);
check("industries move", moved({ industries: ["SaaS"] }), true);
check("salary target moves", moved({ salaryTarget: 160000 }), true);
check("salary period moves", moved({ salaryPeriod: "HOUR" }), true);
check("work auth moves", moved({ workAuthorization: "NEEDS_SPONSORSHIP" }), true);
check("skill added moves", moved({ skills: [...base.skills, { tier: "CORE", proficiency: null, skill: { name: "React" } }] }), true);
check("skill tier moves", moved({ skills: [{ ...base.skills[0], tier: "SECONDARY" }, base.skills[1]] }), true);
check("skill proficiency moves", moved({ skills: [{ ...base.skills[0], proficiency: "ADVANCED" }, base.skills[1]] }), true);
check("revert lands on same hash", computeMatchVersion({ ...computeAfter({ yearsExperience: 9 }), yearsExperience: 8 }), v);
function computeAfter(patch: Partial<MatchVersionInputs>): MatchVersionInputs { return { ...base, ...patch }; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
