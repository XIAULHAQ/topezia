import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicProfile, { getPublicProfile, profileMetadata, TAB_SLUGS, type PublicTab } from "../../PublicProfile";

export const revalidate = 300;

function validTab(t: string): t is Exclude<PublicTab, "overview"> {
  return (TAB_SLUGS as string[]).includes(t);
}

export async function generateMetadata({ params }: { params: { slug: string; tab: string } }): Promise<Metadata> {
  if (!validTab(params.tab)) return { title: "Not found — Topezia", robots: { index: false } };
  const p = await getPublicProfile(params.slug);
  if (!p) return { title: "Profile not found — Topezia", robots: { index: false } };
  return profileMetadata(p, params.tab);
}

export default async function PublicProfileTab({ params }: { params: { slug: string; tab: string } }) {
  if (!validTab(params.tab)) notFound();
  const p = await getPublicProfile(params.slug);
  if (!p) notFound();
  return <PublicProfile p={p} tab={params.tab} />;
}
