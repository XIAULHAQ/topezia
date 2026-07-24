/**
 * /resume — the Resume Builder. Gated in middleware alongside the other
 * dashboard surfaces; anonymous profiles work here too (same as /profile).
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import AppShell from "@/app/_components/AppShell";
import ResumeClient from "./resume-client";

export const metadata: Metadata = { title: "Resume Builder — Topezia", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const { userId } = await currentIdentity();
  if (!userId) redirect("/login?next=%2Fresume");
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) redirect("/onboard");

  return (
    <AppShell>
      <ResumeClient />
    </AppShell>
  );
}
