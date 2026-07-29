/**
 * On-page SEO content for /jobs/{slug} listing pages: the body copy block,
 * FAQ cards, and the structured data that has to match them word for word.
 *
 * Kept honest on purpose (same discipline as lib/seo/intro.ts and hubs.ts):
 * no invented salary bands, no claimed filters that don't exist on this page,
 * no verification cadence we can't back up. Copy is templated from
 * `page.keyword` / `page.topic` / `page.variant` (set per page kind in
 * pages.ts) rather than parsed back out of `heading`, since heading's
 * phrasing differs by kind ("X jobs" vs "Jobs in X" vs "Remote X jobs").
 */
import { stateName, countryName, type SeoPage } from "./pages";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

export type SeoCopyBlock = { type: "p"; text: string } | { type: "h3"; text: string };

/** ~350-450 words, two-column-ready (caller lays out the grid). */
export function buildSeoCopy(page: SeoPage): { h2: string; blocks: SeoCopyBlock[] } {
  const { keyword, variant, topic, total, kind } = page;
  const jobWord = total === 1 ? "opening" : "openings";

  const scopeLine =
    kind === "place"
      ? `${keyword} covers roles physically based in ${topic}, plus — where Topezia tracks it — remote openings anyone there is eligible for, so ${variant} aren't limited to what's physically listed in-country.`
      : kind === "hub"
      ? `${keyword} span salaried roles and freelance briefs alike — a different transaction each, so they're listed as two separate sections rather than blended into one feed.`
      : kind === "remote-role"
      ? `${keyword} mean exactly what they say: every posting here is remote-eligible across the US, tagged with the actual scope the employer will hire in rather than a generic "remote" label.`
      : `${keyword} here span the full range of seniority Topezia has classified this way, from entry-level and junior openings through senior, staff and leadership titles.`;

  const blocks: SeoCopyBlock[] = [
    {
      type: "p",
      text: `Topezia lists ${keyword} from employers who are genuinely hiring right now, not a stale scrape of postings nobody's looked at in weeks. Every listing here is pulled straight from the employer's own careers page or applicant-tracking system, then checked again against that same source multiple times a day. When a role is paused, filled or quietly pulled, it comes off this page within about a day rather than sitting here as a dead link — so the ${total.toLocaleString()} ${jobWord} you see are ones you can actually act on today.`,
    },
    { type: "p", text: scopeLine },
    { type: "h3", text: "Verified, not just collected" },
    {
      type: "p",
      text: `Most job boards will happily show you a posting that closed weeks ago. Topezia re-confirms every one of these ${keyword} against the employer's own page on a regular cadence, and anything that's gone quiet is pulled rather than left up to waste your time. That's also why the count on this page moves — it's a live number, not one frozen the day this page happened to be built.`,
    },
    { type: "h3", text: "Pay, exactly as posted" },
    {
      type: "p",
      text: `Where an employer publishes a salary or rate for one of these ${keyword}, it's shown exactly as written — no rounding it up to look better, no converting it out of the currency it was actually posted in. Where nothing was published, the card says nothing rather than guessing; an invented number would be a worse answer than an honest gap.`,
    },
    { type: "h3", text: "Match scores instead of guesswork" },
    {
      type: "p",
      text: `Upload a resume once — or connect a Topezia profile — and every listing on this page gets scored against what you've actually done, gaps included. That honest score is what the resume builder and application tracker build on next, so you spend your next application on ${variant} you're a real fit for, not a hopeful guess.`,
    },
    {
      type: "p",
      text: `New ${keyword} are added throughout the day as ingestion runs. Save this search for a digest of the ones that match your profile, or browse every category if ${topic} isn't where your next move is.`,
    },
  ];

  return { h2: `Finding ${keyword} worth applying to`, blocks };
}

export interface Faq {
  q: string;
  a: string;
}

/** 4 Q&As, rendered as visible cards AND emitted as FAQPage JSON-LD — must match. */
export function buildFaqs(page: SeoPage): Faq[] {
  const { keyword, topic, variant, kind } = page;
  const last: Faq =
    kind === "hub"
      ? {
          q: "Are these jobs or freelance projects?",
          a: `Both, kept separate. Salaried ${variant} are listed first; freelance briefs follow in their own section, since bidding on a client's own site is a different transaction than applying for a role.`,
        }
      : kind === "place"
      ? {
          q: "Are remote roles included?",
          a: `Yes — this page includes roles based in ${topic} plus, where Topezia tracks it, remote roles open to applicants there.`,
        }
      : {
          q: "Are remote roles included?",
          a: "Yes, wherever they exist for this category — each card is tagged with its location or remote scope so you know before you click through.",
        };

  return [
    {
      q: `How often are ${keyword} checked?`,
      a: "Multiple times a day, against the employer's own posting. When a role closes or is pulled, it comes off this page within about a day rather than sitting here as a dead link.",
    },
    {
      q: "Do these listings show salary?",
      a: "When an employer publishes a range, yes — shown exactly as posted, in the currency they used. When they don't publish one, the card leaves it blank rather than guessing.",
    },
    {
      q: "What experience levels are included?",
      a: `This list already spans every seniority Topezia has data for under ${topic} — entry-level through senior and leadership titles. The related links below narrow further by location or by a more specific role.`,
    },
    last,
  ];
}

/** Home / Jobs / [{role or vertical} /] {current}. Doubles as the JSON-LD trail. */
export function buildBreadcrumbs(page: SeoPage): { name: string; item: string }[] {
  const crumbs: { name: string; item: string }[] = [
    { name: "Home", item: "/" },
    { name: "Jobs", item: "/jobs" },
  ];
  const place = page.state ? stateName(page.state.toUpperCase()) : page.country ? countryName(page.country) : null;
  if (place && page.kind !== "place") {
    crumbs.push({ name: page.topic, item: `/jobs/${page.slug}` });
    crumbs.push({ name: place, item: page.canonicalPath });
  } else {
    crumbs.push({ name: page.topic, item: page.canonicalPath });
  }
  return crumbs;
}

export function collectionPageLd(page: SeoPage) {
  return {
    "@type": "CollectionPage",
    name: page.heading,
    url: `${SITE}${page.canonicalPath}`,
    description: page.intro,
    isPartOf: { "@type": "WebSite", name: "Topezia", url: SITE },
  };
}

export function breadcrumbLd(page: SeoPage) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: buildBreadcrumbs(page).map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE}${c.item}`,
    })),
  };
}

export function faqPageLd(faqs: Faq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
