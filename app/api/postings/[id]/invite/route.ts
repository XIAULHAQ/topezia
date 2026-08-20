/**
 * GET  /api/postings/[id]/invite — who has been invited to this posting.
 * POST /api/postings/[id]/invite — invite members and/or email addresses.
 *
 * OWNERSHIP IS CHECKED HERE, on the posting, exactly as /api/employer/sourced
 * does it — so a jobId belonging to someone else cannot be used to send mail
 * in their name, or to enumerate their candidates.
 *
 * CONSENT IS RE-CHECKED, NOT TRUSTED. Member invitations name a profileId that
 * arrived from the browser, so the gates that made that profile visible in the
 * first place (openToWork AND publicVisible) are verified again here. Without
 * that, the sourcing query's consent rules would be advisory: anyone could POST
 * any profile id.
 *
 * Order of checks is cheap-and-refusing first, expensive-and-sending last, for
 * the same reason as the network invite endpoint: an employer over their cap
 * must never reach the point where Resend is called.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { sendEmail } from "@/lib/alerts/send";
import { checkEmail } from "@/lib/network/addresses";
import { suppressedAmong } from "@/lib/network/invites";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import {
  JOB_INVITE_FROM, JOB_INVITE_LIMITS, JOB_INVITE_RATE,
  jobInviteExpiry, jobInviteUnsubscribeUrl, newJobInviteToken, renderJobInviteEmail,
} from "@/lib/employer/job-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_SELECT = {
  id: true, titleRaw: true, kind: true, companyName: true, status: true,
  locationState: true, country: true,
  salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
  company: { select: { name: true } },
} as const;

/** The posting, only if this account owns it. */
async function ownedJob(userId: string, jobId: string) {
  return prisma.job.findFirst({
    where: { id: jobId, OR: [{ postedByUserId: userId }, { company: { ownerUserId: userId } }] },
    select: JOB_SELECT,
  });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const job = await ownedJob(userId, params.id);
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const invites = await prisma.jobInvite.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, email: true, name: true, status: true, sentAt: true, sendError: true, createdAt: true,
      profile: { select: { fullName: true, publicSlug: true, photoUrl: true } },
    },
  });

  return NextResponse.json({
    jobTitle: job.titleRaw,
    limits: JOB_INVITE_LIMITS,
    remaining: Math.max(0, JOB_INVITE_LIMITS.PER_POSTING - invites.length),
    invites: invites.map((i) => ({
      id: i.id,
      who: i.profile?.fullName ?? i.name ?? i.email,
      email: i.email,
      slug: i.profile?.publicSlug ?? null,
      photoUrl: i.profile?.photoUrl ?? null,
      isMember: Boolean(i.profile),
      status: i.status,
      sent: i.sentAt !== null,
      sendError: i.sendError,
      at: i.createdAt.toISOString(),
    })),
  });
}

