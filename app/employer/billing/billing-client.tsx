"use client";

/**
 * The company's plan: what it is now, and what else is on sale.
 *
 * Prices come from Stripe, never from here — a plan whose price Stripe
 * doesn't return is shown as not-for-sale rather than as a button that
 * fails at checkout. Same house rule as everywhere else: no upsell for
 * something that can't actually be bought.
 */
import { useEffect, useState } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerSection";

type Limits = {
  id: "FREE" | "PRO" | "STUDIO";
  name: string;
  sites: number;
  pages: number;
  aiRepliesPerMonth: number;
  facts: number;
  branded: boolean;
  aiAssist: boolean;
  theming: boolean;
};
type SellablePlan = Limits & {
  forSale: boolean;
  monthly: { amount: number; label: string } | null;
  yearly: { amount: number; label: string } | null;
};
type Coupon = { amountOff: number; currency: string; label: string } | null;
type State = {
  plan: Limits;
  planUntil: string | null;
  hasBillingHistory: boolean;
  billingLive: boolean;
  free: Limits;
  plans: SellablePlan[];
  branding: { offered: boolean; on: boolean; monthly: Coupon; yearly: Coupon };
};

const n = (v: number) => v.toLocaleString();

export default function BillingClient() {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [keepBranding, setKeepBranding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/company/billing", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { setGate("auth"); return null; }
        if (res.status === 409) { setGate("company"); return null; }
        if (!res.ok) throw new Error();
        return res.json() as Promise<State>;
      })
      .then((d) => { if (d) setState(d); })
      .catch(() => setError("Couldn't load your plan."));
  }, []);

  async function go(payload: Record<string, unknown>, key: string) {
    if (busy) return;
    setBusy(key); setError(null);
    try {
      const res = await fetch("/api/company/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; portal?: boolean };
      if (data.url) { window.location.href = data.url; return; }
      if (res.ok) { window.location.reload(); return; }
      // The answer to this one is "go to the portal" — so go, rather than
      // printing a sentence that leaves them looking for the door.
      if (data.portal && payload.action !== "portal") {
        const p = await fetch("/api/company/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "portal" }),
        });
        const pd = (await p.json().catch(() => ({}))) as { url?: string };
        if (pd.url) { window.location.href = pd.url; return; }
      }
      setError(data.error ?? "That didn't work — try again.");
    } catch {
      setError("That didn't work — try again.");
    } finally {
      setBusy(null);
    }
  }

  if (gate) return <EmployerGate title="Plan" reason={gate} what="your plan" />;
  if (!state) {
    return (
      <EmployerSection title="Plan">
        <div style={ES.card}><p style={ES.empty}>{error ?? "Loading…"}</p></div>
      </EmployerSection>
    );
  }

  const current = state.plan;
  const onFree = current.id === "FREE";
  const anyForSale = state.plans.some((p) => p.forSale);

  const rows = (p: Limits) => [
    `${p.sites === 1 ? "1 website" : `${p.sites} websites`}`,
    `${n(p.aiRepliesPerMonth)} AI answers a month${p.sites > 1 ? ", shared" : ""}`,
    `${n(p.pages)} pages scanned`,
    `Teach it ${n(p.facts)} answers`,
    p.aiAssist ? "Drafted replies, weekly digest, intake briefs" : "Leads, inbox and deal tracking",
    p.branded ? "Small Topezia line on the chat" : "No Topezia branding, your own colour",
  ];

  return (
    <EmployerSection
      title="Plan"
      subtitle="What your site chat can do, and what it costs. Leads, your inbox and deal tracking are free forever — the plans buy AI capacity."
    >
      {error && <p style={ES.error}>{error}</p>}

      <div style={{ ...ES.card, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={onFree ? ES.pillDraft : ES.pillLive}>{current.name}</span>
          <span style={{ ...ES.empty, flex: 1, minWidth: 200 }}>
            {onFree
              ? "You're on the free plan. Everything below the AI limits keeps working forever."
              : state.planUntil
                ? `Renews ${new Date(state.planUntil).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.`
                : "Active."}
          </span>
          {state.hasBillingHistory && (
            <button type="button" style={ES.btnGhost} disabled={busy === "portal"} onClick={() => go({ action: "portal" }, "portal")}>
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>
        <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: "#475569", fontSize: 13, lineHeight: 1.9 }}>
          {rows(current).map((r) => <li key={r}>{r}</li>)}
          {state.branding.on && <li>Showing &ldquo;AI chat powered by Topezia&rdquo; for the discount</li>}
        </ul>
        {!onFree && state.branding.offered && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #F1F5F9", marginTop: 14, paddingTop: 12 }}>
            <span style={{ ...ES.empty, flex: 1, minWidth: 200 }}>
              {state.branding.on
                ? "You're getting the discount for keeping our line on your chat."
                : "Keep a small “AI chat powered by Topezia” line on your chat and pay less."}
            </span>
            <button type="button" style={state.branding.on ? ES.btnGhost : ES.btn}
              disabled={busy === "branding"}
              onClick={() => go({ action: "branding", keepBranding: !state.branding.on }, "branding")}>
              {busy === "branding" ? "Saving…" : state.branding.on ? "Remove the line" : "Keep it and save"}
            </button>
          </div>
        )}
      </div>

      {!state.billingLive ? (
        <div style={ES.card}>
          <p style={{ ...ES.empty, margin: 0 }}>
            Paid plans aren&apos;t switched on yet. Everything on the free plan keeps working.
          </p>
        </div>
      ) : anyForSale ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
            {(["month", "year"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                style={{ border: "1px solid", borderColor: period === p ? "#C7D2FE" : "#E2E8F0", background: period === p ? "#EEF2FF" : "#fff",
                         color: period === p ? "#4F46E5" : "#64748B", borderRadius: 999, padding: "7px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {p === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
            {period === "year" && <span style={{ ...ES.empty }}>Two months free.</span>}
          </div>

          {state.branding.offered && (period === "year" ? state.branding.yearly : state.branding.monthly) && (
            <label style={{
              display: "flex", gap: 11, alignItems: "flex-start", cursor: "pointer",
              border: "1px solid #A7F3D0", background: "#ECFDF5", borderRadius: 12, padding: "12px 14px", marginBottom: 14,
            }}>
              <input type="checkbox" checked={keepBranding} onChange={(e) => setKeepBranding(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                <b style={{ fontSize: 13, color: "#065F46" }}>
                  Keep &ldquo;AI chat powered by Topezia&rdquo; and save{" "}
                  {(period === "year" ? state.branding.yearly : state.branding.monthly)!.label}
                  {period === "year" ? " a year" : " a month"}
                </b>
                <span style={{ display: "block", fontSize: 12, color: "#047857", lineHeight: 1.6, marginTop: 3 }}>
                  A small credit line at the bottom of your chat, linking back to us. Everything else about your
                  plan is unchanged, and you can turn it off any time — the discount stops when the line does.
                </span>
              </span>
            </label>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
            {state.plans.map((p) => {
              const price = period === "year" ? p.yearly : p.monthly;
              const isCurrent = p.id === current.id;
              return (
                <div key={p.id} style={{ ...ES.card, margin: 0, opacity: p.forSale ? 1 : 0.6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15 }}>{p.name}</b>
                    {isCurrent && <span style={ES.pillLive}>Current</span>}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: "8px 0 2px" }}>
                    {price ? price.label : "—"}
                  </div>
                  <ul style={{ margin: "12px 0 14px", paddingLeft: 18, color: "#475569", fontSize: 12.8, lineHeight: 1.85 }}>
                    {rows(p).map((r) => <li key={r}>{r}</li>)}
                  </ul>
                  {isCurrent ? (
                    <button type="button" style={{ ...ES.btnGhost, width: "100%" }} disabled>On this plan</button>
                  ) : !price ? (
                    <p style={{ ...ES.empty, margin: 0 }}>Not on sale yet.</p>
                  ) : (
                    <button type="button" style={{ ...ES.btn, width: "100%" }}
                      disabled={busy === p.id}
                      onClick={() => go({ plan: p.id, period, keepBranding }, p.id)}>
                      {busy === p.id
                        ? "Opening…"
                        : onFree ? `Choose ${p.name}` : `Switch to ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ ...ES.empty, marginTop: 14 }}>
            {onFree
              ? "Payment is handled by Stripe — your card never touches Topezia. Cancel any time from Manage billing; you keep the plan until the period you paid for ends."
              : "Switching moves your existing subscription rather than starting a second one — Stripe shows you the exact amount, with the unused part of this period credited, before anything is charged."}
          </p>
        </>
      ) : (
        <div style={ES.card}>
          <p style={{ ...ES.empty, margin: 0 }}>Paid plans aren&apos;t on sale yet. The free plan keeps working as it is.</p>
        </div>
      )}
    </EmployerSection>
  );
}
