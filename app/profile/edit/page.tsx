/**
 * /profile/edit — the editable profile (Panel 1, spec §3.4), now inside the
 * global app shell. /profile is the read view; this is where you change fields.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import ProfileEditor from "../profile-editor";

export const metadata: Metadata = { title: "Edit your profile — Topezia", robots: { index: false } };

export default async function ProfileEditPage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/onboard");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");
  return (
    <AppShell>
      <ProfileEditor />
    </AppShell>
  );
}
