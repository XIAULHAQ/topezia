"use client";

/**
 * Employer dashboard: create/edit the company, list postings with live
 * pipeline counts, post new jobs/projects, close/reopen postings.
 */
import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, GRAD, FONT, Icon, Card } from "@/app/_components/ui";

type Company = { id: string; name: string; slug: string; tagline: string | null; about: string | null; website: string | null; location: string | null };
type Posting = {
  id: string; kind: string; titleRaw: string; status: string; createdAt: string;
  total: number; byStage: Record<string, number>;
};

export default function EmployerClient() {
  const [company, setCompany] = useState<Company | null>(null);
  const [postings, setPostings] = useState<Posting[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", tagline: "", about: "", website: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const c = await fetch("/api/company").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (c) { setCompany(c.company ?? null); setAuthed(c.authed ?? false); }
    else setAuthed(false);
    const p = await fetch("/api/postings").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setPostings(p?.postings ?? []);
  }
  useEffect(() => { load(); }, []);

  async function saveCompany() {
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/company", {
        method: company ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(p: Posting) {
    const status = p.status === "LIVE" ? "EXPIRED" : "LIVE";
    const res = await fetch(`/api/postings/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) setPostings((cur) => (cur ?? []).map((x) => (x.id === p.id ? { ...x, status } : x)));
  }

  const openEdit = () => {
    setForm({
      name: company?.name ?? "", tagline: company?.tagline ?? "", about: company?.about ?? "",
      website: company?.website ?? "", location: company?.location ?? "",
    });
    setEditing(true);
  };

  if (authed === false && !company) {
    return (
      <div style={{ maxWidth: 640, fontFamily: FONT }}>
        <h1 style={S.h1}>Post jobs &amp; projects</h1>
        <p style={{ color: C.mut, fontSize: 14, lineHeight: 1.65 }}>
          Posting needs a signed-in account — applicants deserve an employer they can hold to.
          {" "}<Link href="/login?next=/employer" style={{ color: C.c1, fontWeight: 700 }}>Sign in →</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <h1 style={S.h1}>{company ? company.name : "Post jobs & projects"}</h1>
          <p style={{ color: C.mut, fontSize: 14, margin: "4px 0 0", lineHeight: 1.55 }}>
            {company
              ? <>Your public page: <a href={`/company/${company.slug}`} style={{ color: C.c1, fontWeight: 600 }}>topezia.com/company/{company.slug}</a></>
              : "Set up your company page once — every posting hangs off it."}
          </p>
        </div>
        {company && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 9 }}>
            <button type="button" onClick={openEdit} style={S.ghost}>Edit company</button>
            <Link href="/employer/new" style={S.cta}><Icon name="plus" size={15} />Post a job or project</Link>
          </div>
        )}
      </div>

      {(!company || editing) && (
        <Card style={{ marginBottom: 22 }}>
          <h2 style={S.h2}>{company ? "Edit company" : "Create your company page"}</h2>
          {(["name", "tagline", "location", "website"] as const).map((k) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div style={S.label}>{k === "name" ? "Company name *" : k[0].toUpperCase() + k.slice(1)}</div>
              <input style={S.input} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                placeholder={k === "website" ? "yourcompany.com" : k === "tagline" ? "One line on what you do" : ""} />
            </div>
          ))}
          <div style={S.label}>About</div>
          <textarea style={{ ...S.input, resize: "vertical" }} rows={4} value={form.about} onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))} placeholder="What you build, how you work, why people join." />
          {error && <div style={{ color: "#b42318", fontSize: 13, marginTop: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
            <button type="button" onClick={saveCompany} disabled={saving} style={{ ...S.cta, border: "none", cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving…" : company ? "Save" : "Create company"}</button>
            {company && <button type="button" onClick={() => setEditing(false)} style={S.ghost}>Cancel</button>}
          </div>
        </Card>
      )}

      {company && postings !== null && (
        <>
          <h2 style={{ ...S.h2, margin: "0 0 12px" }}>Your postings</h2>
          {postings.length === 0 && (
            <Card><p style={{ color: C.mut, fontSize: 13.5, margin: 0 }}>Nothing yet. Your first posting goes live immediately — same feed, same honest matching as every other job here.</p></Card>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {postings.map((p) => (
              <div key={p.id} style={S.row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Link href={`/employer/${p.id}`} style={{ fontSize: 15, fontWeight: 700, color: C.ink, textDecoration: "none" }}>{p.titleRaw}</Link>
                    <span style={p.kind === "PROJECT" ? S.projTag : S.jobTag}>{p.kind === "PROJECT" ? "Project" : "Job"}</span>
                    <span style={p.status === "LIVE" ? S.liveTag : S.closedTag}>{p.status === "LIVE" ? "Live" : "Closed"}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mut, marginTop: 4 }}>
                    {p.total} {p.kind === "PROJECT" ? (p.total === 1 ? "proposal" : "proposals") : (p.total === 1 ? "applicant" : "applicants")}
                    {p.byStage.SHORTLISTED ? ` · ${p.byStage.SHORTLISTED} shortlisted` : ""}
                    {p.byStage.INTERVIEW ? ` · ${p.byStage.INTERVIEW} in interviews` : ""}
                    {p.byStage.SELECTED ? ` · ${p.byStage.SELECTED} selected` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flex: "none" }}>
                  <Link href={`/employer/${p.id}`} style={S.ghost}>Pipeline</Link>
                  <button type="button" onClick={() => toggleStatus(p)} style={S.ghost}>{p.status === "LIVE" ? "Close" : "Reopen"}</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: 0 },
  h2: { fontSize: 16, fontWeight: 700, margin: "0 0 14px" },
  label: { fontSize: 12, fontWeight: 700, color: C.slate, margin: "0 0 5px" },
  input: { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit" },
  cta: { background: GRAD, color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 13.5, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 },
  ghost: { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, color: C.slate, textDecoration: "none", cursor: "pointer", fontFamily: "inherit" },
  row: { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", flexWrap: "wrap" },
  jobTag: { fontSize: 11, fontWeight: 700, color: "#4F46E5", background: "#EEF2FF", borderRadius: 999, padding: "3px 9px" },
  projTag: { fontSize: 11, fontWeight: 700, color: "#7C3AED", background: "#F5F3FF", borderRadius: 999, padding: "3px 9px" },
  liveTag: { fontSize: 11, fontWeight: 700, color: "#047857", background: "#ECFDF5", borderRadius: 999, padding: "3px 9px" },
  closedTag: { fontSize: 11, fontWeight: 700, color: "#9A3412", background: "#FFF7ED", borderRadius: 999, padding: "3px 9px" },
};
