/**
 * /portfolio/{slug} — a single piece of work. PUBLIC.
 *
 * Pass 1: correct data, correct access rules, real URLs. The Behance-style
 * layout (full-bleed gallery, sticky rail, Save/Share) is the next pass — this
 * page exists now so the create flow can be verified end to end.
 *
 * Drafts are visible ONLY to their owner. The slug carries a random suffix, so
 * an unpublished draft can't be found by guessing at titles either.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import { portfolioImageUrl } from "@/lib/portfolio/storage";
import { categoryLabel } from "@/lib/portfolio/categories";
import { youTubeEmbedUrl } from "@/lib/portfolio/video";

export const dynamic = "force-dynamic";

const C = { c1: "#8B5CF6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const FONT = "var(--font-sora), system-ui, sans-serif";

async function load(slug: string) {
  return prisma.portfolio.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, description: true, category: true, status: true,
      coverPath: true, skills: true, technologies: true, publishedAt: true, profileId: true,
      media: { orderBy: { position: "asc" }, select: { kind: true, path: true, videoId: true, width: true, height: true, caption: true } },
      profile: { select: { fullName: true, photoUrl: true, publicSlug: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p || p.status !== "PUBLISHED") return { title: "Portfolio — Topezia", robots: { index: false } };
  const who = p.profile.fullName ? ` by ${p.profile.fullName}` : "";
  const description = (p.description ?? "").replace(/\s+/g, " ").trim().slice(0, 155) || `${categoryLabel(p.category)}${who} on Topezia.`;
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
  };
}

export default async function PortfolioDetailPage({ params }: { params: { slug: string } }) {
  const p = await load(params.slug);
  if (!p) notFound();

  // A draft is readable only by its owner. Everyone else gets a 404 rather than
  // a 403, so the existence of an unpublished piece isn't confirmed either.
  let isOwner = false;
  if (p.status !== "PUBLISHED") {
    const { userId } = await currentIdentity();
    if (userId) {
      const me = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
      isOwner = me?.id === p.profileId;
    }
    if (!isOwner) notFound();
  }

  const cover = portfolioImageUrl(p.coverPath);
  const creator = p.profile.fullName ?? "A Topezia member";

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink, overflowX: "clip" }}>
      <SiteHeader />

      <main style={S.wrap}>
        {isOwner && p.status !== "PUBLISHED" && (
          <div style={S.draftBanner}>
            This is a draft — only you can see it. <Link href={`/portfolio/${p.slug}/edit`} style={S.draftLink}>Finish and publish</Link>
          </div>
        )}

        <div style={S.eyebrow}>{categoryLabel(p.category)}</div>
        <h1 style={S.h1}>{p.title}</h1>

        <div style={S.byline}>
          {p.profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.profile.photoUrl} alt="" style={S.avatar} />
          ) : (
            <span style={{ ...S.avatar, display: "grid", placeItems: "center", background: "#EEF2FF", color: C.c1, fontWeight: 700, fontSize: 13 }}>
              {creator.slice(0, 1).toUpperCase()}
            </span>
          )}
          {p.profile.publicSlug ? (
            <Link href={`/p/${p.profile.publicSlug}`} style={S.creatorLink}>{creator}</Link>
          ) : (
            <span style={{ fontWeight: 600 }}>{creator}</span>
          )}
          {p.publishedAt && (
            <span style={{ color: C.mut, fontSize: 13 }}>
              · {new Date(p.publishedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          )}
        </div>

        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" style={S.cover} />
        )}

        {p.description && <p style={S.description}>{p.description}</p>}

        <div style={S.gallery}>
          {p.media.map((m, i) => {
            if (m.kind === "VIDEO") {
              // Built from the stored 11-char id, never from a pasted URL.
              const embed = m.videoId ? youTubeEmbedUrl(m.videoId) : null;
              if (!embed) return null;
              return (
                <div key={i} style={S.videoFrame}>
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
              );
            }
            const url = portfolioImageUrl(m.path);
            if (!url) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={m.caption ?? ""} width={m.width ?? undefined} height={m.height ?? undefined} loading="lazy" decoding="async" style={S.galleryImg} />
            );
          })}
        </div>

        {(p.skills.length > 0 || p.technologies.length > 0) && (
          <div style={S.tagBlock}>
            {p.skills.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={S.tagHead}>Skills used</div>
                <div style={S.chipRow}>{p.skills.map((s) => <span key={s} style={S.chip}>{s}</span>)}</div>
              </div>
            )}
            {p.technologies.length > 0 && (
              <div>
                <div style={S.tagHead}>Technology used</div>
                <div style={S.chipRow}>{p.technologies.map((t) => <span key={t} style={S.chipAlt}>{t}</span>)}</div>
              </div>
            )}
          </div>
        )}

        {isOwner && (
          <div style={{ marginTop: 34 }}>
            <Link href={`/portfolio/${p.slug}/edit`} style={S.editBtn}>Edit this work</Link>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 940, margin: "0 auto", padding: "40px 24px 80px" },
  draftBanner: { background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 12, padding: "12px 16px", fontSize: 13.5, marginBottom: 26 },
  draftLink: { color: "#9A3412", fontWeight: 700 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: C.c1, textTransform: "uppercase", marginBottom: 10 },
  h1: { margin: 0, fontSize: "clamp(26px, 5vw, 38px)", fontWeight: 800, letterSpacing: "-1px", lineHeight: 1.15 },
  byline: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 30px", fontSize: 14, flexWrap: "wrap" },
  avatar: { width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "none" },
  creatorLink: { color: C.ink, fontWeight: 600, textDecoration: "none" },
  cover: { width: "100%", borderRadius: 18, display: "block", marginBottom: 30 },
  description: { fontSize: 15, lineHeight: 1.8, color: C.slate, whiteSpace: "pre-wrap", margin: "0 0 34px", maxWidth: 680 },
  gallery: { display: "flex", flexDirection: "column", gap: 20 },
  galleryImg: { width: "100%", height: "auto", borderRadius: 14, display: "block" },
  videoFrame: { position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 14, overflow: "hidden", background: "#000" },
  iframe: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 },
  tagBlock: { marginTop: 40, paddingTop: 28, borderTop: `1px solid ${C.line}` },
  tagHead: { fontSize: 12, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { background: "#EEF2FF", color: C.c1, border: "1px solid #C7D2FE", borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 600 },
  chipAlt: { background: "#F1F5F9", color: C.slate, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 600 },
  editBtn: { display: "inline-block", border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 600, color: C.slate, textDecoration: "none" },
};
