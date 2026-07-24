"use client";

/**
 * Resume Builder — editor on the left, live print-true preview on the right.
 *
 * Three deliberate calls:
 *  - "Download PDF" is window.print() over a print-scoped stylesheet. The
 *    preview IS the print area, so what you see is byte-for-byte what you get,
 *    and there is no PDF library to maintain. Every browser ships "Save as
 *    PDF" in its print dialog.
 *  - AI drafting is per-section and OPT-IN: it proposes, the person accepts
 *    into the draft, and nothing touches the server until Save. See the assist
 *    route for the grounding rules.
 *  - Saving is explicit, not auto: a resume is a document you finish, and a
 *    half-typed bullet auto-saving over a good one would be worse than a
 *    Save button. The dirty state is visible in the button.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { C, GRAD, Icon } from "@/app/_components/ui";
import { LIMITS, type ResumeContent, type ResumeExperience } from "@/lib/resume/doc";

type Busy = null | "save" | "summary" | `bullets-${number}`;

export default function ResumeClient() {
  const [doc, setDoc] = useState<ResumeContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/resume")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setDoc(d.content); if (d.saved) setSavedAt(d.updatedAt); })
      .catch(() => setError("Couldn't load your resume."));
  }, []);

  const up = useCallback((patch: Partial<ResumeContent>) => {
    setDoc((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }, []);

  if (error && !doc) return <p style={{ color: C.mut }}>{error}</p>;
  if (!doc) return <p style={{ color: C.mut }}>Loading your resume…</p>;

  const upContact = (k: keyof ResumeContent["contact"], v: string) => up({ contact: { ...doc.contact, [k]: v } });
  const upExp = (i: number, patch: Partial<ResumeExperience>) =>
    up({ experience: doc.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  async function save() {
    setBusy("save"); setError(null);
    try {
      const res = await fetch("/api/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: doc }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save.");
      setDirty(false);
      setSavedAt(d.updatedAt ?? new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function assist(kind: "summary" | "bullets", roleIndex = 0) {
    setBusy(kind === "summary" ? "summary" : `bullets-${roleIndex}`);
    setError(null);
    try {
      const res = await fetch("/api/resume/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, roleIndex, content: doc }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't draft that.");
      if (kind === "summary" && typeof d.summary === "string") up({ summary: d.summary });
      if (kind === "bullets" && Array.isArray(d.bullets)) {
        // Append rather than replace: drafted lines join what's written, and
        // deleting is one click — overwriting hand-written work is not.
        const cur = doc!.experience[roleIndex];
        upExp(roleIndex, { bullets: [...cur.bullets, ...d.bullets].slice(0, LIMITS.bulletsPerRole) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* ── Toolbar ── */}
      <div className="rb-toolbar" style={S.toolbar}>
        <div style={{ minWidth: 0 }}>
          <h1 style={S.h1}>Resume Builder</h1>
          <p style={S.subtle}>
            Started from your profile. The summary and bullets are yours to write — or ask AI to draft them from what we know, never inventing what we don&apos;t.
          </p>
        </div>
        <div style={{ display: "flex", gap: 9, flex: "none", alignItems: "center" }}>
          <button type="button" style={S.ghostBtn} onClick={() => window.print()}>
            <Icon name="doc" size={15} />Download PDF
          </button>
          <button type="button" style={dirty ? S.saveBtn : S.saveBtnIdle} onClick={save} disabled={busy === "save" || !dirty}>
            {/* A fresh seed has never been saved — don't claim it has. */}
            {busy === "save" ? "Saving…" : dirty ? "Save" : savedAt ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
      {error && <p style={{ color: "#DC2626", fontSize: 13, fontWeight: 600, margin: "0 0 14px" }}>{error}</p>}
      {!error && savedAt && !dirty && (
        <p style={{ ...S.subtle, margin: "0 0 14px" }}>Saved {new Date(savedAt).toLocaleString()}.</p>
      )}

      <div className="rb-grid" style={S.grid}>
        {/* ── Editor column ── */}
        <div className="rb-editor" style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section style={S.card}>
            <div style={S.cardLabel}>Contact</div>
            <div style={S.two}>
              <input style={S.input} placeholder="Full name" value={doc.contact.name} onChange={(e) => upContact("name", e.target.value)} />
              <input style={S.input} placeholder="Headline — e.g. Video Editor" value={doc.contact.headline} onChange={(e) => upContact("headline", e.target.value)} />
              <input style={S.input} placeholder="Location" value={doc.contact.location} onChange={(e) => upContact("location", e.target.value)} />
              <input style={S.input} placeholder="Email" type="email" value={doc.contact.email} onChange={(e) => upContact("email", e.target.value)} />
              <input style={S.input} placeholder="Phone" value={doc.contact.phone} onChange={(e) => upContact("phone", e.target.value)} />
              <input style={S.input} placeholder="Link — portfolio or LinkedIn" value={doc.contact.link} onChange={(e) => upContact("link", e.target.value)} />
            </div>
          </section>

          <section style={S.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ ...S.cardLabel, marginBottom: 0, flex: 1 }}>Professional summary</div>
              <button type="button" style={S.aiBtn} disabled={busy !== null} onClick={() => assist("summary")}>
                <Icon name="spark" size={13} />{busy === "summary" ? "Drafting…" : doc.summary ? "Redraft with AI" : "Write with AI"}
              </button>
            </div>
            <textarea
              style={S.textarea}
              rows={4}
              placeholder="Two or three sentences on who you are professionally and what you're strongest at."
              value={doc.summary}
              onChange={(e) => up({ summary: e.target.value.slice(0, LIMITS.summary) })}
            />
          </section>

          <section style={S.card}>
            <div style={S.cardLabel}>Experience</div>
            {doc.experience.map((ex, i) => (
              <div key={i} style={{ padding: "14px 0", borderTop: i > 0 ? `1px solid #F2F2F5` : "none" }}>
                <div style={S.two}>
                  <input style={S.input} placeholder="Job title" value={ex.title} onChange={(e) => upExp(i, { title: e.target.value })} />
                  <input style={S.input} placeholder="Company" value={ex.company} onChange={(e) => upExp(i, { company: e.target.value })} />
                </div>
                <input style={{ ...S.input, marginTop: 8, maxWidth: 220 }} placeholder="e.g. 2021–Present" value={ex.years} onChange={(e) => upExp(i, { years: e.target.value })} />

                {ex.bullets.map((b, bi) => (
                  <div key={bi} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      style={{ ...S.input, flex: 1 }}
                      value={b}
                      placeholder="Achievement — start with a verb"
                      onChange={(e) => upExp(i, { bullets: ex.bullets.map((x, j) => (j === bi ? e.target.value.slice(0, LIMITS.bullet) : x)) })}
                    />
                    <button type="button" aria-label="Remove bullet" style={S.x} onClick={() => upExp(i, { bullets: ex.bullets.filter((_, j) => j !== bi) })}>×</button>
                  </div>
                ))}

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {ex.bullets.length < LIMITS.bulletsPerRole && (
                    <button type="button" style={S.addBtn} onClick={() => upExp(i, { bullets: [...ex.bullets, ""] })}>+ Add bullet</button>
                  )}
                  <button type="button" style={S.aiBtn} disabled={busy !== null} onClick={() => assist("bullets", i)}>
                    <Icon name="spark" size={13} />{busy === `bullets-${i}` ? "Drafting…" : "Draft bullets with AI"}
                  </button>
                  <div style={{ flex: 1 }} />
                  <button type="button" style={S.removeRole} onClick={() => up({ experience: doc.experience.filter((_, j) => j !== i) })}>Remove role</button>
                </div>
              </div>
            ))}
            {doc.experience.length < LIMITS.roles && (
              <button type="button" style={{ ...S.addBtn, marginTop: 12 }} onClick={() => up({ experience: [...doc.experience, { title: "", company: "", years: "", bullets: [] }] })}>
                + Add experience
              </button>
            )}
          </section>

          <section style={S.card}>
            <div style={S.cardLabel}>Education</div>
            {doc.education.map((ed, i) => (
              <div key={i} style={{ ...S.two, marginBottom: 8 }}>
                <input style={S.input} placeholder="Degree" value={ed.degree} onChange={(e) => up({ education: doc.education.map((x, j) => (j === i ? { ...x, degree: e.target.value } : x)) })} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...S.input, flex: 1 }} placeholder="Institution" value={ed.institution} onChange={(e) => up({ education: doc.education.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)) })} />
                  <input style={{ ...S.input, width: 90, flex: "none" }} placeholder="Year" value={ed.year} onChange={(e) => up({ education: doc.education.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)) })} />
                  <button type="button" aria-label="Remove" style={S.x} onClick={() => up({ education: doc.education.filter((_, j) => j !== i) })}>×</button>
                </div>
              </div>
            ))}
            {doc.education.length < LIMITS.education && (
              <button type="button" style={S.addBtn} onClick={() => up({ education: [...doc.education, { degree: "", institution: "", year: "" }] })}>+ Add education</button>
            )}
          </section>

          <section style={S.card}>
            <div style={S.cardLabel}>Skills & certifications</div>
            <ChipEditor values={doc.skills} placeholder="Add a skill, then Enter" max={LIMITS.skills} onChange={(v) => up({ skills: v })} />
            <div style={{ height: 12 }} />
            <ChipEditor values={doc.certifications} placeholder="Add a certification, then Enter" max={LIMITS.certifications} onChange={(v) => up({ certifications: v })} />
          </section>
        </div>

        {/* ── Preview column — this exact node is what prints ── */}
        <div className="rb-preview-wrap" style={{ minWidth: 0 }}>
          <div id="resume-print" className="rb-preview" style={S.sheet}>
            <header style={{ borderBottom: "2px solid #111827", paddingBottom: 12, marginBottom: 14 }}>
              <div style={S.pName}>{doc.contact.name || "Your Name"}</div>
              {doc.contact.headline && <div style={S.pHeadline}>{doc.contact.headline}</div>}
              <div style={S.pMeta}>
                {[doc.contact.location, doc.contact.email, doc.contact.phone, doc.contact.link].filter(Boolean).join("  ·  ")}
              </div>
            </header>

            {doc.summary && (
              <PSection title="Summary"><p style={S.pBody}>{doc.summary}</p></PSection>
            )}

            {doc.experience.length > 0 && (
              <PSection title="Experience">
                {doc.experience.map((ex, i) => (
                  <div key={i} style={{ marginBottom: i < doc.experience.length - 1 ? 12 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <span style={S.pRole}>{[ex.title, ex.company].filter(Boolean).join(" — ")}</span>
                      {ex.years && <span style={S.pYears}>{ex.years}</span>}
                    </div>
                    {ex.bullets.length > 0 && (
                      <ul style={S.pUl}>
                        {ex.bullets.filter(Boolean).map((b, bi) => <li key={bi} style={S.pLi}>{b}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </PSection>
            )}

            {doc.education.length > 0 && (
              <PSection title="Education">
                {doc.education.map((ed, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                    <span style={S.pBody}>{[ed.degree, ed.institution].filter(Boolean).join(" — ")}</span>
                    {ed.year && <span style={S.pYears}>{ed.year}</span>}
                  </div>
                ))}
              </PSection>
            )}

            {doc.skills.length > 0 && (
              <PSection title="Skills"><p style={S.pBody}>{doc.skills.join("  ·  ")}</p></PSection>
            )}

            {doc.certifications.length > 0 && (
              <PSection title="Certifications"><p style={S.pBody}>{doc.certifications.join("  ·  ")}</p></PSection>
            )}
          </div>
          <p className="rb-hint" style={{ ...S.subtle, textAlign: "center", marginTop: 10 }}>
            Download PDF opens your browser&apos;s print dialog — choose &quot;Save as PDF&quot;.
          </p>
        </div>
      </div>
    </div>
  );
}

function PSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={S.pSectionTitle}>{title}</div>
      {children}
    </section>
  );
}

function ChipEditor({ values, placeholder, max, onChange }: { values: string[]; placeholder: string; max: number; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v || values.length >= max) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setInput("");
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: values.length ? 8 : 0 }}>
        {values.map((v) => (
          <span key={v} style={S.chip}>{v}<button type="button" aria-label={`Remove ${v}`} style={S.chipX} onClick={() => onChange(values.filter((x) => x !== v))}>×</button></span>
        ))}
      </div>
      <input
        style={S.input}
        value={input}
        placeholder={placeholder}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

/**
 * Print: only the resume sheet exists on paper. The visibility trick (rather
 * than display:none on ancestors) keeps the sheet's own layout intact, and
 * position:absolute re-anchors it to the page origin.
 */
const PRINT_CSS = `
@media (max-width: 980px) { .rb-grid { grid-template-columns: 1fr !important; } }
@media print {
  body * { visibility: hidden; }
  #resume-print, #resume-print * { visibility: visible; }
  #resume-print {
    position: absolute; left: 0; top: 0; width: 100%;
    box-shadow: none !important; border: none !important; border-radius: 0 !important;
    padding: 0 !important; margin: 0 !important;
  }
}
@page { margin: 16mm; }
`;

const S: Record<string, CSSProperties> = {
  toolbar: { display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 },
  h1: { margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px" },
  subtle: { fontSize: 12.5, color: C.mut, margin: "6px 0 0", lineHeight: 1.5, maxWidth: 520 },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${C.line}`, background: "#fff", color: C.slate, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { border: "none", background: GRAD, color: "#fff", borderRadius: 10, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 6px 16px rgba(99,102,241,.3)" },
  saveBtnIdle: { border: `1px solid ${C.line}`, background: "#F8FAFC", color: C.mut, borderRadius: 10, padding: "10px 22px", fontSize: 13, fontWeight: 700, cursor: "default", fontFamily: "inherit" },
  grid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20, alignItems: "start" },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 },
  cardLabel: { fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.mut, marginBottom: 12 },
  two: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 },
  input: { width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid #D4D4D8", fontSize: 13.5, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  textarea: { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #D4D4D8", fontSize: 13.5, fontFamily: "inherit", background: "#fff", boxSizing: "border-box", resize: "vertical", lineHeight: 1.6 },
  aiBtn: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #DDD6FE", background: "#F5F3FF", color: "#7C3AED", borderRadius: 9, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  addBtn: { background: "#EEF2FF", color: C.c1, border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  removeRole: { background: "none", border: "none", color: C.mut, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" },
  x: { border: "none", background: "none", color: C.mut, fontSize: 19, cursor: "pointer", lineHeight: 1, padding: "0 4px", flex: "none" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  chipX: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 },

  // ── The sheet. Times-adjacent serif on purpose: it prints crisply, reads as
  // a document rather than a web page, and ATS parsers have no opinion.
  sheet: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(15,23,42,.08)", padding: "34px 38px", fontFamily: "Georgia, 'Times New Roman', serif", color: "#111827", position: "sticky", top: 90 },
  pName: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.3px" },
  pHeadline: { fontSize: 13.5, marginTop: 3, color: "#374151" },
  pMeta: { fontSize: 11, color: "#4B5563", marginTop: 6 },
  pSectionTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, borderBottom: "1px solid #D1D5DB", paddingBottom: 3, marginBottom: 8, color: "#111827" },
  pBody: { fontSize: 12, lineHeight: 1.55, margin: 0, color: "#1F2937" },
  pRole: { fontSize: 12.5, fontWeight: 700, color: "#111827" },
  pYears: { fontSize: 11, color: "#4B5563", flex: "none" },
  pUl: { margin: "5px 0 0", paddingLeft: 18 },
  pLi: { fontSize: 11.5, lineHeight: 1.5, color: "#1F2937", marginBottom: 3 },
};
