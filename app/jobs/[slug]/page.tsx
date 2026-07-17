/**
 * /jobs/{role-slug} · /jobs/remote-{role-slug} · /jobs/{vertical-slug} — spec §7.
 * 404s (auto-unpublishes) when fewer than MIN_JOBS_FOR_PAGE live jobs match.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveSeoPage } from "@/lib/seo/pages";
import SeoPageView from "../_components/SeoPageView";

export const revalidate = 3600; // hourly: counts move as ingestion runs

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await resolveSeoPage(params.slug);
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

export default async function JobsSlugPage({ params }: { params: { slug: string } }) {
  const page = await resolveSeoPage(params.slug);
  if (!page) notFound();
  return <SeoPageView page={page} />;
}
