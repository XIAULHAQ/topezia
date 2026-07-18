/**
 * /settings — data control (spec §3.4 privacy; the legally-required half).
 *
 * See what we hold, export it, clear the stored résumé text, manage alerts,
 * delete the account. Deliberately unglamorous.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import SettingsClient from "./settings-client";

export const metadata: Metadata = { title: "Settings — Topezia", robots: { index: false } };

export default async function SettingsPage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/onboard");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");
  return (
    <AppShell>
      <SettingsClient />
    </AppShell>
  );
}
