"use client";

/**
 * The Premium purchase button — rendered ONLY when billing is live (the
 * server page checks). Redirects to Stripe-hosted Checkout; for members who
 * are already Premium it becomes the door to Stripe's Billing Portal
 * (card, invoices, cancel).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

const GRAD = "linear-gradient(135deg,#6366F1,#8B5CF6)";

export default function UpgradeButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [premium, setPremium] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Quietly learn the viewer's tier so an existing subscriber sees
    // "Manage billing" instead of a second buy button. Signed-out viewers
    // 401 here and simply keep the upgrade label.
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.profile?.tier === "PREMIUM") setPremium(true); })
      .catch(() => {});
  }, []);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(premium ? "/api/billing/portal" : "/api/billing/checkout", { method: "POST" });
      if (res.status === 401) { router.push("/login?next=/pricing"); return; }
      const d = await res.json().catch(() => null);
      if (res.ok && d?.url) { window.location.assign(d.url); return; }
      if (res.status === 409) { setPremium(true); setBusy(false); return; } // already premium — flip the button
      setError(d?.error ?? "Something went wrong — try again.");
      setBusy(false);
    } catch {
      setError("Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" onClick={go} disabled={busy} style={{ ...S.btn, opacity: busy ? 0.7 : 1 }}>
        {busy ? "One moment…" : premium ? "Manage billing" : "Upgrade to Premium →"}
      </button>
      {error && <div style={{ fontSize: 12.5, color: "#b42318", fontWeight: 600, textAlign: "center" }}>{error}</div>}
      <div style={{ fontSize: 11.5, color: "#6b7280", textAlign: "center", lineHeight: 1.5 }}>
        Secure checkout by Stripe. Cancel anytime — you keep Premium until the period ends.
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  btn: { background: GRAD, color: "#fff", border: "none", borderRadius: 11, padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%" },
};
