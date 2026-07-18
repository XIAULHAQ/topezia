/**
 * /drive — the trucking questionnaire route (spec §3.4, alternate entry path).
 *
 * Same guard as /onboard: if you already have a profile this screen is a dead
 * end, so send you to your feed. `?edit=1` forces the form for a genuine redo.
 */
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import DriveClient from "./drive-client";

export default async function DrivePage({ searchParams }: { searchParams: { edit?: string } }) {
  if (searchParams.edit !== "1") {
    const { userId } = await currentIdentity();
    if (userId) {
      const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
      if (profile) redirect("/feed");
    }
  }
  return <DriveClient />;
}
