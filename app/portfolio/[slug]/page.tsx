/**
 * /portfolio/{slug} — a single piece of work. PUBLIC and indexed.
 *
 * Behance-shaped: a wide gallery column with a sticky rail beside it, the
 * creator's identity up top linking back to their profile, and the tags below
 * as real links into the filtered grid.
 *
 * Two deliberate departures from the reference:
 *  - No appreciation count. See portfolio-rail.tsx.
 *  - No "Hire me" dropdown. Messaging doesn't exist yet, and a button that
 *    does nothing is worse than no button — so the contact action is a real
 *    link to the creator's public profile, and only when they have one.
 *
 * Drafts are visible ONLY to their owner, and 404 for everyone else so the
 * existence of unpublished work isn't confirmed.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import { portfolioImageUrl } from "@/lib/portfolio/storage";
import { categoryLabel, categorySlug } from "@/lib/portfolio/categories";
import { youTubeEmbedUrl } from "@/lib/portfolio/video";
import PortfolioRail from "./portfolio-rail";

export const dynamic = "force-dynamic";

const C = { c1: "#8B5CF6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const FONT = "var(--font-sora), system-ui, sans-serif";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

async function load(slug: string) {
  return prisma.portfolio.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, description: true, category: true, status: true,
      coverPath: true, coverWidth: true, coverHeight: true,
      skills: true, technologies: true, publishedAt: true, profileId: true,
      media: { orderBy: { position: "asc" }, select: { kind: true, path: true, videoId: true, width: true, height: true, caption: true } },
      profile: { select: { fullName: true, photoUrl: true, publicSlug: true } },
      _count: { select: { saves: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p || p.status !== "PUBLISHED") return { title: "Portfolio — Topezia", robots: { index: false } };
  const who = p.profile.fullName ? ` by ${p.profile.fullName}` : "";
  const description =
    (p.description ?? "").replace(/\s+/g, " ").trim().slice(0, 155) ||
    `${categoryLabel(p.category)}${who} on Topezia.`;
  const cover = portfolioImageUrl(p.coverPath);
  return {
    title: `${p.title}${who} | Topezia`,
    description,
    alternates: { canonical: `/portfolio/${p.slug}` },
    openGraph: {
      title: `${p.title}${who}`,
      description,
      url: `/portfolio/${p.slug}`,
      type: "article",
      ...(cover ? { images: [cover] } : {}),
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PortfolioDetailPage({ params }: { params: { slug: string } }) {
  const p = await load(params.slug);
  if (!p) notFound();

  const { userId } = await currentIdentity();
  let me: { id: string } | null = null;
  if (userId) me = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  const isOwner = me?.id === p.profileId;

  if (p.status !== "PUBLISHED" && !isOwner) notFound();

  const saved = me
    ? Boolean(await prisma.portfolioSave.findUnique({
        where: { profileId_portfolioId: { profileId: me.id, portfolioId: p.id } },
        select: { id: true },
      }))
    : false;

  const cover = portfolioImageUrl(p.coverPath);
  const creator = p.profile.fullName ?? "A Topezia member";
  const shareUrl = `${SITE}/portfolio/${p.slug}`;

  // Structured data: this is a creative work with a named author, which is
  // exactly what CreativeWork describes. Only for published pieces.
  const jsonLd =
    p.status === "PUBLISHED"
      ? {
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: p.title,
          ...(p.description ? { description: p.description.slice(0, 500) } : {}),
          ...(cover ? { image: cover } : {}),
          ...(p.publishedAt ? { datePublished: p.publishedAt.toISOString() } : {}),
          author: {
            "@type": "Person",
            name: creator,
            ...(p.profile.publicSlug ? { url: `${SITE}/p/${p.profile.publicSlug}` } : {}),
          },
          url: shareUrl,
          ...(p.skills.length || p.technologies.length ? { keywords: [...p.skills, ...p.technologies].join(", ") } : {}),
        }
      : null;

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink, overflowX: "clip" }}>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SiteHeader />

      <main style={S.wrap}>
        {isOwner && p.status !== "PUBLISHED" && (
          <div style={S.draftBanner}>
            This is a draft — only you can see it.{" "}
            <Link href={`/portfolio/${p.slug}/edit`} style={S.draftLink}>Finish and publish</Link>
          </div>
        )}

        {/* ── Top bar: what it is, who made it, how to reach them ── */}
        <header style={S.topBar}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <Link href={`/portfolio?category=${categorySlug(p.category)}`} style={S.eyebrow}>{categoryLabel(p.category)}</Link>
            <h1 style={S.h1}>{p.title}</h1>
            <div style={S.byline}>
              {p.profile.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.profile.photoUrl} alt="" style={S.avatar} />
              ) : (
                <span style={{ ...S.avatar, display: "grid", placeItems: "center", background: "#EEF2FF", color: C.c1, fontWeight: 700, fontSize: 14 }}>
                  {creator.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span style={{ minWidth: 0 }}>
                {p.profile.publicSlug ? (
                  <Link href={`/p/${p.profile.publicSlug}`} style={S.creatorLink}>{creator}</Link>
                ) : (
                  <span style={{ fontWeight: 600 }}>{creator}</span>
                )}
              </span>
            </div>
          </div>

          <div style={S.topActions}>
            {/* Real link or nothing — messaging doesn't exist yet, so a
                "Contact" button that goes nowhere would be a lie. */}
            {p.profile.publicSlug && !isOwner && (
              <Link href={`/p/${p.profile.publicSlug}`} style={S.contactBtn}>Contact about this work</Link>
            )}
            {isOwner && (
              <Link href={`/portfolio/${p.slug}/edit`} style={S.contactBtn}>Edit this work</Link>
            )}
          </div>
        </header>

        {/* ── Gallery + sticky rail ── */}
        <div className="pd-layout" style={S.layout}>
          <div style={{ minWidth: 0 }}>
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                width={p.coverWidth ?? undefined}
                height={p.coverHeight ?? undefined}
                style={S.media}
                // The cover is the LCP element here — never lazy.
                decoding="async"
              />
            )}

            {p.media.map((m, i) => {
              if (m.kind === "VIDEO") {
                const embed = m.videoId ? youTubeEmbedUrl(m.videoId) : null;
                if (!embed) return null;
                return (
                  <figure key={i} style={S.figure}>
                    <div style={S.videoFrame}>
                      <iframe
                        src={embed}
                        title={m.caption ?? `${p.title} — video ${i + 1}`}
                        style={S.iframe}
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                    {m.caption && <figcaption style={S.caption}>{m.caption}</figcaption>}
                  </figure>
                );
              }
              const url = portfolioImageUrl(m.path);
              if (!url) return null;
              return (
                <figure key={i} style={S.figure}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={m.caption ?? ""} width={m.width ?? undefined} height={m.height ?? undefined} loading="lazy" decoding="async" style={S.media} />
                  {m.caption && <figcaption style={S.caption}>{m.caption}</figcaption>}
                </figure>
              );
            })}

            {p.description && (
              <section style={S.about}>
                <h2 style={S.aboutHead}>About this work</h2>
                <p style={S.description}>{p.description}</p>
              </section>
            )}

            {(p.skills.length > 0 || p.technologies.length > 0) && (
              <section style={S.tagBlock}>
                {p.skills.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={S.tagHead}>Skills used</div>
                    <div style={S.chipRow}>
                      {p.skills.map((s) => (
                        <Link key={s} href={`/portfolio?tag=${encodeURIComponent(s)}`} className="pd-chip" style={S.chip}>{s}</Link>
                      ))}
                    </div>
                  </div>
                )}
                {p.technologies.length > 0 && (
                  <div>
                    <div style={S.tagHead}>Technology used</div>
                    <div style={S.chipRow}>
                      {p.technologies.map((t) => (
                        <Link key={t} href={`/portfolio?tag=${encodeURIComponent(t)}`} className="pd-chip" style={S.chipAlt}>{t}</Link>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="pd-rail" style={S.railCol}>
            <PortfolioRail
              portfolioId={p.id}
              initialSaved={saved}
              canSave={Boolean(me)}
              shareUrl={shareUrl}
              title={p.title}
            />
            {p._count.saves > 0 && (
              <div style={S.savesNote}>{p._count.saves} {p._count.saves === 1 ? "person has" : "people have"} saved this</div>
            )}
          </aside>
        </div>

        <div style={S.backRow}>
          <Link href="/portfolio" style={S.backLink}>← All work</Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

const CSS = `
.pd-chip:hover{border-color:#A5B4FC!important;color:#8B5CF6!important}
@media (max-width:900px){
  .pd-layout{grid-template-columns:1fr!important}
  /* The rail's inner element carries position:sticky; unset it too or it
     sticks inside a now-static column and floats over the gallery. */
  .pd-rail, .pd-rail > div{position:static!important}
}
`;

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "30px 24px 70px" },
  draftBanner: { background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 12, padding: "12px 16px", fontSize: 13.5, marginBottom: 24 },
  draftLink: { color: "#9A3412", fontWeight: 700 },
  topBar: { display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap", paddingBottom: 22, borderBottom: `1px solid ${C.line}`, marginBottom: 26 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: C.c1, textTransform: "uppercase", textDecoration: "none", display: "inline-block", marginBottom: 8 },
  h1: { margin: 0, fontSize: "clamp(24px, 4.5vw, 34px)", fontWeight: 800, letterSpacing: "-0.9px", lineHeight: 1.18 },
  byline: { display: "flex", alignItems: "center", gap: 10, marginTop: 14, fontSize: 14, flexWrap: "wrap" },
  avatar: { width: 36, height: 36, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", flex: "none" },
  creatorLink: { color: C.ink, fontWeight: 600, textDecoration: "none" },
  topActions: { display: "flex", gap: 10, flex: "none", flexWrap: "wrap" },
  contactBtn: { border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 20px", fontSize: 13.5, fontWeight: 600, color: C.slate, textDecoration: "none", whiteSpace: "nowrap" },
  layout: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 208px", gap: 34, alignItems: "start" },
  railCol: { position: "relative" },
  savesNote: { fontSize: 12, color: C.mut, marginTop: 14, lineHeight: 1.5 },
  figure: { margin: "0 0 20px" },
  media: { width: "100%", height: "auto", borderRadius: 14, display: "block", marginBottom: 20 },
  caption: { fontSize: 12.5, color: C.mut, marginTop: -12, marginBottom: 20, lineHeight: 1.5 },
  videoFrame: { position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 14, overflow: "hidden", background: "#000" },
  iframe: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 },
  about: { marginTop: 14 },
  aboutHead: { fontSize: 12, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".6px", margin: "0 0 10px" },
  description: { fontSize: 15, lineHeight: 1.8, color: C.slate, whiteSpace: "pre-wrap", margin: 0, maxWidth: 680 },
  tagBlock: { marginTop: 34, paddingTop: 26, borderTop: `1px solid ${C.line}` },
  tagHead: { fontSize: 12, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { background: "#EEF2FF", color: C.c1, border: "1px solid #C7D2FE", borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 600, textDecoration: "none" },
  chipAlt: { background: "#F1F5F9", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 600, textDecoration: "none" },
  backRow: { marginTop: 44, paddingTop: 22, borderTop: `1px solid ${C.line}` },
  backLink: { color: C.mut, fontSize: 13.5, fontWeight: 600, textDecoration: "none" },
};
