# Turning on the member network + Google contact import

The code is written and typechecks. Three things stand between it and members
being able to use it, in this order. The first two are yours; the third is
Google's and is the long pole.

---

## 1. Apply migration 071 to the database

**DONE — applied to the live database 2026-08-15**, on Brandon's instruction.
Verified afterwards: all four tables, both enums, 13 indexes, five foreign keys
and the `Connection_not_self` CHECK are present, and `prisma migrate status`
reports the schema up to date.

The migration is purely additive: four new tables (`Connection`,
`NetworkInvite`, `ContactImport`, `InviteSuppression`), two new enums, and their
indexes. It does **not** alter any existing table, touch any existing row, or
drop anything. Every statement is `IF NOT EXISTS` or guarded by a
`duplicate_object` handler, so it is safe to run twice.

Same procedure as 044–070 — hand-written SQL, never `prisma migrate dev` (the
pgvector drift trap):

```bash
npx prisma db execute --file prisma/migrations/071_network_connections/migration.sql --schema prisma/schema.prisma
```

```bash
npx prisma migrate resolve --applied 071_network_connections
```

Both steps are recorded above only so the procedure is on file for the next
migration — do not re-run them. Before it was applied, `/network` rendered its
signed-out state fine but any signed-in read threw
`The table public.NetworkInvite does not exist`; that is now gone.

---

## 2. Set the environment variables

| Variable | Needed for | Status |
|---|---|---|
| `GOOGLE_CLIENT_ID` | contact import | set (Production, 2026-08-15) |
| `GOOGLE_CLIENT_SECRET` | contact import | set (Production, 2026-08-15) |
| `TOPEZIA_SECRET_KEY` | encrypting the imported address book | already set |
| `RESEND_API_KEY` | sending invitations | already set |
| `NETWORK_FROM_EMAIL` | sender identity on invitations | optional |
| `CRON_SECRET` | connection notification emails | already set |

`CRON_SECRET` is **already set in Vercel** (Sensitive, Preview + Production;
verified 2026-08-15). It is deliberately NOT in the local `.env`, which is why
the cron route answers 404 to a local `curl` — that is the fail-closed path
working, not a misconfiguration. Without the secret the cron sends nothing,
because an unauthenticated trigger would let anyone force-send mail to members.
The in-app badge is unaffected either way.

To exercise the cron locally, add a `CRON_SECRET` of your own to `.env` and call
the route with `Authorization: Bearer <that value>`. It does not need to match
the deployed one — each deployment checks its own.

`NETWORK_FROM_EMAIL` defaults to `Topezia <invites@mail.topezia.com>`. Anything
on the already-verified `mail.topezia.com` subdomain works without touching
Resend, so this needs no action unless you want a different name on the
envelope.

Without the two Google variables the feature degrades honestly rather than
breaking: `/network` loads, and the import button renders disabled as
"Contact import isn't switched on yet". Everything else — connection requests,
accepting, **inviting people by email**, and the invitation pages — works.

## Two ways to invite

Contact import cannot be the only way in. It needs a Google account, it needs
Google to have verified us, and it asks for a member's *entire address book* to
invite three colleagues. So there are two entry points, both hitting the same
`POST /api/network/invite` and the same guardrails:

| | Reached by | Available |
|---|---|---|
| **Invite by email** | typing or pasting addresses on `/network` | **now** |
| **Contact import** | Connect Google Contacts → results screen | after Google verification |

The paste box accepts whatever a mail client puts on the clipboard: bare
addresses, `Name <addr>`, quoted names containing commas, separated by commas,
semicolons or newlines. Parsing lives in `lib/network/addresses.ts` — a
**Prisma-free module**, because the form is a client component and importing
`lib/network/invites.ts` would drag the database client into the browser bundle.
The server re-parses and re-validates on receipt; a browser is not a validator.

The two paths send **differently worded email**. `source: "contacts"` says the
inviter *found you in their contacts*; `source: "typed"` says they *entered your
address*. The sentence explaining why a stranger is being written to is the one
sentence that must not be wrong, and only those two values are honoured — it is
never attacker-chosen text.

---

## 3. Google OAuth verification — the long pole

### DONE — what exists today (built 2026-08-15)

