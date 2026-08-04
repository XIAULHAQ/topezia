/**
 * Which sites' knowledge one chat may draw on.
 *
 * A brand is a set of domains that are one business (migration 070): the
 * marketing site on WordPress and the shop on Shopify, say. They share a
 * knowledge base, so the site's chat can name a product and the shop's chat
 * can quote the FAQ — the thing that made two separate bots useless to the
 * commonest shape of small business.
 *
 * WHAT THIS MUST NEVER DO IS SPAN TWO BRANDS. Studio sells ten domains to
 * agencies, so "everything this company owns" would let one client's chat
 * answer with another client's content. That is the entire reason brands
 * exist rather than simply widening the filter to companyId, and it is why
 * this function takes a brandId and not a company.
 */
import { prisma } from "@/lib/prisma";

/**
 * The site ids a chat on `site` may retrieve from — always including itself.
 *
 * A site with no brand is an island, which is exactly the behaviour before
 * 070 and the safe answer if a backfill ever misses a row: it can only ever
 * see its own pages.
 *
 * Ordered by id so the array is stable between calls, which keeps the query
 * plan and any downstream caching predictable.
 */
export async function brandSiteIds(site: { id: string; brandId: string | null }): Promise<string[]> {
  if (!site.brandId) return [site.id];

  const rows = await prisma.widgetSite.findMany({
    // enabled only: a website the owner switched off should stop answering
    // everywhere, not just on its own domain.
    where: { brandId: site.brandId, enabled: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const ids = rows.map((r) => r.id);
  // The site being chatted on always counts, even if it was disabled between
  // the token lookup and here — refusing to answer from the very page the
  // visitor is standing on would be absurd.
  return ids.includes(site.id) ? ids : [site.id, ...ids];
}

/**
 * Which site in this brand holds the shop, for "where is my order?".
 *
 * The store credential hangs off ONE site — the shop's — so before brands a
 * visitor could only ask about an order on the shop's own domain. Ask on the
 * marketing site and the assistant had nothing, which is precisely backwards:
 * the marketing site is where people arrive, and "where's my order" is the
 * question they arrive with.
 *
 * A brand has one shop in practice, so the first match is the answer. The
 * site being chatted on wins when it has its own — no reason to reach sideways
 * when the shop is right here.
 *
 * Returns null when nothing in the brand has a store connected, and the chat
 * then says nothing about orders at all rather than inviting an order number
 * it cannot check.
 */
export async function brandStoreSiteId(site: {
  id: string;
  brandId: string | null;
  orderLookup: boolean;
}): Promise<string | null> {
  // Its own shop first. `orderLookup` is the owner's deliberate switch, and
  // the credential's presence is the other half — both are required here and
  // for siblings, so nothing is ever looked up on a site that opted out.
  if (site.orderLookup) {
    const own = await prisma.siteStoreCredential.findUnique({
      where: { siteId: site.id },
      select: { siteId: true },
    });
    if (own) return own.siteId;
  }

  if (!site.brandId) return null;

  const sibling = await prisma.widgetSite.findFirst({
    where: {
      brandId: site.brandId,
      enabled: true,
      orderLookup: true,
      id: { not: site.id },
      storeCredential: { isNot: null },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return sibling?.id ?? null;
}
