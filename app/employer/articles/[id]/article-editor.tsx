"use client";

/**
 * The company article editor — the same one /hq writes with.
 *
 * Same Tiptap body, same live SEO checklist (lib/blog/seo-analysis.ts is pure
 * text analysis with no notion of who is writing), same draft/publish split.
 * What differs is entirely server-side: a different table, a different
 * sanitizer, and a spam score on save. See lib/company/article.ts.
 *
 * The one visible difference is the note about links, which an employer needs
 * and an admin doesn't: external links in a company article are nofollowed.
 * Finding that out from a rendering quirk later would feel like something was
 * done behind their back.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/blog/slugify";
import { analyzeSeo } from "@/lib/blog/seo-analysis";
import TiptapEditor from "@/app/_components/editor/TiptapEditor";
import SeoPanel from "@/app/_components/editor/SeoPanel";
import { EmployerSection, ES } from "../../_components/EmployerSection";

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentHtml: string;
  coverPath: string | null;
  coverAlt: string | null;
  focusKeyword: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  tags: string[];
  status: "DRAFT" | "PUBLISHED";
};

const EMPTY: Article = {
  id: "", slug: "", title: "", excerpt: null, contentHtml: "", coverPath: null, coverAlt: null,
  focusKeyword: null, metaTitle: null, metaDescription: null, tags: [], status: "DRAFT",
};

const imgUrl = (path: string | null) => {
  if (!path) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/company/${path}`;
};

export default function ArticleEditor({ articleId }: { articleId: string }) {
  const router = useRouter();
  const isNew = articleId === "new";

  const [article, setArticle] = useState<Article>(EMPTY);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isNew) {
      // Still needed for the "/company/{slug}/articles/" address preview.
      fetch("/api/company/articles", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setCompanySlug(d.companySlug))
        .catch(() => {});
      return;
    }
    fetch(`/api/company/articles/${articleId}`)
      .then((r) => { if (!r.ok) throw new Error("Couldn't load that article."); return r.json(); })
      .then((d: { article: Article; companySlug: string }) => {
        setArticle(d.article);
        setCompanySlug(d.companySlug);
        setTagsText(d.article.tags.join(", "));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isNew, articleId]);

  function setTitle(title: string) {
    setArticle((a) => ({ ...a, title, slug: slugTouched ? a.slug : slugify(title) }));
  }

  async function uploadImage(file: File): Promise<{ url: string; path: string } | null> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/company/image?kind=article", { method: "POST", body: form });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Upload failed.");
      return null;
    }
    return res.json();
  }

  async function setCover(file: File) {
    const result = await uploadImage(file);
    if (result) setArticle((a) => ({ ...a, coverPath: result.path }));
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    setSaving(true);
    setError(null);
    const body = { ...article, status, tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean) };
    try {
      const res = await fetch(isNew ? "/api/company/articles" : `/api/company/articles/${article.id || articleId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Couldn't save that."); return; }
      setSavedAt(Date.now());
      if (isNew) router.replace(`/employer/articles/${data.article.id}`);
      else setArticle((a) => ({ ...a, status }));
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  const checks = useMemo(
    () => analyzeSeo({
      title: article.title,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
      slug: article.slug,
      focusKeyword: article.focusKeyword,
      contentHtml: article.contentHtml,
    }),
    [article.title, article.metaTitle, article.metaDescription, article.slug, article.focusKeyword, article.contentHtml]
  );

  if (loading) return <EmployerSection title="Edit article"><p style={ES.empty}>Loading…</p></EmployerSection>;

  const cover = imgUrl(article.coverPath);

  return (
    <EmployerSection
      title={isNew ? "New article" : "Edit article"}
      actions={
        <>
          {savedAt && <span style={S.savedNote}>Saved</span>}
          <button type="button" disabled={saving} onClick={() => save("DRAFT")} style={ES.btnGhost}>
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button type="button" disabled={saving} onClick={() => save("PUBLISHED")} style={{ ...ES.btn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : article.status === "PUBLISHED" ? "Update" : "Publish"}
          </button>
        </>
      }
    >
      <p style={{ margin: "-8px 0 18px" }}>
        <a href="/employer/articles" style={S.back}>← All articles</a>
      </p>

      {error && <div style={ES.error}>{error}</div>}

      <div style={S.layout}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <input style={S.titleInput} placeholder="Article title" value={article.title} onChange={(e) => setTitle(e.target.value)} />

          <div style={S.field}>
            <label style={S.label}>Address <span style={S.hint}>— /company/{companySlug ?? "your-company"}/articles/</span></label>
            <input style={S.input} value={article.slug}
              onChange={(e) => { setSlugTouched(true); setArticle((a) => ({ ...a, slug: slugify(e.target.value) })); }} />
            {article.status === "PUBLISHED" && (
              <p style={S.warn}>This article is live. Changing its address breaks any link already pointing at the old one.</p>
            )}
          </div>

          <div style={S.field}>
            <label style={S.label}>Excerpt <span style={S.hint}>— the teaser, and the meta description fallback</span></label>
            <textarea style={{ ...S.input, minHeight: 70, resize: "vertical" }} value={article.excerpt ?? ""}
              onChange={(e) => setArticle((a) => ({ ...a, excerpt: e.target.value }))} />
          </div>

          <TiptapEditor
            value={article.contentHtml}
            onChange={(html) => setArticle((a) => ({ ...a, contentHtml: html }))}
            onUploadImage={uploadImage}
          />

          <div style={ES.notice}>
            Links to other sites in your article carry <code>rel=&quot;ugc nofollow&quot;</code>, the same as every other
            link a member or company adds to Topezia. Readers follow them normally; search engines don&apos;t treat them
            as our endorsement. Images have to be ones you upload here — a picture loaded from somewhere else would
            report every reader of your article to that server.
          </div>

          <section style={S.section}>
            <h2 style={S.h2}>SEO</h2>
            <div style={S.field}>
              <label style={S.label}>Focus keyword</label>
              <input style={S.input} placeholder="e.g. western brand design" value={article.focusKeyword ?? ""}
                onChange={(e) => setArticle((a) => ({ ...a, focusKeyword: e.target.value }))} />
            </div>
            <div style={S.field}>
              <label style={S.label}>SEO title <span style={S.hint}>— falls back to the article title</span></label>
              <input style={S.input} placeholder={article.title || "SEO title"} value={article.metaTitle ?? ""}
                onChange={(e) => setArticle((a) => ({ ...a, metaTitle: e.target.value }))} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Meta description <span style={S.hint}>— falls back to the excerpt</span></label>
              <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} placeholder={article.excerpt || "Meta description"}
                value={article.metaDescription ?? ""} onChange={(e) => setArticle((a) => ({ ...a, metaDescription: e.target.value }))} />
            </div>
            <div style={S.field}>
              <label style={S.label}>Tags <span style={S.hint}>— comma-separated</span></label>
              <input style={S.input} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </div>
          </section>

          <section style={S.section}>
            <h2 style={S.h2}>Cover image</h2>
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" style={S.coverPreview} />
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setCover(f); }} />
            <div style={{ ...S.field, marginTop: 10 }}>
              <label style={S.label}>Cover alt text</label>
              <input style={S.input} value={article.coverAlt ?? ""} onChange={(e) => setArticle((a) => ({ ...a, coverAlt: e.target.value }))} />
            </div>
          </section>
        </div>

        <div>
          <SeoPanel checks={checks} />
        </div>
      </div>
    </EmployerSection>
  );
}

const S: Record<string, CSSProperties> = {
  layout: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 24, alignItems: "start" },
  section: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 18 },
  h2: { fontSize: 14, fontWeight: 700, margin: "0 0 14px" },
  field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: 600, color: "#334155" },
  hint: { fontWeight: 400, color: "#94A3B8" },
  warn: { fontSize: 11.5, color: "#B45309", margin: 0, lineHeight: 1.5 },
  input: { width: "100%", padding: "10px 12px", fontSize: 13.5, borderRadius: 10, border: "1px solid #E2E8F0", fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  titleInput: { width: "100%", padding: "14px 16px", fontSize: 20, fontWeight: 700, borderRadius: 12, border: "1px solid #E2E8F0", fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  back: { fontSize: 12.5, color: "#64748B", textDecoration: "none" },
  savedNote: { fontSize: 12, color: "#16A34A", fontWeight: 600, alignSelf: "center" },
  coverPreview: { width: "100%", maxWidth: 320, height: "auto", borderRadius: 10, marginBottom: 10, display: "block" },
};
