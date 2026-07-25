/**
 * /api/company — the employer identity behind native postings.
 *
 * One company per signed-in account (schema-enforced). Anonymous visitors
 * can browse; POSTING requires a real account — an employer must be
 * reachable, and an anon cookie isn't an identity anyone can hold to.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line about keeps its paragraphs. */
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "";

const httpUrl = (v: unknown): string | null => {
  let s = str(v, 300);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? (u.hostname.includes(".") ? u.toString() : null) : null;
  } catch {
    return null;
  }
};

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "company";

function sanitize(raw: Record<string, unknown>) {
  return {
    name: str(raw.name, 120),
    tagline: str(raw.tagline, 160) || null,
    about: text(raw.about, 4000) || null,
    website: httpUrl(raw.website),
    location: str(raw.location, 120) || null,
  };
}

export async function GET() {
  const { userId, authed } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const company = await prisma.company.findUnique({ where: { ownerUserId: userId } });
  return NextResponse.json({ company, authed });
}

export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in to create a company." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const data = sanitize(body);
  if (!data.name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  const existing = await prisma.company.findUnique({ where: { ownerUserId: userId } });
  if (existing) return NextResponse.json({ error: "You already have a company." }, { status: 409 });

  // Slug: name, with a short suffix only on collision — clean URLs by default.
  const base = slugify(data.name);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const company = await prisma.company.create({ data: { ownerUserId: userId, slug, ...data } });
      return NextResponse.json({ company });
    } catch {
      /* slug collision — retry with suffix */
    }
  }
  return NextResponse.json({ error: "Couldn't create the company — try again." }, { status: 502 });
}

export async function PATCH(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const data = sanitize(body);
  if (!data.name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  // Owner-scoped write: updateMany's where IS the authorization.
  const r = await prisma.company.updateMany({ where: { ownerUserId: userId }, data });
  if (r.count === 0) return NextResponse.json({ error: "No company to edit." }, { status: 404 });
  const company = await prisma.company.findUnique({ where: { ownerUserId: userId } });
  return NextResponse.json({ company });
}
