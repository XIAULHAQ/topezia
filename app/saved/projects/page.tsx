/**
 * /saved/projects — the seeker's saved freelance projects, inside the app shell.
 *
 * Same store as /saved: a project is a Job with kind = PROJECT, so both read
 * JobSave and differ only by the kind filter.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import SavedClient from "../saved-client";

export const metadata: Metadata = { title: "Saved projects — Topezia", robots: { index: false } };

export default async function SavedProjectsPage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/onboard");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");
  return (
    <AppShell>
      <SavedClient kind="PROJECT" />
    </AppShell>
  );
}
