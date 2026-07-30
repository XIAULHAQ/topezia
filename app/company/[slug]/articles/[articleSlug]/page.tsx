/**
 * /company/{slug}/articles/{articleSlug} — one company article, public.
 *
 * Rendered with dangerouslySetInnerHTML, which is only safe because the HTML
 * was sanitized with sanitizeUgcHtml before it was stored (lib/sanitize.ts):
 * external links carry rel="ugc nofollow" and images can only come from our
 * own storage origin.
 *
 * The JSON-LD says `author: Organization {company}` and publisher Topezia.
 * That distinction is the point — this is writing we host, not writing we
 * wrote, and BlogPosting with a Topezia byline would claim otherwise.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { companyImageUrl, companyLogoUrl } from "@/lib/company/storage";
import { companyIndexable, companyArticleIndexable } from "@/lib/company/indexing";
import { htmlToText } from "@/lib/company/article";
import { readingTime } from "@/lib/blog/reading-time";
import { safeJsonLd } from "@/lib/seo/json-ld";

export const revalidate = 900;

const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

async function load(companySlug: string, articleSlug: string) {
  return prisma.companyArticle.findFirst({
    where: { slug: articleSlug, status: "PUBLISHED", company: { slug: companySlug } },
    select: {
      slug: true, title: true, excerpt: true, contentHtml: true, coverPath: true, coverAlt: true,
      metaTitle: true, metaDescription: true, tags: true, publishedAt: true, updatedAt: true,
      company: {
        select: {
          name: true, slug: true, tagline: true, about: true, website: true, logoPath: true, spamCleared: true,
          _count: { select: { jobs: { where: { status: "LIVE" } } } },
        },
      },
    },
  });
}

type ArticleRecord = NonNullable<Awaited<ReturnType<typeof load>>>;

function indexable(a: ArticleRecord): boolean {
  const parentOk = companyIndexable({
    name: a.company.name,
    tagline: a.company.tagline,
    about: a.company.about,
    website: a.company.website,
    spamCleared: a.company.spamCleared,
    liveJobCount: a.company._count.jobs,
  });
  if (!parentOk) return false;

  return companyArticleIndexable(
    { title: a.title, excerpt: a.excerpt, bodyText: htmlToText(a.contentHtml), tags: a.tags },
    a.company.spamCleared
  );
}

export async function generateMetadata({ params }: { params: { slug: string; articleSlug: string } }): Promise<Metadata> {
  const a = await load(params.slug, params.articleSlug);
  if (!a) return { title: "Article — Topezia", robots: { index: false } };

  const title = a.metaTitle || a.title;
  const description = (a.metaDescription || a.excerpt || "").slice(0, 200);
  const cover = companyImageUrl(a.coverPath);

  return {
    title: `${title} | ${a.company.name}`,
    description,
    alternates: { canonical: `/company/${a.company.slug}/articles/${a.slug}` },
    openGraph: {
      title,
      description,
      url: `/company/${a.company.slug}/articles/${a.slug}`,
      type: "article",
      ...(cover ? { images: [cover] } : {}),
    },
    twitter: { card: "summary_large_image" },
    robots: { index: indexable(a), follow: true },
    other: {
      ...(a.publishedAt ? { "article:published_time": a.publishedAt.toISOString() } : {}),
      "article:modified_time": a.updatedAt.toISOString(),
    },
  };
}

export default async function CompanyArticlePage({ params }: { params: { slug: string; articleSlug: string } }) {
  const a = await load(params.slug, params.articleSlug);
  if (!a) notFound();

  const cover = companyImageUrl(a.coverPath);
  const logo = companyLogoUrl(a.company.logoPath);
  const mins = readingTime(a.contentHtml);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    ...(a.excerpt ? { description: a.excerpt } : {}),
    ...(cover ? { image: cover } : {}),
    ...(a.publishedAt ? { datePublished: a.publishedAt.toISOString() } : {}),
    dateModified: a.updatedAt.toISOString(),
    // The company wrote it; we host it. Saying anything else here would be a
    // byline we didn't earn.
    author: { "@type": "Organization", name: a.company.name, url: `${SITE}/company/${a.company.slug}` },
    publisher: { "@type": "Organization", name: "Topezia", url: SITE },
    mainEntityOfPage: `${SITE}/company/${a.company.slug}/articles/${a.slug}`,
  };

  return (
    <main style={{ background: "#F1F5F9", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sora), var(--font-jakarta), sans-serif", color: INK }}>
      <SiteNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 24px 64px", width: "100%", flex: 1 }}>
        <p style={{ margin: "0 0 16px", fontSize: 12.5 }}>
          <Link href={`/company/${a.company.slug}/articles`} style={{ color: MUTED, textDecoration: "none" }}>← Writing by {a.company.name}</Link>
        </p>

        <article style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden" }}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={a.coverAlt ?? ""} style={{ width: "100%", height: "auto", display: "block" }} />
          )}

          <div style={{ padding: "30px 32px 36px" }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.7px", lineHeight: 1.22 }}>{a.title}</h1>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 16, fontSize: 12.5, color: MUTED }}>
              <Link href={`/company/${a.company.slug}`} style={{ display: "inline-flex", gap: 8, alignItems: "center", color: INK, textDecoration: "none", fontWeight: 700 }}>
                <span style={S.logoDot}>
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    a.company.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                {a.company.name}
              </Link>
              {a.publishedAt && <span>{a.publishedAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>}
              <span>{mins} min read</span>
            </div>

            {a.excerpt && <p style={{ margin: "18px 0 0", fontSize: 15.5, lineHeight: 1.7, color: "#334155", fontWeight: 500 }}>{a.excerpt}</p>}

            <div style={S.body} dangerouslySetInnerHTML={{ __html: a.contentHtml }} />

            {a.tags.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 26, paddingTop: 20, borderTop: `1px solid ${LINE}` }}>
                {a.tags.map((t) => <span key={t} style={S.tag}>{t}</span>)}
              </div>
            )}
          </div>
        </article>

        <section style={{ border: "1px solid #C7D2FE", background: "linear-gradient(150deg,#EEF2FF,#F5F3FF)", borderRadius: 16, padding: "20px 22px", marginTop: 22 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Written by {a.company.name}</h2>
          <p style={{ margin: "8px 0 14px", fontSize: 12.8, lineHeight: 1.65, color: "#334155" }}>
            {a.company.tagline || `See their work and open roles on Topezia.`}
          </p>
          <Link href={`/company/${a.company.slug}`} style={{ display: "inline-block", background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", borderRadius: 11, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            View {a.company.name}
          </Link>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  logoDot: { width: 24, height: 24, borderRadius: 6, background: "#F1F5F9", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800, overflow: "hidden", color: "#64748B" },
  body: { marginTop: 22, fontSize: 15.5, lineHeight: 1.85, color: "#1E293B" },
  tag: { background: "#F1F5F9", color: "#475569", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600 },
};