type Incoming = { profileIds?: unknown; emails?: unknown; note?: unknown };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await currentIdentity();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const [hMax, hWin] = JOB_INVITE_RATE.hour;
  const [dMax, dWin] = JOB_INVITE_RATE.day;
  if (!rateLimit(`job-invite-h:${userId}`, hMax, hWin)) return NextResponse.json(RATE_LIMITED, { status: 429 });
  if (!rateLimit(`job-invite-d:${userId}`, dMax, dWin)) return NextResponse.json(RATE_LIMITED, { status: 429 });

  const job = await ownedJob(userId, params.id);
  if (!job) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (job.status !== "LIVE") {
    // Inviting someone to a page that 404s, or to a closed role, wastes their
    // time and ours.
    return NextResponse.json({ error: "Publish this posting before inviting anyone to it." }, { status: 409 });
  }

  let body: Incoming;
  try { body = (await req.json()) as Incoming; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const profileIds = [...new Set((Array.isArray(body.profileIds) ? body.profileIds : [])
    .filter((v): v is string => typeof v === "string" && v.length > 0))];

  const rawEmails = Array.isArray(body.emails) ? body.emails : [];
  const emails = new Map<string, string | null>();
  const rejected: string[] = [];
  for (const item of rawEmails) {
    const value = typeof item === "string" ? item : (item as { email?: unknown })?.email;
    const name = typeof item === "object" && item && typeof (item as { name?: unknown }).name === "string"
      ? ((item as { name: string }).name.trim().slice(0, 120) || null) : null;
    const checked = checkEmail(value);
    if (!checked.ok) { rejected.push(String(value ?? "")); continue; }
    if (!emails.has(checked.email)) emails.set(checked.email, name);
  }

  const wanted = profileIds.length + emails.size;
  if (wanted === 0) return NextResponse.json({ error: "Nobody selected.", rejected }, { status: 400 });
  if (wanted > JOB_INVITE_LIMITS.PER_BATCH) {
    return NextResponse.json(
      { error: `That's more than ${JOB_INVITE_LIMITS.PER_BATCH} people at once. Send them in smaller batches.` },
      { status: 400 }
    );
  }

  const alreadySent = await prisma.jobInvite.count({ where: { jobId: job.id } });
  const headroom = JOB_INVITE_LIMITS.PER_POSTING - alreadySent;
  if (headroom <= 0) {
    return NextResponse.json(
      { error: `This posting has already invited ${JOB_INVITE_LIMITS.PER_POSTING} people.` },
      { status: 409 }
    );
  }

  const note = typeof body.note === "string"
    ? body.note.replace(/\s+/g, " ").trim().slice(0, JOB_INVITE_LIMITS.NOTE_MAX) || null
    : null;

  // Re-verify the consent gates rather than trusting ids from the browser.
  const members = profileIds.length
    ? await prisma.profile.findMany({
        where: { id: { in: profileIds }, openToWork: true, publicVisible: true, userId: { not: userId } },
        select: { id: true, fullName: true, userId: true },
      })
    : [];

  const [suppressed, existing] = await Promise.all([
    suppressedAmong([...emails.keys()]),
    prisma.jobInvite.findMany({
      where: { jobId: job.id, OR: [{ profileId: { in: profileIds } }, { email: { in: [...emails.keys()] } }] },
      select: { profileId: true, email: true },
    }),
  ]);
  const doneProfiles = new Set(existing.map((e) => e.profileId).filter(Boolean) as string[]);
  const doneEmails = new Set(existing.map((e) => e.email).filter(Boolean) as string[]);

  const inviter = await prisma.profile.findUnique({ where: { userId }, select: { fullName: true } });
  const inviterName = inviter?.fullName?.trim();
  if (!inviterName) {
    return NextResponse.json(
      { error: "Add your name to your profile first — invitations go out in your name." },
      { status: 409 }
    );
  }

  const location = [job.locationState, job.country].filter(Boolean).join(", ") || null;
  const salary = job.salaryMin || job.salaryMax
    ? `${job.salaryCurrency ?? ""} ${job.salaryMin ?? ""}${job.salaryMin && job.salaryMax ? "–" : ""}${job.salaryMax ?? ""}`.trim()
    : null;

  type Target = { profileId: string | null; email: string | null; name: string | null; to: string | null };
  const targets: Target[] = [];
  let skipped = 0;

  for (const m of members) {
    if (doneProfiles.has(m.id)) { skipped++; continue; }
    targets.push({ profileId: m.id, email: null, name: m.fullName, to: await accountEmail(m.userId) });
  }
  // A profile id that failed the consent re-check simply isn't here.
  skipped += profileIds.length - members.length;

  for (const [email, name] of emails) {
    if (suppressed.has(email) || doneEmails.has(email)) { skipped++; continue; }
    targets.push({ profileId: null, email, name, to: email });
  }

  const sent: string[] = [];
  const failed: string[] = [];

  for (const t of targets) {
    if (sent.length + failed.length >= headroom) { skipped++; continue; }

    let inviteId: string;
    const token = newJobInviteToken();
    try {
      const row = await prisma.jobInvite.create({
        data: {
          jobId: job.id, invitedByUserId: userId,
          profileId: t.profileId, email: t.email, name: t.name,
          token, note, expiresAt: jobInviteExpiry(),
        },
        select: { id: true },
      });
      inviteId = row.id;
    } catch {
      skipped++; // lost the unique-index race; they are invited either way
      continue;
    }

    if (!t.to) {
      // A member with no reachable address. The invitation still exists and
      // shows in the employer's list, so it is never silently dropped.
      await prisma.jobInvite.update({ where: { id: inviteId }, data: { sendError: "no email on file" } }).catch(() => {});
      failed.push(t.name ?? "someone");
      continue;
    }

    try {
      const { subject, html } = renderJobInviteEmail({
        inviterName,
        companyName: job.company?.name ?? job.companyName ?? null,
        jobTitle: job.titleRaw, jobKind: job.kind,
        location, salary, note, recipientName: t.name,
        job: { id: job.id, titleRaw: job.titleRaw, companyName: job.companyName },
        token,
      });
      await sendEmail({ to: t.to, subject, html, from: JOB_INVITE_FROM, listUnsubscribeUrl: jobInviteUnsubscribeUrl(token) });
      await prisma.jobInvite.update({ where: { id: inviteId }, data: { sentAt: new Date() } });
      sent.push(t.name ?? t.email ?? "someone");
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.error("[job-invite] delivery failed:", message);
      await prisma.jobInvite.update({ where: { id: inviteId }, data: { sendError: message.slice(0, 500) } }).catch(() => {});
      failed.push(t.name ?? t.email ?? "someone");
    }
  }

  return NextResponse.json({
    sent: sent.length,
    failed: failed.length,
    skipped,
    rejected,
    remaining: Math.max(0, headroom - sent.length - failed.length),
  });
}

/** A member's account address, from Supabase's auth.users in the same Postgres. */
async function accountEmail(userId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ email: string | null }[]>(
      `SELECT email FROM auth.users WHERE id::text = $1 LIMIT 1`, userId
    );
    const email = rows[0]?.email ?? null;
    return email ? email.trim().toLowerCase() : null;
  } catch { return null; }
}
