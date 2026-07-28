"use client";

/**
 * Sticky "on this page" nav, sidebar-only (hidden on mobile — see the
 * .blog-toc rule in page.tsx's CSS). Highlights whichever heading is
 * currently in view via IntersectionObserver rather than scroll-position
 * math, so it stays correct regardless of content length or image sizes
 * shifting layout.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { TocItem } from "@/lib/blog/toc";

const C = { c1: "#8B5CF6", mut: "#64748B" };

export default function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      // Treat a heading as "current" once it's crossed just below the sticky
      // header, and stop counting it once it's past the top ~30% of the
      // viewport — keeps exactly one section active at a time while reading.
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    const els = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => !!el);
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav className="blog-toc" aria-label="Table of contents" style={S.box}>
      <div style={S.head}>On this page</div>
      <ul style={S.list}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              style={{
                ...S.link,
                ...(item.level === 3 ? S.linkNested : {}),
                ...(activeId === item.id ? S.linkActive : {}),
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const S: Record<string, CSSProperties> = {
  box: { position: "sticky", top: 90 },
  head: { fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 },
  link: { display: "block", padding: "6px 10px", fontSize: 13, color: C.mut, textDecoration: "none", lineHeight: 1.4, borderRadius: 8 },
  linkNested: { marginLeft: 14, fontSize: 12.5 },
  linkActive: { color: C.c1, fontWeight: 600, background: "#F5F3FF" },
};
