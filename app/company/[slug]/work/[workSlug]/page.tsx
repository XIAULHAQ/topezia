/**
 * /company/{slug}/work/{workSlug} — one case study, public.
 *
 * A draft simply doesn't exist here. Unlike a member's portfolio, which shows
 * its owner a preview of their own draft, a company page has no single "owner
 * viewing" concept on the public side — the owner previews from /employer/work
 * instead, and this route stays a straight 404 for anything unpublished.
 *
 * Indexing is decided by lib/company/indexing.ts and requires BOTH this page
 * and its company to clear the bar: a case study under a company page we
 * decline to index has no business being indexed on its own.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import SiteNav from "@/app/_components/SiteNav";
import { SiteFooter } from "@/app/_components/SiteChrome";
import { companyImageUrl, companyLogoUrl } from "@/lib/company/storage";
import { companyIndexable, companyWorkIndexable } from "@/lib/company/indexing";
import { UGC_REL } from "@/lib/ugc";
// Shared with the member portfolio: same parser, same poster proxy, same
// click-to-play embed. The module still lives under lib/portfolio because
// that is where it was written; nothing in it is portfolio-specific.
import { videoEmbedUrl, videoPosterUrl } from "@/lib/portfolio/video";
import VideoEmbed from "@/app/portfolio/[slug]/video-embed";

export const revalidate = 900;

const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const GRAD = "linear-gradient(135deg,#8B5CF6,#3B82F6)";

async function load(companySlug: string, workSlug: string) {
  const work = await prisma.companyWork.findFirst({
    where: { slug: workSlug, status: "PUBLISHED", company: { slug: companySlug } },
    select: {
      slug: true, title: true, summary: true, description: true, clientName: true,
      projectUrl: true, tags: true, coverPath: true, publishedAt: true,
      media: {
        orderBy: { position: "asc" },
        select: {
          kind: true, path: true, caption: true, width: true, height: true,
          videoId: true, videoProvider: true, videoHash: true,
        },
      },
      company: {
        select: {
          name: true, slug: true, tagline: true, about: true, website: true, logoPath: true, spamCleared: true,
          _count: { select: { jobs: { where: { status: "LIVE" } } } },
        },
      },
    },
  });
  return work;
}

type WorkRecord = NonNullable<Awaited<ReturnType<typeof load>>>;

function indexable(w: WorkRecord): boolean {
  const parentOk = companyIndexable({
    name: w.company.name,
    tagline: w.company.tagline,
    about: w.company.about,
    website: w.company.website,
    spamCleared: w.company.spamCleared,
    liveJobCount: w.company._count.jobs,
  });
  if (!parentOk) return false;

  return companyWorkIndexable(
    {
      title: w.title,
      summary: w.summary,
      description: w.description,
      clientName: w.clientName,
      tags: w.tags,
      captions: w.media.map((m) => m.caption),
    },
    w.company.spamCleared
  );
}

export async function generateMetadata({ params }: { params: { slug: string; workSlug: string } }): Promise<Metadata> {
  const w = await load(params.slug, params.workSlug);
  if (!w) return { title: "Work — Topezia", robots: { index: false } };

  const description = (w.summary || w.description || `Work by ${w.company.name}.`).slice(0, 200);
  const cover = companyImageUrl(w.coverPath);
  return {
    title: `${w.title} — ${w.company.name} | Topezia`,
    description,
    alternates: { canonical: `/company/${w.company.slug}/work/${w.slug}` },
    openGraph: { title: w.title, description, type: "article", ...(cover ? { images: [cover] } : {}) },
    twitter: { card: "summary_large_image" },
    robots: { index: indexable(w), follow: true },
  };
}

export default async function CompanyWorkPage({ params }: { params: { slug: string; workSlug: string } }) {
  const w = await load(params.slug, params.workSlug);
  if (!w) notFound();

  const cover = companyImageUrl(w.coverPath);
  const logo = companyLogoUrl(w.company.logoPath);
  const projectHost = w.projectUrl ? new URL(w.projectUrl).hostname.replace(/^www\./, "") : null;

  return (
    <main style={{ background: "#F1F5F9", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-sora), var(--font-jakarta), sans-serif", color: INK }}>
      <SiteNav />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 24px 64px", width: "100%", flex: 1 }}>
        <p style={{ margin: "0 0 16px", fontSize: 12.5 }}>
          <Link href={`/company/${w.company.slug}`} style={{ color: MUTED, textDecoration: "none" }}>← {w.company.name}</Link>
        </p>

        <article style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden" }}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
          )}

          <div style={{ padding: "28px 30px 32px" }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.6px", lineHeight: 1.25 }}>{w.title}</h1>

            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 14, fontSize: 12.5, color: MUTED }}>
              <Link href={`/company/${w.company.slug}`} style={{ display: "inline-flex", gap: 8, alignItems: "center", color: INK, textDecoration: "none", fontWeight: 700 }}>
                <span style={S.logoDot}>
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    w.company.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                {w.company.name}
              </Link>
              {w.clientName && <span>Client: <b style={{ color: "#334155" }}>{w.clientName}</b></span>}
              {w.publishedAt && <span>{w.publishedAt.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>}
              {w.projectUrl && (
                <a href={w.projectUrl} target="_blank" rel={UGC_REL} style={{ color: "#4F46E5", fontWeight: 700 }}>{projectHost} ↗</a>
              )}
            </div>

            {w.summary && <p style={{ margin: "18px 0 0", fontSize: 15.5, lineHeight: 1.7, color: "#334155", fontWeight: 500 }}>{w.summary}</p>}
            {w.description && <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.8, color: "#334155", whiteSpace: "pre-wrap" }}>{w.description}</p>}

            {w.tags.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 22 }}>
                {w.tags.map((t) => <span key={t} style={S.tag}>{t}</span>)}
              </div>
            )}

            {w.media.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 26 }}>
                {w.media.map((m, i) => {
                  if (m.kind === "VIDEO") {
                    if (!m.videoId || !m.videoProvider) return null;
                    const ref = { provider: m.videoProvider, id: m.videoId, hash: m.videoHash };
                    // autoplay is safe: VideoEmbed only mounts the iframe on
                    // click, so the click IS the user gesture that allows it.
                    const embed = videoEmbedUrl(ref, { autoplay: true });
                    if (!embed) return null;
                    return (
                      <figure key={`v-${i}`} style={{ margin: 0 }}>
                        <VideoEmbed embedUrl={embed} posterUrl={videoPosterUrl(ref)} title={m.caption ?? `${w.title} — video ${i + 1}`} />
                        {m.caption && <figcaption style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>{m.caption}</figcaption>}
                      </figure>
                    );
                  }
                  const url = companyImageUrl(m.path);
                  if (!url) return null;
                  return (
                    <figure key={m.path} style={{ margin: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={m.caption ?? ""} loading="lazy" decoding="async" style={{ width: "100%", height: "auto", borderRadius: 12, display: "block", border: `1px solid ${LINE}` }} />
                      {m.caption && <figcaption style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>{m.caption}</figcaption>}
                    </figure>
                  );
                })}
              </div>
            )}
          </div>
        </article>

        <section style={{ border: "1px solid #C7D2FE", background: "linear-gradient(150deg,#EEF2FF,#F5F3FF)", borderRadius: 16, padding: "20px 22px", marginTop: 22 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Want to work with {w.company.name}?</h2>
          <p style={{ margin: "8px 0 14px", fontSize: 12.8, lineHeight: 1.65, color: "#334155" }}>
            See what they&apos;re hiring for, and how well you actually fit.
          </p>
          <Link href={`/company/${w.company.slug}`} style={{ display: "inline-block", background: GRAD, color: "#fff", borderRadius: 11, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            View {w.company.name}
          </Link>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  logoDot: { width: 24, height: 24, borderRadius: 6, background: "#F1F5F9", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800, overflow: "hidden", color: "#64748B" },
  tag: { background: "#F1F5F9", color: "#475569", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600 },
};
