/**
 * /blog — the public post index. Indexed.
 */
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import PostCard from "./_components/PostCard";

export const dynamic = "force-dynamic";

const C = { ink: "#0F172A", mut: "#64748B" };
const FONT = "var(--font-sora), system-ui, sans-serif";
const TITLE = "Blog — Topezia";
const DESCRIPTION = "Career advice, hiring insights and product updates from Topezia.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/blog" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/blog", type: "website" },
};

export default async function BlogIndexPage() {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: { slug: true, title: true, excerpt: true, coverImage: true, coverImageAlt: true, tags: true, publishedAt: true, contentHtml: true },
  });

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink }}>
      <SiteHeader />
      <main style={S.wrap}>
        <header style={S.head}>
          <h1 style={S.h1}>Blog</h1>
          <p style={S.sub}>{DESCRIPTION}</p>
        </header>

        {posts.length === 0 ? (
          <div style={S.empty}>Nothing published yet — check back soon.</div>
        ) : (
          <div style={S.grid}>
            {posts.map((p) => <PostCard key={p.slug} post={p} />)}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "34px 24px 80px" },
  head: { marginBottom: 30 },
  h1: { margin: 0, fontSize: "clamp(28px, 4.5vw, 38px)", fontWeight: 800, letterSpacing: "-0.9px" },
  sub: { margin: "10px 0 0", fontSize: 15, color: C.mut, lineHeight: 1.6, maxWidth: 560 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 22 },
  empty: { border: "1px dashed #E2E8F0", borderRadius: 18, padding: "56px 28px", textAlign: "center", color: C.mut, background: "#F8FAFC" },
};
