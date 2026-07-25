"use client";

/**
 * PostHog, env-gated: a no-op until NEXT_PUBLIC_POSTHOG_KEY exists in Vercel.
 * Tracks pageviews on route change — enough for the Phase-1 activation funnel
 * (visit → onboard → feed) without sprinkling capture calls through the app.
 * DB tables (Profile, JobClick) remain the source of truth for the funnel's
 * later stages; this adds the top of it and session behaviour.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!KEY) return;
    import("posthog-js").then(({ default: posthog }) => {
      if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
        posthog.init(KEY, {
          api_host: HOST,
          // We fire pageviews ourselves on route change — the automatic one
          // only sees the first server load in an app-router SPA.
          capture_pageview: false,
          persistence: "localStorage+cookie",
        });
      }
      posthog.capture("$pageview");
    });
  }, [pathname]);

  return null;
}
