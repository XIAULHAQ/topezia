/**
 * /jobs/{role-slug}/{state} — the role×state lattice (spec §7).
 * 404s when fewer than MIN_JOBS_FOR_PAGE live jobs match.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveSeoPage } from "@/lib/seo/pages";
import SeoPageView from "../../_components/SeoPageView";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { slug: string; state: string } }): Promise<Metadata> {
  const page = await resolveSeoPage(params.slug, params.state);
  if (!page) return { title: "Jobs — Topezia" };
  const title = `${page.heading} — verified & honestly matched | Topezia`;
  const description = page.intro.slice(0, 155);
  return {
    title,
    description,
    alternates: { canonical: page.canonicalPath },
    openGraph: { title, description, url: page.canonicalPath, type: "website" },
  };
}

export default async function JobsRoleStatePage({ params }: { params: { slug: string; state: string } }) {
  const page = await resolveSeoPage(params.slug, params.state);
  if (!page) notFound();
  return <SeoPageView page={page} />;
}
