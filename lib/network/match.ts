/**
 * Turning an address book into two lists: people who are here, and people who
 * are not.
 *
 * THE PRIVACY LINE. This will happily tell you that alice@example.com is a
 * Topezia member — which is a membership oracle, and would be a real problem if
 * anyone could type an address and ask. They cannot. The only way in is Google
 * consent on the member's OWN account, so every address checked is one they
 * already hold. There is deliberately no endpoint that takes a typed address
 * and answers the same question. If one is ever added, it needs a different
 * answer than this file gives.
 *
 * Matching is on the ACCOUNT address (auth.users.email) and on the optional
 * public contact address a member chose to publish (Profile.contactEmail).
 * The second matters more than it looks: plenty of people sign up with a
 * personal address and publish their work one, and their colleagues' address
 * books hold the work one.
 */
import { prisma } from "@/lib/prisma";
import type { ImportedContact } from "@/lib/network/google";
import { degreesTo, type Degree } from "@/lib/network/connections";

export type MatchedMember = {
  profileId: string;
  /** What their address book called them, kept only to explain the match. */
  contactName: string | null;
  fullName: string | null;
  publicSlug: string | null;
  photoUrl: string | null;
  headline: string | null;
  location: string | null;
  degree: Degree;
};

export type InvitableContact = { name: string | null; email: string };

export type MatchResult = {
  members: MatchedMember[];
  invitable: InvitableContact[];
  /** Everything Google gave us, before any of it was filtered. */
  scanned: number;
  truncated: boolean;
};

type Row = {
  id: string;
  publicSlug: string | null;
  fullName: string | null;
  photoUrl: string | null;
  currentLocation: string | null;
  publicVisible: boolean;
  headline: string | null;
  // BOTH addresses come back, not a COALESCE of them. A member whose account
  // address is personal@ and whose published contact address is work@ matches
  // on work@ — and COALESCE would have handed back personal@, which is not in
  // the contact list. The address would then look unmatched and we would email
  // an existing member an invitation to join.
  accountEmail: string | null;
  contactEmail: string | null;
};

/**
 * Split `contacts` into members and invitable strangers.
 *
 * `viewerProfileId` is excluded from the member list (finding yourself in your
 * own address book is not a discovery), and their own addresses are dropped
 * from the invitable list too.
 */
export async function matchContacts(
  viewerProfileId: string,
  contacts: ImportedContact[],
  opts: { truncated?: boolean } = {}
): Promise<MatchResult> {
  const scanned = contacts.length;
  if (scanned === 0) {
    return { members: [], invitable: [], scanned: 0, truncated: Boolean(opts.truncated) };
  }

  const byEmail = new Map(contacts.map((c) => [c.email, c] as const));
  const emails = [...byEmail.keys()];

  // One pass over both address columns. lower() on the stored side because
  // neither auth.users nor Profile.contactEmail is guaranteed normalised, and a
  // case-sensitive miss here would silently show a member as "not on Topezia"
  // and then email them an invitation to join something they are already on.
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT p.id,
            p."publicSlug",
            p."fullName",
            p."photoUrl",
            p."currentLocation",
            p."publicVisible",
            r.name AS headline,
            lower(u.email) AS "accountEmail",
            lower(p."contactEmail") AS "contactEmail"
       FROM "Profile" p
       LEFT JOIN auth.users u ON u.id::text = p."userId"
       LEFT JOIN "Role" r ON r.id = p."headlineRoleId"
      WHERE lower(u.email) = ANY($1::text[])
         OR lower(p."contactEmail") = ANY($1::text[])`,
    emails
  );

  // Which of the member's two addresses was actually in the contact list.
  // Both may be, in which case the account address wins for naming purposes.
  const seenProfile = new Set<string>();
  const matchedEmails = new Set<string>();
  const deduped: { row: Row; matchedEmail: string }[] = [];

  for (const row of rows) {
    const hits = [row.accountEmail, row.contactEmail].filter(
      (e): e is string => Boolean(e) && byEmail.has(e!)
    );
    // Every matching address is off the invite list, even the one we don't
    // use for the name.
    for (const hit of hits) matchedEmails.add(hit);

    if (row.id === viewerProfileId || seenProfile.has(row.id)) continue;
    const matchedEmail = hits[0];
    if (!matchedEmail) continue; // matched on an address no longer in the list
    seenProfile.add(row.id);
    deduped.push({ row, matchedEmail });
  }

  const degrees = await degreesTo(viewerProfileId, deduped.map((d) => d.row.id));

  const members: MatchedMember[] = deduped.map(({ row, matchedEmail }) => ({
    profileId: row.id,
    contactName: byEmail.get(matchedEmail)?.name ?? null,
    fullName: row.fullName,
    // Only link to a page that will actually render — publicVisible false
    // makes /p/{slug} a 404, and linking a name to one is worse than not
    // linking it.
    publicSlug: row.publicVisible ? row.publicSlug : null,
    photoUrl: row.photoUrl,
    headline: row.headline,
    location: row.currentLocation,
    degree: degrees.get(row.id) ?? "none",
  }));

  // Anything that matched ANY profile is off the invite list — including a
  // profile we filtered out above (the viewer's own second address). Inviting
  // an existing member to "join Topezia" is the most embarrassing failure this
  // feature has.
  const unmatched = contacts.filter((c) => !matchedEmails.has(c.email));

  const invitable = await filterInvitable(viewerProfileId, unmatched);

  return { members, invitable, scanned, truncated: Boolean(opts.truncated) };
}

/**
 * Drop the addresses we must not mail: anyone on the global do-not-contact
 * list, and anyone this member has already invited.
 *
 * Both are dropped SILENTLY. Telling the member "this person unsubscribed"
 * would leak a stranger's choice back to the one person it was made against,
 * and would turn the suppression list into a way to learn who opted out.
 */
async function filterInvitable(
  viewerProfileId: string,
  contacts: ImportedContact[]
): Promise<InvitableContact[]> {
  if (contacts.length === 0) return [];
  const emails = contacts.map((c) => c.email);

  const [suppressed, already] = await Promise.all([
    prisma.inviteSuppression.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    prisma.networkInvite.findMany({
      where: { inviterId: viewerProfileId, email: { in: emails } },
      select: { email: true },
    }),
  ]);

  const blocked = new Set([...suppressed.map((s) => s.email), ...already.map((a) => a.email)]);
  return contacts
    .filter((c) => !blocked.has(c.email))
    .map((c) => ({ name: c.name, email: c.email }));
}
