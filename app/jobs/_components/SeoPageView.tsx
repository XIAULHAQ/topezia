import Link from "next/link";
import type { CSSProperties } from "react";
import type { SeoPage, SeoJob } from "@/lib/seo/pages";
import { countrySlugFor, countryName } from "@/lib/seo/pages";
import { decodeHtmlEntities } from "@/lib/sanitize";
import AlertCapture from "./AlertCapture";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

const REGION_LABEL: Record<string, string> = {
  GLOBAL: "Anywhere", EMEA: "EMEA", APAC: "APAC", LATAM: "LatAm", ANZ: "ANZ",
  EUROPE: "Europe", NORTH_AMERICA: "North America",
};

/**
 * Where the job is, in words a reader recognises.
 *
 * label(remoteType) rendered REMOTE_INTL as "Remote Intl" — raw enum, and on a
 * UK page it called a UK-remote job "international". Say the actual scope.
 */
function placeLabel(j: SeoJob): string {
  if (!j.remoteType.startsWith("REMOTE")) {
    return j.locationState || REGION_LABEL[j.remoteScope ?? ""] || j.country || label(j.remoteType);
  }
  const scope = j.remoteScope;
  if (!scope) return "Remote";
  if (scope === "US") return "Remote (US)";
  return `Remote (${REGION_LABEL[scope] ?? scope})`;
}

/** Plain text for structured data — decode BEFORE stripping tags. */
const plainText = (html: string) =>
  decodeHtmlEntities(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function salaryText(j: SeoJob): string | null {
  if (j.salaryMin == null || j.salaryMax == null) return null;
  const unit = j.salaryPeriod === "HOUR" ? "/hr" : j.salaryPeriod === "YEAR" ? "/yr" : "";
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  return `${fmt(j.salaryMin)}–${fmt(j.salaryMax)}${unit}`;
}

function freshness(d: Date): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 3.6e6));
  if (h < 1) return "verified just now";
  if (h < 48) return `verified ${h}h ago`;
  return `verified ${Math.round(h / 24)}d ago`;
}

/** JobPosting structured data — we emit the same schema we crawl (§7). */
function jsonLd(page: SeoPage) {
  return {
    "@context": "https://schema.org",
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

export default function SeoPageView({ page }: { page: SeoPage }) {
  return (
    <main style={S.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(page)) }} />

      <SiteNav />

      <div style={S.wrap}>
        <h1 style={S.h1}>{page.heading}</h1>
        <p style={S.intro}>{page.intro}</p>

        {/* Email-alert capture above the fold (§7), plus the resume path. */}
        {/* The country heading carries an "& open to applicants there" clause
            that reads badly inside "Get new {label} by email" — use the plain
            place name for the alert label instead. */}
        <AlertCapture slug={page.slug} place={page.state ?? (page.country ? countrySlugFor(page.country) : undefined)} label={page.country ? `jobs open to ${countryName(page.country)}` : page.heading} />
        <div style={S.cta}>
          <div>
            <div style={S.ctaTitle}>Which of these actually fit you?</div>
            <div style={S.ctaSub}>Upload your resume once — get an honest score and the skill gaps for every job below.</div>
          </div>
          <Link href="/onboard" style={S.ctaBtn}>Show my matches →</Link>
        </div>

        <div style={S.count}>{page.total} verified {page.total === 1 ? "job" : "jobs"}</div>

        {page.jobs.map((j) => {
          const pay = salaryText(j);
          return (
            <div key={j.id} style={S.card}>
              <div style={S.cardTop}>
                <div style={{ flex: 1 }}>
                  <div style={S.jobTitle}>{j.titleRaw}</div>
                  <div style={S.jobMeta}>
                    {j.companyName} · {placeLabel(j)} · {label(j.employmentType)}
                    {pay ? ` · ${pay}` : ""}
                  </div>
                </div>
                <a style={S.viewBtn} href={`/job/${j.id}`}>View job</a>
              </div>
              <div style={S.fresh}>● {freshness(j.lastVerifiedAt)} · via {label(j.source)}</div>
            </div>
          );
        })}

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
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "var(--font-jakarta), sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  wrap: { maxWidth: 780, margin: "0 auto", padding: "40px 20px 80px" },
  h1: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 34, margin: "0 0 12px" },
  intro: { color: MUTED, fontSize: 17, lineHeight: 1.6, margin: "0 0 24px" },
  cta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "#eef0ff", border: `1px solid #d9dcff`, borderRadius: 16, padding: 20, marginBottom: 28, flexWrap: "wrap" },
  ctaTitle: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 4 },
  ctaSub: { color: MUTED, fontSize: 14, lineHeight: 1.45 },
  ctaBtn: { padding: "12px 22px", background: INDIGO, color: "#fff", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none", whiteSpace: "nowrap" },
  count: { color: MUTED, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 14, padding: 18, marginBottom: 10 },
  cardTop: { display: "flex", alignItems: "flex-start", gap: 12 },
  jobTitle: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 17 },
  jobMeta: { color: MUTED, fontSize: 14, marginTop: 3 },
  viewBtn: { padding: "8px 16px", background: INDIGO, color: "#fff", borderRadius: 10, fontWeight: 700, textDecoration: "none", fontSize: 14, whiteSpace: "nowrap" },
  fresh: { color: "#059669", fontSize: 12, fontWeight: 600, marginTop: 10 },
  siblings: { marginTop: 36, paddingTop: 24, borderTop: "1px solid #e6e6ef" },
  sibHead: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 12 },
  sibList: { display: "flex", flexWrap: "wrap", gap: 8 },
  sibLink: { padding: "7px 13px", background: "#fff", border: "1px solid #e2e2ea", borderRadius: 999, color: INDIGO, fontSize: 14, fontWeight: 600, textDecoration: "none" },
};
