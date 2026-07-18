import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicProfile, { getPublicProfile, profileMetadata } from "../PublicProfile";

export const revalidate = 300; // public + cacheable; refreshes every 5 min

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await getPublicProfile(params.slug);
  if (!p) return { title: "Profile not found — Topezia", robots: { index: false } };
  return profileMetadata(p, "overview");
}

export default async function PublicProfileOverview({ params }: { params: { slug: string } }) {
  const p = await getPublicProfile(params.slug);
  if (!p) notFound();
  return <PublicProfile p={p} tab="overview" />;
}