| | |
|---|---|
| Google account | `zia.esource@gmail.com` — **owns the OAuth app permanently** |
| GCP project | name `Topezia`, id `topezia`, billing "Firebase Payment" |
| API | Google People API — enabled |
| Consent screen | External, publishing status **Testing** |
| App name shown to users | `Topezia` · support email `zia.esource@gmail.com` |
| Notification contacts | `zia.esource@gmail.com`, `brandon@tiltmediaco.com` |
| Scopes | `contacts.readonly` + `contacts.other.readonly` — both under **sensitive**; restricted list is empty, confirming no CASA |
| Test users | `brandon@tiltmediaco.com`, `zia.esource@gmail.com` (2 / 100) |
| OAuth client | `Topezia Web` (Web application) |
| Redirect URI | `https://www.topezia.com/api/network/google/callback` |
| Vercel | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` on Production; redeployed |

**Verified end to end** by building the exact consent URL the code generates: Google
renders the account chooser "to continue to topezia.com" with no
`redirect_uri_mismatch` and no `invalid_client`. The grant itself was deliberately
not completed.

### STILL TO DO

1. **Verify `topezia.com` in Search Console** under `zia.esource@gmail.com` — the
   same account that owns the project, or verification stalls.
2. **Submit for verification** (Verification Center) with a scope justification and
   an unlisted YouTube demo video. Google quotes up to 10 days.
3. **Only then** publish the app. Until it is verified, everyone who is not one of
   the two test users hits Google's "unverified app" wall.

### Reference — what was configured, if it ever needs rebuilding

1. New project (or an existing one) → **APIs & Services**.
2. Enable the **People API**.
3. **OAuth consent screen** → External. Fill in app name, support email, logo,
   the topezia.com homepage, privacy policy and terms URLs. All of these are
   checked during review and a mismatch is the commonest rejection.
4. Add the two scopes:
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `https://www.googleapis.com/auth/contacts.other.readonly`
5. **Credentials** → OAuth client ID → Web application. Authorized redirect URI:
   `https://www.topezia.com/api/network/google/callback`
   (add `http://localhost:3100/api/network/google/callback` for local work —
   the code derives this from `NEXT_PUBLIC_SITE_URL`).
6. Verify domain ownership of topezia.com in Search Console under the same
   Google account.

### What verification actually costs

Both scopes are **Sensitive**, not **Restricted**. Google's restricted list is
the Gmail and Drive scope families; Contacts is not on it. That matters a lot:

- **Required:** a written justification per scope, and an unlisted YouTube video
  demonstrating the consent flow and exactly what the app does with the data.
  Google quotes **up to 10 days**; in practice budget longer if they come back
  with questions.
- **Not required:** a CASA third-party security assessment, the assessor fee, or
  the annual re-assessment. Those apply to restricted scopes only.

### Before verification clears

The flow works end to end for **test users** — add accounts under the consent
screen's Test users list (up to 100). Everyone else sees the "Google hasn't
verified this app" interstitial and can click through the Advanced link, which
is fine for your own testing and not fine for real members.

**So: test it with your own account first, and do not put the import button in
front of members until verification is granted.**

### What the demo video has to show

Google wants to see the data used for the stated purpose and nothing else. The
honest walkthrough is short: click Connect Google Contacts → consent screen →
the results page showing matched members and invitable contacts → tick two
people → send. Say out loud that the token is not stored and the contact list is
deleted when the member finishes.

### Limited Use compliance — what the code already does

Google's Limited Use policy is the part most apps fail. Ours:

- **Never stores the access token.** `access_type=online`, so Google issues no
  refresh token at all. It is exchanged, spent on two API calls, and dropped
  inside one request.
- **Encrypts the contact list at rest** (AES-256-GCM, `lib/crypto/secrets.ts`)
  and refuses to run at all if `TOPEZIA_SECRET_KEY` is missing rather than
  falling back to plaintext.
- **Deletes it** when the member finishes or skips, and sweeps anything older
  than 60 minutes regardless.
- **Never transfers it** anywhere, uses it for ads, or exposes it to a human.

Your privacy policy needs a paragraph saying this, and the review will check
that the policy URL actually contains it.

---

## The guardrails, and why not to loosen them

`lib/network/doc.ts` holds every number. The short version of why they exist:
this is the only bulk-email path in the product, and Alignable's reputation is
what happens when a network product gets this wrong.

- **Nothing is pre-ticked** on the import screen. Alignable pre-selects all 46
  contacts and offers "Add All (46)". That single default is what turns "I
  wanted to add three people" into 46 emails from someone who did not read the
  screen. Select-all is one click away for anyone who wants it.
- **Members and non-members are separate lists** with separate buttons, because
  an in-app request and an email to a stranger are different acts.
- **500 invitations per member, lifetime** — a ceiling, not a window, because
  the abuse case is patient rather than bursty.
- **One invitation per address per member, ever** — enforced by a unique index,
  not by the UI. Re-inviting is the behaviour that reads as spam.
- **A global do-not-contact list.** One person clicking "don't email me again"
  stops *every* member from inviting that address, not just the one who imported
  them. Suppressed addresses are dropped silently from future import screens —
  telling the importer "they opted out" would leak a stranger's choice back to
  the person it was made against.

If invitations ever need to go out faster than these numbers allow, raise them
deliberately and watch the Resend bounce and complaint rates. A spam-complaint
rate above 0.3% is what Gmail throttles on, and it would take
`mail.topezia.com` — and therefore job alerts — down with it.

---

## Connection notifications (migrations 072–074, applied 2026-08-15)

Two channels, deliberately different in cost and urgency.

