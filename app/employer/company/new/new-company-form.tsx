"use client";

/**
 * The create-a-company form. See page.tsx for why it has a screen to itself.
 *
 * On success the server has already made the new company the ACTIVE one (it
 * sets the cookie — see lib/company/active.ts), so this does a full
 * navigation to /employer rather than a client-side push: every surface in
 * the employer area reads that cookie independently on mount, and a soft
 * transition would leave the rail showing the old company.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, GRAD, FONT, Icon, BrandMark } from "@/app/_components/ui";

type Field = "name" | "tagline" | "location" | "website";

const FIELDS: { k: Field; label: string; placeholder?: string }[] = [
  { k: "name", label: "Company name *" },
  { k: "tagline", label: "Tagline", placeholder: "One line on what you do" },
  { k: "location", label: "Location", placeholder: "City, Country" },
  { k: "website", label: "Website", placeholder: "yourcompany.com" },
];

export default function NewCompanyForm() {
  const [form, setForm] = useState({ name: "", tagline: "", about: "", website: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only to name the way back ("Back to Rodeo Graphics"). Absent on a first
  // company, and the link then simply says the employer area.
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/company", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrent(d?.company?.name ?? null))
      .catch(() => {});
  }, []);

  async function create() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      window.location.href = "/employer";
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't create the company — try again.");
      setSaving(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <Link href="/" style={S.brand}><BrandMark size={20} /><span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.3px" }}>topezia</span></Link>
        <div style={{ flex: 1 }} />
        <Link href="/employer" style={S.back}>
          <Icon name="chev" size={14} />
          {current ? `Back to ${current}` : "Back"}
        </Link>
      </div>

      <div style={S.card}>
        <span style={S.mark}><Icon name="briefcase" size={20} /></span>
        <h1 style={S.h1}>Create a company</h1>
        <p style={S.sub}>
          It gets its own public page, postings, plan and team — separate from{" "}
          {current ? <b>{current}</b> : "your job search"}. You can switch between your companies any time from the
          sidebar or your account menu.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); void create(); }}
        >
          {FIELDS.map((f) => (
            <div key={f.k} style={{ marginBottom: 12 }}>
              <div style={S.label}>{f.label}</div>
              <input
                style={S.input}
                value={form[f.k]}
                placeholder={f.placeholder}
                autoFocus={f.k === "name"}
                onChange={(e) => setForm((v) => ({ ...v, [f.k]: e.target.value }))}
              />
            </div>
          ))}
          <div style={S.label}>About</div>
          <textarea
            style={{ ...S.input, resize: "vertical" }}
            rows={4}
            value={form.about}
            placeholder="What you build, how you work, why people join."
            onChange={(e) => setForm((v) => ({ ...v, about: e.target.value }))}
          />

          {error && <div style={S.err}>{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button type="submit" disabled={saving || !form.name.trim()} style={{ ...S.cta, opacity: saving || !form.name.trim() ? 0.55 : 1 }}>
              {saving ? "Creating…" : "Create company"}
            </button>
            <Link href="/employer" style={S.ghost}>Cancel</Link>
          </div>
          <p style={S.note}>Only the name is required — everything else can be filled in later.</p>
        </form>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#F8FAFC", fontFamily: FONT, color: C.ink },
  bar: { display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", maxWidth: 760, margin: "0 auto" },
  brand: { display: "flex", alignItems: "center", gap: 8, color: C.ink, textDecoration: "none" },
  back: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.mut, textDecoration: "none", transform: "none" },
  card: { maxWidth: 560, margin: "10px auto 60px", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "26px 28px 24px" },
  mark: { display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 13, background: GRAD, color: "#fff", marginBottom: 14 },
  h1: { fontSize: 23, fontWeight: 800, letterSpacing: "-0.6px", margin: "0 0 8px" },
  sub: { fontSize: 13.5, lineHeight: 1.65, color: C.mut, margin: "0 0 22px" },
  label: { fontSize: 12, fontWeight: 700, color: C.slate, margin: "0 0 5px" },
  input: { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", background: "#fff", color: C.ink },
  err: { color: "#b42318", fontSize: 13, marginTop: 12 },
  cta: { background: GRAD, color: "#fff", border: "none", borderRadius: 11, padding: "11px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  ghost: { display: "inline-flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 18px", fontSize: 13.5, fontWeight: 600, color: C.slate, textDecoration: "none", background: "#fff" },
  note: { fontSize: 12, color: C.mut, margin: "14px 0 0" },
};
