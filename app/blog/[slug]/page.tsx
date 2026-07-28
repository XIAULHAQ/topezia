/**
 * /blog/{slug} — a single post. PUBLIC and indexed.
 *
 * Modeled on app/portfolio/[slug]/page.tsx: generateMetadata with a
 * canonical + OG/Twitter, BlogPosting JSON-LD, and an unconditional
 * `status !== "PUBLISHED"` 404 — there's no "owner" concept here the way
 * portfolio drafts have (no per-post author, /hq has no accounts), so a
 * draft simply doesn't exist to the public, full stop.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import { blogImageUrl } from "@/lib/blog/storage";
import { readingTime } from "@/lib/blog/reading-time";
import { safeJsonLd } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";

const C = { c1: "#8B5CF6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const FONT = "var(--font-sora), system-ui, sans-serif";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

async function load(slug: string) {
  return prisma.post.findUnique({ where: { slug } });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p || p.status !== "PUBLISHED") return { title: "Blog — Topezia", robots: { index: false } };

  const title = p.metaTitle || p.title;
  const description = (p.metaDescription || p.excerpt || "").slice(0, 200);
  const cover = blogImageUrl(p.coverImage);

  return {
    title: `${title} | Topezia Blog`,
    description,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: {
      title,
      description,
      url: `/blog/${p.slug}`,
      type: "article",
      ...(cover ? { images: [cover] } : {}),
    },
    twitter: { card: "summary_large_image" },
    // Next's `openGraph.type: "article"` doesn't itself emit the
    // article:published_time meta tag — set it explicitly.
    other: {
      ...(p.publishedAt ? { "article:published_time": p.publishedAt.toISOString() } : {}),
      "article:modified_time": p.updatedAt.toISOString(),
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const p = await load(params.slug);
  if (!p || p.status !== "PUBLISHED") notFound();

  const cover = blogImageUrl(p.coverImage);
  const shareUrl = `${SITE}/blog/${p.slug}`;
  const mins = readingTime(p.contentHtml);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    ...(p.excerpt ? { description: p.excerpt } : {}),
    ...(cover ? { image: cover } : {}),
    ...(p.publishedAt ? { datePublished: p.publishedAt.toISOString() } : {}),
    dateModified: p.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "Topezia Team" },
    publisher: {
      "@type": "Organization",
      name: "Topezia",
      logo: { "@type": "ImageObject", url: `${SITE}/brand-mark.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": shareUrl },
    url: shareUrl,
    ...(p.tags.length ? { keywords: p.tags.join(", ") } : {}),
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <SiteHeader />

      <main style={S.wrap}>
        <div style={S.backRow}>
          <Link href="/blog" style={S.backLink}>← All posts</Link>
        </div>

        <header style={S.head}>
          {p.tags.length > 0 && (
            <div style={S.tagRow}>
              {p.tags.map((t) => <Link key={t} href={`/blog/tag/${encodeURIComponent(t)}`} style={S.tag}>{t}</Link>)}
            </div>
          )}
          <h1 style={S.h1}>{p.title}</h1>
          <div style={S.meta}>
            <span style={{ fontWeight: 600, color: C.ink }}>Topezia Team</span>
            <span>·</span>
            {p.publishedAt && <span>{p.publishedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>}
            <span>·</span>
            <span>{mins} min read</span>
          </div>
        </header>

        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={p.coverImageAlt ?? ""} style={S.cover} decoding="async" />
        )}

        <div style={S.content} dangerouslySetInnerHTML={{ __html: p.contentHtml }} />
      </main>

      <SiteFooter />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "30px 24px 80px" },
  backRow: { marginBottom: 20 },
  backLink: { color: C.mut, fontSize: 13.5, fontWeight: 600, textDecoration: "none" },
  head: { marginBottom: 24 },
  tagRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  tag: { background: "#EEF2FF", color: C.c1, border: "1px solid #C7D2FE", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, textDecoration: "none" },
  h1: { margin: 0, fontSize: "clamp(26px, 5vw, 38px)", fontWeight: 800, letterSpacing: "-0.9px", lineHeight: 1.2 },
  meta: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: C.mut, marginTop: 14 },
  cover: { width: "100%", height: "auto", borderRadius: 16, display: "block", marginBottom: 30 },
  content: { fontSize: 16, lineHeight: 1.85, color: C.slate },
};
