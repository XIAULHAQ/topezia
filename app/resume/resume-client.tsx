"use client";

/**
 * Resume Builder — editor on the left, live print-true preview on the right,
 * restyled to the "Topezia Resume Builder" design (dark hero header, icon-chip
 * section cards, styled resume with the navy header band).
 *
 * Deliberate calls:
 *  - "Download PDF" is window.print() over a print-scoped stylesheet. The
 *    preview IS the print area, so what you see is byte-for-byte what you get,
 *    and there is no PDF library to maintain. The resume's dark header only
 *    survives printing because print-color-adjust:exact is forced on the sheet.
 *  - The photo comes LIVE from the profile — never stored in the resume row —
 *    and the doc stores only whether to show it (photo-less resumes are the
 *    norm in several markets, so hiding it must persist).
 *  - The design's "AI score 92" ring is NOT implemented: we have no scoring
 *    system, and a made-up number on a document people send to employers is
 *    worse than no number. The hero stats show only real counts.
 *  - AI drafting is per-section and OPT-IN; saving is explicit, not auto.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { C, GRAD, Icon, BrandMark, MatchRing, SoonTag } from "@/app/_components/ui";
import { LIMITS, type ResumeContent, type ResumeExperience } from "@/lib/resume/doc";
import { scoreResume } from "@/lib/resume/score";
import type { AssistStatus } from "@/lib/resume/assist-quota";
import type { DemandSkill } from "@/lib/matching/insights";
import type { FocusDirection } from "@/app/api/resume/focus/route";

type Busy = null | "save" | "sync" | "summary" | `bullets-${number}`;

/** GET /api/resume/market — DB-counted demand for the person's field. */
interface MarketStats {
  fieldLabel: string | null;
  targetJobs: number;
  reliable: boolean;
  topDemand: DemandSkill[];
}

