/**
 * /portfolio/new — add work. Gated in middleware (the only gated path under
 * /portfolio; browsing and viewing are public).
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import PortfolioEditor from "./portfolio-editor";

export const metadata: Metadata = { title: "Add work — Topezia", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NewPortfolioPage() {
  const { userId, authed } = await currentIdentity();
  // Publishing needs a real account, not just an anonymous profile — the work
  // has to stay attributable to someone who can sign back in and manage it.
  if (!userId || !authed) redirect("/login?next=%2Fportfolio%2Fnew");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");

  return (
    <AppShell>
      <PortfolioEditor />
    </AppShell>
  );
}
