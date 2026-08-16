/**
 * "Which of my companies am I working on?" — asked once, here.
 *
 * Since migration 076 an account may own several companies. Every surface
 * that used to say "my company" (the /employer dashboard, the company editor,
 * the logo upload, the widget, the WordPress handshake) still needs exactly ONE
 * answer, and it must be the same answer on every request until the person
 * switches — otherwise the sidebar shows company A while the editor saves to
 * company B.
 *
 * The answer lives in an httpOnly cookie holding a company id. It is only ever
 * a HINT: every read re-checks that the named company is owned by the caller
 * (`ownerUserId` is still the authorization), and falls back to the account's
 * oldest company when the cookie is missing, stale, or points at somebody
 * else's row. A cookie can therefore never grant access to anything; the worst
 * it can do is pick a different one of your own companies.
 *
 * Why a cookie and not the URL: /employer/* is ~20 pages and a dozen API
 * routes that all assume "the company". Moving the id into every path is a
 * rewrite; a cookie is a lookup. When the employer area grows a real
 * permission model (team members with write access), the switch belongs in
 * the URL and this file is where that change starts.
 */
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Company, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ACTIVE_COMPANY_COOKIE = "tz_company";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** The company id the browser last asked for, or null. Never trusted alone. */
export async function activeCompanyHint(): Promise<string | null> {
  try {
    const v = cookies().get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch {
    // Called outside a request scope (a cron, a script) — no hint.
    return null;
  }
}

/**
 * The caller's active company, or null when they own none.
 *
 * `select` narrows the columns exactly as it does on prisma.company.findFirst,
 * so call sites that used `findUnique({ where: { ownerUserId }, select })`
 * translate one-for-one.
 */
export async function activeCompany<S extends Prisma.CompanySelect>(
  userId: string,
  select: S
): Promise<Prisma.CompanyGetPayload<{ select: S }> | null>;
export async function activeCompany(userId: string): Promise<Company | null>;
export async function activeCompany(userId: string, select?: Prisma.CompanySelect): Promise<unknown> {
  const hint = await activeCompanyHint();
  if (hint) {
    const hinted = await prisma.company.findFirst({
      where: { id: hint, ownerUserId: userId },
      ...(select ? { select } : {}),
    });
    if (hinted) return hinted;
  }
  // No hint, or a stale one: the oldest company is the stable default —
  // "the one you made first" is what a person with one company expects, and
  // it does not change under them when they create a second.
  return prisma.company.findFirst({
    where: { ownerUserId: userId },
    orderBy: { createdAt: "asc" },
    ...(select ? { select } : {}),
  });
}

/** Every company the account owns, oldest first — for switchers and pickers. */
export async function ownedCompanies(userId: string) {
  return prisma.company.findMany({
    where: { ownerUserId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, logoPath: true },
  });
}

/**
 * A company id the caller CLAIMS to be acting as (a "post as" picker, a
 * switch request), verified against ownership. Returns the row or null —
 * never throws, never trusts the id.
 */
export async function ownedCompanyById<S extends Prisma.CompanySelect>(userId: string, companyId: string, select: S) {
  if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) return null;
  return prisma.company.findFirst({ where: { id: companyId, ownerUserId: userId }, select });
}

/** Pin the active company on a response. Call only after verifying ownership. */
export function setActiveCompanyCookie(res: NextResponse, companyId: string) {
  res.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}
