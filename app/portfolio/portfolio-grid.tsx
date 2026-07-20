"use client";

/**
 * The masonry grid.
 *
 * CSS multi-column rather than a JS layout: it needs no measuring pass, no
 * resize listener, and no layout thrash on the first paint. The cost is that
 * order runs top-to-bottom within a column rather than left-to-right, which for
 * a discovery grid of unrelated work nobody reads as an ordering.
 *
 * Every tile reserves its exact box from the stored cover dimensions before the
 * image loads. Without that, a Pinterest layout reflows on every arriving image
 * and the whole column jumps under the cursor.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { C, FONT } from "@/app/_components/ui";
import { categoryLabel } from "@/lib/portfolio/categories";
import type { GridCard } from "@/lib/portfolio/list";

/** Fallback ratio for covers uploaded in a format we don't measure (AVIF). */
const DEFAULT_RATIO = 4 / 3;

export default function PortfolioGrid({ cards }: { cards: GridCard[] }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="pg-grid">
        {cards.map((c) => {
          const ratio = c.coverWidth && c.coverHeight ? c.coverWidth / c.coverHeight : DEFAULT_RATIO;
          return (
            <article key={c.slug} className="pg-card">
              <Link href={`/portfolio/${c.slug}`} className="pg-media" style={{ aspectRatio: String(ratio) }}>
                {c.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.coverUrl}
                    alt=""
                    width={c.coverWidth ?? undefined}
                    height={c.coverHeight ?? undefined}
                    loading="lazy"
                    decoding="async"
                    className="pg-img"
                  />
                ) : (
                  <span className="pg-placeholder">{categoryLabel(c.category)}</span>
                )}
              </Link>

              <div style={S.meta}>
                <Link href={`/portfolio/${c.slug}`} style={S.title}>{c.title}</Link>
                <div style={S.byline}>
                  {c.creatorSlug ? (
                    <Link href={`/p/${c.creatorSlug}`} style={S.creator}>{c.creator}</Link>
                  ) : (
                    <span style={S.creator}>{c.creator}</span>
                  )}
                  {c.saves > 0 && <span style={S.saves}>· {c.saves} saved</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

const CSS = `
.pg-grid{column-count:4;column-gap:20px}
@media (max-width:1180px){.pg-grid{column-count:3}}
@media (max-width:820px){.pg-grid{column-count:2}}
@media (max-width:520px){.pg-grid{column-count:1}}
.pg-card{break-inside:avoid;margin:0 0 26px;display:block}
.pg-media{display:block;width:100%;border-radius:14px;overflow:hidden;background:#F1F5F9;position:relative}
.pg-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s ease}
.pg-card:hover .pg-img{transform:scale(1.03)}
.pg-placeholder{position:absolute;inset:0;display:grid;place-items:center;color:#94A3B8;font-size:12px;font-weight:600}
@media (prefers-reduced-motion:reduce){.pg-img{transition:none}.pg-card:hover .pg-img{transform:none}}
`;

const S: Record<string, CSSProperties> = {
  meta: { padding: "10px 2px 0", fontFamily: FONT },
  title: { display: "block", fontSize: 14.5, fontWeight: 700, color: C.ink, textDecoration: "none", lineHeight: 1.35 },
  byline: { display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 12.5, color: C.mut, flexWrap: "wrap" },
  creator: { color: C.mut, textDecoration: "none", fontWeight: 500 },
  saves: { color: C.mut },
};
