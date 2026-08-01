import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { companyLogoUrl } from "@/lib/company/storage";
import { replyTimePhrase, parseReplyHours, officeState, normalizeAccent } from "@/lib/widget/presence";
import WidgetChat from "./widget-chat";

/**
 * The inside of the chat iframe. Deliberately bare: no AppShell, no
 * SiteChrome, no auth — this renders on other people's websites, and the
 * token in the URL identifies a site without authorizing anything.
 * next.config.js gives /widget/* the frame-ancestors carve-out.
 *
 * PAGE-AWARE OPENER: the loader passes ?page= (the host page the visitor
 * opened the chat from). If that page is a known product, the greeting names
 * it; if it's a crawled page with a usable title, the greeting references
 * it. Deterministic — matched against the crawl, no model call until the
 * visitor actually says something.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** "Post Card - Rodeo Graphics" → "Post Card" — page titles carry the site
 *  name as a suffix and the greeting shouldn't read it back. */
function cleanTitle(raw: string, companyName: string): string {
  const t = raw.split(/\s+[|\-–—·]\s+/)[0].trim();
  if (!t || t.length < 3 || t.length > 70) return "";
  if (t.toLowerCase() === companyName.toLowerCase()) return "";
  return t;
}

export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { page?: string };
}) {
  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: {
      id: true, domain: true, enabled: true, branded: true, pagesCrawled: true,
      accentColor: true, replyHours: true,
      company: { select: { id: true, name: true, logoPath: true } },
    },
  });

  if (!site || !site.enabled) {
    return (
      <main style={{ fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", padding: 24, color: "#64748B", fontSize: 14 }}>
        This chat is currently turned off.
      </main>
    );
  }

  // Only the site's own pages count as context; anything else in ?page= is
  // noise or mischief and is simply ignored.
  let pageUrl: string | null = null;
  if (typeof searchParams?.page === "string") {
    try {
      const u = new URL(searchParams.page);
      const h = u.hostname.replace(/^www\./, "");
      if (h === site.domain.replace(/^www\./, "")) pageUrl = `${u.origin}${u.pathname}`;
    } catch { /* not a URL */ }
  }

  let greeting: string | null = null;
  if (pageUrl && site.pagesCrawled > 0) {
    const bare = pageUrl.replace(/\/$/, "");
    const urlForms = [pageUrl, bare, `${bare}/`];
    const isHome = new URL(pageUrl).pathname === "/";
    if (!isHome) {
      const [product, chunk] = await Promise.all([
        prisma.siteProduct.findFirst({ where: { siteId: site.id, url: { in: urlForms } }, select: { name: true, price: true } }),
        prisma.siteChunk.findFirst({ where: { siteId: site.id, url: { in: urlForms }, title: { not: "" } }, select: { title: true } }),
      ]);
      if (product) {
        greeting = `Looking at ${product.name}?${product.price ? ` It's ${product.price.charAt(0).toLowerCase() + product.price.slice(1)}.` : ""} Ask me anything about it — or leave a message and a real person will follow up.`;
      } else if (chunk) {
        const title = cleanTitle(chunk.title, site.company.name);
        if (title) greeting = `Got questions about ${title}? I know this site well — ask away, or leave a message for the team.`;
      }
    }
  }

  // How fast this company actually replies, and whether anyone is at the
  // desk right now. Both are honest-or-absent: no history, no phrase; no
  // configured hours, no availability claim.
  const [replyTime, hours] = await Promise.all([
    replyTimePhrase(site.company.id),
    Promise.resolve(parseReplyHours(site.replyHours)),
  ]);
  const office = officeState(hours);

  return (
    <WidgetChat
      token={params.token}
      companyName={site.company.name}
      logoUrl={companyLogoUrl(site.company.logoPath)}
      ready={site.pagesCrawled > 0}
      branded={site.branded}
      greeting={greeting}
      pageUrl={pageUrl}
      accent={normalizeAccent(site.accentColor)}
      replyTime={replyTime}
      offlineUntil={office && !office.open ? office.backAt || null : null}
      offline={Boolean(office && !office.open)}
    />
  );
}
