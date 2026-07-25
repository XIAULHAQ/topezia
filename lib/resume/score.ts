/**
 * Resume strength score — the design's "score ring" made honest.
 *
 * A transparent CHECKLIST, not a model judgment: every point is a rule the
 * person can read, and every missing point names exactly what to do about it.
 * Pure function over ResumeContent so the client recomputes it live on every
 * keystroke — no API call, no AI cost, works identically on the server.
 *
 * Points sum to exactly 100 (asserted in dev). The weights encode what hiring
 * folk wisdom consistently rewards: quantified bullets carry the most because
 * "cut cost 38%" is the single highest-leverage edit a resume can get.
 */
import type { ResumeContent } from "./doc";

export interface StrengthCheck {
  id: string;
  label: string; // what the rule is, stated as the finished state
  hint: string; // the actionable fix, shown only while unmet
  points: number;
  met: boolean;
}

export interface Strength {
  score: number; // 0–100, sum of met points
  metCount: number;
  checks: StrengthCheck[]; // unmet first, biggest points first
}

export function scoreResume(c: ResumeContent): Strength {
  const bullets = c.experience.flatMap((e) => e.bullets).filter(Boolean);
  const quantified = bullets.filter((b) => /\d/.test(b));

  const checks: StrengthCheck[] = [
    {
      id: "contact",
      label: "Contact basics: name, email and location",
      hint: "Recruiters discard resumes they can't reply to — fill name, email and location.",
      points: 10,
      met: !!(c.contact.name && c.contact.email && c.contact.location),
    },
    {
      id: "reach",
      label: "A phone number or a link",
      hint: "Add a phone number, or a portfolio/LinkedIn link, so there are two ways to reach you.",
      points: 5,
      met: !!(c.contact.phone || c.contact.link),
    },
    {
      id: "headline",
      label: "A headline under your name",
      hint: "One line saying what you are — e.g. \"Marketing Manager\" — orients the reader instantly.",
      points: 5,
      met: !!c.contact.headline,
    },
    {
      id: "summary",
      label: "A professional summary (2–3 sentences)",
      hint: "Write 2–3 sentences on who you are and what you're strongest at — or use Write with AI.",
      points: 10,
      met: c.summary.trim().length >= 80,
    },
    {
      id: "experience",
      label: "At least one role in Experience",
      hint: "Add your current or most recent role — title, company and years.",
      points: 10,
      met: c.experience.some((e) => e.title || e.company),
    },
    {
      id: "bullets",
      label: "Three or more achievement bullets",
      hint: "Add bullets under your roles — what you did and what changed because of it.",
      points: 10,
      met: bullets.length >= 3,
    },
    {
      id: "numbers",
      label: "Numbers in at least two bullets",
      hint: "Quantify: \"cut production cost 38%\" beats \"reduced costs\". Add numbers to two bullets.",
      points: 15,
      met: quantified.length >= 2,
    },
    {
      id: "skills",
      label: "Eight or more skills",
      hint: "List at least eight skills — they're what searches and screeners match on.",
      points: 10,
      met: c.skills.length >= 8,
    },
    {
      id: "education",
      label: "Education listed",
      hint: "Add your degree or highest completed education.",
      points: 5,
      met: c.education.some((e) => e.degree || e.institution),
    },
    {
      id: "projects",
      label: "A portfolio project attached",
      hint: "Attach a published portfolio piece — proof of work beats claims of work.",
      points: 10,
      met: c.projects.length >= 1,
    },
    {
      id: "languages",
      label: "Languages listed",
      hint: "Add the languages you work in — an easy differentiator many resumes skip.",
      points: 5,
      met: c.languages.some((l) => l.name),
    },
    {
      id: "recommendation",
      label: "A recommendation quote",
      hint: "Add one short quote from a client or colleague — with who said it.",
      points: 5,
      met: c.recommendations.some((r) => r.text),
    },
  ];

  if (process.env.NODE_ENV !== "production") {
    const total = checks.reduce((s, ch) => s + ch.points, 0);
    if (total !== 100) throw new Error(`Strength checklist points sum to ${total}, not 100`);
  }

  const score = checks.reduce((s, ch) => s + (ch.met ? ch.points : 0), 0);
  return {
    score,
    metCount: checks.filter((ch) => ch.met).length,
    checks: [...checks].sort((a, b) => Number(a.met) - Number(b.met) || b.points - a.points),
  };
}
