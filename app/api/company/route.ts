/**
 * /api/company — the employer identity behind native postings.
 *
 * An account may own several companies (migration 076). Every method here
 * acts on the ACTIVE one — the company the browser last switched to, see
 * lib/company/active.ts — except POST, which creates another and makes it
 * active, and PUT, which switches. Anonymous visitors can browse; CREATING
 * requires a real account — an employer must be reachable, and an anon cookie
 * isn't an identity anyone can hold to.
 *
 *   GET   → { company: active | null, companies: [all owned], siteChat, authed }
 *   POST  → create a company (first or additional); becomes active
 *   PATCH → edit the active company
 *   PUT   → { companyId } switch the active company (must be one you own)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { activeCompany, ownedCompanies, ownedCompanyById, setActiveCompanyCookie } from "@/lib/company/active";

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
  const [company, companies] = await Promise.all([activeCompany(userId), ownedCompanies(userId)]);
  // Whether the site chat is actually LIVE on this company — the employer
  // sidebar greys the item out until it is, so "Site chat" never looks like
  // something that is running when nothing is. Two counts, not one: a site
  // that exists but is switched off is still "not enabled", and the shell
  // says "Off" rather than "Not set up" for it.
  const siteChat = company
    ? await (async () => {
        const [total, live] = await Promise.all([
          prisma.widgetSite.count({ where: { companyId: company.id } }),
          prisma.widgetSite.count({ where: { companyId: company.id, enabled: true } }),
        ]);
        return { sites: total, enabled: live > 0 };
      })()
    : { sites: 0, enabled: false };
  return NextResponse.json({ company, companies, siteChat, authed });
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

  // A generous ceiling, not a plan limit: it exists so a script can't mint
  // company pages (each is a public URL). Real multi-brand owners have a few.
  const owned = await prisma.company.count({ where: { ownerUserId: userId } });
  if (owned >= 10) return NextResponse.json({ error: "You've reached the limit of 10 companies on one account." }, { status: 409 });

  // Slug: name, with a short suffix only on collision — clean URLs by default.
  const base = slugify(data.name);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const company = await prisma.company.create({ data: { ownerUserId: userId, slug, ...data } });
      // The one you just made is the one you want to be working on.
      const res = NextResponse.json({ company });
      setActiveCompanyCookie(res, company.id);
      return res;
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

  const active = await activeCompany(userId, { id: true });
  if (!active) return NextResponse.json({ error: "No company to edit." }, { status: 404 });
  // Owner-scoped write: updateMany's where IS the authorization.
  const r = await prisma.company.updateMany({ where: { id: active.id, ownerUserId: userId }, data });
  if (r.count === 0) return NextResponse.json({ error: "No company to edit." }, { status: 404 });
  const company = await prisma.company.findUnique({ where: { id: active.id } });
  return NextResponse.json({ company });
}

/** Switch the active company. The cookie is set only for a company you own. */
export async function PUT(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const company = await ownedCompanyById(userId, companyId, { id: true, name: true, slug: true, logoPath: true });
  if (!company) return NextResponse.json({ error: "Not one of your companies." }, { status: 404 });

  const res = NextResponse.json({ company });
  setActiveCompanyCookie(res, company.id);
  return res;
}
