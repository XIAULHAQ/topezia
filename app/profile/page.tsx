/**
 * /profile — the editable profile (Panel 1, spec §3.4).
 *
 * Until now the only way to change a profile was re-uploading a résumé. This
 * lets you edit every structured field directly, and shows where each one came
 * from — your résumé, our inference, or your own hand. Saving re-matches.
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import ProfileEditor from "./profile-editor";

export const metadata: Metadata = { title: "Your profile — Topezia", robots: { index: false } };

export default async function ProfilePage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/onboard");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");
  return <ProfileEditor />;
}
