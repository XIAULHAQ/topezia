import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal / transactional surfaces have no business in the index.
        disallow: ["/api/", "/admin/", "/feed", "/onboard", "/login", "/go/", "/jobs/expired"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
