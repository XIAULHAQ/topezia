/**
 * /portfolio/mine — your own work, drafts included.
 *
 * Gated in middleware alongside /portfolio/new (both are authoring surfaces;
 * the public grid and detail pages stay open).
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import MyWorkClient from "./my-work-client";

export const metadata: Metadata = { title: "My work — Topezia", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyWorkPage() {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) redirect("/login?next=%2Fportfolio%2Fmine");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");

  return (
    <AppShell>
      <MyWorkClient />
    </AppShell>
  );
}
