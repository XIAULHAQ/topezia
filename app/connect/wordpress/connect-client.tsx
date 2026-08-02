"use client";

/**
 * The four screens of the WordPress connect flow: expired, sign in, approve,
 * done. One component because they are one journey — a person who lands on
 * "sign in" walks straight into "approve" without a page they can lose.
 *
 * Self-contained styling, like the other standalone flows. This page is
 * reached from inside someone's wp-admin and is judged in about a second:
 * it has to look like a permission screen from a company you'd trust, not
 * like a form.
 */
import { useState } from "react";
import type { WpSiteDetails } from "@/lib/wordpress/connect";

export type PlanChoice = {
  id: string;
  name: string;
  price: string;
  per: string;
  feats: string[];
  forSale: boolean;
};

export type ConnectView =
  | { kind: "expired" }
  | { kind: "signin"; host: string; detected: WpSiteDetails; next: string }
  | {
      kind: "approve";
      state: string;
      host: string;
      siteUrl: string;
      back: string | null;
      detected: WpSiteDetails;
      plans: PlanChoice[];
      plan: string;
      company: { name: string; hasTagline: boolean; hasAbout: boolean; hasLocation: boolean; hasLogo: boolean } | null;
    }
  | { kind: "done"; host: string; back: string | null; companyName: string | null; plans: PlanChoice[]; plan: string };

const INK = "#0F172A";
const MUT = "#64748B";
const LINE = "#E2E8F0";
const BRAND = "#4F46E5";

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#F8FAFC 0%,#EEF2FF 100%)",
    padding: "40px 20px 64px",
    fontFamily: "inherit",
    color: INK,
  } as const,
  shell: { maxWidth: 680, margin: "0 auto" } as const,
  card: {
    background: "#fff",
    border: `1px solid ${LINE}`,
    borderRadius: 18,
    padding: 28,
    boxShadow: "0 10px 30px rgba(15,23,42,.06)",
  } as const,
  h1: { fontSize: 25, fontWeight: 800, letterSpacing: "-0.6px", margin: "0 0 8px" } as const,
  sub: { fontSize: 14, color: MUT, lineHeight: 1.65, margin: 0 } as const,
  label: { fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: MUT },
  btn: {
    background: BRAND,
    color: "#fff",
    border: "none",
    borderRadius: 11,
    padding: "13px 20px",
    fontSize: 14.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
  } as const,
  ghost: {
    background: "#fff",
    color: INK,
    border: `1px solid ${LINE}`,
    borderRadius: 11,
    padding: "12px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    textDecoration: "none",
    display: "inline-block",
  } as const,
  err: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    borderRadius: 11,
    padding: "11px 14px",
    fontSize: 13,
    margin: "0 0 16px",
  } as const,
};

function Mark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22 }}>
      <span
        style={{
          width: 30, height: 30, borderRadius: 9, background: BRAND, color: "#fff",
          display: "grid", placeItems: "center", fontWeight: 800, fontSize: 15,
        }}
      >
        T
      </span>
      <b style={{ fontSize: 15.5, letterSpacing: "-0.3px" }}>Topezia</b>
    </div>
  );
}

/** One detected field, with a switch to refuse it. */
function Field({
  label, value, on, onChange, note,
}: {
  label: string;
  value: string | null;
  on: boolean;
  onChange: (v: boolean) => void;
  note?: string;
}) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: `1px solid #F1F5F9` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.label}>{label}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 3, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
          {value.length > 260 ? `${value.slice(0, 260)}…` : value}
        </div>
        {note && <div style={{ fontSize: 12, color: MUT, marginTop: 4 }}>{note}</div>}
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 7, cursor: "pointer", flex: "none", paddingTop: 2 }}>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span style={{ fontSize: 12.5, color: MUT }}>Use</span>
      </label>
    </div>
  );
}

