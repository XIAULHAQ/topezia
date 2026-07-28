/**
 * /blog/tag/{tag} — posts filtered by a free-text tag. Indexed only when it
 * has content: a mistyped tag URL and a genuinely-empty tag both 404,
 * consistent with how the rest of the app treats nonexistent content.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import PostCard from "../../_components/PostCard";

export const dynamic = "force-dynamic";

const C = { ink: "#0F172A", mut: "#64748B" };
const FONT = "var(--font-sora), system-ui, sans-serif";

async function load(tag: string) {
  return prisma.post.findMany({
    where: { status: "PUBLISHED", tags: { has: tag } },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: { slug: true, title: true, excerpt: true, coverImage: true, coverImageAlt: true, tags: true, publishedAt: true, contentHtml: true },
  });
}

export async function generateMetadata({ params }: { params: { tag: string } }): Promise<Metadata> {
  const tag = decodeURIComponent(params.tag);
  const posts = await load(tag);
  if (posts.length === 0) return { title: "Blog — Topezia", robots: { index: false } };
  const title = `${tag} articles | Topezia Blog`;
  const description = `Posts tagged "${tag}" on the Topezia blog.`;
  return {
    title,
    description,
    alternates: { canonical: `/blog/tag/${encodeURIComponent(tag)}` },
    openGraph: { title, description, url: `/blog/tag/${encodeURIComponent(tag)}`, type: "website" },
  };
}

export default async function BlogTagPage({ params }: { params: { tag: string } }) {
  const tag = decodeURIComponent(params.tag);
  const posts = await load(tag);
  if (posts.length === 0) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink }}>
      <SiteHeader />
      <main style={S.wrap}>
        <div style={S.backRow}>
          <Link href="/blog" style={S.backLink}>← All posts</Link>
        </div>
        <header style={S.head}>
          <h1 style={S.h1}>{tag}</h1>
          <p style={S.sub}>{posts.length} {posts.length === 1 ? "post" : "posts"} tagged &ldquo;{tag}&rdquo;</p>
        </header>
        <div style={S.grid}>
          {posts.map((p) => <PostCard key={p.slug} post={p} />)}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "30px 24px 80px" },
  backRow: { marginBottom: 20 },
  backLink: { color: C.mut, fontSize: 13.5, fontWeight: 600, textDecoration: "none" },
  head: { marginBottom: 30 },
  h1: { margin: 0, fontSize: "clamp(26px, 4.5vw, 34px)", fontWeight: 800, letterSpacing: "-0.8px" },
  sub: { margin: "10px 0 0", fontSize: 14, color: C.mut },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 22 },
};
