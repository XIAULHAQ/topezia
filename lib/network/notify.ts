/**
 * The connection digest: "someone wants to connect" and "someone said yes", in
 * one email.
 *
 * WHY ONE EMAIL AND NOT TWO. A member who gets three requests and two
 * acceptances in a morning has had one thing happen — their network moved — and
 * telling them twice doubles the send volume to say it. So both halves are
 * gathered, one email goes out, and the 24-hour quiet window covers the pair.
 * The alternative (separate windows per type) also means an acceptance can
 * arrive an inconvenient hour after the request email that already mentioned
 * the same person.
 *
 * WHY THE ACCEPTANCE HALF ALSO COVERS INVITATIONS. An emailed invitation that
 * gets accepted becomes an ACCEPTED edge whose requester is the inviter (see
 * app/api/network/accept). So "tell the requester" answers both "your request
 * was accepted" and "the person you invited joined". Only the wording differs,
 * driven by fromInviteId.
 *
 * WHY THIS IS A CRON AND NOT AN INLINE SEND. The obvious design emails at the
 * moment of the event. It breaks on the batch: the import screen can create 100
 * requests in one POST, and sending inside that request would blow the time
 * limit and couple "did my requests save?" to "did Resend answer?".
 *
 * THE THREE RULES.
 *  1. One email covers everything the member has not been told about.
 *  2. At most one email per member per QUIET_HOURS, counting both halves.
 *  3. Rows are marked notified whether or not delivery succeeded — see
 *     markNotified for why that is the right way round.
 *
 * This is bulk mail by Gmail's and Yahoo's definition, so it carries
 * List-Unsubscribe and List-Unsubscribe-Post (RFC 8058) like every other bulk
 * send here. See lib/alerts/send.ts.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail, siteUrl } from "@/lib/alerts/send";
import { INVITE_FROM } from "@/lib/network/invites";

/** No member hears from us about their network more often than this. */
export const QUIET_HOURS = 24;

/** Names listed per section before it becomes "and N others". */
const NAMES_SHOWN = 5;

/** Members handled in one cron run. A ceiling so a surge can't turn one
 *  invocation into a thousand sequential Resend calls; the leftovers are picked
 *  up on the next tick, because nothing was marked notified. */
const MAX_RECIPIENTS_PER_RUN = 200;

export function notifyUnsubscribeUrl(token: string): string {
  return `${siteUrl()}/api/network/notify-unsubscribe?token=${token}`;
}

/** One section of the digest: some named people, and a count of the rest. */
export type Section = { ids: string[]; names: string[]; extra: number };

const emptySection = (): Section => ({ ids: [], names: [], extra: 0 });

/** Turn a raw (id, name) list into a section, capping the named part. */
function toSection(rows: { id: string; name: string | null }[]): Section {
  const names = rows.map((r) => r.name?.trim()).filter((n): n is string => Boolean(n));
  return {
    ids: rows.map((r) => r.id),
    names: names.slice(0, NAMES_SHOWN),
    // Everyone the list does not name — whether because they have no name on
    // their profile or because they fell past the cap — is still a real person
    // and still counted.
    extra: rows.length - Math.min(names.length, NAMES_SHOWN),
  };
}

const sectionTotal = (s: Section) => s.names.length + s.extra;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The subject line, which has to be true in four different shapes. */
function subjectFor(requests: Section, accepts: Section, anyJoined: boolean): string {
  const r = sectionTotal(requests);
  const a = sectionTotal(accepts);

  if (a === 0) {
    return r === 1 && requests.names[0]
      ? `${requests.names[0]} wants to connect with you on Topezia`
      : `${r} people want to connect with you on Topezia`;
  }

  if (r === 0) {
    if (a === 1 && accepts.names[0]) {
      return anyJoined
        ? `${accepts.names[0]} joined Topezia — you're now connected`
        : `${accepts.names[0]} accepted your connection request`;
    }
    // Mixed causes at this size; "new connections" is true of all of them.
    return `You have ${a} new connections on Topezia`;
  }

  return `${a} new ${plural(a, "connection", "connections")} and ${r} ${plural(r, "request", "requests")} on Topezia`;
}

function listHtml(section: Section, muted: string): string {
  const named = section.names.map((n) => `<li style="margin:0 0 6px;">${escapeHtml(n)}</li>`).join("");
  const rest = section.extra > 0
    ? `<li style="margin:0 0 6px;color:${muted};">and ${section.extra} ${plural(section.extra, "other", "others")}</li>`
    : "";
  return `<ul style="color:#1a1a2e;font-size:15px;line-height:1.6;margin:0 0 20px;padding-left:20px;">${named}${rest}</ul>`;
}

