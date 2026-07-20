/**
 * /portfolio — the public discovery grid. Indexed.
 *
 * Category chips scroll horizontally, as in the reference. Only categories that
 * actually contain published work are shown: a row of fifteen chips that mostly
 * lead to empty pages teaches people the filters don't work.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import { PORTFOLIO_CATEGORIES, categoryLabel, categorySlug, categoryFromSlug } from "@/lib/portfolio/categories";
import { listPortfolios, activeCategories } from "@/lib/portfolio/list";
import PortfolioGrid from "./portfolio-grid";

export const dynamic = "force-dynamic";

const C = { c1: "#8B5CF6", c2: "#3B82F6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

export async function generateMetadata({ searchParams }: { searchParams: { category?: string; tag?: string } }): Promise<Metadata> {
  const cat = searchParams.category ? categoryFromSlug(searchParams.category) : null;
  const label = cat ? categoryLabel(cat) : null;
  const title = label ? `${label} portfolios | Topezia` : "Portfolios — work by Topezia members";
  const description = label
    ? `${label} work published by professionals on Topezia.`
    : "Branding, design, illustration, apps and engineering work published by professionals on Topezia.";
  return {
    title,
    description,
    // Tag pages are filtered views of the same set — canonical to the clean
    // grid so they don't compete with it in the index.
    alternates: { canonical: cat ? `/portfolio?category=${categorySlug(cat)}` : "/portfolio" },
    openGraph: { title, description, url: "/portfolio", type: "website" },
  };
}

export default async function PortfolioIndexPage({ searchParams }: { searchParams: { category?: string; tag?: string; page?: string } }) {
  const cat = searchParams.category ? categoryFromSlug(searchParams.category) : null;
  const tag = searchParams.tag ?? null;
  const page = Number(searchParams.page) || 1;

  const [{ cards, total, pages }, counts] = await Promise.all([
    listPortfolios({ category: cat, tag, page }),
    activeCategories(),
  ]);

  const shown = PORTFOLIO_CATEGORIES.filter((c) => counts.has(c.value));

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink, overflowX: "clip" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SiteHeader />

      <main style={S.wrap}>
        <header style={S.head}>
          <h1 style={S.h1}>{cat ? `${categoryLabel(cat)} work` : "Work by Topezia members"}</h1>
          <p style={S.sub}>
            {tag
              ? <>Tagged <strong style={{ color: C.ink }}>{tag}</strong>. <Link href="/portfolio" style={S.clear}>Clear</Link></>
              : "Portfolios published by professionals on Topezia — branding, design, illustration, apps and engineering."}
          </p>
        </header>

        {shown.length > 0 && (
          <nav className="pg-chips" aria-label="Filter by category">
            <Link href="/portfolio" className="pg-chip" style={!cat && !tag ? S.chipOn : S.chipOff}>All</Link>
            {shown.map((c) => (
              <Link key={c.value} href={`/portfolio?category=${categorySlug(c.value)}`} className="pg-chip" style={cat === c.value ? S.chipOn : S.chipOff}>
                {c.label}
              </Link>
            ))}
          </nav>
        )}

        {cards.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyTitle}>{total === 0 && !cat && !tag ? "No published work yet" : "Nothing here yet"}</div>
            <p style={S.emptyBody}>
              {total === 0 && !cat && !tag
                ? "This is where members' work appears. Be the first — publish a piece and it gets its own public, shareable page."
                : "No published work matches this filter yet."}
            </p>
            <Link href="/portfolio/new" style={S.cta}>Add your work</Link>
          </div>
        ) : (
          <>
            <div style={S.count}>{total.toLocaleString()} {total === 1 ? "piece" : "pieces"}</div>
            <PortfolioGrid cards={cards} />
            {pages > 1 && (
              <nav style={S.pager} aria-label="Pagination">
                {page > 1 && <Link href={hrefFor(searchParams, page - 1)} style={S.pageBtn}>← Newer</Link>}
                <span style={S.pageNow}>Page {page} of {pages}</span>
                {page < pages && <Link href={hrefFor(searchParams, page + 1)} style={S.pageBtn}>Older →</Link>}
              </nav>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function hrefFor(sp: { category?: string; tag?: string }, page: number): string {
  const q = new URLSearchParams();
  if (sp.category) q.set("category", sp.category);
  if (sp.tag) q.set("tag", sp.tag);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/portfolio?${s}` : "/portfolio";
}

const CSS = `
.pg-chips{display:flex;gap:8px;overflow-x:auto;padding:0 0 6px;margin-bottom:26px;scrollbar-width:none}
.pg-chips::-webkit-scrollbar{display:none}
.pg-chip{flex:none;text-decoration:none;white-space:nowrap;transition:border-color .15s,color .15s}
.pg-chip:hover{border-color:#A5B4FC!important}
`;

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 1240, margin: "0 auto", padding: "34px 24px 80px" },
  head: { marginBottom: 22 },
  h1: { margin: 0, fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 800, letterSpacing: "-0.8px" },
  sub: { margin: "8px 0 0", fontSize: 14, color: C.mut, lineHeight: 1.6, maxWidth: 620 },
  clear: { color: C.c1, fontWeight: 600, textDecoration: "none" },
  chipOn: { background: GRAD, color: "#fff", border: "1px solid transparent", borderRadius: 999, padding: "8px 15px", fontSize: 13, fontWeight: 600 },
  chipOff: { background: "#fff", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 15px", fontSize: 13, fontWeight: 600 },
  count: { fontSize: 12.5, color: C.mut, marginBottom: 16 },
  empty: { border: `1px dashed ${C.line}`, borderRadius: 18, padding: "56px 28px", textAlign: "center", background: "#F8FAFC" },
  emptyTitle: { fontSize: 17, fontWeight: 700, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: C.mut, lineHeight: 1.65, maxWidth: 430, margin: "0 auto 22px" },
  cta: { display: "inline-block", background: GRAD, color: "#fff", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 600, textDecoration: "none" },
  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 40 },
  pageBtn: { border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, color: C.slate, textDecoration: "none" },
  pageNow: { fontSize: 13, color: C.mut },
};