**In-app badge.** A count on the "My Network" sidebar item, from
`GET /api/network/pending` — two indexed COUNTs, nothing else, because AppShell
renders on every signed-in page. Signed-out returns zeroes rather than 401, so
logged-out visitors don't fill their console with errors. It hydrates from the
session cache (already cleared on login/logout, so one account's count can never
show under another's) and refreshes on navigation plus on a
`topezia:network-pending-changed` event that `/network` fires — otherwise
acting on that page would leave a stale count, since the pathname never changes.

The badge counts **two things, cleared by different events**:

| Half | Means | Clears when |
|---|---|---|
| `pending` | requests waiting on your answer | you accept or ignore |
| `accepted` | your requests that were accepted | you open `/network` |

Requests are a **to-do list** — looking at a decision is not making it, so the
count survives a visit. Acceptances are **news** — they clear on sight. Summing
them gives one honest number: things wanting your attention.

"On sight" is `Profile.networkSeenAt`, stamped by `GET /api/network`. It is
deliberately **not** `acceptNotifiedAt`: that means "we put an email on the
wire", and an email leaving the server is not somebody reading it. Clearing the
badge on send would switch off the in-app signal for the member who never opened
the mail — precisely the one who needed the badge.

That GET therefore has a side effect. A separate `POST /seen` would be cleaner
REST but adds a round trip and a failure mode where the badge never clears
because the second call was dropped. Opening the page *is* the event.

The previous stamp is read before it is overwritten, so `/network` can flag the
new connections with an "Accepted your request" marker — otherwise the badge
count would vanish into an undifferentiated list. The flag mirrors
`badgeCounts()` exactly, so the badge and the page can never disagree.

**Email**, via `/api/cron/connection-requests` every four hours. It sends a
**digest covering both halves**: requests waiting on the member, and requests of
theirs that were accepted. One email, not two — a member who got three requests
and two acceptances this morning has had one thing happen (their network moved),
and telling them twice doubles the send volume to say it.

The acceptance half also covers invitations. An emailed invitation that gets
accepted becomes an ACCEPTED edge whose requester is the inviter, so "tell the
requester" answers both *your request was accepted* and *the person you invited
joined*. Only the wording differs, driven by `fromInviteId`:

> Dana Ruiz **accepted your connection request**
> Dana Ruiz **joined Topezia — you're now connected**

The route path still says `connection-requests` because it is wired into
`vercel.json`; renaming it would open a window where the cron config points at a
route that no longer exists.

Three rules:

1. **One email per member, covering everything they haven't been told about.**
   Three requests arriving together produce one email that says "3 people", not
   three emails.
2. **At most one email per member per 24 hours** (`QUIET_HOURS`), counting both
   halves. Anything inside a quiet window is left *unmarked*, so the next tick
   after it closes picks it up — held, never dropped.
3. **Rows are marked notified even when delivery fails.** This looks wrong and
   is not. Retrying would turn a permanently bad address into an
   every-four-hours retry forever, which is precisely what gets a sending domain
   blocked. Everything still sits in the app; only the nudge was lost.

The two halves are tracked in **separate columns** — `notifiedAt` (the addressee
was told someone asked) and `acceptNotifiedAt` (the requester was told they said
yes). Two columns because the two facts are told to *opposite ends of the same
row*, and a row is legitimately in both states at once.

`connectionEmails` defaults **true**, unlike every other email preference here,
because a named person has asked this member a direct question and is waiting.
It is one click off from the email footer or from Settings → Connection emails,
and covers both halves. That opt-out flips one boolean and nothing else — it is
*not* the global `InviteSuppression` list, which is for strangers who never
asked to hear from us.

**The account is on Vercel Pro** (confirmed 2026-08-15), so the four-hourly
schedule is fine — Hobby would cap crons at once per day.

Pro also raises the function ceiling from 60s to 300s, and the notifier is sized
to use it: one run processes up to 200 recipients, each a few queries and a
sequential Resend call, which is 100-200s on a full batch. `maxDuration = 300`
on the cron, the invite endpoint (50 sequential sends) and the Google callback
(two paginated APIs over up to 2,000 contacts). **If this ever moves back to
Hobby, those three routes fail to build** — that is the right failure, since
silently truncating them would half-send batches.

Migration 073 **backfills `acceptNotifiedAt` on every already-ACCEPTED row.**
Without it, the first cron run after deploy would email every member about every
connection they had ever made — a backlog blast that reads as a bug to the
recipient and as spam to Gmail. There were zero accepted rows at the time, so it
was a no-op; it is written that way because "it happened to be empty" is not a
migration strategy.

Migration 074 backfills `networkSeenAt` on every existing profile, for the same
reason 073 backfills `acceptNotifiedAt`: without it, the first page load after
deploy shows every member a badge counting every connection they have ever made.
**Any future "was this seen/notified?" column needs the same backfill.**

## Known gaps

- **Connections are not shown on public profiles.** `/p/{slug}` does not display
  a connection count or list. Deliberate for now — that is a visibility decision
  with its own privacy questions, not something to inherit from LinkedIn by
  default.
- **No mutual-connection hints** ("you both know X"). The data supports it; the
  UI does not use it yet.
- **Import is Google only.** The provider boundary is `lib/network/google.ts`;
  Microsoft/Outlook would be a sibling module plus a second start/callback pair.
- **Rate limits are per serverless instance**, the same honest limitation as
  every other limiter in the product (see `lib/rate-limit.ts`). The lifetime
  invitation cap is the real ceiling; it is a database count and cannot be
  dodged by hitting a cold instance.
