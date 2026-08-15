/**
 * POST /api/network/invite — email a batch of non-members an invitation.
 *
 * This is the endpoint the whole feature is built around and the one that can
 * damage the sending domain, so read lib/network/doc.ts before changing any
 * number in here.
 *
 * ORDER OF CHECKS MATTERS. Cheap and refusing first, expensive and sending
 * last: rate limit → batch size → lifetime cap → suppression list → already
 * invited → create row → send. A member who is over their lifetime cap must
 * never reach the point where Resend is called, and an address on the
 * do-not-contact list must never have a row created for it.
 *
 * DELIVERY FAILURE DOES NOT FAIL THE REQUEST, and it does not lie either. The
 * invite row is the artifact; a failed send is recorded on the row as
 * sendError and shown to the inviter as "couldn't send", never as "sent".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { profileIdFor } from "@/lib/network/connections";
import { sendEmail } from "@/lib/alerts/send";
import {
  checkEmail, INVITE_FROM, inviteExpiry, newInviteToken,
  renderInviteEmail, suppressedAmong, unsubscribeUrl, type InviteSource,
} from "@/lib/network/invites";
import { NETWORK_LIMITS, NETWORK_RATE } from "@/lib/network/doc";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Up to INVITES_PER_BATCH (50) invitations, each one a sequential Resend call.
// Headroom for a slow upstream rather than a half-sent batch.
export const maxDuration = 300;

type Incoming = { email?: unknown; name?: unknown };

export async function POST(req: NextRequest) {
  const { userId, authed } = await currentIdentity();
  if (!authed || !userId) {
    return NextResponse.json({ error: "Sign in first.", authGate: true }, { status: 401 });
  }
  const profileId = await profileIdFor(userId);
  if (!profileId) return NextResponse.json({ error: "Create your profile first." }, { status: 409 });

  // Two windows on purpose, same as company invites: the hourly one stops a
  // burst, the daily one stops a patient sender who spreads it out.
  const [hMax, hWin] = NETWORK_RATE.inviteHour;
  const [dMax, dWin] = NETWORK_RATE.inviteDay;
  if (!rateLimit(`network-invite-h:${userId}`, hMax, hWin)) return NextResponse.json(RATE_LIMITED, { status: 429 });
  if (!rateLimit(`network-invite-d:${userId}`, dMax, dWin)) return NextResponse.json(RATE_LIMITED, { status: 429 });

  let body: { contacts?: unknown; source?: unknown };
  try {
    body = (await req.json()) as { contacts?: unknown; source?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Defaults to "contacts" because the import screen is the older caller and
  // omits it. Only these two values are honoured — the email's explanation of
  // why a stranger is being written to must never be attacker-chosen text.
  const source: InviteSource = body.source === "typed" ? "typed" : "contacts";

  const raw = Array.isArray(body.contacts) ? (body.contacts as Incoming[]) : [];
  if (raw.length === 0) return NextResponse.json({ error: "Nobody selected." }, { status: 400 });
  if (raw.length > NETWORK_LIMITS.INVITES_PER_BATCH) {
    return NextResponse.json(
      { error: `That's more than ${NETWORK_LIMITS.INVITES_PER_BATCH} invitations at once. Send them in smaller batches.` },
      { status: 400 }
    );
  }

  // Normalise and de-duplicate before counting against the cap, so a list with
  // the same address three times costs one.
  const wanted = new Map<string, string | null>();
  const rejected: { email: string; reason: string }[] = [];
  for (const item of raw) {
    const checked = checkEmail(item?.email);
    if (!checked.ok) {
      rejected.push({ email: String(item?.email ?? ""), reason: checked.error });
      continue;
    }
    if (!wanted.has(checked.email)) {
      const name = typeof item?.name === "string" ? item.name.trim().slice(0, 120) || null : null;
      wanted.set(checked.email, name);
    }
  }
  if (wanted.size === 0) {
    return NextResponse.json({ error: "None of those were valid email addresses.", rejected }, { status: 400 });
  }

  // Lifetime ceiling, not a window — the abuse case here is patient.
  const sentEver = await prisma.networkInvite.count({ where: { inviterId: profileId } });
  const headroom = NETWORK_LIMITS.INVITES_LIFETIME - sentEver;
  if (headroom <= 0) {
    return NextResponse.json(
      { error: `You've sent the maximum of ${NETWORK_LIMITS.INVITES_LIFETIME} invitations. Get in touch if you genuinely need more.` },
      { status: 409 }
    );
  }

  const emails = [...wanted.keys()];
  const [suppressed, existing] = await Promise.all([
    suppressedAmong(emails),
    prisma.networkInvite.findMany({
      where: { inviterId: profileId, email: { in: emails } },
      select: { email: true },
    }),
  ]);
  const alreadyInvited = new Set(existing.map((e) => e.email));

  const inviter = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { fullName: true, headlineRoleId: true },
  });
  const inviterName = inviter?.fullName?.trim();
  if (!inviterName) {
    // The email says "<name> wants to connect". Without a real name it would
    // have to say "A Topezia member", which is exactly the anonymous blast this
    // feature must not be.
    return NextResponse.json(
      { error: "Add your name to your profile first — invitations go out in your name." },
      { status: 409 }
    );
  }

  // headlineRoleId is a plain column, not a relation — resolved separately,
  // the same way every other caller does it (see app/api/r/[token]/route.ts).
  const inviterHeadline = inviter?.headlineRoleId
    ? (await prisma.role.findUnique({ where: { id: inviter.headlineRoleId }, select: { name: true } }))?.name ?? null
    : null;

  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];
  let skippedSuppressed = 0;
  let skippedDuplicate = 0;
  let skippedOverCap = 0;

  for (const [email, name] of wanted) {
    // Silent on both counts: telling the inviter "they unsubscribed" would leak
    // a stranger's choice back to the one person it was made against.
    if (suppressed.has(email)) { skippedSuppressed++; continue; }
    if (alreadyInvited.has(email)) { skippedDuplicate++; continue; }
    if (sent.length + failed.length >= headroom) { skippedOverCap++; continue; }

    const token = newInviteToken();
    let inviteId: string;
    try {
      const row = await prisma.networkInvite.create({
        data: { inviterId: profileId, email, name, token, expiresAt: inviteExpiry() },
        select: { id: true },
      });
      inviteId = row.id;
    } catch {
      // Lost the unique index race against another tab. Not an error worth
      // showing — the address is invited either way.
      skippedDuplicate++;
      continue;
    }

    try {
      const { subject, html } = renderInviteEmail({
        inviterName,
        inviterHeadline,
        recipientName: name,
        source,
        token,
      });
      await sendEmail({
        to: email, subject, html,
        from: INVITE_FROM,
        listUnsubscribeUrl: unsubscribeUrl(token),
      });
      await prisma.networkInvite.update({ where: { id: inviteId }, data: { sentAt: new Date() } });
      sent.push(email);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error("[network/invite] delivery failed:", message);
      // Keep the row (the link still works if they share it another way) but
      // record the truth on it.
      await prisma.networkInvite
        .update({ where: { id: inviteId }, data: { sendError: message.slice(0, 500) } })
        .catch(() => {});
      failed.push({ email, error: "We couldn't deliver this one." });
    }
  }

  return NextResponse.json({
    sent: sent.length,
    failed,
    rejected,
    skipped: {
      duplicate: skippedDuplicate,
      overCap: skippedOverCap,
      // Deliberately folded into one opaque number — see above.
      unavailable: skippedSuppressed,
    },
    remaining: Math.max(0, headroom - sent.length - failed.length),
  });
}
