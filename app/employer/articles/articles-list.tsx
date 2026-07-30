"use client";

/**
 * The company's article list — the same table /hq/posts shows an admin, for a
 * different table and a different author.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerTabs";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ArticlesList() {
  const [articles, setArticles] = useState<Row[] | null>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"auth" | "company" | null>(null);

  useEffect(() => {
    fetch("/api/company/articles", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) { setGate("auth"); setArticles([]); return null; }
        if (r.status === 409) { setGate("company"); setArticles([]); return null; }
        if (!r.ok) throw new Error("Couldn't load your articles.");
        return r.json();
      })
      .then((d) => { if (d) { setArticles(d.articles); setCompanySlug(d.companySlug); } })
      .catch((e) => setError(e.message));
  }, []);

  if (gate) return <EmployerGate title="Articles" reason={gate} what="your articles" />;

  return (
    <EmployerSection
      title="Articles"
      subtitle="Write about your work, your field, or how you hire. Published articles appear on your company page."
      actions={<a href="/employer/articles/new" style={ES.btn}>New article</a>}
    >
      {error && <div style={ES.error}>{error}</div>}
      {!articles && !error && <p style={ES.empty}>Loading…</p>}

      {articles && articles.length === 0 && (
        <div style={ES.card}>
          <p style={ES.empty}>
            Nothing written yet. An article that answers something your clients actually ask will do more for you than
            another page of services.
          </p>
        </div>
      )}

      {articles && articles.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Title</th><th style={S.th}>Status</th><th style={S.th}>Tags</th>
                <th style={S.th}>Published</th><th style={S.th}>Updated</th><th style={S.th} />
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td style={S.td}>
                    <a href={`/employer/articles/${a.id}`} style={S.link}>{a.title || <em style={{ color: "#94A3B8" }}>Untitled</em>}</a>
                  </td>
                  <td style={S.td}><span style={a.status === "PUBLISHED" ? ES.pillLive : ES.pillDraft}>{a.status === "PUBLISHED" ? "Published" : "Draft"}</span></td>
                  <td style={S.td}>{a.tags.join(", ") || <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                  <td style={S.td}>{a.publishedAt ? fmtDate(a.publishedAt) : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
                  <td style={S.td}>{fmtDate(a.updatedAt)}</td>
                  <td style={S.td}>
                    {a.status === "PUBLISHED" && companySlug && (
                      <a href={`/company/${companySlug}/articles/${a.slug}`} target="_blank" rel="noreferrer" style={S.link}>View ↗</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EmployerSection>
  );
}

const S: Record<string, CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #E2E8F0", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748B", whiteSpace: "nowrap" },
  td: { padding: "11px 12px", borderBottom: "1px solid #F1F5F9", verticalAlign: "top" },
  link: { color: "#0F172A", fontWeight: 600, textDecoration: "none" },
};
