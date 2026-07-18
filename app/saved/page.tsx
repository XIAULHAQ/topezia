/**
 * /saved — the seeker's saved (bookmarked) jobs, inside the app shell.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import SavedClient from "./saved-client";

export const metadata: Metadata = { title: "Saved jobs — Topezia", robots: { index: false } };

export default async function SavedPage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/onboard");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");
  return (
    <AppShell>
      <SavedClient />
    </AppShell>
  );
}
