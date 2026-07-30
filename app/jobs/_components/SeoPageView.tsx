import Link from "next/link";
import type { CSSProperties } from "react";
import type { SeoPage, SeoJob, HubLink, BrowseHub } from "@/lib/seo/pages";
import { countrySlugFor, countryName, getBrowseHub } from "@/lib/seo/pages";
import { decodeHtmlEntities } from "@/lib/sanitize";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { placeLabel, salaryText, freshness, label } from "@/lib/seo/job-display";
import { buildSeoCopy, buildFaqs, buildBreadcrumbs, collectionPageLd, breadcrumbLd, faqPageLd } from "@/lib/seo/content-block";
import AlertCapture from "./AlertCapture";
import JobsInteractive from "./JobsInteractive";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

/** Plain text for structured data — decode BEFORE stripping tags. */
const plainText = (html: string) =>
  decodeHtmlEntities(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** JobPosting structured data — we emit the same schema we crawl (§7). */
function itemListLd(page: SeoPage) {
  return {
    "@type": "ItemList",
    itemListElement: page.jobs.slice(0, 25).map((j, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "JobPosting",
        title: j.titleRaw,
        // Decode first: Greenhouse serves entity-encoded HTML, so strip-first
        // fed Google 800 chars of literal "&lt;div class=&quot;...&quot;&gt;".
        description: plainText(j.descriptionRaw).slice(0, 800),
        datePosted: (j.postedAt ?? j.lastVerifiedAt).toISOString(),
        employmentType: j.employmentType,
        hiringOrganization: { "@type": "Organization", name: j.companyName },
        // addressCountry was hardcoded "US" — it told Google every UK, German
        // and Indian posting was American. Omit rather than guess when unknown:
        // a wrong country is worse than an absent one.
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            ...(j.remoteType.startsWith("REMOTE") ? {} : { addressRegion: j.locationState ?? undefined }),
            ...(j.country ? { addressCountry: j.country } : {}),
          },
        },
        ...(j.remoteType.startsWith("REMOTE") ? { jobLocationType: "TELECOMMUTE" } : {}),
        directApply: false,
        url: j.sourceUrl,
      },
    })),
  };
}

/** CollectionPage + BreadcrumbList + ItemList + FAQPage, one @graph — the FAQPage
 * entries must stay byte-for-byte in sync with the visible FAQ cards below.
 *
 * A thin page (§1.2) emits the breadcrumb only. CollectionPage, ItemList and
 * FAQPage are all bids to be indexed as a listing hub, and we're serving this
 * one `noindex` — asking for rich results on a page we've told Google to skip
 * is at best noise, at worst a mixed signal. The breadcrumb stays because it
 * describes where the URL sits, which is still true while it's thin. */
function structuredData(page: SeoPage, faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@graph": page.thin
      ? [breadcrumbLd(page)]
      : [collectionPageLd(page), breadcrumbLd(page), itemListLd(page), faqPageLd(faqs)],
  };
}

/**
 * Below-floor state (§1.2). The page is `noindex,follow`, so its whole job is
 * to be useful to the human who landed on it: say plainly how thin it is and
 * offer the alert, rather than dressing up 2 listings as a market. This is the
 * conversion path a 404 used to throw away.
 */
function ThinNotice({ total }: { total: number }) {
  return (
    <div style={S.thinNotice}>
      <strong style={{ color: "#fff" }}>
        Only {total} {total === 1 ? "listing" : "listings"} here right now.
      </strong>{" "}
      This page fills up as we crawl more boards. Set an email alert and we&rsquo;ll tell you the
      moment new roles land — no need to keep checking back.{" "}
      <a href="#alerts" style={S.thinNoticeLink}>Set an alert →</a>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={S.sectionHead}>
      <div style={S.sectionTitle}>{title}</div>
      <div style={S.sectionSub}>{sub}</div>
    </div>
  );
}

