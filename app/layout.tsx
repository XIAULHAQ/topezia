import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  // Resolves relative canonical/OG URLs in child pages to absolute ones —
  // without this, canonicals emit as "/jobs/foo", which search engines
  // shouldn't have to guess at. Must match the canonical host (www).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com"),
  title: "Topezia",
  description: "AI-matched jobs, aggregated from everywhere. One resume, honest matches.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        {/*
          Global border-box, which every design file assumed and the app never
          had. Without it any `width: 100%` element ALSO adds its padding, so
          layouts overflowed horizontally by exactly the padding on narrow
          screens (onboard was 392px wide in a 360px viewport). Individual
          components had been patching this locally; this fixes it at the root.
        */}
        <style dangerouslySetInnerHTML={{ __html: "*,*::before,*::after{box-sizing:border-box}" }} />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
