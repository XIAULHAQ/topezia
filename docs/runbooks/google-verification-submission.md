# Google OAuth verification — the submission

Everything on the form is done except the demo video. Google will not let the
form **Save** without a YouTube link, so the justification below is kept here
rather than lost: paste it back into *Data Access → How will the scopes be
used?* when you add the video URL.

## Scope justification (paste verbatim — check the counter stays under 1000)

```
Topezia is a professional network. Members connect Google so we can show which of their contacts are already on Topezia, and invite those who aren't.

contacts.readonly reads saved contacts. contacts.other.readonly reads "Other contacts" (corresponded with, never saved) - where most professional contacts live; without it the feature finds almost nothing for members who don't curate contacts.

We read only names and email addresses, on an explicit click, and match them server-side against members. Nothing is emailed until the member ticks names. No narrower scope exists: the People API has none limited to email addresses.

The token is never stored (access_type=online; no refresh token). Contacts are encrypted at rest (AES-256-GCM) and kept so the member can invite a few at a time across visits - that is the feature. They are used for nothing else, never transferred, sold, advertised against, or read by a human, and the member can delete them in one click, or by deleting their account.
```

Every claim in it is checkable against the code, which is the point — the
reviewer compares it to the demo:

| Claim | Where |
|---|---|
| token never stored, no refresh token | `lib/network/google.ts` — `access_type=online` |
| encrypted at rest | `ContactImport.payload`, AES-256-GCM via `lib/crypto/secrets.ts` |
| kept only for this feature | `ContactImport`, read only by `/api/network/import/[id]` |
| deletable in one click | `ImportedContacts` card on /network -> `DELETE /api/network/import/[id]` |
| deleted with the account | `ContactImport.profileId` FK, `onDelete: Cascade` |
| nothing emailed until names are ticked | `SELECT_ALL_DEFAULT = false`, `lib/network/doc.ts` |

## The demo video

Required. Unlisted YouTube is fine. It must show every OAuth client in the
project (there is one: `Topezia Web`).

Shot list:

1. Sign in to www.topezia.com, go to **My Network**
2. Click **Connect Google Contacts**
3. **The "unverified app" screen — Google explicitly requires this to be shown**
4. The Google consent screen, with both contacts scopes visible
5. The results page: matched members, and contacts who aren't members
6. Tick two people, send
7. Say aloud: the access token is never stored, contacts are used only to
   power this screen, and the member can delete them at any time — then show
   the Delete button on /network doing it

Point 7 is the part the reviewer is actually assessing. The Limited Use claim is
only credible if the video demonstrates the flow the justification describes.

## ⚠ Google's own warning about recording against production

Quoted from the form:

> If your app is already public, **do not** deploy unverified scopes to your
> production traffic. This will disrupt your users and may consume your
> unverified user quota.
>
> Instead: (1) trigger the new scope only in a staging environment or hidden
> test route, or (2) use a separate project for recording.

**This describes our current state.** The app is published, the scopes are
unverified, and the import button is live for every member on www.topezia.com.
Each non-test member who clicks through the warning burns one of the 100
lifetime unverified-user slots.

Two ways to fix it, both fine:

- **Back to testing** — Audience → *Back to testing*. Non-test members get a hard
  "Access blocked" instead of the warning. Verification cannot be submitted while
  in this state, so flip back to production when the video is ready.
- **Hide the button** — gate the import card behind a flag so it renders disabled
  until verification clears. No member meets a Google error at all, and the app
  can stay published. One small code change and a deploy.

The second is what Google's "hidden test route" advice amounts to, and it is the
only option that leaves members with a coherent experience for the ~10 days the
review takes.

## Status

| | |
|---|---|
| Publishing status | **In production** (was Testing) |
| Branding | submitted; auto-check asked for manual review |
| Scope justification | written, **not saved** — blocked on the video |
| Demo video | **not provided** — needs recording |
| Submitted for review | **no** |

Nothing has been sent to Google for review yet. The form is reached at
Verification Center → *Prepare for verification*.
