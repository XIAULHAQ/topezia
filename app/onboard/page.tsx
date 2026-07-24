/**
 * Onboard route guard.
 *
 * If you already have a profile, this screen is a dead end — it asks for a
 * resume you've already given us. Links into /onboard come from places that
 * can't know whether you're new (the alert confirmation email, for one), so
 * the guard lives here rather than at every link. `?edit=1` forces the form
 * for a genuine re-upload.
 */
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import OnboardClient from "./onboard-client";

export default async function OnboardPage({ searchParams }: { searchParams: { edit?: string } }) {
  if (searchParams.edit !== "1") {
    const { userId } = await currentIdentity();
    if (userId) {
      const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
      if (profile) redirect("/feed");
    }
  }

  // The role taxonomy for the no-resume path's picker — same grouping the
  // profile editor uses, so a picked role always resolves to a real Role.
  const verticals = await prisma.vertical.findMany({
    where: { slug: { not: "unsorted" } },
    select: { name: true, roles: { select: { name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  const roleGroups = verticals
    .filter((v) => v.roles.length > 0)
    .map((v) => ({ field: v.name, roles: v.roles.map((r) => r.name) }));

  return <OnboardClient roleGroups={roleGroups} />;
}
