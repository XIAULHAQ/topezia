"use client";

/**
 * Top-of-page navigation progress bar.
 *
 * WHY THIS EXISTS RATHER THAN A loading.tsx: the App Router shows nothing at all
 * during a client-side navigation unless the target segment has a loading.tsx —
 * so clicking a heavy page like /jobs/tech-software looked like a dead click.
 * But a loading.tsx on /jobs/[slug] is forbidden: it wraps the segment in
 * Suspense, Next commits HTTP 200 before the page resolves, and every
 * notFound() after that renders a 404 body under a 200 — a soft 404 across the
 * whole SEO lattice. See app/_components/RouteLoading.tsx, where that was
 * measured.
 *
 * This sidesteps the problem entirely by living OUTSIDE the routing tree: it is
 * a sibling of {children} in the root layout, creates no Suspense boundary, and
 * runs purely on the client. It cannot affect a status code.
 *
 * Deliberately NOT using useSearchParams: in Next 14 an unwrapped
 * useSearchParams forces a client-side-rendering bailout for statically
 * rendered pages, and this component sits in the ROOT layout — that would opt
 * the entire site out of static rendering to draw a progress bar.
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Don't flash the bar on navigations that were instant anyway. */
const SHOW_AFTER_MS = 150;
/** Give up and hide if a navigation never completes (aborted, error boundary). */
const GIVE_UP_MS = 15000;

export default function RouteProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [pct, setPct] = useState(0);

  // Timers live in refs so a re-render never leaves one dangling.
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creep = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(false);

  function clearAll() {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    if (creep.current) clearInterval(creep.current);
    showTimer.current = giveUpTimer.current = creep.current = null;
  }

  useEffect(() => {
    function begin() {
      if (started.current) return;
      started.current = true;
      showTimer.current = setTimeout(() => {
        setVisible(true);
        setPct(8);
        // Ease toward 90% and stop. The bar must never reach 100% on its own —
        // completion is a fact about the navigation, not a guess about timing.
        creep.current = setInterval(() => {
          setPct((p) => (p >= 90 ? p : p + Math.max(0.4, (90 - p) / 18)));
        }, 120);
      }, SHOW_AFTER_MS);
      giveUpTimer.current = setTimeout(() => {
        started.current = false;
        clearAll();
        setVisible(false);
        setPct(0);
      }, GIVE_UP_MS);
    }

    function onClick(e: MouseEvent) {
      // Only plain left-clicks navigate; anything modified opens a new context.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as HTMLElement | null)?.closest?.("a");
      if (!el) return;
      const a = el as HTMLAnchorElement;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      // Same-document jumps and non-navigations shouldn't draw a loading bar.
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      begin();
    }

    // Back/forward can be slow for the same reason a click can be.
    function onPop() {
      begin();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      clearAll();
    };
  }, []);

  // The new route committed: finish, then get out of the way.
  useEffect(() => {
    if (!started.current) return;
    started.current = false;
    clearAll();
    setPct(100);
    const t = setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 260);
    return () => clearTimeout(t);
    // Intentionally keyed on pathname only — see the useSearchParams note above.
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-busy="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 300,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "linear-gradient(90deg, #6366F1, #8B5CF6)",
          boxShadow: "0 0 10px rgba(99,102,241,.6)",
          transition: pct === 100 ? "width .2s ease-out, opacity .2s ease-out .06s" : "width .25s ease-out",
          opacity: pct === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
