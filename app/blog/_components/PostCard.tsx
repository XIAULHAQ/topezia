import Link from "next/link";
import type { CSSProperties } from "react";
import { blogImageUrl } from "@/lib/blog/storage";
import { readingTime } from "@/lib/blog/reading-time";

const C = { c1: "#8B5CF6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };

export type PostCardData = {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  coverImageAlt: string | null;
  tags: string[];
  publishedAt: Date | null;
  contentHtml: string;
};

export default function PostCard({ post }: { post: PostCardData }) {
  const cover = blogImageUrl(post.coverImage);
  const mins = readingTime(post.contentHtml);
  return (
    <article style={S.card}>
      <Link href={`/blog/${post.slug}`} style={S.coverLink}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={post.coverImageAlt ?? ""} style={S.cover} loading="lazy" decoding="async" />
        ) : (
          <div style={S.coverFallback} />
        )}
      </Link>
      <div style={S.body}>
        {post.tags[0] && (
          <Link href={`/blog/tag/${encodeURIComponent(post.tags[0])}`} style={S.eyebrow}>{post.tags[0]}</Link>
        )}
        <h2 style={S.title}>
          <Link href={`/blog/${post.slug}`} style={S.titleLink}>{post.title}</Link>
        </h2>
        {post.excerpt && <p style={S.excerpt}>{post.excerpt}</p>}
        <div style={S.meta}>
          {post.publishedAt && (
            <span>{post.publishedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
          )}
          <span>·</span>
          <span>{mins} min read</span>
        </div>
      </div>
    </article>
  );
}

const S: Record<string, CSSProperties> = {
  card: { border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" },
  coverLink: { display: "block" },
  cover: { width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" },
  coverFallback: { width: "100%", aspectRatio: "16/9", background: "linear-gradient(135deg,#EEF2FF,#EFF6FF)" },
  body: { padding: 18, display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: ".5px", color: C.c1, textTransform: "uppercase", textDecoration: "none" },
  title: { margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.35 },
  titleLink: { color: C.ink, textDecoration: "none" },
  excerpt: { margin: 0, fontSize: 13.5, color: C.slate, lineHeight: 1.6, flex: 1 },
  meta: { display: "flex", gap: 6, fontSize: 12, color: C.mut, marginTop: 4 },
};
