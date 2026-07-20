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
        {/*
          The font CSS is a render-blocking request to a THIRD origin, and the
          font files it names live on a FOURTH (fonts.gstatic.com) — so without
          these hints the browser pays two cold DNS+TCP+TLS handshakes in series
          before a single glyph is fetched. Sora then landed well after first
          paint, the page re-flowed from the system-ui fallback, and that one
          swap measured a 0.2285 layout shift (Google calls anything over 0.25
          "poor"). Preconnecting both origins in parallel with the HTML lets the
          font arrive with the paint instead of after it. gstatic serves fonts
          as CORS requests, hence crossOrigin on that one specifically.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
