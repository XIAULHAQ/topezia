/**
 * /jobs/{role-slug}/{place} — the role × place lattice (spec §7).
 *
 * `place` is either a US state code ("ca") or a country slug ("germany").
 * They can't share a namespace as codes: CA is California AND Canada, IN is
 * Indiana AND India, DE is Delaware AND Germany. US pages keep their two-letter
 * codes; countries use full-name slugs, which is also what people search for.
 *
 * 404s only when nothing is behind the URL (unknown place, no taxonomy match,
 * or zero live jobs). Below the indexability floor the page renders
 * `noindex,follow` with an alert-capture state (§1.2 of the SEO addendum).
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveSeoPage } from "@/lib/seo/pages";
import SeoPageView from "../../_components/SeoPageView";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { slug: string; place: string } }): Promise<Metadata> {
  const page = await resolveSeoPage(params.slug, params.place);
  if (!page) return { title: "Jobs — Topezia" };
  const title = `${page.heading} — verified & honestly matched | Topezia`;
  const description = page.intro.slice(0, 155);
  return {
    title,
    description,
    robots: page.thin ? "noindex,follow" : "index,follow,max-image-preview:large",
    alternates: { canonical: page.canonicalPath },
    openGraph: { title, description, url: page.canonicalPath, type: "website" },
  };
}

export default async function JobsRolePlacePage({ params }: { params: { slug: string; place: string } }) {
  const page = await resolveSeoPage(params.slug, params.place);
  if (!page) notFound();
  return <SeoPageView page={page} />;
}
