/**
 * Reading published portfolios for the public grid.
 *
 * Only PUBLISHED rows, ever. Drafts are private to their owner and are read
 * through the detail page's own ownership check, never through here.
 */
import { prisma } from "@/lib/prisma";
import { portfolioImageUrl } from "./storage";
import { parseCategory } from "./categories";

export const PAGE_SIZE = 36;

export type GridCard = {
  slug: string;
  title: string;
  category: string;
  coverUrl: string | null;
  /** Intrinsic cover size, so a masonry tile reserves its box before loading. */
  coverWidth: number | null;
  coverHeight: number | null;
  creator: string;
  creatorSlug: string | null;
  creatorPhoto: string | null;
  saves: number;
};

export async function listPortfolios(opts: { category?: string | null; tag?: string | null; page?: number }) {
  const category = parseCategory(opts.category ?? undefined);
  const tag = (opts.tag ?? "").trim().slice(0, 40) || null;
  const page = Math.max(1, Math.min(opts.page ?? 1, 200));

  const where = {
    status: "PUBLISHED" as const,
    ...(category ? { category } : {}),
    // Chips on the detail page link back here. Case-insensitive so "Figma" and
    // "figma" are the same chip — people type tags however they like.
    ...(tag ? { OR: [{ skills: { has: tag } }, { technologies: { has: tag } }] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.portfolio.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        slug: true, title: true, category: true,
        coverPath: true, coverWidth: true, coverHeight: true,
        profile: { select: { fullName: true, publicSlug: true, photoUrl: true } },
        _count: { select: { saves: true } },
      },
    }),
    prisma.portfolio.count({ where }),
  ]);

  const cards: GridCard[] = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    category: r.category,
    coverUrl: portfolioImageUrl(r.coverPath),
    coverWidth: r.coverWidth,
    coverHeight: r.coverHeight,
    creator: r.profile.fullName ?? "Topezia member",
    creatorSlug: r.profile.publicSlug,
    creatorPhoto: r.profile.photoUrl,
    saves: r._count.saves,
  }));

  return { cards, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Categories that actually have published work, for the filter row. */
export async function activeCategories(): Promise<Map<string, number>> {
  const rows = await prisma.portfolio.groupBy({
    by: ["category"],
    where: { status: "PUBLISHED" },
    _count: { category: true },
  });
  return new Map(rows.map((r) => [r.category, r._count.category]));
}
