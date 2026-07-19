/**
 * /coach — the Career Coach, inside the app shell. The full roadmap lives
 * here: the honesty mirror diffed against the user's real market, with room to
 * grow (momentum, alerts, the shareable report) as those land.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import CoachClient from "./coach-client";

export const metadata: Metadata = { title: "Career Coach — Topezia", robots: { index: false } };

export default async function CoachPage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/onboard");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");
  return (
    <AppShell>
      <CoachClient />
    </AppShell>
  );
}