export function renderDigestEmail(opts: {
  recipientName: string | null;
  requests: Section;
  accepts: Section;
  /** At least one acceptance came from an invitation this member sent. */
  anyJoined: boolean;
  unsubToken: string;
}): { subject: string; html: string } {
  const { recipientName, requests, accepts, anyJoined, unsubToken } = opts;
  const MUTED = "#6b7280";
  const r = sectionTotal(requests);
  const a = sectionTotal(accepts);
  const hi = recipientName ? `Hi ${escapeHtml(recipientName.split(" ")[0]!)},` : "Hi,";

  // Good news first: an acceptance is something the member can act on happily,
  // a request is a decision they owe someone.
  const acceptBlock = a > 0
    ? `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">${
        anyJoined
          ? `${a === 1 ? "Someone you invited has joined Topezia" : "People you invited have joined Topezia"} — you're now connected:`
          : `${a === 1 ? "Your connection request was accepted" : "Your connection requests were accepted"}:`
      }</p>${listHtml(accepts, MUTED)}`
    : "";

  const requestBlock = r > 0
    ? `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">${
        a > 0 ? "And these people have asked to connect with you:"
              : r === 1 ? "Someone has asked to connect with you:"
              : "These people have asked to connect with you:"
      }</p>${listHtml(requests, MUTED)}`
    : "";

  // The call to action follows whichever half needs a decision.
  const cta = r > 0 ? (r === 1 ? "See the request" : "See your requests") : "See your network";
  const footnote = r > 0
    ? `Nothing is shared with them unless you accept. Ignoring a request tells them nothing.`
    : `Say hello, or take a look at what they're working on.`;

  return {
    subject: subjectFor(requests, accepts, anyJoined),
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f7f7fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-weight:800;font-size:22px;color:#4f46e5;margin-bottom:20px;">topezia</div>
    <div style="background:#fff;border:1px solid #ececf2;border-radius:16px;padding:24px;">
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 14px;">${hi}</p>
      ${acceptBlock}${requestBlock}
      <a href="${siteUrl()}/network" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;">${cta}</a>
      <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:20px 0 0;">${footnote}</p>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px;line-height:1.5;">
      You're getting this because of activity in your Topezia network.<br>
      <a href="${notifyUnsubscribeUrl(unsubToken)}" style="color:#9ca3af;">Turn off connection emails</a> — this one setting only; your other emails are unaffected.
    </p>
  </div></body></html>`,
  };
}

type Pending = { requests: Section; accepts: Section; anyJoined: boolean };

/**
 * Everyone with something they have not been told, keyed by who to tell.
 *
 * The two halves are gathered from opposite ends of the row — a request is news
 * for the ADDRESSEE, an acceptance is news for the REQUESTER — then merged, so
 * a member who has both gets one entry.
 */
async function whoIsWaiting(): Promise<Map<string, Pending>> {
  const [requestRows, acceptRows] = await Promise.all([
    prisma.connection.findMany({
      where: { status: "PENDING", notifiedAt: null },
      select: { id: true, addresseeId: true, requester: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.connection.findMany({
      where: { status: "ACCEPTED", acceptNotifiedAt: null },
      select: {
        id: true, requesterId: true, fromInviteId: true,
        addressee: { select: { fullName: true } },
      },
      orderBy: { respondedAt: "asc" },
    }),
  ]);

  const requestsBy = new Map<string, { id: string; name: string | null }[]>();
  for (const row of requestRows) {
    const list = requestsBy.get(row.addresseeId) ?? [];
    list.push({ id: row.id, name: row.requester.fullName });
    requestsBy.set(row.addresseeId, list);
  }

  const acceptsBy = new Map<string, { id: string; name: string | null }[]>();
  const joinedBy = new Set<string>();
  for (const row of acceptRows) {
    const list = acceptsBy.get(row.requesterId) ?? [];
    list.push({ id: row.id, name: row.addressee.fullName });
    acceptsBy.set(row.requesterId, list);
    if (row.fromInviteId) joinedBy.add(row.requesterId);
  }

  const out = new Map<string, Pending>();
  for (const profileId of new Set([...requestsBy.keys(), ...acceptsBy.keys()])) {
    out.set(profileId, {
      requests: requestsBy.has(profileId) ? toSection(requestsBy.get(profileId)!) : emptySection(),
      accepts: acceptsBy.has(profileId) ? toSection(acceptsBy.get(profileId)!) : emptySection(),
      anyJoined: joinedBy.has(profileId),
    });
  }
  return out;
}

/**
 * Mark rows as told, each on its own column.
 *
 * Called EVEN WHEN DELIVERY FAILED, deliberately. The alternative — retry on
 * the next tick — turns a permanently bad address (a bounced corporate mailbox,
 * a typo'd domain) into an every-four-hours retry forever, which is exactly the
 * behaviour that gets a sending domain blocked. The member still sees
 * everything in the app; only the nudge was lost, and one lost nudge is cheaper
 * than the reputation.
 */
async function markNotified(p: Pending): Promise<void> {
  const now = new Date();
  if (p.requests.ids.length) {
    await prisma.connection.updateMany({ where: { id: { in: p.requests.ids } }, data: { notifiedAt: now } });
  }
  if (p.accepts.ids.length) {
    await prisma.connection.updateMany({ where: { id: { in: p.accepts.ids } }, data: { acceptNotifiedAt: now } });
  }
}

/**
 * When this member was last emailed, from either half. Both ends of the row are
 * checked because either could have been the reason for the last send.
 */
async function lastEmailedAt(profileId: string): Promise<number> {
  const [asAddressee, asRequester] = await Promise.all([
    prisma.connection.findFirst({
      where: { addresseeId: profileId, notifiedAt: { not: null } },
      orderBy: { notifiedAt: "desc" },
      select: { notifiedAt: true },
    }),
    prisma.connection.findFirst({
      where: { requesterId: profileId, acceptNotifiedAt: { not: null } },
      orderBy: { acceptNotifiedAt: "desc" },
      select: { acceptNotifiedAt: true },
    }),
  ]);
  return Math.max(
    asAddressee?.notifiedAt?.getTime() ?? 0,
    asRequester?.acceptNotifiedAt?.getTime() ?? 0
  );
}

export type NotifyResult = {
  candidates: number;
  sent: number;
  quiet: number;
  optedOut: number;
  failed: number;
  deferred: number;
  /** What went out, for the cron log. */
  requestsIncluded: number;
  acceptsIncluded: number;
};

/** One cron pass. Safe to run as often as you like — the rules decide. */
export async function runConnectionNotifications(): Promise<NotifyResult> {
  const waiting = [...(await whoIsWaiting())];
  const result: NotifyResult = {
    candidates: waiting.length, sent: 0, quiet: 0, optedOut: 0, failed: 0, deferred: 0,
    requestsIncluded: 0, acceptsIncluded: 0,
  };

  const batch = waiting.slice(0, MAX_RECIPIENTS_PER_RUN);
  result.deferred = waiting.length - batch.length;

  for (const [profileId, pending] of batch) {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true, fullName: true, connectionEmails: true, notifyUnsubToken: true },
    });
    if (!profile) continue;

    if (!profile.connectionEmails) {
      // Opted out. Mark anyway — otherwise these rows are rescanned on every
      // tick forever, and the moment they switched the setting back on they
      // would be emailed about things from months ago.
      await markNotified(pending);
      result.optedOut++;
      continue;
    }

    // Rule 2: one email per QUIET_HOURS, counting both halves.
    if (Date.now() < (await lastEmailedAt(profileId)) + QUIET_HOURS * 60 * 60 * 1000) {
      // Left UNMARKED on purpose: this is still news, just not yet. The next
      // tick after the window closes picks it up.
      result.quiet++;
      continue;
    }

    const email = await accountEmail(profile.userId);
    if (!email) { await markNotified(pending); continue; }

    const { subject, html } = renderDigestEmail({
      recipientName: profile.fullName,
      requests: pending.requests,
      accepts: pending.accepts,
      anyJoined: pending.anyJoined,
      unsubToken: profile.notifyUnsubToken,
    });

    try {
      await sendEmail({
        to: email, subject, html,
        from: INVITE_FROM,
        listUnsubscribeUrl: notifyUnsubscribeUrl(profile.notifyUnsubToken),
      });
      result.sent++;
      result.requestsIncluded += pending.requests.ids.length;
      result.acceptsIncluded += pending.accepts.ids.length;
    } catch (err) {
      console.error("[network/notify] delivery failed:", err instanceof Error ? err.message : err);
      result.failed++;
    }
    // Either way — see markNotified.
    await markNotified(pending);
  }

  return result;
}

/** The account address, from Supabase's auth.users in the same Postgres. */
async function accountEmail(userId: string): Promise<string | null> {
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
