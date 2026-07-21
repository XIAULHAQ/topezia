/**
 * The branded route-loading animation.
 *
 * DO NOT re-add this as `app/loading.tsx`. A loading.tsx at the app ROOT wraps
 * every route in a Suspense boundary, so Next starts streaming — and commits
 * HTTP 200 — before the page has resolved. Any notFound() thrown afterwards
 * then renders the 404 body under a 200 status: a soft 404 across the entire
 * site, including the whole /jobs SEO lattice, which calls notFound() for every
 * slug below the publish threshold. Google indexes those as real pages.
 *
 * That was measured, not assumed: with the root loading.tsx present, every
 * notFound() route returned 200 while Next's own no-route-match 404 returned
 * 404 correctly. Removing this one file flipped all of them to 404.
 *
 * So it is opt-in per segment instead. Add a loading.tsx re-exporting this to
 * any segment that is slow AND never calls notFound() — check before adding,
 * and never place one at or above: /job/[id], /jobs/[slug], /p/[slug],
 * /portfolio/[slug].
 *
 * Self-contained (no imports from the "use client" ui module): a server
 * component can't read runtime values out of a client module, so the design
 * tokens are inlined here to match ui.tsx.
 */
const BG = "#F1F5F9";
const LINE = "#E2E8F0";
const C1 = "#6366F1";
const C2 = "#8B5CF6";
const GRAD = `linear-gradient(135deg, ${C1}, ${C2})`;
const FONT = "var(--font-sora), system-ui, sans-serif";

export default function RouteLoading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: BG,
        fontFamily: FONT,
        zIndex: 200,
      }}
    >
      <style>{`
        @keyframes tz-spin { to { transform: rotate(360deg); } }
        @keyframes tz-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ position: "relative", width: 52, height: 52 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `4px solid ${LINE}` }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: `conic-gradient(from 0deg, ${C1}, ${C2}, transparent 75%)`,
              WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px))",
              animation: "tz-spin .8s linear infinite",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.3px",
            background: GRAD,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            animation: "tz-pulse 1.4s ease-in-out infinite",
          }}
        >
          topezia
        </div>
      </div>
    </div>
  );
}
