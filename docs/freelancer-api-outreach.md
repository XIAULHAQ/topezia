# Outreach draft — Freelancer.com API team

**To:** api@freelancer.com (their developer portal's listed contact; also try the
"contact us" form at developers.freelancer.com if no reply in a week)
**From:** brandon@tiltmediaco.com
**Subject:** Partnership request — sending qualified bidders to Freelancer.com projects

---

Hi,

I'm Brandon, founder of Topezia (topezia.com) — an AI job-matching platform. We
read a person's résumé once, then score every live opportunity against their
actual skills and show them honestly why something is or isn't a fit. We never
sit between the applicant and the publisher: every listing clicks out to the
original source to apply.

We'd like to include active Freelancer.com projects in our members' match
feeds, using your public projects API:

- **What we show:** project title, description, skills, budget, and freshness —
  attributed to Freelancer.com.
- **Where clicks go:** every project links straight to its freelancer.com
  project page; bidding, messaging and payment all happen on your platform. We
  send you registered, skill-matched bidders and take nothing from the
  transaction.
- **Data handling:** we re-crawl at least daily (your 24-hour cache-refresh
  requirement), serve everything over TLS, store data encrypted at rest, and
  drop projects that are no longer active.
- **Volume:** modest — low thousands of API requests per day, well under your
  documented limits.

We've read the API Terms & Conditions and believe this use is in the spirit of
the program (we complement rather than compete — we don't host projects,
process bids, or take fees), but we'd rather confirm than assume:

1. Can you confirm this click-out aggregation use is permitted under the API
   T&Cs?
2. Is there an affiliate/partner tier we should register for so referred
   signups are attributed to us?
3. Anything you'd like us to change about attribution or display?

Happy to share screenshots or a demo account. Thanks for building an actually
open API — it's rare.

Brandon
Topezia — topezia.com
brandon@tiltmediaco.com

---

*Internal notes (not part of the email):*
- Until they reply, we operate within the written T&Cs: 24h refresh (our
  ingestion cadence), encrypted storage, no API resale, attribution on every
  card and detail page ("via Freelancer.com").
- If they say no: pull the source by deleting FREELANCER_COM rows; the Job.kind
  machinery stays for Phase 3 native projects and any other marketplace source.
- Their affiliate program, if offered, adds revenue per referred signup —
  worth asking even though the aggregation works without it.
