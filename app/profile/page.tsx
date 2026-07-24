/**
 * /profile — the profile VIEW. LinkedIn-style presentation of the real profile
 * (experience, skills, education, insights) with clearly-labelled
 * "Sample"/"Coming soon" panels for parts we don't back with data yet.
 * Sections edit IN PLACE via per-section modals (see edit-in-place.tsx);
 * /profile/edit remains only for resume replacement and job preferences.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import ProfileView from "./profile-view";

export const metadata: Metadata = { title: "Your profile — Topezia", robots: { index: false } };

export default async function ProfilePage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/onboard");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");
  return (
    <AppShell>
      <ProfileView />
    </AppShell>
  );
}
