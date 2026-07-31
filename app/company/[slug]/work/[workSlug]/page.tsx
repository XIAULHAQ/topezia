/**
 * /company/{slug}/work/{workSlug} — one case study, public.
 *
 * Laid out to match app/portfolio/[slug]/page.tsx, deliberately and closely:
 * same wrapper width, same top bar (eyebrow → title → byline), same
 * gallery-plus-sticky-rail grid, same "About this work" and tag blocks, same
 * back row. A visitor who has seen one piece of work on Topezia should not
 * have to relearn the page when the author happens to be a company.
 *
 * Where it differs, it differs because the DATA differs, never because a
 * second designer got to it:
 *  - The byline is the company (logo + name) rather than a person.
 *  - Tags are plain chips, not links. Portfolio chips filter /portfolio; there
 *    is no equivalent grid for company work, and a chip that looks like a link
 *    and goes nowhere is worse than a chip that doesn't.
 *  - The rail carries Share and the facts. No Like or Save: neither exists for
 *    company work in the schema, and a button that does nothing is a lie.
 *
 * A draft simply doesn't exist here. The owner previews from /employer/work,
 * so this route stays a straight 404 for anything unpublished.
 *
 * Indexing requires BOTH this page and its company to clear the bar in
 * lib/company/indexing.ts: a case study under a company page we decline to
 * index has no business being indexed on its own.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { SiteHeader, SiteFooter } from "@/app/_components/SiteChrome";
import ShareMenu from "@/app/_components/ShareMenu";
import { Icon } from "@/app/_components/ui";
import { companyImageUrl, companyLogoUrl } from "@/lib/company/storage";
import { companyIndexable, companyWorkIndexable } from "@/lib/company/indexing";
import { UGC_REL } from "@/lib/ugc";
// Shared with the member portfolio: same parser, same poster proxy, same
// click-to-play embed. The module still lives under lib/portfolio because
// that is where it was written; nothing in it is portfolio-specific.
import { videoEmbedUrl, videoPosterUrl } from "@/lib/portfolio/video";
import VideoEmbed from "@/app/portfolio/[slug]/video-embed";
import ReportButton from "@/app/_components/ReportButton";

export const revalidate = 900;

const C = { c1: "#8B5CF6", ink: "#0F172A", slate: "#334155", mut: "#64748B", line: "#E2E8F0" };
const FONT = "var(--font-sora), system-ui, sans-serif";
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

async function load(companySlug: string, workSlug: string) {
  return prisma.companyWork.findFirst({
    where: { slug: workSlug, status: "PUBLISHED", company: { slug: companySlug } },
    select: {
      slug: true, title: true, summary: true, description: true, clientName: true,
      id: true,
      projectUrl: true, tags: true, coverPath: true, coverWidth: true, coverHeight: true, publishedAt: true,
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
  const shareUrl = `${SITE}/company/${w.company.slug}/work/${w.slug}`;
  const projectHost = w.projectUrl ? new URL(w.projectUrl).hostname.replace(/^www\./, "") : null;

  const facts: [string, string][] = [
    ...(w.clientName ? ([["Client", w.clientName]] as [string, string][]) : []),
    ...(w.publishedAt
      ? ([["Published", w.publishedAt.toLocaleDateString(undefined, { month: "long", year: "numeric" })]] as [string, string][])
      : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT, color: C.ink, overflowX: "clip" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <SiteHeader />

      <main style={S.wrap}>
        {/* ── Top bar: what it is, who made it, how to reach them ── */}
        <header style={S.topBar}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <Link href={`/company/${w.company.slug}#work`} style={S.eyebrow}>
              {w.clientName ? `Work for ${w.clientName}` : "Selected work"}
            </Link>
            <h1 style={S.h1}>{w.title}</h1>
            <div style={S.byline}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" style={S.avatar} />
              ) : (
                <span style={{ ...S.avatar, display: "grid", placeItems: "center", background: "#EEF2FF", color: C.c1, fontWeight: 700, fontSize: 13 }}>
                  {w.company.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span style={{ minWidth: 0 }}>
                <Link href={`/company/${w.company.slug}`} style={S.creatorLink}>{w.company.name}</Link>
              </span>
            </div>
          </div>

          <div style={S.topActions}>
            {w.projectUrl && (
              <a href={w.projectUrl} target="_blank" rel={UGC_REL} style={S.contactBtn}>See it live ↗</a>
            )}
            <Link href={`/company/${w.company.slug}`} style={S.contactBtn}>View {w.company.name}</Link>
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
                width={w.coverWidth ?? undefined}
                height={w.coverHeight ?? undefined}
                style={S.media}
                // The cover is the LCP element here — never lazy.
                decoding="async"
              />
            )}

            {w.media.map((m, i) => {
              if (m.kind === "VIDEO") {
                if (!m.videoId || !m.videoProvider) return null;
                const ref = { provider: m.videoProvider, id: m.videoId, hash: m.videoHash };
                // autoplay is safe here: the iframe is only mounted on click.
                const embed = videoEmbedUrl(ref, { autoplay: true });
                if (!embed) return null;
                return (
                  <figure key={i} style={S.figure}>
                    <VideoEmbed embedUrl={embed} posterUrl={videoPosterUrl(ref)} title={m.caption ?? `${w.title} — video ${i + 1}`} />
                    {m.caption && <figcaption style={S.caption}>{m.caption}</figcaption>}
                  </figure>
                );
              }
              const url = companyImageUrl(m.path);
              if (!url) return null;
              return (
                <figure key={i} style={S.figure}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={m.caption ?? ""} width={m.width ?? undefined} height={m.height ?? undefined} loading="lazy" decoding="async" style={S.media} />
                  {m.caption && <figcaption style={S.caption}>{m.caption}</figcaption>}
                </figure>
              );
            })}

            {(w.summary || w.description) && (
              <section style={S.about}>
                <h2 style={S.aboutHead}>About this work</h2>
                {w.summary && <p style={S.summary}>{w.summary}</p>}
                {w.description && <p style={S.description}>{w.description}</p>}
              </section>
            )}

            {w.tags.length > 0 && (
              <section style={S.tagBlock}>
                <div style={S.tagHead}>What this involved</div>
                <div style={S.chipRow}>
                  {/* Spans, not links. The portfolio's chips filter /portfolio;
                      company work has no such grid, and a chip styled as a
                      link that leads nowhere is a worse lie than a plain tag. */}
                  {w.tags.map((t) => <span key={t} style={S.chip}>{t}</span>)}
                </div>
              </section>
            )}
          </div>

          {/* position:sticky lives HERE, on the grid item, not inside the rail.
              A sticky element can only travel within its parent's box, and with
              align-items:start that box is exactly the rail's own height — so
              sticking the inner element would look right and move nothing. */}
          <aside className="pd-rail" style={S.railCol}>
            <div style={S.rail}>
              <ShareMenu url={shareUrl} title={w.title} buttonStyle={S.railBtn} wrapperStyle={{ display: "block", width: "100%" }}>
                <Icon name="share" size={16} />
                Share
              </ShareMenu>

              {projectHost && (
                <a href={w.projectUrl!} target="_blank" rel={UGC_REL} style={S.railBtn}>
                  {projectHost} ↗
                </a>
              )}
            </div>

            {facts.length > 0 && (
              <dl style={S.facts}>
                {facts.map(([k, v]) => (
                  <div key={k} style={S.factRow}>
                    <dt style={S.factKey}>{k}</dt>
                    <dd style={S.factVal}>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        </div>

        <div style={S.backRow}>
          <Link href={`/company/${w.company.slug}#work`} style={S.backLink}>← All work by {w.company.name}</Link>
        </div>

        {/* Quiet, and at the bottom — same placement and same reasoning as the
            portfolio page. See ReportButton for why it isn't louder. */}
        <div style={{ marginTop: 22 }}>
          <ReportButton kind="COMPANY_WORK" targetId={w.id} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

const CSS = `
@media (max-width:900px){
  .pd-layout{grid-template-columns:1fr!important}
  /* One column: the rail becomes a normal block, so the sticky has to come
     off or it pins itself over the gallery. */
  .pd-rail{position:static!important}
}
`;

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "30px 24px 70px" },
  topBar: { display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap", paddingBottom: 22, borderBottom: `1px solid ${C.line}`, marginBottom: 26 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: ".8px", color: C.c1, textTransform: "uppercase", textDecoration: "none", display: "inline-block", marginBottom: 8 },
  h1: { margin: 0, fontSize: "clamp(24px, 4.5vw, 34px)", fontWeight: 800, letterSpacing: "-0.9px", lineHeight: 1.18 },
  byline: { display: "flex", alignItems: "center", gap: 10, marginTop: 14, fontSize: 14, flexWrap: "wrap" },
  // Contained, not cover: a logo is a mark on its own background, and cropping
  // it to a circle the way a photo can be cropped mangles it.
  avatar: { width: 36, height: 36, borderRadius: 9, objectFit: "contain", background: "#fff", border: `1px solid ${C.line}`, flex: "none" },
  creatorLink: { color: C.ink, fontWeight: 600, textDecoration: "none" },
  topActions: { display: "flex", gap: 10, flex: "none", flexWrap: "wrap" },
  contactBtn: { border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 20px", fontSize: 13.5, fontWeight: 600, color: C.slate, textDecoration: "none", whiteSpace: "nowrap" },
  layout: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 208px", gap: 34, alignItems: "start" },
  railCol: { position: "sticky", top: 90, alignSelf: "start" },
  rail: { display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" },
  railBtn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
    border: `1px solid ${C.line}`, background: "#fff", color: C.slate, textDecoration: "none",
  },
  facts: { margin: "18px 0 0", display: "flex", flexDirection: "column", gap: 12 },
  factRow: { display: "flex", flexDirection: "column", gap: 3 },
  factKey: { fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".6px" },
  factVal: { margin: 0, fontSize: 13.5, color: C.slate, fontWeight: 600 },
  figure: { margin: "0 0 20px" },
  media: { width: "100%", height: "auto", borderRadius: 14, display: "block", marginBottom: 20 },
  caption: { fontSize: 12.5, color: C.mut, marginTop: -12, marginBottom: 20, lineHeight: 1.5 },
  about: { marginTop: 14 },
  aboutHead: { fontSize: 12, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".6px", margin: "0 0 10px" },
  summary: { fontSize: 16.5, lineHeight: 1.7, color: C.ink, margin: "0 0 14px", maxWidth: 680, fontWeight: 500 },
  description: { fontSize: 15, lineHeight: 1.8, color: C.slate, whiteSpace: "pre-wrap", margin: 0, maxWidth: 680 },
  tagBlock: { marginTop: 34, paddingTop: 26, borderTop: `1px solid ${C.line}` },
  tagHead: { fontSize: 12, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { background: "#EEF2FF", color: C.c1, border: "1px solid #C7D2FE", borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 600 },
  backRow: { marginTop: 44, paddingTop: 22, borderTop: `1px solid ${C.line}` },
  backLink: { color: C.mut, fontSize: 13.5, fontWeight: 600, textDecoration: "none" },
};