/** Flat card — used only for hub freelance-project sections, which stay a
 * simple list rather than the company-grouped/filterable jobs treatment
 * (there's no salary-comparability or company-diversity concern the same way
 * for a handful of client briefs). */
function ListingCard({ j }: { j: SeoJob }) {
  const pay = salaryText(j);
  const isProject = j.kind === "PROJECT";
  return (
    <div style={S.card}>
      <div style={S.cardTop}>
        <div style={{ flex: 1 }}>
          <div style={S.jobTitle}>{j.titleRaw}</div>
          <div style={S.jobMeta}>
            {j.companyName} · {placeLabel(j)} · {isProject ? "Freelance" : label(j.employmentType)}
            {pay ? ` · ${pay}` : ""}
          </div>
        </div>
        <a style={S.viewBtn} href={`/job/${j.id}`}>{isProject ? "View & bid" : "View job"}</a>
      </div>
      <div style={S.fresh}>● {freshness(j.lastVerifiedAt)} · via {label(j.source)}</div>
    </div>
  );
}

/** No fabricated per-job scores — bars are unlabelled and captioned as
 * illustrative, since an anonymous visitor has no resume on file yet to
 * actually score against. */
function MatchGate({ topic }: { topic: string }) {
  const widths = [82, 61, 45];
  return (
    <section style={S.matchGate}>
      <div style={S.matchGateBlob} />
      <div style={S.matchGateTitle}>See which of these actually fit you</div>
      <p style={S.matchGateSub}>
        Upload a resume once and every {topic} listing here gets scored against what you&apos;ve actually done — gaps included, no signup wall.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {widths.map((w, i) => (
          <div key={i} style={S.matchGateTrack}>
            <div style={{ ...S.matchGateFill, width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div style={S.matchGateCaption}>Illustrative only — your real score depends on your resume.</div>
      <Link href="/onboard" style={S.matchGateBtn}>Upload résumé</Link>
    </section>
  );
}

/** Sitewide taxonomy — reuses getBrowseHub (same data backing /jobs) rather
 * than inventing a page-specific breakdown, so every link here is guaranteed
 * to resolve (same floor-checked discipline as the directory itself). */
function TaxonomyGrid({ hub, exceptHref }: { hub: BrowseHub; exceptHref: string }) {
  const notSelf = (l: HubLink) => l.href !== exceptHref;
  const columns: { title: string; items: HubLink[] }[] = [
    { title: "By field", items: hub.verticals.filter(notSelf).slice(0, 8) },
    { title: "By role", items: hub.roles.filter(notSelf).slice(0, 8) },
    { title: "By US state", items: hub.states.filter(notSelf).slice(0, 8) },
    { title: "By country", items: hub.countries.filter(notSelf).slice(0, 8) },
  ].filter((c) => c.items.length > 0);

  if (columns.length === 0) return null;

  return (
    <section style={S.taxSection}>
      <div style={S.taxWrap}>
        <h2 style={S.taxH2}>Browse jobs by category</h2>
        <p style={S.taxSub}>Counts from live, re-verified postings — updated a few times a day.</p>
        <div id="tz-tax-grid">
          <style dangerouslySetInnerHTML={{ __html: "#tz-tax-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}" }} />
          {columns.map((col) => (
            <div key={col.title} style={S.taxCard}>
              <div style={S.taxGroupTitle}>{col.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {col.items.map((it) => (
                  <Link key={it.href} href={it.href} style={S.taxLink}>
                    <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                    <span style={{ flex: "none", fontSize: 11, color: MUTED }}>{it.count.toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function SeoPageView({ page }: { page: SeoPage }) {
  const isHub = page.kind === "hub";
  const projects = page.projects ?? [];
  const faqs = buildFaqs(page);
  const seoCopy = buildSeoCopy(page);
  const crumbs = buildBreadcrumbs(page);
  const hub = await getBrowseHub();

  const heroStats: { v: string; k: string }[] = [
    { v: page.total.toLocaleString(), k: `Live verified ${page.total === 1 ? "role" : "roles"}` },
    { v: page.stats.companies.toLocaleString(), k: page.stats.companies === 1 ? "Company hiring" : "Companies hiring" },
    // Remote-role pages are 100% remote by definition — showing that back as
    // a "stat" would just be restating the page's own filter.
    ...(page.kind === "remote-role" ? [] : [{ v: `${page.stats.remoteSharePct}%`, k: "Remote-eligible" }]),
    { v: page.stats.postedLast7d.toLocaleString(), k: "Posted in the last 7 days" },
  ];

  const alertLabel = page.country ? `jobs open to ${countryName(page.country)}` : page.heading;
  const alertPlace = page.state ?? (page.country ? countrySlugFor(page.country) : undefined);
  const alertSlot = (
    <div id="alerts">
      <AlertCapture slug={page.slug} place={alertPlace} label={alertLabel} />
    </div>
  );
  const matchGate = <MatchGate topic={page.topic} />;

  return (
    <main style={S.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData(page, faqs)) }} />

      <SiteNav />

      {/* ── Dark hero: breadcrumb, H1, intro, CTAs, real stat bar ── */}
      <section style={S.hero}>
        <div style={S.heroBlob} />
        <div style={S.heroInner}>
          <nav aria-label="Breadcrumb" style={S.crumbNav}>
            {crumbs.map((c, i) => (
              <span key={c.item} style={S.crumbItem}>
                {i > 0 && <span style={S.crumbSep}>/</span>}
                {i === crumbs.length - 1 ? (
                  <span style={S.crumbCurrent}>{c.name}</span>
                ) : (
                  <Link href={c.item} style={S.crumbLink}>{c.name}</Link>
                )}
              </span>
            ))}
          </nav>
          <div style={S.heroTop}>
            <div style={{ flex: "1 1 480px", minWidth: 300 }}>
              <h1 style={S.h1}>{page.heading}</h1>
              <p style={S.heroIntro}>{page.intro}</p>
              {page.thin && <ThinNotice total={page.total} />}
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 22 }}>
                <Link href="/onboard" style={S.heroCtaPrimary}>Upload résumé — score every role</Link>
                <a href="#alerts" style={S.heroCtaSecondary}>Email me new roles</a>
              </div>
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 280, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: "20px 22px" }}>
              <div id="tz-hero-stats">
                <style dangerouslySetInnerHTML={{ __html: "#tz-hero-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}" }} />
                {heroStats.map((s) => (
                  <div key={s.k}>
                    <div style={S.statV}>{s.v}</div>
                    <div style={S.statK}>{s.k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main grid: filter/sort/group + sidebar (or hub's two lists) ── */}
      <div style={S.wrap2}>
        {isHub ? (
          <>
            {/* Two lists, not one. A salaried job and a freelance brief are
                different transactions — you apply for one and bid on the
                other — so merging them would misrepresent both. */}
            <SectionHead
              title={`${page.jobs.length} ${page.jobs.length === 1 ? "job" : "jobs"}`}
              sub="Salaried roles, straight from company career pages."
            />
            {page.jobs.length > 0 ? (
              <JobsInteractive jobs={page.jobs} poolLabel={page.topic} matchGate={matchGate} alertSlot={alertSlot} />
            ) : (
              <p style={S.empty}>No salaried openings matching this right now — the freelance briefs below are where this work is being posted today.</p>
            )}

            <SectionHead
              title={`${projects.length} freelance ${projects.length === 1 ? "project" : "projects"}`}
              sub="Live client briefs. You bid on the client's own site — Topezia never sits in between."
            />
            {projects.map((j) => <ListingCard key={j.id} j={j} />)}
            {projects.length === 0 && <p style={S.empty}>No open briefs right now. New ones land daily.</p>}
          </>
        ) : (
          <JobsInteractive jobs={page.jobs} poolLabel={page.topic} matchGate={matchGate} alertSlot={alertSlot} />
        )}

        {page.siblings.length > 0 && (
          <nav style={S.siblings}>
            <div style={S.sibHead}>Related searches</div>
            <div style={S.sibList}>
              {page.siblings.map((s) => (
                <Link key={s.href} href={s.href} style={S.sibLink}>{s.label}</Link>
              ))}
            </div>
          </nav>
        )}
      </div>

      <TaxonomyGrid hub={hub} exceptHref={page.canonicalPath} />

      {/* SEO content block: two-column copy + FAQ, stacks under 900px (SEO_CSS). */}
      <section style={S.seoSection}>
        <style dangerouslySetInnerHTML={{ __html: SEO_CSS }} />
        <div id="tz-seo-grid">
          <div>
            <h2 style={S.seoH2}>{seoCopy.h2}</h2>
            {seoCopy.blocks.map((b, i) =>
              b.type === "h3" ? (
                <h3 key={i} style={S.seoH3}>{b.text}</h3>
              ) : (
                <p key={i} style={S.seoP}>{b.text}</p>
              )
            )}
            <p style={S.seoP}>
              <Link href="/jobs" style={S.seoInlineLink}>Browse every job category</Link> on Topezia, or see how this page fits into the wider taxonomy above.
            </p>
          </div>
          <div>
            <h2 style={S.faqHead}>Common questions</h2>
            {faqs.map((f) => (
              <div key={f.q} style={S.faqCard}>
                <div style={S.faqQ}>{f.q}</div>
                <p style={S.faqA}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

const SEO_CSS = `
#tz-seo-grid{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:44px}
@media (max-width:900px){#tz-seo-grid{grid-template-columns:minmax(0,1fr)!important;gap:28px!important}}
`;

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "var(--font-jakarta), sans-serif", color: INK },
  hero: { background: "#0F172A", color: "#fff", position: "relative", overflow: "hidden" },
  heroBlob: { position: "absolute", top: -190, right: -80, width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.34), transparent 68%)", pointerEvents: "none" },
  heroInner: { maxWidth: 1180, margin: "0 auto", padding: "22px 24px 34px", position: "relative" },
  heroTop: { display: "flex", gap: 44, alignItems: "flex-start", flexWrap: "wrap", marginTop: 12 },
  h1: { margin: 0, fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 36, letterSpacing: "-1.2px", lineHeight: 1.12 },
  heroIntro: { margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 560 },
  thinNotice: { margin: "16px 0 0", maxWidth: 560, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: "13px 16px", fontSize: 13.5, lineHeight: 1.65, color: "#B9C0D4" },
  thinNoticeLink: { color: "#A5B4FC", textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" },
  heroCtaPrimary: { display: "inline-flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg, ${INDIGO}, #3B82F6)`, borderRadius: 11, padding: "12px 22px", fontSize: 13.5, fontWeight: 700, color: "#fff", textDecoration: "none", boxShadow: "0 8px 22px rgba(99,102,241,.34)", whiteSpace: "nowrap" },
  heroCtaSecondary: { display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.06)", borderRadius: 11, padding: "12px 20px", fontSize: 13.5, fontWeight: 600, color: "#E2E8F0", textDecoration: "none", whiteSpace: "nowrap" },
  statV: { fontSize: 22, fontWeight: 800, letterSpacing: "-0.7px", color: "#fff" },
  statK: { fontSize: 10.5, color: "#8B96B5", marginTop: 4, lineHeight: 1.4 },
  crumbNav: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 11.5, color: "#8B96B5", marginBottom: 4 },
  crumbItem: { display: "inline-flex", alignItems: "center", gap: 8 },
  crumbSep: { color: "#586180" },
  crumbLink: { color: "#8B96B5", textDecoration: "none", fontWeight: 500 },
  crumbCurrent: { color: "#E2E8F0", fontWeight: 600 },
  wrap2: { maxWidth: 1180, margin: "0 auto", padding: "26px 24px 20px" },
  sectionHead: { marginTop: 30, marginBottom: 12 },
  sectionTitle: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 20 },
  sectionSub: { color: MUTED, fontSize: 14, marginTop: 3, lineHeight: 1.5 },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 14, padding: 18, marginBottom: 10 },
  cardTop: { display: "flex", alignItems: "flex-start", gap: 12 },
  jobTitle: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 17 },
  jobMeta: { color: MUTED, fontSize: 14, marginTop: 3 },
  viewBtn: { padding: "8px 16px", background: INDIGO, color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: 14, whiteSpace: "nowrap" },
  fresh: { color: "#059669", fontSize: 12, fontWeight: 600, marginTop: 10 },
  empty: { color: MUTED, fontSize: 14, lineHeight: 1.6, background: "#fff", border: "1px dashed #dcdce6", borderRadius: 14, padding: 18, margin: 0 },
  siblings: { marginTop: 36, paddingTop: 24, borderTop: "1px solid #e6e6ef" },
  sibHead: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 12 },
  sibList: { display: "flex", flexWrap: "wrap", gap: 8 },
  sibLink: { padding: "7px 13px", background: "#fff", border: "1px solid #e2e2ea", borderRadius: 999, color: INDIGO, fontSize: 14, fontWeight: 600, textDecoration: "none" },
  matchGate: { background: "#0F172A", borderRadius: 16, padding: "20px 22px", color: "#fff", position: "relative", overflow: "hidden" },
  matchGateBlob: { position: "absolute", top: -60, right: -50, width: 190, height: 190, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.4), transparent 70%)" },
  matchGateTitle: { position: "relative", fontSize: 14, fontWeight: 700 },
  matchGateSub: { position: "relative", margin: "7px 0 14px", fontSize: 11.5, lineHeight: 1.6, color: "#B9C0D4" },
  matchGateTrack: { position: "relative", height: 8, borderRadius: 999, background: "rgba(255,255,255,.1)", overflow: "hidden" },
  matchGateFill: { height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${INDIGO}, #3B82F6)` },
  matchGateCaption: { position: "relative", fontSize: 10.5, color: "#8B96B5", marginBottom: 14 },
  matchGateBtn: { position: "relative", display: "block", background: `linear-gradient(135deg, ${INDIGO}, #3B82F6)`, borderRadius: 10, padding: 11, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#fff", textDecoration: "none" },
  taxSection: { borderTop: "1px solid #ececf2", background: "#f7f7fb" },
  taxWrap: { maxWidth: 1180, margin: "0 auto", padding: "40px 24px 48px" },
  taxH2: { margin: "0 0 6px", fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px" },
  taxSub: { margin: "0 0 22px", fontSize: 12.5, color: MUTED },
  taxCard: { background: "#fff", border: "1px solid #ececf2", borderRadius: 14, padding: "16px 18px" },
  taxGroupTitle: { fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: MUTED, textTransform: "uppercase", marginBottom: 12 },
  taxLink: { display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: "#334155", textDecoration: "none" },
  seoSection: { borderTop: "1px solid #ececf2", background: "#fff", padding: "48px 20px 64px" },
  seoH2: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "-0.5px", margin: "0 0 16px" },
  seoH3: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 16, margin: "20px 0 8px" },
  seoP: { color: MUTED, fontSize: 14.5, lineHeight: 1.75, margin: "0 0 14px" },
  seoInlineLink: { color: INDIGO, fontWeight: 600, textDecoration: "none" },
  faqHead: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: "-0.3px", margin: "0 0 14px" },
  faqCard: { background: "#f7f7fb", border: "1px solid #ececf2", borderRadius: 14, padding: "16px 18px", marginBottom: 12 },
  faqQ: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: INK },
  faqA: { margin: 0, fontSize: 12.5, lineHeight: 1.65, color: MUTED },
};