export default function ResumeClient() {
  const [doc, setDoc] = useState<ResumeContent | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketStats | null>(null);
  const [directions, setDirections] = useState<FocusDirection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [quota, setQuota] = useState<AssistStatus | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/resume")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setDoc(d.content);
        setPhoto(d.photo ?? null);
        setPublicUrl(d.publicUrl ?? null);
        setQr(d.qr ?? null);
        if (d.saved) setSavedAt(d.updatedAt);
        if (d.assist) setQuota(d.assist);
      })
      .catch(() => setError("Couldn't load your resume."));
    // Market stats load separately and lazily — the heavy insight queries must
    // never delay the editor. A failure just means no card.
    fetch("/api/resume/market")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && Array.isArray(d.topDemand)) setMarket(d); })
      .catch(() => {});
  }, []);

  const up = useCallback((patch: Partial<ResumeContent>) => {
    setDoc((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }, []);

  // Focus Check — re-classify the LIVE skill list (debounced) whenever it
  // changes. The key encodes the list so the effect closure is never stale.
  const skillsKey = doc ? doc.skills.join("") : "";
  useEffect(() => {
    const skills = skillsKey ? skillsKey.split("") : [];
    if (skills.length < 2) { setDirections([]); return; }
    const t = setTimeout(() => {
      fetch("/api/resume/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && Array.isArray(d.directions)) setDirections(d.directions); })
        .catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [skillsKey]);

  if (error && !doc) return <p style={{ color: C.mut }}>{error}</p>;
  if (!doc) return <p style={{ color: C.mut }}>Loading your resume…</p>;

  const aiBlocked = quota !== null && !quota.allowed;
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

  /**
   * Save the resume AND push its facts back to the profile — one click, both
   * directions consistent. The server decides what syncs (see
   * /api/resume/sync-profile); the note it returns is shown when the headline
   * was deliberately left alone.
   */
  async function saveAndSync() {
    setBusy("sync"); setError(null); setSyncNote(null);
    try {
      const saveRes = await fetch("/api/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: doc }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new Error(saveData.error || "Couldn't save.");
      setDirty(false);
      setSavedAt(saveData.updatedAt ?? new Date().toISOString());

      const res = await fetch("/api/resume/sync-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: doc }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't update your profile.");
      setSyncNote(d.note ?? "Profile updated from this resume.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update your profile.");
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
      if (d.assist) setQuota(d.assist);
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

  // Hero stats — real counts only. The strength score is checklist-based
  // (lib/resume/score.ts) and recomputes live on every edit.
  const strength = scoreResume(doc);

  // Focus split: core skills lead, the rest step back to "Additional". Falls
  // back to a single list when the chosen core no longer intersects the
  // skill list (e.g. every core skill was removed after focusing).
  const coreSet = new Set((doc.focus?.core ?? []).map((s) => s.toLowerCase()));
  const coreSkills = doc.focus ? doc.skills.filter((s) => coreSet.has(s.toLowerCase())) : doc.skills;
  const extraSkills = doc.focus ? doc.skills.filter((s) => !coreSet.has(s.toLowerCase())) : [];
  const focusActive = !!doc.focus && coreSkills.length > 0;

  const shortTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const quotaStat = !quota
    ? { value: "—", label: "AI drafting" }
    : quota.activeUntil
      ? { value: "Open", label: `AI drafting — unlimited until ${shortTime(quota.activeUntil)}` }
      : quota.allowed
        ? { value: String(quota.remaining), label: quota.remaining === 1 ? "AI update available" : "AI updates available" }
        : { value: "0", label: `AI updates — next unlocks ${quota.nextAt ? shortDate(quota.nextAt) : "later"}` };
  const stats: { value: string; label: string }[] = [
    { value: String(strength.score), label: `Resume strength — ${strength.metCount} of ${strength.checks.length} checks` },
    { value: String(doc.skills.length), label: "Skills on this resume" },
    { value: String(doc.projects.length), label: "Portfolio projects attached" },
    quotaStat,
  ];

  const showPhoto = !!photo && doc.showPhoto;

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* ── Hero header ── */}
      <section style={S.hero}>
        <div style={S.heroGlow} />
        <div style={S.heroLines} />
        <div style={{ position: "relative", display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={S.heroBadge}><Icon name="spark" size={13} />Built from your Topezia profile</div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.8px" }}>Resume Builder</h1>
            <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "#B9C0D4", maxWidth: 520 }}>
              The summary and bullets are yours to write — or let AI draft them from what your profile already knows. It never invents what we don&apos;t have.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={S.heroGhostBtn} onClick={() => window.print()}>
              <Icon name="doc" size={15} />Download PDF
            </button>
            <button type="button" style={{ ...S.heroGhostBtn, opacity: dirty ? 1 : 0.55, cursor: dirty ? "pointer" : "default" }} onClick={save} disabled={busy !== null || !dirty}>
              {/* A fresh seed has never been saved — don't claim it has. */}
              {busy === "save" ? "Saving…" : dirty ? "Save draft" : savedAt ? "Saved ✓" : "Save draft"}
            </button>
            <button type="button" style={S.heroSyncBtn} onClick={saveAndSync} disabled={busy !== null} title="Saves this resume, then updates your Topezia profile to match it">
              <Icon name="check" size={15} />{busy === "sync" ? "Updating profile…" : "Save & update profile"}
            </button>
          </div>
        </div>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,.09)", marginTop: 24 }}>
          {stats.map((st, i) => (
            <div key={st.label} style={{ flex: 1, minWidth: 150, padding: "16px 14px 2px 0", borderRight: i < stats.length - 1 ? "1px solid rgba(255,255,255,.06)" : "none", paddingLeft: i > 0 ? 16 : 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{st.value}</div>
              <div style={{ fontSize: 11.5, color: "#8B96B5", marginTop: 3, lineHeight: 1.4 }}>{st.label}</div>
            </div>
          ))}
        </div>
      </section>

      {quota && <QuotaLine q={quota} />}
      {error && <p style={{ color: "#DC2626", fontSize: 13, fontWeight: 600, margin: "0 0 14px" }}>{error}</p>}
      {syncNote && <p style={{ color: "#0F6E56", fontSize: 12.5, fontWeight: 600, background: "#E7F6EE", border: "1px solid #A7F3D0", borderRadius: 10, padding: "8px 12px", margin: "0 0 14px", lineHeight: 1.5 }}>{syncNote}</p>}
      {!error && savedAt && !dirty && (
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 14px" }}>Saved {new Date(savedAt).toLocaleString()}.</p>
      )}

      <div className="rb-grid" style={S.grid}>
        {/* ── Editor column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <StrengthCard strength={strength} />
          {market && market.topDemand.length > 0 && (
            <MarketCard
              market={market}
              resumeSkills={doc.skills}
              onAdd={(name) => {
                if (doc.skills.length >= LIMITS.skills) return;
                if (!doc.skills.some((s) => s.toLowerCase() === name.toLowerCase())) up({ skills: [...doc.skills, name] });
              }}
            />
          )}
          <section style={S.card}>
            <CardHead icon="user" title="Contact" />
            {photo && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", flex: "none" }} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: C.slate, cursor: "pointer" }}>
                  <input type="checkbox" checked={doc.showPhoto} onChange={(e) => up({ showPhoto: e.target.checked })} />
                  Show photo on the resume
                </label>
                <span style={{ fontSize: 11.5, color: C.mut }}>The photo itself comes from your profile.</span>
              </div>
            )}
            <div style={S.two}>
              <input className="rb-in" style={S.input} placeholder="Full name" value={doc.contact.name} onChange={(e) => upContact("name", e.target.value)} />
              <input className="rb-in" style={S.input} placeholder="Headline / role" value={doc.contact.headline} onChange={(e) => upContact("headline", e.target.value)} />
              <input className="rb-in" style={S.input} placeholder="Location" value={doc.contact.location} onChange={(e) => upContact("location", e.target.value)} />
              <input className="rb-in" style={S.input} placeholder="Email" type="email" value={doc.contact.email} onChange={(e) => upContact("email", e.target.value)} />
              <input className="rb-in" style={S.input} placeholder="Phone" value={doc.contact.phone} onChange={(e) => upContact("phone", e.target.value)} />
              <input className="rb-in" style={S.input} placeholder="Portfolio or LinkedIn" value={doc.contact.link} onChange={(e) => upContact("link", e.target.value)} />
            </div>
          </section>

          <section style={S.card}>
            <CardHead icon="doc" title="Professional summary">
              <button type="button" style={aiBlocked ? S.aiBtnOff : S.aiBtn} disabled={busy !== null || aiBlocked} onClick={() => assist("summary")}>
                <Icon name="spark" size={13} />{busy === "summary" ? "Drafting…" : doc.summary ? "Redraft with AI" : "Write with AI"}
              </button>
            </CardHead>
            <textarea
              className="rb-in"
              style={S.textarea}
              rows={4}
              placeholder="Two or three sentences on who you are professionally and what you're strongest at."
              value={doc.summary}
              onChange={(e) => up({ summary: e.target.value.slice(0, LIMITS.summary) })}
            />
          </section>

          <section style={S.card}>
            <CardHead icon="briefcase" title="Experience" />
            <div style={{ display: "grid", gap: 14 }}>
              {doc.experience.map((ex, i) => (
                <div key={i} style={S.roleBox}>
                  <div style={S.roleGrid}>
                    <input className="rb-in" style={S.inputSm} placeholder="Job title" value={ex.title} onChange={(e) => upExp(i, { title: e.target.value })} />
                    <input className="rb-in" style={S.inputSm} placeholder="Company" value={ex.company} onChange={(e) => upExp(i, { company: e.target.value })} />
                    <input className="rb-in" style={S.inputSm} placeholder="2019–Present" value={ex.years} onChange={(e) => upExp(i, { years: e.target.value })} />
                  </div>

                  {ex.bullets.map((b, bi) => (
                    <div key={bi} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input
                        className="rb-in"
                        style={{ ...S.inputSm, flex: 1 }}
                        value={b}
                        placeholder="Achievement — start with a verb"
                        onChange={(e) => upExp(i, { bullets: ex.bullets.map((x, j) => (j === bi ? e.target.value.slice(0, LIMITS.bullet) : x)) })}
                      />
                      <button type="button" aria-label="Remove bullet" style={S.x} onClick={() => upExp(i, { bullets: ex.bullets.filter((_, j) => j !== bi) })}>×</button>
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                    {ex.bullets.length < LIMITS.bulletsPerRole && (
                      <button type="button" style={S.mutBtn} onClick={() => upExp(i, { bullets: [...ex.bullets, ""] })}>+ Add bullet</button>
                    )}
                    <button type="button" style={aiBlocked ? S.aiBtnOff : S.aiBtn} disabled={busy !== null || aiBlocked} onClick={() => assist("bullets", i)}>
                      <Icon name="spark" size={13} />{busy === `bullets-${i}` ? "Drafting…" : "Draft bullets with AI"}
                    </button>
                    <div style={{ flex: 1 }} />
                    <button type="button" style={S.removeRole} onClick={() => up({ experience: doc.experience.filter((_, j) => j !== i) })}>Remove role</button>
                  </div>
                </div>
              ))}
            </div>
            {doc.experience.length < LIMITS.roles && (
              <button type="button" style={{ ...S.addBtn, marginTop: 14 }} onClick={() => up({ experience: [...doc.experience, { title: "", company: "", years: "", bullets: [] }] })}>
                + Add experience
              </button>
            )}
          </section>

          <section style={S.card}>
            <CardHead icon="grad" title="Education" />
            <div style={{ display: "grid", gap: 11 }}>
              {doc.education.map((ed, i) => (
                <div key={i} className="rb-edu" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) 96px 32px", gap: 11, alignItems: "center" }}>
                  <input className="rb-in" style={S.inputSm} placeholder="Degree" value={ed.degree} onChange={(e) => up({ education: doc.education.map((x, j) => (j === i ? { ...x, degree: e.target.value } : x)) })} />
                  <input className="rb-in" style={S.inputSm} placeholder="Institution" value={ed.institution} onChange={(e) => up({ education: doc.education.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)) })} />
                  <input className="rb-in" style={S.inputSm} placeholder="Year" value={ed.year} onChange={(e) => up({ education: doc.education.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)) })} />
                  <button type="button" aria-label="Remove" style={S.x} onClick={() => up({ education: doc.education.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
            </div>
            {doc.education.length < LIMITS.education && (
              <button type="button" style={{ ...S.addBtn, marginTop: doc.education.length ? 14 : 0 }} onClick={() => up({ education: [...doc.education, { degree: "", institution: "", year: "" }] })}>+ Add education</button>
            )}
          </section>

          <FocusCard
            directions={directions}
            focus={doc.focus}
            onFocus={(d) => {
              // Reorder so core leads everywhere, including saved order.
              const core = new Set(d.skills.map((s) => s.toLowerCase()));
              up({
                focus: { label: d.label, core: d.skills },
                skills: [...doc.skills.filter((s) => core.has(s.toLowerCase())), ...doc.skills.filter((s) => !core.has(s.toLowerCase()))],
              });
            }}
            onClear={() => up({ focus: null })}
          />

          <section style={S.card}>
            <CardHead icon="spark" title="Skills & certifications" />
            <ChipEditor values={doc.skills} placeholder="Add a skill, then Enter" max={LIMITS.skills} onChange={(v) => up({ skills: v })} />
            <div style={{ height: 12 }} />
            <ChipEditor values={doc.certifications} placeholder="Add a certification, then Enter" max={LIMITS.certifications} onChange={(v) => up({ certifications: v })} />
          </section>

          <section style={S.card}>
            <CardHead icon="grid" title="Projects — from your portfolio" />
            {doc.projects.length === 0 ? (
              <p style={{ fontSize: 12.5, color: C.mut, margin: 0, lineHeight: 1.6 }}>
                Published portfolio work appears here with a thumbnail, linked to its page.{" "}
                <a href="/portfolio/new" style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>Add a piece →</a>
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {doc.projects.map((pr, i) => (
                  <div key={pr.url} style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${C.line}`, borderRadius: 13, padding: "11px 14px" }}>
                    <div style={{ width: 62, height: 44, borderRadius: 9, overflow: "hidden", background: "#EEF2FF", flex: "none", display: "grid", placeItems: "center", color: C.mut }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {pr.thumb ? <img src={pr.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="image" size={14} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{pr.title}</div>
                      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.url.replace(/^https?:\/\/(www\.)?/, "")}</div>
                    </div>
                    <button type="button" aria-label={`Remove ${pr.title}`} style={S.x} onClick={() => up({ projects: doc.projects.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <p style={{ fontSize: 12, color: C.mut, margin: "3px 0 0", lineHeight: 1.65 }}>
                  Removing here only takes it off the resume. Titles and images come from the portfolio itself — <a href="/portfolio/mine" style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>manage there</a>.
                </p>
              </div>
            )}
          </section>

          <section style={S.card}>
            <CardHead icon="globe" title="Languages" />
            {doc.languages.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input className="rb-in" style={{ ...S.inputSm, flex: 2 }} placeholder="Language" value={l.name} onChange={(e) => up({ languages: doc.languages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <input className="rb-in" style={{ ...S.inputSm, flex: 1 }} placeholder="Level — e.g. Fluent" value={l.level} onChange={(e) => up({ languages: doc.languages.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)) })} />
                <button type="button" aria-label="Remove" style={S.x} onClick={() => up({ languages: doc.languages.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            {doc.languages.length < LIMITS.languages && (
              <button type="button" style={S.addBtn} onClick={() => up({ languages: [...doc.languages, { name: "", level: "" }] })}>+ Add language</button>
            )}
          </section>

          <section style={S.card}>
            <CardHead icon="quote" title="Recommendations" />
            <p style={{ fontSize: 12.5, color: C.mut, margin: "0 0 12px", lineHeight: 1.65 }}>Quotes you&apos;ve received and choose to show — with who said it.</p>
            {doc.recommendations.map((r, i) => (
              <div key={i} style={{ borderTop: i > 0 ? `1px solid #F2F2F5` : "none", paddingTop: i > 0 ? 10 : 0, marginBottom: 10 }}>
                <textarea className="rb-in" style={S.textarea} rows={2} placeholder="What they said…" value={r.text} onChange={(e) => up({ recommendations: doc.recommendations.map((x, j) => (j === i ? { ...x, text: e.target.value.slice(0, LIMITS.recommendationText) } : x)) })} />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input className="rb-in" style={{ ...S.inputSm, flex: 1 }} placeholder="Who" value={r.author} onChange={(e) => up({ recommendations: doc.recommendations.map((x, j) => (j === i ? { ...x, author: e.target.value } : x)) })} />
                  <input className="rb-in" style={{ ...S.inputSm, flex: 1 }} placeholder="Their role" value={r.role} onChange={(e) => up({ recommendations: doc.recommendations.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} />
                  <button type="button" aria-label="Remove" style={S.x} onClick={() => up({ recommendations: doc.recommendations.filter((_, j) => j !== i) })}>×</button>
                </div>
              </div>
            ))}
            {doc.recommendations.length < LIMITS.recommendations && (
              <button type="button" style={S.addBtn} onClick={() => up({ recommendations: [...doc.recommendations, { text: "", author: "", role: "" }] })}>+ Add recommendation</button>
            )}
          </section>
        </div>

        {/* ── Preview column — the sheet is exactly what prints ── */}
        <div className="rb-preview-wrap" style={{ position: "sticky", top: 20, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.mut, flex: 1 }}>Live preview</div>
            {/* Template picker — same content, different rendering. ATS-safe is
                plain single-column text: no photo, no QR, no graphics. */}
            <div style={{ display: "inline-flex", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: 3, gap: 2 }}>
              {(["styled", "ats"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => up({ template: t })}
                  title={t === "ats" ? "Plain single-column text — for employers whose software parses resumes" : "The designed Topezia look"}
                  style={{
                    border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    background: doc.template === t ? GRAD : "transparent",
                    color: doc.template === t ? "#fff" : C.mut,
                  }}
                >
                  {t === "ats" ? "ATS-safe" : "Styled"}
                </button>
              ))}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, color: C.slate }}>
              <Icon name="eye" size={13} />A4
            </div>
          </div>

          <div id="resume-print" style={doc.template === "ats" ? A.sheet : S.sheet}>
            {doc.template === "ats" ? <AtsSheet doc={doc} publicUrl={publicUrl} /> : (<>
            {/* Navy header band */}
            <header style={S.pHead}>
              <div style={S.pHeadGlow1} />
              <div style={S.pHeadGlow2} />
              <div style={S.pHeadLines} />
              <div style={{ position: "relative", display: "flex", gap: 18, alignItems: "center" }}>
                {showPhoto && (
                  <div style={{ flex: "none", padding: 3, borderRadius: "50%", background: GRAD }}>
                    <div style={{ padding: 3, background: C.navy, borderRadius: "50%" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo!} alt="" style={{ width: 92, height: 92, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
                    </div>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.6px", lineHeight: 1.2 }}>{doc.contact.name || "Your Name"}</h2>
                  {doc.contact.headline && (
                    <div style={{ fontSize: 13, marginTop: 5, fontWeight: 600, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                      {doc.contact.headline}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                {([["pin", doc.contact.location], ["mail", doc.contact.email], ["phone", doc.contact.phone], ["link", doc.contact.link]] as const)
                  .filter(([, v]) => v)
                  .map(([ic, v]) => (
                    <span key={ic} style={S.pChip}><Icon name={ic} size={11} />{v}</span>
                  ))}
              </div>
              {doc.summary && (
                <p style={{ position: "relative", margin: "14px 0 0", fontSize: 11.8, lineHeight: 1.7, color: "#B9C0D4" }}>{doc.summary}</p>
              )}
            </header>

            <div style={{ padding: "24px 26px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
              {doc.experience.length > 0 && (
                <PSection icon="briefcase" title="Experience">
                  <div style={{ display: "grid", gap: 13 }}>
                    {doc.experience.map((ex, i) => (
                      <div key={i} style={{ display: "flex", gap: 12 }}>
                        <div style={{ width: 2, borderRadius: 2, background: GRAD, flex: "none" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, flex: 1, lineHeight: 1.35, color: C.ink }}>{ex.title || ex.company}</div>
                            {ex.years && <div style={{ fontSize: 10.5, color: C.mut, fontWeight: 600, flex: "none" }}>{ex.years}</div>}
                          </div>
                          {ex.title && ex.company && <div style={{ fontSize: 11.5, color: C.c1, fontWeight: 600, marginTop: 3 }}>{ex.company}</div>}
                          {ex.bullets.filter(Boolean).length > 0 && (
                            <ul style={{ margin: "7px 0 0", paddingLeft: 15, display: "grid", gap: 4 }}>
                              {ex.bullets.filter(Boolean).map((b, bi) => (
                                <li key={bi} style={{ fontSize: 11.3, lineHeight: 1.6, color: C.slate }}>{b}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </PSection>
              )}

              {doc.education.length > 0 && (
                <PSection icon="grad" title="Education">
                  <div style={{ display: "grid", gap: 9 }}>
                    {doc.education.map((ed, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{ed.degree}</div>
                          {ed.institution && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 2 }}>{ed.institution}</div>}
                        </div>
                        {ed.year && <div style={{ fontSize: 10.5, color: C.mut, fontWeight: 600, flex: "none" }}>{ed.year}</div>}
                      </div>
                    ))}
                  </div>
                </PSection>
              )}

              {doc.skills.length > 0 && (
                <PSection icon="spark" title={focusActive ? "Core skills" : "Skills"}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(focusActive ? coreSkills : doc.skills).map((sk) => <span key={sk} style={S.pSkill}>{sk}</span>)}
                  </div>
                  {focusActive && extraSkills.length > 0 && (
                    <>
                      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: C.mut, margin: "10px 0 6px" }}>Additional skills</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {extraSkills.map((sk) => <span key={sk} style={{ ...S.pSkill, background: "#F8FAFC", border: `1px solid ${C.line}`, color: C.mut }}>{sk}</span>)}
                      </div>
                    </>
                  )}
                </PSection>
              )}

              {doc.certifications.length > 0 && (
                <PSection icon="award" title="Certifications">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {doc.certifications.map((ct) => <span key={ct} style={{ ...S.pSkill, background: "#F1F5F9", border: `1px solid ${C.line}`, color: C.slate }}>{ct}</span>)}
                  </div>
                </PSection>
              )}

              {doc.projects.length > 0 && (
                <PSection icon="grid" title="Selected projects">
                  {/* Real <a> hyperlinks: browsers preserve them in Save-as-PDF,
                      and the visible short URL keeps a paper copy useful too. */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                    {doc.projects.map((pr) => (
                      <a key={pr.url} href={pr.url} style={{ textDecoration: "none", color: "inherit", border: `1px solid ${C.line}`, borderRadius: 11, overflow: "hidden", display: "block" }}>
                        <div style={{ aspectRatio: "16/10", background: "#EEF2FF" }}>
                          {pr.thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={pr.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          )}
                        </div>
                        <div style={{ padding: "9px 10px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.3, color: C.ink }}>{pr.title}</div>
                          <div style={{ fontSize: 9.5, color: C.c1, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.url.replace(/^https?:\/\/(www\.)?/, "")}</div>
                        </div>
                      </a>
                    ))}
                  </div>
                </PSection>
              )}

              {doc.languages.filter((l) => l.name).length > 0 && (
                <PSection icon="globe" title="Languages">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {doc.languages.filter((l) => l.name).map((l) => (
                      <span key={l.name} style={{ ...S.pSkill, background: "#F1F5F9", border: `1px solid ${C.line}`, color: C.slate }}>
                        {l.level ? `${l.name} — ${l.level}` : l.name}
                      </span>
                    ))}
                  </div>
                </PSection>
              )}

              {doc.recommendations.filter((r) => r.text).length > 0 && (
                <PSection icon="quote" title="Recommendations">
                  <div style={{ display: "grid", gap: 10 }}>
                    {doc.recommendations.filter((r) => r.text).map((r, i) => (
                      <div key={i}>
                        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.65, color: C.slate, fontStyle: "italic" }}>&ldquo;{r.text}&rdquo;</p>
                        {(r.author || r.role) && <div style={{ fontSize: 10.5, color: C.mut, marginTop: 3, fontWeight: 600 }}>— {[r.author, r.role].filter(Boolean).join(", ")}</div>}
                      </div>
                    ))}
                  </div>
                </PSection>
              )}

              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <BrandMark size={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {publicUrl ? (
                    <a href={publicUrl} style={{ fontSize: 10, color: C.mut, lineHeight: 1.5, textDecoration: "none", display: "block" }}>
                      Full profile & portfolio on {publicUrl.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  ) : (
                    <span style={{ fontSize: 10, color: C.mut, lineHeight: 1.5 }}>Built on topezia.com</span>
                  )}
                  {qr && publicUrl && (
                    <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>Scan the code for the live portfolio.</div>
                  )}
                </div>
                {/* The paper resume's escape hatch to the living one: printed
                    QR → /p/{slug} with real work, videos, recommendations. */}
                {qr && publicUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code linking to the live Topezia profile" style={{ width: 54, height: 54, flex: "none" }} />
                )}
              </div>
            </div>
            </>)}
          </div>
          <p style={{ fontSize: 11.5, color: C.mut, textAlign: "center", lineHeight: 1.6, marginTop: 12 }}>
            Download PDF opens your browser&apos;s print dialog — choose &quot;Save as PDF&quot;.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Editor card header: icon chip + title, matching the design system. */
function CardHead({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: "#EEF2FF", color: C.c1, display: "grid", placeItems: "center", flex: "none" }}>
        <Icon name={icon} size={16} />
      </span>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1, letterSpacing: "-0.2px" }}>{title}</h2>
      {children}
    </div>
  );
}

/** Preview section header: small icon chip + uppercase title. */
function PSection({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: "#EEF2FF", color: C.c1, display: "grid", placeItems: "center", flex: "none" }}>
          <Icon name={icon} size={13} />
        </span>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.slate }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

/**
 * The strength card: the score as a ring plus the checklist behind it. Every
 * unmet item is the exact edit that earns its points — the score is never a
 * verdict without a to-do list attached.
 */
function StrengthCard({ strength }: { strength: ReturnType<typeof scoreResume> }) {
  const [open, setOpen] = useState(false);
  const unmet = strength.checks.filter((ch) => !ch.met);
  const shown = open ? unmet : unmet.slice(0, 3);
  return (
    <section style={S.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <MatchRing value={strength.score} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.2px" }}>Resume strength</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.mut, lineHeight: 1.5 }}>
            {strength.metCount} of {strength.checks.length} checks passed — a transparent checklist, not an AI judgment.
          </p>
        </div>
      </div>
      {unmet.length > 0 ? (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {shown.map((ch) => (
            <div key={ch.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 11, padding: "10px 13px" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#B45309", flex: "none", background: "#FEF3C7", borderRadius: 999, padding: "2px 8px" }}>+{ch.points}</span>
              <span style={{ fontSize: 12.5, color: "#78350F", lineHeight: 1.55 }}>{ch.hint}</span>
            </div>
          ))}
          {unmet.length > 3 && (
            <button type="button" onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", color: C.c1, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0 }}>
              {open ? "Show fewer" : `Show ${unmet.length - 3} more ways to earn points`}
            </button>
          )}
        </div>
      ) : (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#0F6E56", fontWeight: 600 }}>
          All {strength.checks.length} checks passed — as complete as the checklist gets.
        </p>
      )}
    </section>
  );
}

/**
 * Market card — counted from live postings, no AI involved. Three honest
 * states per skill: on this resume (done), on your profile but not this
 * resume (one-click add — we KNOW you have it), or not on your profile at
 * all (a Career Coach question, never an "add it anyway" temptation).
 */
function MarketCard({ market, resumeSkills, onAdd }: { market: MarketStats; resumeSkills: string[]; onAdd: (name: string) => void }) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const onResume = (skill: string) => {
    const n = norm(skill);
    return resumeSkills.some((s) => { const m = norm(s); return m === n || m.includes(n) || n.includes(m); });
  };
  if (!market.reliable) {
    return (
      <section style={S.card}>
        <CardHead icon="trend" title="Your market" />
        <p style={{ fontSize: 12.5, color: C.mut, margin: 0, lineHeight: 1.6 }}>
          Only {market.targetJobs} live {market.fieldLabel ?? "matching"} posting{market.targetJobs === 1 ? "" : "s"} open to you right now — too few for percentages to mean much. This fills in as inventory grows.
        </p>
      </section>
    );
  }
  const rows = market.topDemand.slice(0, 6);
  const missing = rows.filter((d) => !onResume(d.skill) && !d.youHave).length;
  return (
    <section style={S.card}>
      <CardHead icon="trend" title="What your market asks for" />
      <div style={{ display: "grid", gap: 7 }}>
        {rows.map((d) => {
          const have = onResume(d.skill);
          return (
            <div key={d.skill} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.skill}</span>
              <span style={{ fontSize: 11.5, color: C.mut, flex: "none" }}>{d.pct}% of postings</span>
              {have ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#0F6E56", background: "#E7F6EE", borderRadius: 999, padding: "3px 9px", flex: "none" }}>✓ on resume</span>
              ) : d.youHave ? (
                <button type="button" onClick={() => onAdd(d.skill)} style={{ fontSize: 11, fontWeight: 700, color: C.c1, background: "#EEF2FF", border: "none", borderRadius: 999, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", flex: "none" }} title="It's on your profile but not this resume">
                  + Add
                </button>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", flex: "none" }}>not on your profile</span>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: C.mut, margin: "12px 0 0", lineHeight: 1.55 }}>
        Counted from {market.targetJobs} live {market.fieldLabel ?? ""} postings open to you — no AI involved.
        {missing > 0 && <> Skills you don&apos;t have yet are a <a href="/coach" style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>Career Coach</a> conversation, not a resume edit.</>}
      </p>
    </section>
  );
}

/**
 * Focus Check — one question, one click, then silence.
 *
 * Renders NOTHING when the skills read as one direction (silence is the
 * reward for a focused resume). With 2+ detected directions it asks exactly
 * one question; once answered it collapses to a single line and never nags.
 * The premium pitch appears exactly once, right after focusing — the moment
 * the person has just felt "but I also do design…" — and is dismissible.
 * Honest per the gating rule: "coming soon", never a fake checkout.
 */
function FocusCard({ directions, focus, onFocus, onClear }: {
  directions: FocusDirection[];
  focus: ResumeContent["focus"];
  onFocus: (d: FocusDirection) => void;
  onClear: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [pitch, setPitch] = useState(false);

  if (focus) {
    return (
      <section style={{ ...S.card, padding: "16px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#0F6E56", fontWeight: 800, fontSize: 14 }}>✓</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Focused on {focus.label}</span>
          <span style={{ fontSize: 12, color: C.mut }}>— core skills lead, the rest are listed as additional.</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClear} style={{ background: "none", border: "none", color: C.c1, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Change</button>
        </div>
        {pitch && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12, background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 11, padding: "11px 14px" }}>
            <Icon name="spark" size={14} color="#7C3AED" />
            <span style={{ fontSize: 12.5, color: "#5B21B6", lineHeight: 1.6, flex: 1 }}>
              <strong>Your other directions didn&apos;t disappear</strong> — they&apos;re on this resume as additional skills. Premium will keep <strong>one resume per direction</strong>, so every application leads with the right you. <SoonTag label="Premium — coming soon" />
            </span>
            <button type="button" aria-label="Dismiss" onClick={() => setPitch(false)} style={{ background: "none", border: "none", color: "#7C3AED", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 0, flex: "none" }}>×</button>
          </div>
        )}
      </section>
    );
  }

  if (directions.length < 2) return null;
  const shown = showAll ? directions : directions.slice(0, 3);
  return (
    <section style={{ ...S.card, border: "1px solid #C7D2FE", background: "#FDFDFF" }}>
      <CardHead icon="gauge" title="Who is this resume for?" />
      <p style={{ fontSize: 12.5, color: C.slate, margin: "0 0 14px", lineHeight: 1.65 }}>
        Your skills point in <strong>{directions.length} directions</strong> — recruiters skim for one. A resume that says several things at once reads as none of them. Pick the one this resume leads with; the rest become additional skills, not deleted ones.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {shown.map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => { onFocus(d); setPitch(true); }}
            title={d.skills.join(", ")}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", borderRadius: 999, padding: "9px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            {d.label}
            <span style={{ fontWeight: 600, color: "#818CF8" }}>{d.skills.length} skills</span>
          </button>
        ))}
        {!showAll && directions.length > 3 && (
          <button type="button" onClick={() => setShowAll(true)} style={{ background: "none", border: "none", color: C.mut, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            and {directions.length - 3} more
          </button>
        )}
      </div>
      <p style={{ fontSize: 11, color: C.mut, margin: "12px 0 0", lineHeight: 1.5 }}>
        Directions are counted from which professions&apos; live postings ask for each skill — no AI involved.
      </p>
    </section>
  );
}

/**
 * The ATS-safe rendering: single column, serif, black on white, no photo, no
 * QR, no graphics — plain text a parser can't misread. Same ResumeContent.
 */
function AtsSheet({ doc, publicUrl }: { doc: ResumeContent; publicUrl: string | null }) {
  const coreSet = new Set((doc.focus?.core ?? []).map((s) => s.toLowerCase()));
  const core = doc.focus ? doc.skills.filter((s) => coreSet.has(s.toLowerCase())) : doc.skills;
  const extra = doc.focus ? doc.skills.filter((s) => !coreSet.has(s.toLowerCase())) : [];
  const focusActive = !!doc.focus && core.length > 0;
  return (
    <div>
      <header style={{ borderBottom: "2px solid #111827", paddingBottom: 12, marginBottom: 14 }}>
        <div style={A.name}>{doc.contact.name || "Your Name"}</div>
        {doc.contact.headline && <div style={A.headline}>{doc.contact.headline}</div>}
        <div style={A.meta}>
          {[doc.contact.location, doc.contact.email, doc.contact.phone, doc.contact.link].filter(Boolean).join("  ·  ")}
        </div>
      </header>

      {doc.summary && <AtsSection title="Summary"><p style={A.body}>{doc.summary}</p></AtsSection>}

      {doc.experience.length > 0 && (
        <AtsSection title="Experience">
          {doc.experience.map((ex, i) => (
            <div key={i} style={{ marginBottom: i < doc.experience.length - 1 ? 12 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={A.role}>{[ex.title, ex.company].filter(Boolean).join(" — ")}</span>
                {ex.years && <span style={A.years}>{ex.years}</span>}
              </div>
              {ex.bullets.filter(Boolean).length > 0 && (
                <ul style={{ margin: "5px 0 0", paddingLeft: 18 }}>
                  {ex.bullets.filter(Boolean).map((b, bi) => <li key={bi} style={A.li}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
        </AtsSection>
      )}

      {doc.education.length > 0 && (
        <AtsSection title="Education">
          {doc.education.map((ed, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <span style={A.body}>{[ed.degree, ed.institution].filter(Boolean).join(" — ")}</span>
              {ed.year && <span style={A.years}>{ed.year}</span>}
            </div>
          ))}
        </AtsSection>
      )}

      {doc.skills.length > 0 && (
        <AtsSection title={focusActive ? "Core Skills" : "Skills"}>
          <p style={A.body}>{(focusActive ? core : doc.skills).join("  ·  ")}</p>
          {focusActive && extra.length > 0 && (
            <p style={{ ...A.body, fontSize: 10.5, color: "#4B5563", marginTop: 4 }}>Additional: {extra.join("  ·  ")}</p>
          )}
        </AtsSection>
      )}
      {doc.certifications.length > 0 && <AtsSection title="Certifications"><p style={A.body}>{doc.certifications.join("  ·  ")}</p></AtsSection>}

      {doc.projects.length > 0 && (
        <AtsSection title="Selected Projects">
          {doc.projects.map((pr) => (
            <div key={pr.url} style={{ marginBottom: 4 }}>
              <span style={{ ...A.role, fontSize: 11.5 }}>{pr.title}</span>
              <span style={{ fontSize: 10, color: "#374151" }}> — {pr.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
            </div>
          ))}
        </AtsSection>
      )}

      {doc.languages.filter((l) => l.name).length > 0 && (
        <AtsSection title="Languages">
          <p style={A.body}>{doc.languages.filter((l) => l.name).map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join("  ·  ")}</p>
        </AtsSection>
      )}

      {doc.recommendations.filter((r) => r.text).length > 0 && (
        <AtsSection title="Recommendations">
          {doc.recommendations.filter((r) => r.text).map((r, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <p style={{ ...A.body, fontStyle: "italic" }}>&ldquo;{r.text}&rdquo;</p>
              {(r.author || r.role) && <div style={{ fontSize: 10.5, color: "#4B5563", marginTop: 2 }}>— {[r.author, r.role].filter(Boolean).join(", ")}</div>}
            </div>
          ))}
        </AtsSection>
      )}

      {publicUrl && (
        <div style={{ borderTop: "1px solid #D1D5DB", paddingTop: 10, marginTop: 4, fontSize: 10, color: "#4B5563" }}>
          Full profile &amp; portfolio: {publicUrl.replace(/^https?:\/\/(www\.)?/, "")}
        </div>
      )}
    </div>
  );
}

function AtsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={A.sectionTitle}>{title}</div>
      {children}
    </section>
  );
}

/**
 * One honest line about the AI allowance. States exactly one of three
 * situations — window open, updates available, or blocked until a date —
 * never a generic "upgrade for more".
 */
function QuotaLine({ q }: { q: AssistStatus }) {
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  let text: string;
  if (q.activeUntil) text = `AI drafting is open until ${fmt(q.activeUntil)} — unlimited drafts until then. Your plan: ${q.planLabel}.`;
  else if (q.allowed) text = `Your plan includes ${q.planLabel}. Your first drafting click starts a 24-hour window of unlimited drafts.`;
  else text = `Your plan includes ${q.planLabel}, and you've used it${q.nextAt ? ` — the next unlocks ${fmt(q.nextAt)}` : ""}. Editing and PDF download stay unlimited.`;
  const ok = q.allowed;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: ok ? "#EEF2FF" : "#FFF7ED", border: `1px solid ${ok ? "#C7D2FE" : "#FED7AA"}`, borderRadius: 14, padding: "12px 18px", fontSize: 12.5, color: ok ? "#4338CA" : "#9A3412", margin: "0 0 18px", lineHeight: 1.55 }}>
      <Icon name="spark" size={14} />
      <span>{text}</span>
    </div>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: values.length ? 10 : 0 }}>
        {values.map((v) => (
          <span key={v} style={S.chip}>{v}<button type="button" aria-label={`Remove ${v}`} style={S.chipX} onClick={() => onChange(values.filter((x) => x !== v))}>×</button></span>
        ))}
      </div>
      <input
        className="rb-in"
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
 * Page CSS. Print: only the resume sheet exists on paper. The visibility trick
 * (rather than display:none on ancestors) keeps the sheet's own layout intact,
 * and position:absolute re-anchors it to the page origin. print-color-adjust:
 * exact is what keeps the navy header band and gradient accents on paper —
 * without it most browsers strip backgrounds and the white-on-navy header
 * would print as a blank block.
 */
const PAGE_CSS = `
.rb-grid { grid-template-columns: minmax(0,1fr) 470px; }
@media (max-width: 1180px) {
  .rb-grid { grid-template-columns: 1fr !important; }
  .rb-preview-wrap { position: static !important; }
}
@media (max-width: 640px) { .rb-edu { grid-template-columns: 1fr !important; } }
.rb-in:focus { border-color: #A5B4FC !important; box-shadow: 0 0 0 3px rgba(99,102,241,.12); outline: none; }
@media print {
  body * { visibility: hidden; }
  #resume-print, #resume-print * { visibility: visible; }
  #resume-print, #resume-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #resume-print {
    position: absolute; left: 0; top: 0; width: 100%;
    box-shadow: none !important; border: none !important; border-radius: 0 !important;
    margin: 0 !important;
  }
}
@page { margin: 12mm; }
`;

const S: Record<string, CSSProperties> = {
  // ── Hero ──
  hero: { background: C.navy, borderRadius: 20, padding: "28px 30px 20px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 20 },
  heroGlow: { position: "absolute", top: -140, right: -70, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,.38), transparent 68%)" },
  heroLines: { position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 72px)" },
  heroBadge: { display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)", color: "#C7CEE4", fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "5px 12px", marginBottom: 14 },
  heroGhostBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 11, padding: "11px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#E2E8F0", fontFamily: "inherit" },
  heroSyncBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: GRAD, border: "none", borderRadius: 11, padding: "11px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#fff", fontFamily: "inherit", boxShadow: "0 6px 18px rgba(99,102,241,.4)" },

  // ── Layout & editor ──
  grid: { display: "grid", gap: 22, alignItems: "start" },
  card: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "24px 26px" },
  two: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  input: { width: "100%", padding: "12px 14px", borderRadius: 11, border: `1px solid ${C.line}`, fontSize: 13.5, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  inputSm: { width: "100%", padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  textarea: { width: "100%", padding: "14px", borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 13.5, fontFamily: "inherit", background: "#fff", boxSizing: "border-box", resize: "vertical", lineHeight: 1.7, color: C.slate },
  roleBox: { border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, background: "#FBFCFE" },
  roleGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 11 },
  aiBtn: { display: "inline-flex", alignItems: "center", gap: 7, border: "none", background: "#EEF2FF", color: C.c1, borderRadius: 10, padding: "9px 15px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  aiBtnOff: { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#9CA3AF", borderRadius: 10, padding: "9px 15px", fontSize: 12.5, fontWeight: 700, cursor: "default", fontFamily: "inherit" },
  addBtn: { background: "#EEF2FF", color: C.c1, border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  mutBtn: { background: "#F1F5F9", color: C.slate, border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  removeRole: { background: "none", border: "none", color: C.mut, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" },
  x: { border: "none", background: "none", color: C.mut, fontSize: 19, cursor: "pointer", lineHeight: 1, padding: "0 4px", flex: "none" },
  chip: { display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", background: "#EEF2FF", color: "#4338CA", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  chipX: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.6 },

  // ── The sheet (styled resume — Sora, matching the product, not a serif doc) ──
  sheet: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 18px 44px rgba(15,23,42,.09)", fontFamily: "inherit", color: C.ink },
  pHead: { background: C.navy, padding: "26px 26px 22px", color: "#fff", position: "relative", overflow: "hidden" },
  pHeadGlow1: { position: "absolute", top: -110, right: -60, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,.4), transparent 68%)" },
  pHeadGlow2: { position: "absolute", bottom: -130, left: "14%", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.28), transparent 68%)" },
  pHeadLines: { position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 1px, transparent 1px 56px)" },
  pChip: { display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.13)", color: "#C7CEE4", borderRadius: 999, padding: "4px 11px", fontSize: 10.5, fontWeight: 500, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" },
  pSkill: { background: "#F5F3FF", border: "1px solid #E9E5FF", color: "#4C1D95", borderRadius: 7, padding: "5px 10px", fontSize: 10.8, fontWeight: 600 },
};

// ── ATS-safe template. Times-adjacent serif on purpose: it prints crisply,
// reads as a document rather than a web page, and parsers have no opinion.
const A: Record<string, CSSProperties> = {
  sheet: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(15,23,42,.08)", padding: "34px 38px", fontFamily: "Georgia, 'Times New Roman', serif", color: "#111827" },
  name: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.3px" },
  headline: { fontSize: 13.5, marginTop: 3, color: "#374151" },
  meta: { fontSize: 11, color: "#4B5563", marginTop: 6 },
  sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, borderBottom: "1px solid #D1D5DB", paddingBottom: 3, marginBottom: 8, color: "#111827" },
  body: { fontSize: 12, lineHeight: 1.55, margin: 0, color: "#1F2937" },
  role: { fontSize: 12.5, fontWeight: 700, color: "#111827" },
  years: { fontSize: 11, color: "#4B5563", flex: "none" },
  li: { fontSize: 11.5, lineHeight: 1.5, color: "#1F2937", marginBottom: 3 },
};
