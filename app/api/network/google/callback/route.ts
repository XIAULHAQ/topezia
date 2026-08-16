/**
 * GET /api/network/google/callback — where Google sends the member back.
 *
 * Everything that touches the address book happens inside this one request:
 * exchange the code, read the contacts, match them against members, encrypt the
 * result, drop the token. The member is then redirected to a page that reads
 * that result exactly once.
 *
 * THE TOKEN DIES HERE. It is a local const, it is never written anywhere, and
 * we asked for an online token so there is no refresh token to lose. If this
 * request fails halfway, the worst case is a member who has to click the button
 * again — there is no half-stored credential.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { profileIdFor } from "@/lib/network/connections";
import { exchangeCode, fetchContacts, STATE_COOKIE } from "@/lib/network/google";
import { matchContacts } from "@/lib/network/match";
import { NETWORK_LIMITS } from "@/lib/network/doc";
import { encryptJson, secretsAvailable } from "@/lib/crypto/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A large address book is two paginated Google APIs (up to MAX_CONTACTS = 2000)
// plus the match query. Timing out here loses the member's consent round trip
// and makes them start again, so it gets room.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (err: string) => {
    const res = NextResponse.redirect(new URL(`/network?error=${encodeURIComponent(err)}`, origin));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) return NextResponse.redirect(new URL("/login?next=/network", origin));

  const profileId = await profileIdFor(userId);
  if (!profileId) return back("Finish your profile first.");

  // Google's own words beat anything generic when the member cancelled or the
  // consent screen is misconfigured.
  const googleError = url.searchParams.get("error");
  if (googleError) {
    return back(googleError === "access_denied"
      ? "No problem — nothing was imported."
      : `Google said: ${googleError}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!code) return back("Google didn't send anything back. Try again.");
  if (!state || !expected || state !== expected) {
    // Either a stale tab or someone else's callback. Both get the same answer.
    return back("That import link had expired. Start again from your network page.");
  }

  if (!secretsAvailable()) {
    // Refuse rather than fall back to storing an address book in the clear.
    return back("Contact import isn't available here — this deployment can't hold data securely yet.");
  }

  let scannedTotal = 0;
  let importId: string;
  try {
    const token = await exchangeCode(code);
    const { contacts, truncated } = await fetchContacts(token);
    scannedTotal = contacts.length;

    const result = await matchContacts(profileId, contacts, { truncated });

    // One current list per member. Re-importing REPLACES rather than stacks:
    // two address books for one person would leave the older one to rot, and
    // /network can only offer to open one of them.
    await prisma.contactImport.deleteMany({ where: { profileId } });

    const row = await prisma.contactImport.create({
      data: {
        profileId,
        payload: encryptJson(result),
        total: result.scanned,
        // Null: kept until the member deletes it. See migration 075 — the list
        // exists to be worked through over days, not minutes.
        expiresAt: null,
      },
      select: { id: true },
    });
    importId = row.id;
  } catch (err) {
    console.error("[network/google] import failed:", err instanceof Error ? err.message : err);
    return back("We couldn't read your contacts from Google. Nothing was saved — try again.");
  }

  // Sweep only rows that carry an expiry — imports made under the old
  // self-destructing behaviour, whose owners were told they would go. Lists
  // kept deliberately have expiresAt null and are never touched here.
  prisma.contactImport
    .deleteMany({ where: { expiresAt: { not: null, lt: new Date() } } })
    .catch(() => {});

  if (scannedTotal === 0) {
    return back("Google returned no contacts with email addresses on that account.");
  }

  const res = NextResponse.redirect(new URL(`/network/import/${importId}`, origin));
  res.cookies.delete(STATE_COOKIE);
  return res;
}
