import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { companyLogoUrl } from "@/lib/company/storage";
import WidgetChat from "./widget-chat";

/**
 * The inside of the chat iframe. Deliberately bare: no AppShell, no
 * SiteChrome, no auth — this renders on other people's websites, and the
 * token in the URL identifies a site without authorizing anything.
 * next.config.js gives /widget/* the frame-ancestors carve-out.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function WidgetPage({ params }: { params: { token: string } }) {
  const site = await prisma.widgetSite.findUnique({
    where: { siteToken: params.token },
    select: { enabled: true, branded: true, pagesCrawled: true, company: { select: { name: true, logoPath: true } } },
  });

  if (!site || !site.enabled) {
    return (
      <main style={{ fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", padding: 24, color: "#64748B", fontSize: 14 }}>
        This chat is currently turned off.
      </main>
    );
  }

  return (
    <WidgetChat
      token={params.token}
      companyName={site.company.name}
      logoUrl={companyLogoUrl(site.company.logoPath)}
      ready={site.pagesCrawled > 0}
      branded={site.branded}
    />
  );
}
