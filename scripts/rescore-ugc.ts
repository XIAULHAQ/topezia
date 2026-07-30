/**
 * Re-score every piece of existing user content against the CURRENT rules.
 *
 *   npx tsx scripts/rescore-ugc.ts            # audit, changes nothing
 *   npx tsx scripts/rescore-ugc.ts --verbose  # also list clean rows
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * lib/ugc.ts scores at read and write time, so there is no stored score to go
 * stale — but that cuts both ways: content written BEFORE a rule existed was
 * never checked against it, and tightening a threshold silently re-decides
 * every page on the site with nobody looking. This is how you look.
 *
 * Run it after ANY change to lib/ugc.ts, before deploying. The output answers
 * the only two questions that matter:
 *   - does anything real get caught that shouldn't be (false positives)?
 *   - does anything already published now fall below the index bar?
 *
 * READ-ONLY on purpose. It writes nothing and hides nothing — retroactively
 * un-publishing someone's work because a threshold moved is not a thing to do
 * from a script. Act on what it prints, in /hq/spam, one row at a time.
 */
import { prisma } from "../lib/prisma";
import { scoreUgcFields, isSpam, isSuspect, SPAM_REJECT, SPAM_REVIEW, type UgcVerdict } from "../lib/ugc";

const verbose = process.argv.includes("--verbose");

const band = (v: UgcVerdict) => (isSpam(v) ? "REJECT" : isSuspect(v) ? "review" : "clean ");

let flagged = 0;
let scanned = 0;

function report(label: string, what: string, v: UgcVerdict) {
  scanned++;
  if (isSuspect(v)) flagged++;
  if (!isSuspect(v) && !verbose) return;
  console.log(
    `${band(v)} ${String(v.score).padStart(3)} | ${label.padEnd(12)} | ${what.slice(0, 46).padEnd(46)} | ${v.reasons.join("; ")}`
  );
}

async function main() {
  console.log(`Scoring against the current rules — reject at ${SPAM_REJECT}, withhold indexing at ${SPAM_REVIEW}.\n`);

  // Profiles: the PUBLIC fields only, exactly what indexability() scores.
  // Never resumeText — a real CV carries a page of links and a phone number,
  // and scoring it would flag most honest members.
  const profiles = await prisma.profile.findMany({
    select: {
      fullName: true, currentLocation: true, industries: true, certifications: true,
      linkedinUrl: true, githubUrl: true, websiteUrl: true, workHistory: true, education: true,
      publicSlug: true, spamCleared: true,
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
  for (const p of profiles) {
    const wh = Array.isArray(p.workHistory) ? (p.workHistory as { title?: string; company?: string; bullets?: string[] }[]) : [];
    const ed = Array.isArray(p.education) ? (p.education as { degree?: string; institution?: string }[]) : [];
    const v = scoreUgcFields(
      [
        p.fullName, p.currentLocation, ...p.industries, ...p.certifications,
        p.linkedinUrl, p.githubUrl, p.websiteUrl,
        ...wh.flatMap((w) => [w?.title, w?.company, ...(w?.bullets ?? [])]),
        ...ed.map((e) => `${e?.degree ?? ""} ${e?.institution ?? ""}`),
        ...p.skills.map((s) => s.skill.name),
      ],
      { linksExpected: true }
    );
    report("profile", `${p.fullName ?? "-"}${p.spamCleared ? " [cleared]" : ""}`, v);
  }

  const works = await prisma.portfolio.findMany({
    select: { title: true, description: true, skills: true, technologies: true, status: true, slug: true },
  });
  for (const w of works) {
    const v = scoreUgcFields([w.title, w.description, ...w.skills, ...w.technologies], { linksExpected: true });
    report(w.status === "PUBLISHED" ? "work" : "work/draft", w.title, v);
  }

  const pubs = await prisma.publication.findMany({
    select: { title: true, venue: true, abstract: true, url: true, authors: true },
  });
  for (const p of pubs) {
    const v = scoreUgcFields([p.title, p.venue, p.abstract, p.url, ...p.authors], { linksExpected: true });
    report("publication", p.title, v);
  }

  // Endorsements: links are NOT expected here — a recommendation is prose about
  // a person, so a URL in one is already odd. Same setting as the write path.
  const ends = await prisma.endorsement.findMany({
    where: { status: "SUBMITTED" },
    select: { authorName: true, authorRole: true, text: true },
  });
  for (const e of ends) {
    const v = scoreUgcFields([e.authorName, e.authorRole, e.text]);
    report("endorsement", e.authorName ?? "-", v);
  }

  console.log(
    `\nScanned ${scanned} items — ${flagged} at or above ${SPAM_REVIEW}.` +
      (flagged ? " Review them at /hq/spam; nothing was changed here." : " Nothing trips the current rules.")
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
