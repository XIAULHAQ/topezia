/**
 * POST /api/resume/sync-profile — push the resume's facts back to the profile.
 *
 * The forward direction (profile → resume seed) has existed since the builder
 * shipped; this is the reverse: after polishing a resume, one click makes the
 * profile match it. Mapping is deliberately conservative:
 *
 *  - Bullets stay on the resume. The profile's workHistory is {title, company,
 *    years} — prose lives in the resume document, facts live on the profile.
 *  - The headline syncs ONLY when it resolves to a taxonomy Role. A free-text
 *    headline like "Video Editor & Motion Designer" resolving to null would
 *    WIPE the profile's role and mis-scope the person's whole feed — a resume
 *    edit must never be able to do that silently.
 *  - Skills sync as names; updateProfileFields preserves each existing
 *    skill's provenance and tier, and brand-new ones land USER_ADDED/CORE.
 *  - Projects don't sync — they ARE the portfolio; the resume only points at
 *    them.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sanitizeContent } from "@/lib/resume/doc";
import { updateProfileFields, type ProfileFieldEdit } from "@/lib/matching/profile";
import { resolveRole } from "@/lib/ingestion/resolve-taxonomy";

export const maxDuration = 60; // skill resolution + re-embed on skill change

export async function POST(req: NextRequest) {
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
  const c = sanitizeContent((body as { content?: unknown }).content);

  const edit: ProfileFieldEdit = {
    workHistory: c.experience.map((e) => ({ title: e.title, company: e.company, years: e.years })),
    education: c.education.map((e) => ({ degree: e.degree, institution: e.institution, year: e.year })),
    certifications: c.certifications,
    languages: c.languages.map((l) => ({ name: l.name, level: l.level || undefined })),
    recommendations: c.recommendations.map((r) => ({ text: r.text, author: r.author || undefined, role: r.role || undefined })),
    skills: c.skills.map((name) => ({ name, proficiency: null })),
  };
  if (c.contact.name) edit.fullName = c.contact.name;
  if (c.contact.location) edit.currentLocation = c.contact.location;

  // Headline: only when it resolves — see the header comment.
  let headlineSynced = false;
  if (c.contact.headline) {
    const roleId = await resolveRole(c.contact.headline, c.contact.headline);
    if (roleId) {
      edit.headline = c.contact.headline;
      headlineSynced = true;
    }
  }

  try {
    const result = await updateProfileFields(userId, edit);
    if (!result) return NextResponse.json({ error: "No profile to update." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      headlineSynced,
      // Honest note the UI can show when the headline was left alone.
      note: !headlineSynced && c.contact.headline
        ? `Your headline "${c.contact.headline}" isn't one of our role names, so your profile's role was left unchanged — it scopes your job feed.`
        : null,
    });
  } catch (err) {
    console.error("resume->profile sync failed:", err);
    return NextResponse.json({ error: "Couldn't update your profile — try again." }, { status: 502 });
  }
}