function PlanCards({ plans, current }: { plans: PlanChoice[]; current: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 14 }}>
      {plans.map((p) => (
        <div
          key={p.id}
          style={{
            border: `1px solid ${p.id === current ? "#C7D2FE" : LINE}`,
            background: p.id === current ? "#EEF2FF" : "#fff",
            borderRadius: 13,
            padding: 15,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{p.name}</b>
            {p.id === current && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, background: "#fff", border: `1px solid #C7D2FE`, borderRadius: 999, padding: "2px 7px" }}>
                Yours
              </span>
            )}
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", marginTop: 5 }}>
            {p.price}
            <span style={{ fontSize: 11.5, fontWeight: 600, color: MUT, marginLeft: 3 }}>{p.per}</span>
          </div>
          <ul style={{ margin: "9px 0 0", paddingLeft: 16, color: "#475569", fontSize: 12, lineHeight: 1.75 }}>
            {p.feats.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ConnectClient({ view }: { view: ConnectView }) {
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ pages: number; company: string } | null>(null);

  const on = (k: string) => accept[k] !== false;
  const set = (k: string) => (v: boolean) => setAccept((a) => ({ ...a, [k]: v }));

  if (view.kind === "expired") {
    return (
      <main style={S.page}>
        <div style={S.shell}>
          <Mark />
          <div style={S.card}>
            <h1 style={S.h1}>This link has expired</h1>
            <p style={S.sub}>
              Connection links last an hour, so an abandoned one can&apos;t be picked up later by someone else.
              Go back to <b>Topezia</b> in your WordPress admin and press Connect again — it takes a second.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (view.kind === "signin") {
    const d = view.detected;
    return (
      <main style={S.page}>
        <div style={S.shell}>
          <Mark />
          <div style={S.card}>
            <h1 style={S.h1}>Connect {view.host}</h1>
            <p style={S.sub}>
              Your WordPress site is asking to add the Topezia chat. Create an account or sign in and you&apos;ll
              be back here to confirm — nothing is saved until you do.
            </p>
            <div style={{ background: "#F8FAFC", border: `1px solid ${LINE}`, borderRadius: 13, padding: "14px 16px", margin: "18px 0" }}>
              <div style={S.label}>What your site sent</div>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.75, marginTop: 6 }}>
                {[d.name && `Site name: ${d.name}`, d.tagline && `Tagline: ${d.tagline}`, d.email && `Contact email: ${d.email}`, d.logoUrl && "Your logo", d.store === "woocommerce" && "WooCommerce is active"]
                  .filter(Boolean)
                  .map((line) => <div key={String(line)}>{line}</div>)}
              </div>
            </div>
            <a href={`/login?next=${encodeURIComponent(view.next)}`} style={{ ...S.btn, display: "block", textAlign: "center", textDecoration: "none" }}>
              Continue
            </a>
            <p style={{ ...S.sub, fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
              Free forever on one website. No card.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (view.kind === "done" || result) {
    const back = view.kind === "done" ? view.back : (view as Extract<ConnectView, { kind: "approve" }>).back;
    const host = view.host;
    const plans = view.kind === "done" ? view.plans : (view as Extract<ConnectView, { kind: "approve" }>).plans;
    const plan = view.kind === "done" ? view.plan : (view as Extract<ConnectView, { kind: "approve" }>).plan;
    return (
      <main style={S.page}>
        <div style={S.shell}>
          <Mark />
          <div style={S.card}>
            <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 12 }}>✓</div>
            <h1 style={S.h1}>{host} is connected</h1>
            <p style={S.sub}>
              {result
                ? result.pages > 0
                  ? `We read ${result.pages} page${result.pages === 1 ? "" : "s"} of your website. The chat can answer from them now.`
                  : "Your website is set up. The first scan didn't find pages it could read — you can run it again from your dashboard."
                : "The chat is set up on this website."}
            </p>
            <p style={{ ...S.sub, marginTop: 10 }}>
              Go back to WordPress and the plugin will finish the last step by itself. The chat bubble appears on
              your site straight away.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              {back && <a href={back} style={{ ...S.btn, width: "auto", textDecoration: "none", display: "inline-block" }}>Back to WordPress</a>}
              <a href="/employer/widget" style={S.ghost}>Open my dashboard</a>
            </div>

            <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 24, paddingTop: 18 }}>
              <div style={S.label}>Your plan</div>
              <PlanCards plans={plans} current={plan} />
              <p style={{ ...S.sub, fontSize: 12.5, marginTop: 12 }}>
                You&apos;re on {plans.find((p) => p.id === plan)?.name ?? "Free"} and nothing needs changing today.
                Upgrade whenever the AI answers run short — <a href="/employer/billing" style={{ color: BRAND }}>see the plans</a>.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Approve ──────────────────────────────────────────────────────────
  const v = view as Extract<ConnectView, { kind: "approve" }>;
  const d = v.detected;
  const fresh = !v.company;

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/wordpress/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: v.state, accept }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; crawl?: { pages: number } | null; company?: { name: string } };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That didn't work — try again.");
        return;
      }
      setResult({ pages: data.crawl?.pages ?? 0, company: data.company?.name ?? "" });
    } catch {
      setError("That didn't work — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={S.page}>
      <div style={S.shell}>
        <Mark />
        <div style={S.card}>
          <h1 style={S.h1}>Add the chat to {v.host}?</h1>
          <p style={S.sub}>
            {fresh
              ? "We'll set up your company on Topezia from what your website already says, add the chat to this site and read your pages so it can answer questions about them."
              : `We'll add this website to ${v.company!.name} and read its pages so the chat can answer from them.`}
          </p>

          {error && <p style={{ ...S.err, marginTop: 16 }}>{error}</p>}

          <div style={{ marginTop: 20 }}>
            <div style={S.label}>What your site told us</div>
            <div style={{ marginTop: 4 }}>
              <Field label="Company name" value={fresh ? d.name : null} on={on("name")} onChange={set("name")} />
              <Field
                label="Tagline"
                value={!v.company?.hasTagline ? d.tagline : null}
                on={on("tagline")}
                onChange={set("tagline")}
              />
              <Field
                label="About"
                value={!v.company?.hasAbout ? d.about : null}
                on={on("about")}
                onChange={set("about")}
              />
              <Field
                label="Location"
                value={!v.company?.hasLocation ? d.address : null}
                on={on("address")}
                onChange={set("address")}
              />
              <Field
                label="Logo"
                value={!v.company?.hasLogo && d.logoUrl ? d.logoUrl : null}
                on={on("logo")}
                onChange={set("logo")}
                note="Copied to Topezia so your company page doesn't depend on your media library."
              />
            </div>

            {!fresh && (
              <p style={{ ...S.sub, fontSize: 12.5, marginTop: 12 }}>
                Anything you&apos;ve already written on your Topezia profile stays exactly as it is — only empty
                fields are offered here.
              </p>
            )}
            {d.store === "woocommerce" && (
              <p style={{ ...S.sub, fontSize: 12.5, marginTop: 10 }}>
                WooCommerce detected. The chat can recommend products and hand shoppers to your own checkout —
                order tracking stays off until you connect the store yourself.
              </p>
            )}
          </div>

          <div style={{ marginTop: 22 }}>
            <button type="button" style={{ ...S.btn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={approve}>
              {busy ? "Setting it up and reading your pages…" : "Connect and scan my site"}
            </button>
            {busy && (
              <p style={{ ...S.sub, fontSize: 12.5, marginTop: 10, textAlign: "center" }}>
                Reading up to {PAGES_HINT} pages. This can take a minute — leave the tab open.
              </p>
            )}
          </div>

          <p style={{ ...S.sub, fontSize: 12, marginTop: 16 }}>
            You can disconnect at any time from WordPress or from your Topezia dashboard.{" "}
            <a href="/privacy" style={{ color: MUT, textDecoration: "underline" }}>Privacy</a> ·{" "}
            <a href="/terms" style={{ color: MUT, textDecoration: "underline" }}>Terms</a>
          </p>
        </div>

        <div style={{ ...S.card, marginTop: 16 }}>
          <div style={S.label}>Plans</div>
          <PlanCards plans={v.plans} current={v.plan} />
          <p style={{ ...S.sub, fontSize: 12.5, marginTop: 12 }}>
            You&apos;ll start on {v.plans.find((p) => p.id === v.plan)?.name ?? "Free"}. Nothing to pay now, and
            no card — the chat works, captures leads and emails you either way.
          </p>
        </div>
      </div>
    </main>
  );
}

/** Free-tier page budget, quoted so the wait has a reason. */
const PAGES_HINT = 60;
