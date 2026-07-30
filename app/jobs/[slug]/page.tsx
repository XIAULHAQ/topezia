/**
 * /jobs/{role-slug} · /jobs/remote-{role-slug} · /jobs/{vertical-slug} — spec §7.
 *
 * 404s only when nothing is behind the URL (no taxonomy match, or zero live
 * jobs). A page that resolves but sits under its indexability floor renders
 * `noindex,follow` with an alert-capture state — see SeoPage.thin and
 * docs/topezia-slice4-seo-spec.md §1.2.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveSeoPage } from "@/lib/seo/pages";
import { getCountryExtras } from "@/lib/seo/country";
import SeoPageView from "../_components/SeoPageView";
import CountryPageView from "../_components/CountryPageView";

export const revalidate = 3600; // hourly: counts move as ingestion runs

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await resolveSeoPage(params.slug);
  if (!page) return { title: "Jobs — Topezia" };
  const title = `${page.heading} — verified & honestly matched | Topezia`;
  const description = page.intro.slice(0, 155);
  return {
    title,
    description,
    // `follow` either way: even while thin, the outbound links to siblings and
    // job details are worth crawling.
    robots: page.thin ? "noindex,follow" : "index,follow,max-image-preview:large",
    alternates: { canonical: page.canonicalPath },
    openGraph: { title, description, url: page.canonicalPath, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function JobsSlugPage({ params }: { params: { slug: string } }) {
  const page = await resolveSeoPage(params.slug);
  if (!page) notFound();
  // Bare-country pages get the designed layout (hero image, field breakdown,
  // market snapshot); everything else keeps the standard SEO listing view.
  if (page.kind === "place" && page.country) {
    const extras = await getCountryExtras(page.country);
    return <CountryPageView page={page} extras={extras} />;
  }
  return <SeoPageView page={page} />;
}
