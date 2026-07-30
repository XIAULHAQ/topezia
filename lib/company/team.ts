/**
 * The company's team roster.
 *
 * The owner is a row in CompanyTeamMember like everyone else, created on
 * demand rather than at company-creation time. Two reasons for that shape:
 *
 *  - Companies created before migration 045 have no team row. Backfilling
 *    would mean guessing a display name for accounts that may not have a
 *    profile yet; creating it the first time the owner opens the team page
 *    means the name comes from whatever they have by then.
 *  - It keeps the public team section honest with one query. If the owner were
 *    synthesized at render time, "who is on this team" would have two
 *    definitions — the roster, and the roster plus a special case.
 */
import { prisma } from "@/lib/prisma";

/**
 * A name to show for someone who has just joined. Their profile name if they
 * have one, otherwise the local part of the address the invite went to —
 * "alex.rivera@acme.com" becomes "Alex Rivera", which is a better placeholder
 * than a blank row and is theirs to change.
 */
export function displayNameFor(fullName: string | null | undefined, email: string | null | undefined): string {
  const real = (fullName ?? "").trim();
  if (real) return real.slice(0, 120);

  const local = (email ?? "").split("@")[0] ?? "";
  const guessed = local
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return guessed.slice(0, 120) || "Team member";
}

/** The owner's own roster row, created the first time it is needed. */
export async function ensureOwnerRow(companyId: string, ownerUserId: string, email: string | null) {
  const existing = await prisma.companyTeamMember.findUnique({
    where: { companyId_userId: { companyId, userId: ownerUserId } },
    select: { id: true },
  });
  if (existing) return;

  const profile = await prisma.profile.findFirst({
    where: { userId: ownerUserId },
    select: { id: true, fullName: true },
  });

  await prisma.companyTeamMember.create({
    data: {
      companyId,
      userId: ownerUserId,
      profileId: profile?.id ?? null,
      name: displayNameFor(profile?.fullName, email),
      role: "OWNER",
      invitedEmail: email,
    },
  });
}
