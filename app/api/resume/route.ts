/**
 * /api/resume — load and save the Resume Builder document.
 *
 * GET returns the saved doc, or a profile-seeded draft when none exists yet.
 * The seed is NOT saved on read: a row appears only when the person actually
 * saves, so opening the page once doesn't mint DB rows for every looker.
 *
 * PUT upserts the whole document. Whole-doc on purpose — the resume is edited
 * as one thing and is small; per-field patching would buy nothing but bugs.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sanitizeContent, seedFromProfile, asJson } from "@/lib/resume/doc";

const PROFILE_SELECT = {
  id: true, fullName: true, headlineRoleId: true, currentLocation: true,
  workHistory: true, education: true, certifications: true,
  skills: { select: { tier: true, skill: { select: { name: true } } } },
} as const;

async function loadProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId }, select: PROFILE_SELECT });
}

export async function GET() {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "No profile." }, { status: 401 });
  const profile = await loadProfile(userId);
  if (!profile) return NextResponse.json({ error: "No profile." }, { status: 404 });

  const doc = await prisma.resumeDoc.findUnique({ where: { profileId: profile.id }, select: { content: true, updatedAt: true } });
  if (doc) {
    return NextResponse.json({ content: sanitizeContent(doc.content), saved: true, updatedAt: doc.updatedAt });
  }

  const headlineName = profile.headlineRoleId
    ? (await prisma.role.findUnique({ where: { id: profile.headlineRoleId }, select: { name: true } }))?.name ?? null
    : null;

  const content = seedFromProfile({
    fullName: profile.fullName,
    headlineName,
    currentLocation: profile.currentLocation,
    workHistory: profile.workHistory,
    education: profile.education,
    certifications: profile.certifications,
    skills: profile.skills.map((s) => ({ name: s.skill.name, tier: s.tier })),
  });
  return NextResponse.json({ content, saved: false, updatedAt: null });
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

  // sanitizeContent is the entire validation story: unknown fields drop,
  // strings cap, lists cap — nothing user-supplied reaches the row unchecked.
  const content = sanitizeContent((body as { content?: unknown }).content);

  try {
    const saved = await prisma.resumeDoc.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id, content: asJson(content) },
      update: { content: asJson(content) },
      select: { updatedAt: true },
    });
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
  } catch (err) {
    console.error("resume save failed:", err);
    return NextResponse.json({ error: "Couldn't save — try again." }, { status: 502 });
  }
}
