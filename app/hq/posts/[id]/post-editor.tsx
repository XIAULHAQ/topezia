"use client";

/**
 * The /hq/posts/{id} editor — plain controlled state, no form library, same
 * convention as hq-login.tsx. `postId === "new"` is a sentinel for "not
 * created yet"; the first Save does a POST, every save after does a PATCH.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/blog/slugify";
import { blogImageUrl } from "@/lib/blog/storage";
import { analyzeSeo } from "@/lib/blog/seo-analysis";
import TiptapEditor from "./tiptap-editor";
import SeoPanel from "./seo-panel";

type PostRecord = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  contentHtml: string;
  coverImage: string | null;
  coverImageAlt: string | null;
  focusKeyword: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED";
};

const EMPTY: PostRecord = {
  id: "", title: "", slug: "", excerpt: null, contentHtml: "", coverImage: null, coverImageAlt: null,
  focusKeyword: null, metaTitle: null, metaDescription: null, tags: [], status: "DRAFT",
};

export default function PostEditor({ postId }: { postId: string }) {
  const router = useRouter();
  const isNew = postId === "new";

  const [post, setPost] = useState<PostRecord>(EMPTY);
  const [tagsText, setTagsText] = useState("");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/hq/posts/${postId}`)
      .then((r) => { if (!r.ok) throw new Error("Couldn't load that post."); return r.json(); })
      .then(({ post }: { post: PostRecord }) => { setPost(post); setTagsText(post.tags.join(", ")); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isNew, postId]);

  function setTitle(title: string) {
    setPost((p) => ({ ...p, title, slug: slugTouched ? p.slug : slugify(title) }));
  }

  async function uploadImage(file: File): Promise<{ url: string; path: string } | null> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/hq/blog/upload", { method: "POST", body: form });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Upload failed.");
      return null;
    }
    return res.json();
  }

  async function setCoverImage(file: File) {
    const result = await uploadImage(file);
    if (result) setPost((p) => ({ ...p, coverImage: result.path }));
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    setSaving(true);
    setError(null);
    const body = {
      ...post,
      status,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
    };
    try {
      const res = await fetch(isNew ? "/api/hq/posts" : `/api/hq/posts/${post.id || postId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that.");
        return;
      }
      setSavedAt(Date.now());
      if (isNew) router.replace(`/hq/posts/${data.post.id}`);
      else setPost((p) => ({ ...p, status }));
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  const checks = useMemo(
    () => analyzeSeo({
      title: post.title,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      slug: post.slug,
      focusKeyword: post.focusKeyword,
      contentHtml: post.contentHtml,
    }),
    [post.title, post.metaTitle, post.metaDescription, post.slug, post.focusKeyword, post.contentHtml]
  );

  if (loading) return <main style={S.page}><p style={{ color: "#64748B" }}>Loading…</p></main>;

  return (
    <main style={S.page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <a href="/hq/posts" style={S.back}>← All posts</a>
          <h1 style={S.h1}>{isNew ? "New post" : "Edit post"}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {savedAt && <span style={S.savedNote}>Saved</span>}
          <span style={S.statusPill(post.status)}>{post.status === "PUBLISHED" ? "Published" : "Draft"}</span>
          <button type="button" disabled={saving} onClick={() => save("DRAFT")} style={S.btnSecondary}>
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button type="button" disabled={saving} onClick={() => save("PUBLISHED")} style={S.btnPrimary}>
            {saving ? "Saving…" : post.status === "PUBLISHED" ? "Update & keep published" : "Publish"}
          </button>
        </div>
      </div>

      {error && <p style={S.error}>{error}</p>}

      <div style={S.layout}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <input
            style={S.titleInput}
            placeholder="Post title"
            value={post.title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div style={S.field}>
            <label style={S.label}>Slug — /blog/</label>
            <input
              style={S.input}
              value={post.slug}
              onChange={(e) => { setSlugTouched(true); setPost((p) => ({ ...p, slug: slugify(e.target.value) })); }}
            />
          </div>

          <div style={S.field}>
            <label style={S.label}>Excerpt <span style={S.hint}>— list teaser, and the meta description fallback</span></label>
            <textarea
              style={{ ...S.input, minHeight: 70, resize: "vertical" }}
              value={post.excerpt ?? ""}
              onChange={(e) => setPost((p) => ({ ...p, excerpt: e.target.value }))}
            />
          </div>

          <TiptapEditor
            value={post.contentHtml}
            onChange={(html) => setPost((p) => ({ ...p, contentHtml: html }))}
            onUploadImage={uploadImage}
          />

          <section style={S.section}>
            <h2 style={S.h2}>SEO</h2>
            <div style={S.field}>
              <label style={S.label}>Focus keyword</label>
              <input
                style={S.input}
                placeholder="e.g. remote job negotiation"
                value={post.focusKeyword ?? ""}
                onChange={(e) => setPost((p) => ({ ...p, focusKeyword: e.target.value }))}
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>SEO title <span style={S.hint}>— falls back to the post title</span></label>
              <input
                style={S.input}
                placeholder={post.title || "SEO title"}
                value={post.metaTitle ?? ""}
                onChange={(e) => setPost((p) => ({ ...p, metaTitle: e.target.value }))}
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Meta description <span style={S.hint}>— falls back to the excerpt</span></label>
              <textarea
                style={{ ...S.input, minHeight: 60, resize: "vertical" }}
                placeholder={post.excerpt || "Meta description"}
                value={post.metaDescription ?? ""}
                onChange={(e) => setPost((p) => ({ ...p, metaDescription: e.target.value }))}
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Tags <span style={S.hint}>— comma-separated</span></label>
              <input style={S.input} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </div>
          </section>

          <section style={S.section}>
            <h2 style={S.h2}>Cover image</h2>
            {post.coverImage && blogImageUrl(post.coverImage) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={blogImageUrl(post.coverImage)!} alt="" style={S.coverPreview} />
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCoverImage(f); }} />
            <div style={{ ...S.field, marginTop: 10 }}>
              <label style={S.label}>Cover alt text</label>
              <input
                style={S.input}
                value={post.coverImageAlt ?? ""}
                onChange={(e) => setPost((p) => ({ ...p, coverImageAlt: e.target.value }))}
              />
            </div>
          </section>
        </div>

        <div>
          <SeoPanel checks={checks} />
        </div>
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> & { statusPill: (s: "DRAFT" | "PUBLISHED") => CSSProperties } = Object.assign(
  {
    page: { minHeight: "100vh", background: "#F8FAFC", fontFamily: "var(--font-sora), system-ui, sans-serif", color: "#0F172A", padding: "32px 24px 80px", maxWidth: 1180, margin: "0 auto" },
    back: { fontSize: 12.5, color: "#64748B", textDecoration: "none" },
    h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", margin: "6px 0 0" },
    layout: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24, alignItems: "start" },
    section: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 18 },
    h2: { fontSize: 14, fontWeight: 700, margin: "0 0 14px" },
    field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
    label: { fontSize: 12, fontWeight: 600, color: "#334155" },
    hint: { fontWeight: 400, color: "#94A3B8" },
    input: { width: "100%", padding: "10px 12px", fontSize: 13.5, borderRadius: 10, border: "1px solid #E2E8F0", fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    titleInput: { width: "100%", padding: "14px 16px", fontSize: 20, fontWeight: 700, borderRadius: 12, border: "1px solid #E2E8F0", fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    btnPrimary: { background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    btnSecondary: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
    error: { background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
    savedNote: { fontSize: 12, color: "#16A34A", fontWeight: 600 },
    coverPreview: { width: "100%", maxWidth: 320, height: "auto", borderRadius: 10, marginBottom: 10, display: "block" },
  } as Record<string, CSSProperties>,
  {
    statusPill: (s: "DRAFT" | "PUBLISHED"): CSSProperties => ({
      fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
      padding: "5px 10px", borderRadius: 999,
      background: s === "PUBLISHED" ? "#F0FDF4" : "#F1F5F9",
      color: s === "PUBLISHED" ? "#16A34A" : "#64748B",
      border: `1px solid ${s === "PUBLISHED" ? "#BBF7D0" : "#E2E8F0"}`,
    }),
  }
);
