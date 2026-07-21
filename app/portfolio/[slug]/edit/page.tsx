/**
 * /portfolio/{slug}/edit — edit your own work.
 *
 * Not listed in middleware's GATED (that would need a prefix wildcard which
 * would also swallow the public detail page). Ownership is checked here
 * instead, which is the stronger check anyway: a session alone shouldn't let
 * you open someone else's editor.
 */
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import PortfolioEditor from "../../new/portfolio-editor";

export const metadata: Metadata = { title: "Edit work — Topezia", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditPortfolioPage({ params }: { params: { slug: string } }) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) redirect(`/login?next=${encodeURIComponent(`/portfolio/${params.slug}/edit`)}`);

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");

  // Scoped to the owner: someone else's slug 404s rather than 403s, so this
  // doesn't confirm what exists.
  const p = await prisma.portfolio.findFirst({
    where: { slug: params.slug, profileId: profile.id },
    select: {
      id: true, title: true, description: true, category: true, status: true,
      coverPath: true, coverWidth: true, coverHeight: true, skills: true, technologies: true,
      media: { orderBy: { position: "asc" }, select: { kind: true, path: true, videoId: true, videoProvider: true, videoHash: true, width: true, height: true } },
    },
  });
  if (!p) notFound();

  return (
    <AppShell>
      <PortfolioEditor existing={p} />
    </AppShell>
  );
}
