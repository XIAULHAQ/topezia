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
type State = {
  plan: Limits;
  planUntil: string | null;
  hasBillingHistory: boolean;
  billingLive: boolean;
  free: Limits;
  plans: SellablePlan[];
};

const n = (v: number) => v.toLocaleString();

export default function BillingClient() {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
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
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
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
        </ul>
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
                      onClick={() => go({ plan: p.id, period }, p.id)}>
                      {busy === p.id ? "Opening checkout…" : `Choose ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ ...ES.empty, marginTop: 14 }}>
            Payment is handled by Stripe — your card never touches Topezia. Cancel any time from Manage billing;
            you keep the plan until the period you paid for ends.
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
