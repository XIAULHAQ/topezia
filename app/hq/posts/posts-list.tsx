"use client";

import { useEffect, useState, type CSSProperties } from "react";

type PostRow = {
  id: string;
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function PostsList() {
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hq/posts")
      .then((r) => { if (!r.ok) throw new Error("Couldn't load posts."); return r.json(); })
      .then(({ posts }: { posts: PostRow[] }) => setPosts(posts))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main style={S.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <a href="/hq" style={S.back}>← HQ</a>
          <h1 style={S.h1}>Blog posts</h1>
        </div>
        <a href="/hq/posts/new" style={S.newBtn}>New post</a>
      </div>

      {error && <p style={S.error}>{error}</p>}
      {!posts && !error && <p style={{ color: "#64748B", marginTop: 20 }}>Loading…</p>}

      {posts && (
        <div style={{ overflowX: "auto", marginTop: 24 }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Title</th><th style={S.th}>Status</th><th style={S.th}>Tags</th>
                <th style={S.th}>Published</th><th style={S.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td style={S.td}><a href={`/hq/posts/${p.id}`} style={S.link}>{p.title || <em style={{ color: "#94A3B8" }}>Untitled</em>}</a></td>
                  <td style={S.td}>
                    <span style={p.status === "PUBLISHED" ? S.pillPublished : S.pillDraft}>
                      {p.status === "PUBLISHED" ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td style={S.td}>{p.tags.join(", ") || <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                  <td style={S.td}>{p.publishedAt ? fmtDate(p.publishedAt) : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                  <td style={S.td}>{fmtDate(p.updatedAt)}</td>
                </tr>
              ))}
              {posts.length === 0 && <tr><td style={S.td} colSpan={5}>No posts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#F8FAFC", fontFamily: "var(--font-sora), system-ui, sans-serif", color: "#0F172A", padding: "40px 24px 80px", maxWidth: 1100, margin: "0 auto" },
  back: { fontSize: 12.5, color: "#64748B", textDecoration: "none" },
  h1: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.7px", margin: "6px 0 0" },
  newBtn: { background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, textDecoration: "none" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #E2E8F0", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748B", whiteSpace: "nowrap" },
  td: { padding: "11px 12px", borderBottom: "1px solid #F1F5F9", verticalAlign: "top" },
  link: { color: "#0F172A", fontWeight: 600, textDecoration: "none" },
  pillPublished: { fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: "#F0FDF4", color: "#16A34A", border: "1px solid #BBF7D0" },
  pillDraft: { fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 16 },
};
