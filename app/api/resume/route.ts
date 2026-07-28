/**
 * /api/resume — load and save the Resume Builder document.
 *
 * GET returns the saved doc, or a profile-seeded draft when none exists yet.
 * The seed is NOT saved on read: a row appears only when the person actually
 * saves, so opening the page once doesn't mint DB rows for every looker.
 *
 * PUT upserts the whole document. Whole-doc on purpose — the resume is edited
 * as one thing and is small; per-field patching would buy nothing but bugs.
 *
 * Both accept an optional `jobId` (query param on GET, body field on PUT) to
 * address a job-tailored version instead of the main resume — see
 * TailoredResumeDoc in the schema and POST /api/resume/tailor, which creates
 * these. The tailored path deliberately diverges from the main-resume path in
 * two ways: it never re-derives `experience` from the live profile (the whole
 * point of a tailored doc is that it differs from the canonical one), and PUT
 * never syncs `experience` back onto Profile.workHistory (a job-specific,
 * trimmed bullet list must never overwrite the person's real work history).
 */
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sanitizeContent, asJson } from "@/lib/resume/doc";
import { peekAssistStatus } from "@/lib/resume/assist-quota";
import { loadQuotes, loadResumeProfile, loadMainResumeContent } from "@/lib/resume/load";
import { updateProfileFields } from "@/lib/matching/profile";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await loadResumeProfile(userId);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const assist = await peekAssistStatus(profile.id, profile.tier);

  // The photo is never stored in the ResumeDoc — the profile is its single
  // source (a data-URI photo copied into every resume row would bloat each
  // one by up to 1MB). The doc only stores whether to SHOW it.
  const photo = profile.photoUrl ?? null;
  const publicUrl = profile.publicSlug ? `${SITE}/p/${profile.publicSlug}` : null;
  // QR of the public profile, for the printed resume's footer: paper resume →
  // one scan → live portfolio. Data URI so it prints with no network fetch.
  // Best-effort: a QR failure must never block loading the resume.
  const qr = publicUrl
    ? await QRCode.toDataURL(publicUrl, { margin: 0, width: 160, color: { dark: "#0F172A", light: "#FFFFFF" } }).catch(() => null)
    : null;

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (jobId) {
    const [tailored, job] = await Promise.all([
      prisma.tailoredResumeDoc.findUnique({ where: { profileId_jobId: { profileId: profile.id, jobId } }, select: { content: true, updatedAt: true } }),
      prisma.job.findUnique({ where: { id: jobId }, select: { titleNormalized: true, titleRaw: true, companyName: true } }),
    ]);
    if (!tailored) return NextResponse.json({ error: "No tailored resume yet for this job." }, { status: 404 });
    const content = sanitizeContent(tailored.content);
    // Unlike the main resume, experience is NOT re-derived from the live
    // profile here — the whole point of a tailored doc is that it diverges
    // from the canonical one. Recommendations still come live: never
    // resume-owned, on the main OR a tailored doc, per the rule above.
    content.recommendations = sanitizeContent({ recommendations: await loadQuotes(profile.id) }).recommendations;
    return NextResponse.json({
      content, saved: true, updatedAt: tailored.updatedAt, assist, photo, publicUrl, qr,
      job: job ? { title: job.titleNormalized ?? job.titleRaw, company: job.companyName } : null,
    });
  }

  const { content, saved, updatedAt } = await loadMainResumeContent(profile);
  return NextResponse.json({ content, saved, updatedAt, assist, photo, publicUrl, qr, job: null });
}

export async function PUT(req: NextRequest) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = typeof (body as { jobId?: unknown }).jobId === "string" ? (body as { jobId: string }).jobId : null;

  // sanitizeContent is the entire validation story: unknown fields drop,
  // strings cap, lists cap — nothing user-supplied reaches the row unchecked.
  const content = sanitizeContent((body as { content?: unknown }).content);
  // …except recommendations, which the client is never trusted with at all:
  // they come from endorsements other people wrote, re-derived on every save
  // so a hand-crafted PUT can't put words in someone else's mouth.
  content.recommendations = sanitizeContent({ recommendations: await loadQuotes(profile.id) }).recommendations;

  if (jobId) {
    try {
      const saved = await prisma.tailoredResumeDoc.upsert({
        where: { profileId_jobId: { profileId: profile.id, jobId } },
        create: { profileId: profile.id, jobId, content: asJson(content) },
        update: { content: asJson(content) },
        select: { updatedAt: true },
      });
      // Deliberately NO updateProfileFields call here — a job-tailored,
      // trimmed/reordered experience list must never overwrite the person's
      // real Profile.workHistory. That sync only happens on the main resume.
      return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
    } catch (err) {
      console.error("tailored resume save failed:", err);
      return NextResponse.json({ error: "Couldn't save — try again." }, { status: 502 });
    }
  }

  try {
    const saved = await prisma.resumeDoc.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id, content: asJson(content) },
      update: { content: asJson(content) },
      select: { updatedAt: true },
    });
    // Experience is profile-owned (see lib/resume/doc.ts's module comment) —
    // every resume save writes title/company/years/bullets straight back to
    // Profile.workHistory, so /profile and a future resume upload see it too.
    // Deliberately best-effort: a hiccup here must never fail the resume save
    // the person actually asked for.
    await updateProfileFields(userId, { workHistory: content.experience }).catch((err) => {
      console.error("resume experience -> profile sync failed:", err);
    });
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (err) {
    console.error("resume save failed:", err);
    return NextResponse.json({ error: "Couldn't save — try again." }, { status: 502 });
  }
}
