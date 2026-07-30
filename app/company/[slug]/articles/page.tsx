/**
 * /company/{slug}/articles — everything a company has published.
 *
 * Deliberately noindex: it is a list of links with no words of its own, which
 * is the definition of a thin page. The ARTICLES are what should rank, and
 * each decides that for itself. Crawlers still follow through to them.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { companyImageUrl, companyLogoUrl } from "@/lib/company/storage";

export const revalidate = 900;

const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";

async function load(slug: string) {
  return prisma.company.findUnique({
    where: { slug },
    select: {
      name: true, slug: true, logoPath: true, tagline: true,
      articles: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        select: { slug: true, title: true, excerpt: true, publishedAt: true, coverPath: true, tags: true },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await load(params.slug);
  if (!c) return { title: "Articles — Topezia", robots: { index: false } };
  return {
    title: `Articles by ${c.name} | Topezia`,
    description: `Writing from ${c.name} on Topezia.`,
    alternates: { canonical: `/company/${c.slug}/articles` },
    robots: { index: false, follow: true },
  };
}

export default async function CompanyArticlesPage({ params }: { params: { slug: string } }) {
  const c = await load(params.slug);
  if (!c) notFound();

  const logo = companyLogoUrl(c.logoPath);

  return (
    <main style={{ background: "#F1F5F9", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sora), var(--font-jakarta), sans-serif", color: INK }}>
      <SiteNav />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 24px 64px", width: "100%", flex: 1 }}>
        <p style={{ margin: "0 0 16px", fontSize: 12.5 }}>
          <Link href={`/company/${c.slug}`} style={{ color: MUTED, textDecoration: "none" }}>← {c.name}</Link>
        </p>

        <header style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 24 }}>
          <span style={S.logo}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              c.name.slice(0, 2).toUpperCase()
            )}
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>Writing by {c.name}</h1>
            {c.tagline && <p style={{ margin: "6px 0 0", fontSize: 13, color: MUTED }}>{c.tagline}</p>}
          </div>
        </header>

        {c.articles.length === 0 ? (
          <div style={S.card}><p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Nothing published yet.</p></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {c.articles.map((a) => {
              const cover = companyImageUrl(a.coverPath);
              return (
                <Link key={a.slug} href={`/company/${c.slug}/articles/${a.slug}`} style={{ ...S.card, display: "flex", gap: 18, alignItems: "flex-start", color: INK, textDecoration: "none" }}>
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" style={{ flex: "none", width: 132, height: 88, objectFit: "cover", borderRadius: 10, border: `1px solid ${LINE}` }} />
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 16, fontWeight: 700, display: "block", lineHeight: 1.35 }}>{a.title}</b>
                    {a.excerpt && <span style={{ display: "block", fontSize: 13, color: MUTED, marginTop: 7, lineHeight: 1.6 }}>{a.excerpt}</span>}
                    <span style={{ display: "block", fontSize: 11.5, color: "#94A3B8", marginTop: 9 }}>
                      {a.publishedAt?.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                      {a.tags.length > 0 && ` · ${a.tags.join(", ")}`}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "20px 22px" },
  logo: { flex: "none", width: 48, height: 48, borderRadius: 12, background: "#fff", border: `1px solid ${LINE}`, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, color: "#64748B", overflow: "hidden", padding: 4 },
};
