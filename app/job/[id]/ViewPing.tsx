"use client";

/**
 * Records one posting view, once per mount.
 *
 * Renders nothing. It exists as its own component because the job page is a
 * cached server document (revalidate 900) shared by every visitor — the page
 * render can't attribute a view to anyone, so the count has to come from the
 * browser. See app/api/jobs/[id]/view/route.ts for the dedupe and
 * don't-count-your-own-posting rules; this side stays deliberately dumb.
 *
 * The StrictMode double-invoke in dev would fire this twice; that's harmless,
 * because the route dedupes on (posting, viewer, day) in the database rather
 * than trusting the client to call exactly once.
 */
import { useEffect } from "react";

export default function ViewPing({ jobId }: { jobId: string }) {
  useEffect(() => {
    // keepalive so the ping still lands if the visitor immediately clicks
    // through to the employer's site.
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/view`, { method: "POST", keepalive: true }).catch(() => {
      /* a failed counter must never affect the page */
    });
  }, [jobId]);

  return null;
}
