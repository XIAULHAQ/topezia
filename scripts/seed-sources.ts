/**
 * Seed a starter set of ATS boards into the Source table (spec §4.1).
 *
 * Run: npx tsx scripts/seed-sources.ts
 *
 * `npm run ingest` reads from Source — it does not discover boards on its own.
 * Founding-employer waitlist signups populate Source automatically, but until
 * those arrive this gives the pipeline something real to crawl. Idempotent:
 * upserts on the (type, companySlug) unique, so re-running is safe.
 *
 * Every slug below was verified to return HTTP 200 with live jobs at seed time
 * (2026-07). ATS boards come and go — if a crawl returns 0 jobs, re-verify the
 * slug rather than assuming a crawler bug.
 */

import { prisma } from "@/lib/prisma";
import { JobSource } from "@prisma/client";

// Real, live boards only. NOTE: `leverdemo` was removed — it's Lever's own
// sample board, so it served fake postings ("Account Executive (copy)", four
// identical "Account Executive" rows). Demo data must never reach real users or
// an alert email. `palantir` replaces it as the real Lever board.
//
// Beware: a dead Lever board returns HTTP 200 with an EMPTY array, not a 404
// (netflix, plaid and mistral all do this today). A crawler that silently
// returns 0 looks identical to a healthy board with nothing new, so re-verify
// the slug before blaming the crawler.
const SEED_SOURCES: { type: JobSource; companySlug: string; companyName: string }[] = [
  { type: JobSource.GREENHOUSE, companySlug: "dropbox", companyName: "Dropbox" },
  { type: JobSource.GREENHOUSE, companySlug: "discord", companyName: "Discord" },
  { type: JobSource.ASHBY, companySlug: "posthog", companyName: "PostHog" },
  { type: JobSource.ASHBY, companySlug: "linear", companyName: "Linear" },
  // 273 postings, 203 US (New York, Washington DC, Palo Alto), newest 2 days
  // old at seed time. Verified 2026-07-17: 0 missing fields, 0 duplicate
  // externalIds, no "(copy)" placeholders — i.e. everything leverdemo wasn't.
  { type: JobSource.LEVER, companySlug: "palantir", companyName: "Palantir Technologies" },

  // Non-US boards. The index is global (spec §2) but every source was a US/EU
  // company board, so a seeker outside the US saw almost nothing — the feed
  // filter was honest and the inventory simply wasn't there. All eight verified
  // 2026-07-17 with the real crawlers: 0 missing fields, 0 "(copy)"/demo
  // titles, unique externalIds throughout, and locations that resolve to a
  // country. Between them they cover ~35 countries.
  { type: JobSource.GREENHOUSE, companySlug: "monzo", companyName: "Monzo" },            // 68  · GB, ES, IE
  { type: JobSource.GREENHOUSE, companySlug: "n26", companyName: "N26" },                // 74  · DE, ES, FR, IT
  { type: JobSource.GREENHOUSE, companySlug: "wolt", companyName: "Wolt" },              // 284 · 28 countries across Europe + Central Asia
  { type: JobSource.ASHBY, companySlug: "deliveroo", companyName: "Deliveroo" },         // 188 · GB, AE, FR, IT, IE, BE, IN, KW
  { type: JobSource.ASHBY, companySlug: "xero", companyName: "Xero" },                   // 90  · AU, NZ, GB, ZA, SG, CA, US
  { type: JobSource.ASHBY, companySlug: "wealthsimple", companyName: "Wealthsimple" },   // 38  · CA
  { type: JobSource.LEVER, companySlug: "meesho", companyName: "Meesho" },               // 44  · IN
  { type: JobSource.LEVER, companySlug: "qonto", companyName: "Qonto" },                 // 50  · FR, ES, DE, IT, BE, RS

  // US-focused expansion (2026-07-18): US-heavy boards with real marketing/design
  // volume, to grow inventory in our launch market. All verified with the real
  // crawlers: 0 missing fields, 0 "(copy)"/demo titles, unique externalIds.
  { type: JobSource.GREENHOUSE, companySlug: "reddit", companyName: "Reddit" },
  { type: JobSource.GREENHOUSE, companySlug: "pinterest", companyName: "Pinterest" },
  { type: JobSource.GREENHOUSE, companySlug: "roblox", companyName: "Roblox" },
  { type: JobSource.GREENHOUSE, companySlug: "samsara", companyName: "Samsara" },
  { type: JobSource.GREENHOUSE, companySlug: "instacart", companyName: "Instacart" },
  { type: JobSource.GREENHOUSE, companySlug: "twilio", companyName: "Twilio" },
  { type: JobSource.GREENHOUSE, companySlug: "coinbase", companyName: "Coinbase" },
  { type: JobSource.GREENHOUSE, companySlug: "robinhood", companyName: "Robinhood" },
  { type: JobSource.GREENHOUSE, companySlug: "affirm", companyName: "Affirm" },
  { type: JobSource.GREENHOUSE, companySlug: "chime", companyName: "Chime" },
  { type: JobSource.GREENHOUSE, companySlug: "mercury", companyName: "Mercury" },
  { type: JobSource.ASHBY, companySlug: "ramp", companyName: "Ramp" },

  // Real CDL / commercial-driving inventory (2026-07-18). Until now the
  // "trucking-logistics" vertical held ~0 actual driving jobs — the LIVE rows
  // there were misclassified warehouse/last-mile/telematics ops (Samsara,
  // Deliveroo, Meesho). The /drive questionnaire (spec §3.4) had nothing real
  // to match against. These boards post genuine CDL truck-driver, delivery/route
  // driver, and autonomous-vehicle CDL safety/test-driver roles. All verified
  // 2026-07-18 against the live crawlers: 0 dup externalIds, 0 missing
  // title/location/description/id, 0 "(copy)"/demo placeholders. Real US
  // locations throughout. Driver-title counts noted are the CDL/driving subset;
  // the balance of each board (warehouse, AV engineering, ops) classifies into
  // its own vertical once the tightened classifier runs. NOTE: none of the big
  // OTR carriers (Swift/Schneider/Werner/JB Hunt) publish on Greenhouse/Lever/
  // Ashby, so the honest CDL inventory available on these ATSs is grocery/
  // meal-kit local & regional CDL delivery plus autonomous-truck safety drivers.
  { type: JobSource.GREENHOUSE, companySlug: "misfitsmarket", companyName: "Misfits Market" }, // 93 jobs · 28 driving: CDL A/B, Class C & (Lead/PT) Delivery Drivers · US
  { type: JobSource.GREENHOUSE, companySlug: "stackav", companyName: "Stack AV" },             // 20 jobs · 8 CDL-A "Operations Specialist" driving roles · US (TN, CO, GA, IL, AZ, FL, TX)
  { type: JobSource.GREENHOUSE, companySlug: "kodiak", companyName: "Kodiak Robotics" },       // 73 jobs · 7 driving: Class A CDL & Class A Safety Drivers · US (TX, SF Bay)
  { type: JobSource.GREENHOUSE, companySlug: "outrider", companyName: "Outrider" },            // 10 jobs · 3 driving: CDL-A Autonomous Vehicle Test Operators / Site Lead · San Antonio, TX
  { type: JobSource.LEVER, companySlug: "waabi", companyName: "Waabi" },                       // 56 jobs · 1 driving: Vehicle Operator (CDL) · Dallas, TX

  // ~3-4x volume expansion (2026-07-27), requested to give the recently-shipped
  // Relocation fit / currency-conversion / eligibility features enough real
  // variety to test against — the trigger was discovering 83% of live US jobs
  // had no salaryMin/Max at all (see extractSalary() fix, same commit). Every
  // slug below was hit against the REAL live crawler endpoint before being
  // added here — not guessed. 159 + 164 candidates were tried across all
  // three ATS types (many are simply wrong guesses at which platform a company
  // uses, which is exactly what this check is for); these are the ones that
  // came back HTTP 200, non-empty, 0 "(copy)"/demo titles, unique external
  // ids. Job counts are total board size at verification time, not a driving
  // subset like the CDL block above.
  //
  // Frontier AI / ML infra — the vertical the platform had ~0 real inventory
  // for.
  { type: JobSource.ASHBY, companySlug: "openai", companyName: "OpenAI" },                 // 752 · US, Japan
  { type: JobSource.GREENHOUSE, companySlug: "anthropic", companyName: "Anthropic" },      // 418 · US, UK, AU, IE, DE, JP
  { type: JobSource.ASHBY, companySlug: "cohere", companyName: "Cohere" },                 // 139 · US, UK, CA, KR
  { type: JobSource.ASHBY, companySlug: "harvey", companyName: "Harvey" },                  // 350 · US, UK, ES
  { type: JobSource.ASHBY, companySlug: "elevenlabs", companyName: "ElevenLabs" },          // 213 · IN, US, JP, GB, PL
  { type: JobSource.GREENHOUSE, companySlug: "scaleai", companyName: "Scale AI" },          // 204 · US, QA, GB
  { type: JobSource.GREENHOUSE, companySlug: "togetherai", companyName: "Together AI" },    // 58  · US, NL, IN
  { type: JobSource.ASHBY, companySlug: "perplexity", companyName: "Perplexity" },          // 86  · US, JP, RS, GB
  { type: JobSource.ASHBY, companySlug: "langchain", companyName: "LangChain" },            // 85  · US, NL
  { type: JobSource.ASHBY, companySlug: "deepgram", companyName: "Deepgram" },              // 77  · US, GB, SG
  { type: JobSource.ASHBY, companySlug: "modal", companyName: "Modal" },                    // 32  · US, SE
  { type: JobSource.ASHBY, companySlug: "baseten", companyName: "Baseten" },                // 68  · US
  { type: JobSource.ASHBY, companySlug: "fireworksai", companyName: "Fireworks AI" },       // 47  · US, SG, GB
  { type: JobSource.ASHBY, companySlug: "cursor", companyName: "Cursor (Anysphere)" },      // 122 · US, SG
  { type: JobSource.ASHBY, companySlug: "exa", companyName: "Exa" },                        // 35  · US, SG
  { type: JobSource.ASHBY, companySlug: "tavily", companyName: "Tavily" },                  // 18  · US, IL
  { type: JobSource.ASHBY, companySlug: "browserbase", companyName: "Browserbase" },        // 8   · US
  { type: JobSource.ASHBY, companySlug: "airbyte", companyName: "Airbyte" },                // 14  · US, CA
  { type: JobSource.ASHBY, companySlug: "pinecone", companyName: "Pinecone" },              // 5   · US
  { type: JobSource.ASHBY, companySlug: "weaviate", companyName: "Weaviate" },              // 4   · Europe (remote)
  { type: JobSource.ASHBY, companySlug: "warp", companyName: "Warp" },                      // 18  · US

  // Major SaaS / dev-tools / data infra — the "real engineering roles,
  // globally distributed" segment.
  { type: JobSource.GREENHOUSE, companySlug: "databricks", companyName: "Databricks" },     // 796 · JP, IN, AU, SG, US
  { type: JobSource.GREENHOUSE, companySlug: "mongodb", companyName: "MongoDB" },           // 402 · US, IN, MX, IE, MY
  { type: JobSource.GREENHOUSE, companySlug: "okta", companyName: "Okta" },                 // 359 · ES, JP, DE, US
  { type: JobSource.GREENHOUSE, companySlug: "cloudflare", companyName: "Cloudflare" },     // 273 · distributed, IN
  { type: JobSource.GREENHOUSE, companySlug: "elastic", companyName: "Elastic" },           // 195 · US, PL, BE, GB, IN, NL
  { type: JobSource.GREENHOUSE, companySlug: "gitlab", companyName: "GitLab" },             // 187 · remote IT/US/CA/GB/BR
  { type: JobSource.GREENHOUSE, companySlug: "vercel", companyName: "Vercel" },             // 78  · GB, AU, US
  { type: JobSource.GREENHOUSE, companySlug: "airtable", companyName: "Airtable" },         // 38  · US, FR, GB
  { type: JobSource.ASHBY, companySlug: "notion", companyName: "Notion" },                  // 120 · US, SG, JP, IN, KR
  { type: JobSource.ASHBY, companySlug: "replit", companyName: "Replit" },                  // 92  · US
  { type: JobSource.ASHBY, companySlug: "supabase", companyName: "Supabase" },              // 56  · remote APAC/AMER/USA
  { type: JobSource.ASHBY, companySlug: "planetscale", companyName: "PlanetScale" },        // 8   · US, remote NA/APAC/EMEA
  { type: JobSource.ASHBY, companySlug: "neon", companyName: "Neon" },                      // 6   · PH, US
  { type: JobSource.GREENHOUSE, companySlug: "clickhouse", companyName: "ClickHouse" },     // 171 · US, DE, GB, NL, CA
  { type: JobSource.GREENHOUSE, companySlug: "fivetran", companyName: "Fivetran" },         // 194 · GB, IE, US
  { type: JobSource.ASHBY, companySlug: "temporal", companyName: "Temporal" },              // 60  · US, IN, FR, DE
  { type: JobSource.GREENHOUSE, companySlug: "launchdarkly", companyName: "LaunchDarkly" }, // 32  · US, IN, AU, SG
  { type: JobSource.ASHBY, companySlug: "render", companyName: "Render" },                  // 31  · US

  // Fintech / risk / trust — pairs well with the currency-conversion testing
  // (many state real salary ranges).
  { type: JobSource.GREENHOUSE, companySlug: "stripe", companyName: "Stripe" },             // 534 · US, AU, JP, SG
  { type: JobSource.GREENHOUSE, companySlug: "brex", companyName: "Brex" },                 // 279 · US, CA, BR
  { type: JobSource.GREENHOUSE, companySlug: "adyen", companyName: "Adyen" },               // 216 · BR, CN, MY, NL, ES, DE
  { type: JobSource.GREENHOUSE, companySlug: "gemini", companyName: "Gemini" },             // 44  · US, SG
  { type: JobSource.GREENHOUSE, companySlug: "marqeta", companyName: "Marqeta" },           // 43  · US, CA, GB, PL
  { type: JobSource.GREENHOUSE, companySlug: "sofi", companyName: "SoFi" },                 // 63  · US
  { type: JobSource.GREENHOUSE, companySlug: "carta", companyName: "Carta" },               // 63  · US, GB, CA
  { type: JobSource.GREENHOUSE, companySlug: "dashlane", companyName: "Dashlane" },         // 21  · FR, PT, US
  { type: JobSource.GREENHOUSE, companySlug: "alloy", companyName: "Alloy" },               // 21  · US, GB
  { type: JobSource.GREENHOUSE, companySlug: "riskified", companyName: "Riskified" },       // 20  · US, PT, IL
  { type: JobSource.GREENHOUSE, companySlug: "forter", companyName: "Forter" },             // 40  · CN, JP, DE, GB, US
  { type: JobSource.GREENHOUSE, companySlug: "checkr", companyName: "Checkr" },             // 53  · US
  { type: JobSource.ASHBY, companySlug: "vanta", companyName: "Vanta" },                    // 104 · US, IE, GB, AU, CA
  { type: JobSource.ASHBY, companySlug: "drata", companyName: "Drata" },                    // 59  · US

  // Marketing / growth / design — explicitly thin verticals per the prior
  // batch's own note.
  { type: JobSource.GREENHOUSE, companySlug: "webflow", companyName: "Webflow" },           // 25  · GB, US, CA, AR
  { type: JobSource.GREENHOUSE, companySlug: "typeform", companyName: "Typeform" },         // 11  · US, IE, NL, PT, ES, GB, DE
  { type: JobSource.GREENHOUSE, companySlug: "hootsuite", companyName: "Hootsuite" },       // 20  · CA, MX, RO, IN, LU
  { type: JobSource.GREENHOUSE, companySlug: "calendly", companyName: "Calendly" },         // 14  · US
  { type: JobSource.ASHBY, companySlug: "miro", companyName: "Miro" },                      // 43  · DK, NL, JP, AU, US, DE
  { type: JobSource.GREENHOUSE, companySlug: "klaviyo", companyName: "Klaviyo" },           // 152 · IE, GB, US
  { type: JobSource.GREENHOUSE, companySlug: "mixpanel", companyName: "Mixpanel" },         // 44  · GB, ES, DE, US
  { type: JobSource.GREENHOUSE, companySlug: "pendo", companyName: "Pendo" },               // 44  · US, GB, AU
  { type: JobSource.GREENHOUSE, companySlug: "similarweb", companyName: "Similarweb" },     // 76  · GB, IL, CZ, US
  { type: JobSource.GREENHOUSE, companySlug: "zoominfo", companyName: "ZoomInfo" },         // 96  · US, GB
  { type: JobSource.GREENHOUSE, companySlug: "apolloio", companyName: "Apollo.io" },        // 41  · MX, US, GB
  { type: JobSource.GREENHOUSE, companySlug: "salesloft", companyName: "Salesloft" },       // 27  · US, IN, MX, GB
  { type: JobSource.GREENHOUSE, companySlug: "sproutsocial", companyName: "Sprout Social" },// 8   · US, IE
  { type: JobSource.GREENHOUSE, companySlug: "postscript", companyName: "Postscript" },     // 7   · US, CA
  { type: JobSource.GREENHOUSE, companySlug: "yotpo", companyName: "Yotpo" },               // 11  · BG, US, GB, IL, CA
  { type: JobSource.GREENHOUSE, companySlug: "planable", companyName: "Planable" },         // 1   · MD, RO
  { type: JobSource.ASHBY, companySlug: "buffer", companyName: "Buffer" },                  // 1   · remote
  { type: JobSource.ASHBY, companySlug: "hightouch", companyName: "Hightouch" },            // 1   · US
  { type: JobSource.GREENHOUSE, companySlug: "bold", companyName: "Bold" },                 // 1   · US
  { type: JobSource.GREENHOUSE, companySlug: "sigmacomputing", companyName: "Sigma Computing" }, // 73 · US, GB, AU

  // Consumer / marketplace / broader industry — real volume, broad geography.
  { type: JobSource.GREENHOUSE, companySlug: "airbnb", companyName: "Airbnb" },             // 193 · FR, DE, CN, US, JP
  { type: JobSource.GREENHOUSE, companySlug: "lyft", companyName: "Lyft" },                 // 157 · US, CA, MX
  { type: JobSource.GREENHOUSE, companySlug: "duolingo", companyName: "Duolingo" },         // 59  · US, TW, JP, GB, CN
  { type: JobSource.GREENHOUSE, companySlug: "peloton", companyName: "Peloton" },           // 63  · US, TW
  { type: JobSource.GREENHOUSE, companySlug: "twitch", companyName: "Twitch" },             // 66  · US
  { type: JobSource.GREENHOUSE, companySlug: "faire", companyName: "Faire" },               // 67  · GB, US, CA
  { type: JobSource.GREENHOUSE, companySlug: "classpass", companyName: "ClassPass" },       // 58  · BR, JP, ES, US, CA, MY
  { type: JobSource.GREENHOUSE, companySlug: "squarespace", companyName: "Squarespace" },   // 16  · IE, US, PT
  { type: JobSource.GREENHOUSE, companySlug: "nextdoor", companyName: "Nextdoor" },         // 16  · US
  { type: JobSource.GREENHOUSE, companySlug: "coursera", companyName: "Coursera" },         // 13  · US, IN, CA
  { type: JobSource.GREENHOUSE, companySlug: "udemy", companyName: "Udemy" },               // 8   · US, IE, MX
  { type: JobSource.GREENHOUSE, companySlug: "masterclass", companyName: "MasterClass" },   // 2   · US
  { type: JobSource.GREENHOUSE, companySlug: "remote", companyName: "Remote" },             // 2   · US
  { type: JobSource.GREENHOUSE, companySlug: "xendit", companyName: "Xendit" },             // 23  · TH, MY, HK, SG, TW, PH, ID
  { type: JobSource.GREENHOUSE, companySlug: "branchmetrics", companyName: "Branch" },      // 18  · CN, GB, US
  { type: JobSource.GREENHOUSE, companySlug: "motive", companyName: "Motive" },             // 18  · US
  { type: JobSource.GREENHOUSE, companySlug: "current", companyName: "Current" },           // 3   · US (remote)
  { type: JobSource.GREENHOUSE, companySlug: "calm", companyName: "Calm" },                 // 1   · US
  { type: JobSource.GREENHOUSE, companySlug: "toast", companyName: "Toast" },               // 301 · IE, US
  { type: JobSource.GREENHOUSE, companySlug: "attentive", companyName: "Attentive" },       // 48  · US, GB, AU
  { type: JobSource.GREENHOUSE, companySlug: "gusto", companyName: "Gusto" },               // 76  · US
  { type: JobSource.GREENHOUSE, companySlug: "flexport", companyName: "Flexport" },         // 150 · US, CA, DE, NL, IT
  { type: JobSource.GREENHOUSE, companySlug: "intercom", companyName: "Intercom" },         // 130 · US, IE, GB, DE
  { type: JobSource.GREENHOUSE, companySlug: "asana", companyName: "Asana" },               // 146 · US, PL, IS, AU, IE
  { type: JobSource.GREENHOUSE, companySlug: "figma", companyName: "Figma" },               // 175 · DE, US, IN, FR, SG, AU

  // ── Pakistan (2026-07-30) ───────────────────────────────────────────────
  // Read this before adding more "Pakistan boards": PK employers are almost
  // entirely ABSENT from Greenhouse/Lever/Ashby. 85 candidates were probed
  // against the live endpoints — Systems Ltd, NETSOL, 10Pearls, Arbisoft,
  // Devsinc, Contour, Folio3, VentureDive, Tintash, Confiz, Gaditek, Daraz,
  // Bazaar, Retailo, Bykea, PostEx, Abhi, Safepay, Zameen/Dubizzle, Trukkr and
  // the rest ALL returned 404 on all three ATSs. They hire via Rozee.pk,
  // Mustakbil, LinkedIn or their own sites. Only two boards below carry real
  // PK-located roles; reaching PK inventory at scale needs a NEW crawler for an
  // ATS those companies actually use, not more slugs here.
  { type: JobSource.GREENHOUSE, companySlug: "careem", companyName: "Careem" },             // 28  · 12 PK (Karachi, Lahore) + AE, JO — best PK source found
  { type: JobSource.LEVER, companySlug: "educative", companyName: "Educative" },            // 11  · 10 PK (Lahore, Islamabad) + US (Bellevue WA HQ)

  // Globally-remote boards. These are how PK seekers are actually served today:
  // country pages are ELIGIBILITY-based, so "Home based — Worldwide" roles show
  // on /jobs/pakistan even with no PK-located supply.
  { type: JobSource.GREENHOUSE, companySlug: "canonical", companyName: "Canonical" },       // 303 · Home-based Worldwide / EMEA / Americas — all remote
  { type: JobSource.GREENHOUSE, companySlug: "turing", companyName: "Turing" },             // 28  · US 14, India remote
  { type: JobSource.LEVER, companySlug: "toptal", companyName: "Toptal" },                  // 22  · US, CA, LATAM (remote)
  { type: JobSource.ASHBY, companySlug: "andela", companyName: "Andela" },                  // 18  · North America, GB, KE
  { type: JobSource.ASHBY, companySlug: "zapier", companyName: "Zapier" },                  // 14  · NAMER, APAC, India (remote)

  // ── US expansion (2026-07-30) ───────────────────────────────────────────
  // 90 candidates probed; these are the ones that returned HTTP 200 with live
  // jobs, unique external ids and no demo/"(copy)" titles. Counts are total
  // board size at verification time.
  //
  // NOTE: `aha` was probed and REJECTED — the Greenhouse board on that slug is a
  // veterinary practice ("Credentialed Veterinary Technician"), not Aha! the
  // software company. Slug ≠ brand; verify identity, not just HTTP 200.
  { type: JobSource.GREENHOUSE, companySlug: "datadog", companyName: "Datadog" },           // 425 · US 201, JP, FR
  { type: JobSource.GREENHOUSE, companySlug: "braze", companyName: "Braze" },               // 236 · US 164 (NYC, Chicago, Austin)
  { type: JobSource.GREENHOUSE, companySlug: "riotgames", companyName: "Riot Games" },      // 162 · US 69 (LA), CN, SG
  { type: JobSource.GREENHOUSE, companySlug: "epicgames", companyName: "Epic Games" },      // 137 · US 46 (Cary NC)
  { type: JobSource.GREENHOUSE, companySlug: "upstart", companyName: "Upstart" },           // 100 · US 100 (92 remote-US)
  { type: JobSource.GREENHOUSE, companySlug: "justworks", companyName: "Justworks" },       // 94  · US 72 (NYC)
  { type: JobSource.GREENHOUSE, companySlug: "chainguard", companyName: "Chainguard" },     // 67  · US 44 remote, GB, CA
  { type: JobSource.GREENHOUSE, companySlug: "sweetgreen", companyName: "Sweetgreen" },     // 55  · US 53 — non-tech/hourly, thin vertical
  { type: JobSource.GREENHOUSE, companySlug: "amplitude", companyName: "Amplitude" },       // 44  · US 34, GB
  { type: JobSource.GREENHOUSE, companySlug: "betterment", companyName: "Betterment" },     // 39  · US 39 (NYC)
  { type: JobSource.GREENHOUSE, companySlug: "ziprecruiter", companyName: "ZipRecruiter" }, // 36  · US 26 (Santa Monica)
  { type: JobSource.GREENHOUSE, companySlug: "cultureamp", companyName: "Culture Amp" },    // 27  · AU, GB, US 7
  { type: JobSource.ASHBY, companySlug: "astronomer", companyName: "Astronomer" },          // 27  · US 20 (NYC), GB
  { type: JobSource.GREENHOUSE, companySlug: "customerio", companyName: "Customer.io" },    // 25  · Americas/EMEA remote
  { type: JobSource.GREENHOUSE, companySlug: "applovin", companyName: "AppLovin" },         // 24  · US 17 (Palo Alto, NYC)
  { type: JobSource.GREENHOUSE, companySlug: "iterable", companyName: "Iterable" },         // 23  · US 16, PT
  { type: JobSource.GREENHOUSE, companySlug: "mattermost", companyName: "Mattermost" },     // 13  · US 8, GB
  { type: JobSource.ASHBY, companySlug: "resend", companyName: "Resend" },                  // 10  · Americas/Europe remote
  { type: JobSource.ASHBY, companySlug: "prefect", companyName: "Prefect" },                // 5   · remote
  { type: JobSource.GREENHOUSE, companySlug: "lattice", companyName: "Lattice" },           // 4   · US, GB, CA
];

async function main() {
  let created = 0;
  for (const s of SEED_SOURCES) {
    const existing = await prisma.source.findUnique({
      where: { type_companySlug: { type: s.type, companySlug: s.companySlug } },
      select: { id: true },
    });
    await prisma.source.upsert({
      where: { type_companySlug: { type: s.type, companySlug: s.companySlug } },
      update: { companyName: s.companyName },
      create: { type: s.type, companySlug: s.companySlug, companyName: s.companyName, isPriority: false },
    });
    if (!existing) created++;
    console.log(`  ${existing ? "updated" : "created"}  ${s.type} / ${s.companySlug} → ${s.companyName}`);
  }
  const total = await prisma.source.count();
  console.log(`\nDone. ${created} new, ${total} sources total.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});