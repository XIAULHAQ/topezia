"use client";

/**
 * The app-wide error boundary. Shown in place of a page whose render threw.
 *
 * Two jobs: say something honest to the person (with a way to retry), and
 * put the failure in the error log so it is seen at the weekly review — a
 * page that quietly shows "Something went wrong" to a visitor and tells
 * nobody is how bugs live for months. Reported through the same /api/errors
 * as ErrorReporter, deduplicated by Next's own error digest.
 */
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      const body = JSON.stringify({
        message: `[page] ${error.message || "Render error"}${error.digest ? ` (digest ${error.digest})` : ""}`,
        stack: error.stack ?? null,
        path: location.pathname,
      });
      void fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    } catch {
      /* never */
    }
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", color: "#0F172A" }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Something broke on this page</h1>
        <p style={{ color: "#64748B", fontSize: 14.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          It&apos;s been logged and will be looked at. You can try again, or head back to the start.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button type="button" onClick={reset} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#4F46E5", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Try again</button>
          <a href="/" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #E2E8F0", color: "#0F172A", fontWeight: 600, textDecoration: "none" }}>Home</a>
        </div>
      </div>
    </div>
  );
}
