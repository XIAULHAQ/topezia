import type { Metadata } from "next";
import type { ReactNode } from "react";
import Analytics from "@/app/_components/Analytics";
import { Sora, Plus_Jakarta_Sans, EB_Garamond, Instrument_Serif, Archivo, IBM_Plex_Mono } from "next/font/google";

/**
 * Fonts are SELF-HOSTED, not pulled from Google's CDN at runtime.
 *
 * The <link> to fonts.googleapis.com was render-blocking on a third origin,
 * and the woff2 files it named lived on a fourth (fonts.gstatic.com) — a serial
 * chain the browser had to finish before painting text. Lighthouse measured it
 * at 750ms blocking, ~1.66s of potential savings. Preconnect hints shortened
 * the chain but could not remove it: the request was still on the critical path.
 *
 * next/font downloads both families at BUILD time and serves them from our own
 * origin, so there is no third-party request and nothing blocks render.
 *
 * It also fixes the layout shift, which the preconnect did not. Lighthouse
 * attributed a 0.297 CLS (anything over 0.25 is "poor") to the hero section:
 * text painted in the system-ui fallback, then reflowed when Sora arrived,
 * because the two have different metrics. next/font generates a fallback with
 * size-adjust/ascent-override tuned to match the real font's metrics, so the
 * fallback occupies the same space and the swap no longer moves anything.
 *
 * `variable` (not `className`) because the app sets fonts through inline style
 * objects in ~25 components. The generated family name is hashed per build, so
 * a literal "'Sora'" would silently stop matching — every call site reads
 * var(--font-sora) instead. No `weight`: both are variable fonts, so omitting
 * it ships one file covering the whole weight range.
 */
const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sora",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

/**
 * Resume template faces. Only the /resume export designs use these, and each
 * design is built around its own typography — swapping them for Sora would
 * make five templates look like one. Self-hosted by next/font like the rest,
 * so choosing a template never costs a round-trip to Google, and the files
 * only download on pages that actually paint them.
 */
const garamond = EB_Garamond({ subsets: ["latin"], display: "swap", variable: "--font-garamond", style: ["normal", "italic"] });
const instrument = Instrument_Serif({ subsets: ["latin"], display: "swap", variable: "--font-instrument", weight: "400" });
const archivo = Archivo({ subsets: ["latin"], display: "swap", variable: "--font-archivo" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], display: "swap", variable: "--font-plex-mono", weight: ["400", "500", "600"] });

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
    <html lang="en" className={`${sora.variable} ${jakarta.variable} ${garamond.variable} ${instrument.variable} ${archivo.variable} ${plexMono.variable}`}>
      <head>
        {/*
          Global border-box, which every design file assumed and the app never
          had. Without it any `width: 100%` element ALSO adds its padding, so
          layouts overflowed horizontally by exactly the padding on narrow
          screens (onboard was 392px wide in a 360px viewport). Individual
          components had been patching this locally; this fixes it at the root.
        */}
        <style dangerouslySetInnerHTML={{ __html: "*,*::before,*::after{box-sizing:border-box}" }} />
      </head>
      <body style={{ margin: 0 }}>{children}<Analytics /></body>
    </html>
  );
}
