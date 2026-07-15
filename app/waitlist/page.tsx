"use client";

/**
 * Public founding-employer waitlist page — implements the copy and form
 * fields from topezia-founding-employer-landing-page.md, posts to
 * /api/waitlist. Kept to inline styles + brand tokens (no Tailwind
 * dependency assumed) so it runs the moment this scaffold is deployed.
 */
import { useState } from "react";

const BRAND = {
  gradientFrom: "#6366F1",
  gradientTo: "#8B5CF6",
  ink: "#0F172A",
  slate: "#334155",
  muted: "#64748B",
  bg: "#F1F5F9",
  white: "#FFFFFF",
};

const VERTICALS = [
  { slug: "tech-software", label: "Tech & Software" },
  { slug: "marketing-creative", label: "Marketing & Creative" },
  { slug: "healthcare-allied", label: "Healthcare" },
  { slug: "trucking-logistics", label: "Trucking & Logistics" },
  { slug: "other", label: "Other" },
];

const HIRING_VOLUMES = [
  { value: "ONE_TO_FIVE", label: "1–5 roles" },
  { value: "SIX_TO_TWENTY", label: "6–20 roles" },
  { value: "TWENTY_PLUS", label: "20+ roles" },
];

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; isFoundingMember: boolean; foundingRank: number | null }
  | { status: "error"; message: string };

export default function WaitlistPage() {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    careersPageUrl: "",
    hiringVolume: "",
    verticalSlug: "",
  });
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: data.error || "Something went wrong." });
        return;
      }
      setState({
        status: "success",
        isFoundingMember: data.isFoundingMember,
        foundingRank: data.foundingRank,
      });
    } catch {
      setState({ status: "error", message: "Network error — try again in a moment." });
    }
  }

  if (state.status === "success") {
    return (
      <main style={styles.page}>
        <div style={{ ...styles.card, textAlign: "center", maxWidth: 480 }}>
          <p style={styles.eyebrow}>
            {state.isFoundingMember ? "You're in" : "Request received"}
          </p>
          <h1 style={{ ...styles.h1, marginBottom: 12 }}>
            {state.isFoundingMember
              ? `Welcome, founding employer #${state.foundingRank}`
              : "You're on the waitlist"}
          </h1>
          <p style={{ color: BRAND.muted, fontSize: 15, lineHeight: 1.6 }}>
            {state.isFoundingMember
              ? "We'll index your careers page ahead of launch and follow up with your founding-employer badge details."
              : "Our first 100 founding-employer slots are filled, but you're on the list — we'll reach out as soon as we open general employer access."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <p style={styles.eyebrow}>Now accepting the first 100 founding employers</p>
        <h1 style={styles.h1}>
          Get your open roles in front of pre-matched candidates — for free.
        </h1>
        <p style={{ color: BRAND.muted, fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
          Topezia is an AI job-matching engine launching soon. Founding employers get
          priority placement and free premium access for up to 24 months after launch.
        </p>

        <form onSubmit={handleSubmit} style={styles.card}>
          <Field label="Company name" required>
            <input
              style={styles.input}
              required
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
            />
          </Field>

          <Field label="Your name" required>
            <input
              style={styles.input}
              required
              value={form.contactName}
              onChange={(e) => update("contactName", e.target.value)}
            />
          </Field>

          <Field label="Work email" required>
            <input
              type="email"
              style={styles.input}
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>

          <Field label="Phone (optional)">
            <input
              style={styles.input}
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </Field>

          <Field label="Careers page URL" required>
            <input
              type="url"
              placeholder="https://yourcompany.com/careers"
              style={styles.input}
              required
              value={form.careersPageUrl}
              onChange={(e) => update("careersPageUrl", e.target.value)}
            />
          </Field>

          <Field label="Roughly how many roles are you hiring for right now?">
            <select
              style={styles.input}
              value={form.hiringVolume}
              onChange={(e) => update("hiringVolume", e.target.value)}
            >
              <option value="">Select one</option>
              {HIRING_VOLUMES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Industry">
            <select
              style={styles.input}
              value={form.verticalSlug}
              onChange={(e) => update("verticalSlug", e.target.value)}
            >
              <option value="">Select one</option>
              {VERTICALS.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>

          {state.status === "error" && (
            <p style={{ color: "#DC2626", fontSize: 13, marginBottom: 12 }}>{state.message}</p>
          )}

          <button
            type="submit"
            disabled={state.status === "loading"}
            style={styles.button}
          >
            {state.status === "loading" ? "Submitting…" : "Claim founding status →"}
          </button>
          <p style={{ textAlign: "center", fontSize: 12, color: BRAND.muted, marginTop: 10 }}>
            No cost, ever, to join the waitlist.
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: BRAND.slate, marginBottom: 5 }}>
        {label} {required && <span style={{ color: "#DC2626" }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: BRAND.bg,
    display: "flex",
    justifyContent: "center",
    padding: "64px 20px",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    color: BRAND.ink,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: BRAND.gradientFrom,
    marginBottom: 10,
  },
  h1: {
    fontFamily: "'Sora', system-ui, sans-serif",
    fontWeight: 800,
    fontSize: 32,
    lineHeight: 1.2,
    marginBottom: 12,
  },
  card: {
    background: BRAND.white,
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
    margin: "0 auto",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    fontSize: 14,
    fontFamily: "inherit",
    color: BRAND.ink,
  },
  button: {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    border: "none",
    background: `linear-gradient(135deg, ${BRAND.gradientFrom}, ${BRAND.gradientTo})`,
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 6,
  },
};
