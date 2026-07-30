/**
 * /api/hq/spam — the review queue behind /hq/spam.
 *
 * Requires the signed /hq session cookie (lib/hq-auth.ts), like every other
 * /api/hq route, and re-checks it independently of the page's own gate.
 *
 * ── Why this scores at read time ─────────────────────────────────────────
 * There is no stored spam score. v1 deliberately shipped without one so that
 * nothing had to be applied by hand against the production database beyond a
 * single additive column, and so that changing a threshold in lib/ugc.ts
 * re-decides every page immediately instead of leaving a table of numbers
 * computed under rules that no longer exist.
 *
 * The cost is that this endpoint scores rows on demand, which does not scale
 * to a large member base. SCAN_LIMIT below is the honest bound — it is
 * reported in the response and shown in the UI rather than silently
 * truncating, so "queue is empty" never quietly means "we only looked at the
 * newest few hundred". When that bound starts to bite, the fix is a stored
 * score written at the end of the ingestion run, the same shape as PageStats.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";
import { scoreUgcFields, isSuspect, isSpam, SPAM_REVIEW } from "@/lib/ugc";
import { htmlToText } from "@/lib/company/article";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many of the newest rows of each kind we score per request. */
const SCAN_LIMIT = 500;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return unauthorized();

  const [profileRows, workRows, companyRows, reports] = await Promise.all([
    prisma.profile.findMany({
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
      select: {
        id: true, publicSlug: true, fullName: true, currentLocation: true, industries: true,
        certifications: true, linkedinUrl: true, githubUrl: true, websiteUrl: true,
        workHistory: true, education: true, publicVisible: true, spamCleared: true, createdAt: true,
        skills: { select: { skill: { select: { name: true } } } },
        publications: { select: { title: true, venue: true, abstract: true, url: true } },
        endorsements: {
          where: { status: "SUBMITTED" as const },
          select: { authorName: true, authorRole: true, text: true },
        },
      },
    }),
    prisma.portfolio.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: SCAN_LIMIT,
      select: {
        id: true, slug: true, title: true, description: true, skills: true, technologies: true,
        status: true, publishedAt: true,
        profile: { select: { fullName: true, publicSlug: true } },
      },
    }),
    // Companies carry UGC of their own since migration 045 — testimonial copy,
    // client names and outbound client links all sit on a public company page.
    prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      take: SCAN_LIMIT,
      select: {
        id: true, slug: true, name: true, tagline: true, about: true, website: true,
        spamCleared: true, createdAt: true,
        testimonials: { select: { quote: true, authorName: true, authorUrl: true } },
        clients: { select: { name: true, websiteUrl: true } },
        work: { where: { status: "PUBLISHED" as const }, select: { id: true, slug: true, title: true, summary: true, description: true, tags: true } },
        articles: { where: { status: "PUBLISHED" as const }, select: { id: true, slug: true, title: true, excerpt: true, contentHtml: true, tags: true } },
      },
    }),
    prisma.contentReport.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const reportedProfiles = new Set(reports.filter((r) => r.kind === "PROFILE").map((r) => r.targetId));
  const reportedWorks = new Set(reports.filter((r) => r.kind === "PORTFOLIO").map((r) => r.targetId));

  const profiles = profileRows
    .map((p) => {
      const wh = Array.isArray(p.workHistory) ? (p.workHistory as { title?: string; company?: string; bullets?: string[] }[]) : [];
      const ed = Array.isArray(p.education) ? (p.education as { degree?: string; institution?: string }[]) : [];
      // The same fields indexability() scores — never resumeText, which
      // legitimately carries a page of links and a phone number.
      const verdict = scoreUgcFields(
        [
          p.fullName, p.currentLocation, ...p.industries, ...p.certifications,
          p.linkedinUrl, p.githubUrl, p.websiteUrl,
          ...wh.flatMap((w) => [w?.title, w?.company, ...(w?.bullets ?? [])]),
          ...ed.map((e) => `${e?.degree ?? ""} ${e?.institution ?? ""}`),
          ...p.skills.map((s) => s.skill.name),
          ...p.publications.flatMap((x) => [x.title, x.venue, x.abstract, x.url]),
          ...p.endorsements.flatMap((e) => [e.authorName, e.authorRole, e.text]),
        ],
        { linksExpected: true }
      );
      return {
        id: p.id,
        slug: p.publicSlug,
        name: p.fullName,
        createdAt: p.createdAt,
        publicVisible: p.publicVisible,
        spamCleared: p.spamCleared,
        score: verdict.score,
        reasons: verdict.reasons,
        wouldReject: isSpam(verdict),
        reported: reportedProfiles.has(p.id),
      };
    })
    .filter((p) => isSuspect({ score: p.score, reasons: p.reasons }) || p.reported)
    .sort((a, b) => b.score - a.score);

  const works = workRows
    .map((w) => {
      const verdict = scoreUgcFields([w.title, w.description, ...w.skills, ...w.technologies], { linksExpected: true });
      return {
        id: w.id,
        slug: w.slug,
        title: w.title,
        author: w.profile.fullName,
        authorSlug: w.profile.publicSlug,
        status: w.status,
        publishedAt: w.publishedAt,
        score: verdict.score,
        reasons: verdict.reasons,
        reported: reportedWorks.has(w.id),
      };
    })
    .filter((w) => isSuspect({ score: w.score, reasons: w.reasons }) || w.reported)
    .sort((a, b) => b.score - a.score);

  // A company is scored as ONE document, its published work and articles
  // included — a testimonial that reads clean beside a case study full of
  // casino links is not clean, and the page shows them together.
  const companies = companyRows
    .map((c) => {
      const verdict = scoreUgcFields(
        [
          c.name, c.tagline, c.about, c.website,
          ...c.testimonials.flatMap((t) => [t.quote, t.authorName, t.authorUrl]),
          ...c.clients.flatMap((cl) => [cl.name, cl.websiteUrl]),
          ...c.work.flatMap((w) => [w.title, w.summary, w.description, ...w.tags]),
          ...c.articles.flatMap((a) => [a.title, a.excerpt, htmlToText(a.contentHtml), ...a.tags]),
        ],
        { linksExpected: true }
      );
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        createdAt: c.createdAt,
        spamCleared: c.spamCleared,
        score: verdict.score,
        reasons: verdict.reasons,
        wouldReject: isSpam(verdict),
        // Listed so a reviewer can pull one piece rather than the whole page.
        work: c.work.map((w) => ({ id: w.id, slug: w.slug, title: w.title })),
        articles: c.articles.map((a) => ({ id: a.id, slug: a.slug, title: a.title })),
      };
    })
    .filter((c) => isSuspect({ score: c.score, reasons: c.reasons }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({
    profiles,
    works,
    companies,
    reports,
    threshold: SPAM_REVIEW,
    // Stated so an empty queue can be read correctly — see the header comment.
    scanned: { profiles: profileRows.length, works: workRows.length, companies: companyRows.length, limit: SCAN_LIMIT },
  });
}

/**
 * PATCH — the four things a reviewer can actually do.
 *
 * Note what is absent: there is no "delete this member". Removing someone's
 * account is not a thing to do from a queue built on a heuristic, and hiding
 * is reversible in a way deletion is not.
 */
export async function PATCH(req: NextRequest) {
  if (!sessionValid(req.cookies.get(HQ_COOKIE)?.value)) return unauthorized();

  let body: { action?: unknown; id?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id || !action) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  switch (action) {
    // "This is a real person" — overrides the SCORE only. The substance bar in
    // indexability() still applies; see the comment there.
    case "clear-profile":
      await prisma.profile.update({ where: { id }, data: { spamCleared: true } });
      break;
    case "unclear-profile":
      await prisma.profile.update({ where: { id }, data: { spamCleared: false } });
      break;
    // publicVisible is the member's own master switch, reused here. A hidden
    // profile 404s rather than rendering an empty page — same answer as a slug
    // that never existed, so nothing confirms the profile merely being hidden.
    case "hide-profile":
      await prisma.profile.update({ where: { id }, data: { publicVisible: false } });
      break;
    case "show-profile":
      await prisma.profile.update({ where: { id }, data: { publicVisible: true } });
      break;
    // Back to DRAFT, not deleted: the member keeps their work and can fix it.
    case "unpublish-work":
      await prisma.portfolio.update({ where: { id }, data: { status: "DRAFT", publishedAt: null } });
      break;
    // Same override as clear-profile, for a company page.
    case "clear-company":
      await prisma.company.update({ where: { id }, data: { spamCleared: true } });
      break;
    case "unclear-company":
      await prisma.company.update({ where: { id }, data: { spamCleared: false } });
      break;
    // Back to DRAFT, not deleted — the employer keeps what they wrote.
    case "unpublish-company-work":
      await prisma.companyWork.update({ where: { id }, data: { status: "DRAFT", publishedAt: null } });
      break;
    case "unpublish-company-article":
      await prisma.companyArticle.update({ where: { id }, data: { status: "DRAFT", publishedAt: null } });
      break;
    case "resolve-report":
      await prisma.contentReport.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          resolution: typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null,
        },
      });
      break;
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
