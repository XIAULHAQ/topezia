"use client";

/**
 * Sends uncaught browser errors to /api/errors so they land in the error log
 * (lib/errors/log.ts) next to the server's. Mounted once in the root layout;
 * renders nothing.
 *
 * Catches: uncaught exceptions (window "error"), unhandled promise rejections,
 * and — because React 18 reports render errors to the global handler too —
 * component crashes as well. Deduplicated per page load so a crash loop sends
 * one report, not one per frame. Nothing here can throw into the page.
 */
import { useEffect } from "react";

const seen = new Set<string>();

function report(message: string, stack: string | null) {
  try {
    if (!message) return;
    const key = message.slice(0, 120);
    if (seen.has(key) || seen.size > 20) return;
    seen.add(key);
    // Ignore noise that isn't ours: extensions, and cross-origin scripts
    // the browser reports only as "Script error." with no detail.
    if (/^Script error\.?$/.test(message) || /chrome-extension:|moz-extension:/.test(stack ?? "")) return;
    const body = JSON.stringify({ message, stack, path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/errors", new Blob([body], { type: "application/json" }));
    else void fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* never */
  }
}

export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => report(e.message || String(e.error ?? "Error"), e.error?.stack ?? null);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report(r instanceof Error ? r.message : typeof r === "string" ? r : "Unhandled promise rejection", r instanceof Error ? r.stack ?? null : null);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
