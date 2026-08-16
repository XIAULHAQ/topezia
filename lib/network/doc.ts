/**
 * The member graph: what it is, and what stops it becoming a spam machine.
 *
 * THE FEATURE. A member connects their Google account, we read their contacts
 * once, and show them two lists: people already on Topezia (send a connection
 * request) and people who are not (send an invitation by email). Mutual accept
 * on both sides — LinkedIn's model.
 *
 * THE RISK, STATED PLAINLY. Until now the product mailed a stranger in exactly
 * one place, one address at a time (lib/company/invites.ts), and endorsements
 * deliberately refused to mail anyone at all ("Topezia sends no email on a
 * member's behalf, so we can never be turned into a way to mail strangers").
 * This feature breaks that rule on purpose and in bulk. Every number below is
 * the price of doing it without earning the reputation Alignable has.
 *
 * THE FOUR GUARDRAILS.
 *  1. Caps — a hard ceiling per batch and per member, forever. Not a rate that
 *     resets: a lifetime number, because the failure mode is a patient sender.
 *  2. Two rate-limit windows — hourly stops a burst, daily stops the patient
 *     one. Same shape as company invites.
 *  3. A global do-not-contact list — one person saying "stop" stops every
 *     member, not just the one who imported them. See InviteSuppression.
 *  4. Never one address twice — the unique index on (inviterId, email) makes a
 *     second invitation from the same member impossible, not merely discouraged.
 *
 * WHAT WE DELIBERATELY DID NOT COPY FROM ALIGNABLE. Their screen pre-ticks
 * every checkbox and offers "Add All (46)". Pre-ticking turns "I wanted to add
 * three people" into 46 emails sent by someone who did not read the screen, and
 * it is the single decision that earns a network product its reputation. Ours
 * starts with nothing selected and asks the member to choose — see
 * SELECT_ALL_DEFAULT and app/network/import/import-client.tsx.
 */

/** Nothing is pre-selected on the import screen. See the note above — this is
 *  the one Alignable behaviour we consciously refused. */
export const SELECT_ALL_DEFAULT = false;

export const NETWORK_LIMITS = {
  /** Invitations to non-members in one submission. */
  INVITES_PER_BATCH: 50,
  /** Invitations to non-members a member may ever send. A lifetime ceiling,
   *  not a window: the abuse case is patient, not bursty. */
  INVITES_LIFETIME: 500,
  /** Connection requests to existing members in one submission. Higher than
   *  the invite cap because these are in-product notifications to people who
   *  already chose to be here, not mail to strangers. */
  REQUESTS_PER_BATCH: 100,
  /** Connection requests a member may have outstanding at once. Unanswered
   *  requests piling up is the signal that someone is adding people they do
   *  not actually know. */
  MAX_PENDING_REQUESTS: 500,
  /** Characters in the optional "add a note" line. */
  NOTE_MAX: 300,
  /** Contacts we will read from one Google account. Above this we take the
   *  first N and tell the member how many we skipped — silently truncating an
   *  address book would make the screen lie about what it looked at. */
  MAX_CONTACTS: 2000,
  /**
   * How long an imported address book may sit in the database.
   *
   * A day, not an hour. The screen offers 50 invitations at a time, so a member
   * with 600 contacts needs a dozen passes — an hour made that impossible and
   * silently binned the list mid-way. Google's Limited Use rule is "only as
   * long as necessary to provide the feature", and a feature that asks someone
   * to review hundreds of people plainly needs longer than one sitting.
   *
   * It is still a hard ceiling, and it is still deleted the moment the member
   * presses Done or works through the list — the TTL is the backstop, not the
   * plan. If this number changes, change the verification justification with
   * it: docs/runbooks/google-verification-submission.md states it to Google.
   */
  IMPORT_TTL_MINUTES: 24 * 60,
  /** How long an emailed invitation stays good. */
  INVITE_TTL_DAYS: 60,
} as const;

/** Hourly / daily windows for the two endpoints that spend deliverability.
 *  Tuples of [max, windowMs], read by the routes. */
export const NETWORK_RATE = {
  inviteHour: [60, 60 * 60 * 1000],
  inviteDay: [150, 24 * 60 * 60 * 1000],
  requestHour: [200, 60 * 60 * 1000],
  importDay: [10, 24 * 60 * 60 * 1000],
} as const satisfies Record<string, readonly [number, number]>;
