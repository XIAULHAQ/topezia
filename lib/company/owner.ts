/**
 * "Which company am I allowed to write to?" — asked once, here.
 *
 * Every /api/company/* write route needs the same three answers: is there a
 * real account behind this request, does it own a company, and which one. Nine
 * routes each doing their own version of that is nine chances for one of them
 * to check two of the three. The Company row's `ownerUserId` IS the
 * authorization. Since migration 076 an account may own several companies, so
 * "my company" means the ACTIVE one — see lib/company/active.ts for how that
 * is chosen and why it can never widen access.
 *
 * Team MEMBERS deliberately fail this check. They are listed on the company
 * page and nothing more; giving every invitee write access to the employer's
 * public page and hiring pipeline is a permissions system, which is not what
 * "invite team members to be listed" asked for. When that changes, it changes
 * here, once.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { activeCompany } from "@/lib/company/active";

export type CompanyOwner = {
  userId: string;
  companyId: string;
  slug: string;
  name: string;
};

type OwnerResult = { ok: true; owner: CompanyOwner } | { ok: false; response: NextResponse };

export async function requireCompanyOwner(): Promise<OwnerResult> {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) {
    return { ok: false, response: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }

  const company = await activeCompany(userId, { id: true, slug: true, name: true });
  if (!company) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Create your company page first — this belongs to it." },
        { status: 409 }
      ),
    };
  }

  return { ok: true, owner: { userId, companyId: company.id, slug: company.slug, name: company.name } };
}

/**
 * The signed-in account's email address, read from Supabase's `auth.users` —
 * which lives in the same Postgres we already connect to, so this needs no
 * service-role key.
 *
 * Used by the invite-accept path, where "is this invite for you?" can only be
 * answered against a real address. Returns null rather than throwing: a failed
 * lookup must refuse the join, never silently allow it.
 */
export async function userEmail(userId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ email: string | null }[]>(
      `SELECT email FROM auth.users WHERE id::text = $1 LIMIT 1`,
      userId
    );
    const email = rows[0]?.email ?? null;
    return email ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
