"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { initials } from "@/app/_components/ui";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Prov = "RESUME" | "CONFIRMED" | "USER_ADDED";
interface Skill { name: string; proficiency: string | null; confidence: number; source: Prov }
interface Profile {
  fullName: string | null;
  photoUrl: string | null;
  headline: string | null;
  seniority: string | null;
  yearsExperience: number | null;
  currentLocation: string | null;
  country: string | null;
  industries: string[];
  employmentTypes: string[];
  remoteTypes: string[];
  locations: string[];
  salaryFloor: number | null;
  salaryTarget: number | null;
  salaryPeriod: string | null;
  workAuthorization: string;
  tier: string;
  skills: Skill[];
  workHistory: { title?: string; company?: string; years?: string }[];
  education: { degree?: string; institution?: string; year?: string }[];
  certifications: string[];
}

interface SkillGap { skill: string; jobsWanting: number; pct: number; youHave: string | null }
interface Insights {
  fieldLabel: string | null;
  targetJobs: number;
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null;
  skillGaps: SkillGap[];
  certs: { label: string; jobs: number }[];
  premiumFrom: number;
  inferred: boolean;
  reliable: boolean;
}

const SENIORITIES = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC", "NOT_APPLICABLE"];
const PROFICIENCIES = ["FAMILIAR", "PROFICIENT", "ADVANCED", "EXPERT"];
const WORK_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "HOURLY", "TEMPORARY"];
const REMOTE = [
  { label: "In office", values: ["ONSITE"] },
  { label: "Hybrid", values: ["HYBRID"] },
  { label: "Remote", values: ["REMOTE_US", "REMOTE_GLOBAL", "REMOTE_INTL"] },
];
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

// Provenance is the point: show where each thing came from, honestly.
function Badge({ kind }: { kind: "told" | "inferred" | "guess" | "added" }) {
  const map = {
    told: { t: "from your résumé", bg: "#e7f6ee", fg: "#0f6e56" },
    inferred: { t: "we inferred", bg: "#eef0ff", fg: INDIGO },
    guess: { t: "confirm?", bg: "#fdf0d5", fg: "#8a5a00" },
    added: { t: "you added", bg: "#e7f6ee", fg: "#0f6e56" },
  }[kind];
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: map.bg, color: map.fg, whiteSpace: "nowrap" }}>{map.t}</span>;
}

const skillBadge = (s: Skill): "told" | "guess" | "added" =>
  s.source === "USER_ADDED" ? "added" : s.confidence < 0.8 ? "guess" : "told";

export default function ProfileEditor() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [newCert, setNewCert] = useState("");
  const [reup, setReup] = useState<"idle" | "working">("idle");
  const [reupErr, setReupErr] = useState<string | null>(null);
  const [industriesText, setIndustriesText] = useState("");
  const [locationsText, setLocationsText] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [tier, setTier] = useState<string>("FREE");
  const [roleGroups, setRoleGroups] = useState<{ field: string; roles: string[] }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) throw new Error("load");
        const data = await res.json();
        setP(data.profile);
        setRoleGroups(data.roleGroups || []);
        setIndustriesText((data.profile.industries || []).join(", "));
        setLocationsText((data.profile.locations || []).join(", "));
      } catch {
        setError("Couldn't load your profile.");
      }
    })();
    // Insights load separately — they're a nice-to-have, never block the editor.
    (async () => {
      try {
        const res = await fetch("/api/profile/insights");
        if (!res.ok) return;
        const data = await res.json();
        setInsights(data.insights);
        setTier(data.tier ?? "FREE");
      } catch { /* insights are optional */ }
    })();
  }, []);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => { setP((cur) => (cur ? { ...cur, [k]: v } : cur)); setSaved(false); };
  const toggle = (k: "employmentTypes", v: string) => set(k, (p![k].includes(v) ? p![k].filter((x) => x !== v) : [...p![k], v]));
  const remoteOn = (vals: string[]) => vals.every((v) => p!.remoteTypes.includes(v));
  const toggleRemote = (vals: string[]) =>
    set("remoteTypes", remoteOn(vals) ? p!.remoteTypes.filter((v) => !vals.includes(v)) : [...new Set([...p!.remoteTypes, ...vals])]);

  async function save() {
    if (!p) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: p.headline,
          seniority: p.seniority,
          yearsExperience: p.yearsExperience,
          currentLocation: p.currentLocation,
          industries: industriesText.split(",").map((s) => s.trim()).filter(Boolean),
          employmentTypes: p.employmentTypes,
          remoteTypes: p.remoteTypes,
          locations: locationsText.split(",").map((s) => s.trim()).filter(Boolean),
          salaryFloor: p.salaryFloor,
          salaryTarget: p.salaryTarget,
          salaryPeriod: p.salaryPeriod ?? "YEAR",
          workAuthorization: p.workAuthorization,
          photoUrl: p.photoUrl,
          skills: p.skills.map((s) => ({ name: s.name, proficiency: s.proficiency, source: s.source })),
          workHistory: p.workHistory.filter((w) => w.title || w.company),
          education: p.education.filter((e) => e.degree || e.institution),
          certifications: p.certifications,
        }),
      });
      if (!res.ok) throw new Error("save");
      setSaved(true);
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Re-upload a résumé to overwrite the parsed side of the profile (skills,
   * experience, education, certifications, headline, photo) while KEEPING the
   * job preferences and salary the person set by hand — we pass the current
   * preferences straight back so createOrUpdateProfile's upsert doesn't wipe them.
   */
  async function reupload(file: File) {
    if (!p) return;
    setReup("working"); setReupErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const pr = await fetch("/api/parse", { method: "POST", body: form });
      const pd = await pr.json();
      if (!pr.ok) throw new Error(pd.error || "Couldn't read that file");
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsed: pd.parsed,
          resumeText: pd.resumeText,
          photo: pd.photo,
          preferences: {
            employmentTypes: p.employmentTypes,
            remoteTypes: p.remoteTypes,
            locations: p.locations,
            salaryFloor: p.salaryFloor,
            salaryTarget: p.salaryTarget,
            salaryPeriod: p.salaryPeriod ?? null,
            workAuthorization: p.workAuthorization,
          },
        }),
      });
      if (!res.ok) throw new Error("Couldn't save the new résumé");
      window.location.reload(); // reload the editor with the fresh parse
    } catch (e) {
      setReupErr(e instanceof Error ? e.message : "Something went wrong");
      setReup("idle");
    }
  }

  if (error && !p) return <div style={S.wrap}><p style={{ color: MUTED }}>{error}</p></div>;
  if (!p) return <div style={S.wrap}><p style={{ color: MUTED }}>Loading your profile…</p></div>;

  return (
    <div style={S.wrap}>
      <Link href="/profile" style={S.back}>← Back to profile</Link>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={S.h1}>{p.fullName || "Your profile"}</h1>
          {p.tier === "PREMIUM" && <span style={S.tier}>Premium</span>}
        </div>
        <p style={S.sub}>Edit anything. The badges show where we got it — your résumé, our inference, or your own hand. Saving re-scores your matches.</p>

        <section style={S.card}>
          <div style={S.cardLabel}>Replace your résumé</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <label style={reup === "working" ? S.reupBtnBusy : S.reupBtn}>
              <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" style={{ display: "none" }} disabled={reup === "working"} onChange={(e) => { const f = e.target.files?.[0]; if (f) reupload(f); }} />
              {reup === "working" ? "Reading your new résumé…" : "Upload a new résumé"}
            </label>
            <div style={{ ...S.hint, flex: 1, minWidth: 220, marginTop: 0 }}>Refreshes your skills, experience, education and photo from the new file. Your job preferences and salary stay as they are.</div>
          </div>
          {reupErr && <p style={{ color: "#dc2626", fontSize: 13, margin: "10px 0 0" }}>{reupErr}</p>}
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>Profile photo <Badge kind="told" /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt="Profile" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "1px solid #ececf2" }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#eef0ff", color: INDIGO, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 24 }}>
                {initials(p.fullName)}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
                {p.photoUrl ? "Pulled from your CV. Uploading a new one is coming soon." : "No photo found in your CV. Uploading one is coming soon."}
              </div>
              {p.photoUrl && (
                <button style={{ ...S.addRow, background: "#fff", border: "1px solid #d4d4d8", color: INK, marginTop: 10 }} onClick={() => set("photoUrl", null)}>Remove photo</button>
              )}
            </div>
          </div>
        </section>

        {insights && !insights.reliable && insights.fieldLabel && (
          <section style={S.card}>
            <div style={S.cardLabel}>Where you stand</div>
            <div style={S.inferNote}>
              Only {insights.targetJobs} {insights.fieldLabel.replace(/ roles( \(broad\))?$/, "")} {insights.targetJobs === 1 ? "role is" : "roles are"} open to your region right now — too few for reliable stats or a roadmap. These sharpen as we add sources in your market.
            </div>
          </section>
        )}

        {insights && insights.reliable && (
          <>
            <section style={S.card}>
              <div style={S.cardLabel}>Where you stand · you against {insights.targetJobs} {insights.fieldLabel ?? "jobs"}</div>
              {insights.inferred && (
                <div style={S.inferNote}>
                  We guessed your field from your closest matches. Set your job title above to sharpen this.
                </div>
              )}
              <div style={S.statGrid}>
                <div style={S.stat}>
                  <div style={S.statNum}>{insights.coveragePct ?? "—"}%</div>
                  <div style={S.statLabel}>of the skills your field asks for, you already have</div>
                </div>
                {insights.seniority && (
                  <div style={S.stat}>
                    <div style={S.statNum}>{insights.seniority.atOrAbove}</div>
                    <div style={S.statLabel}>roles at or above your level ({label(insights.seniority.level)}); {insights.seniority.below} below</div>
                  </div>
                )}
                <div style={S.stat}>
                  <div style={S.statNum}>{insights.skillGaps[0].pct}%</div>
                  <div style={S.statLabel}>want {insights.skillGaps[0].skill}{insights.skillGaps[0].youHave ? ` — you're only ${insights.skillGaps[0].youHave.toLowerCase()}` : ", which you don't list"}</div>
                </div>
              </div>
            </section>

            <section style={S.card}>
              <div style={S.cardLabel}>Your roadmap · what these jobs ask that you don&apos;t have yet</div>
              <div style={S.diagnosis}>
                <i className="ti" aria-hidden="true" />
                Biggest lever: <strong>{insights.skillGaps[0].skill}</strong> — named in {insights.skillGaps[0].pct}% of {insights.fieldLabel ?? "these roles"}.
              </div>
              {insights.skillGaps.map((g, i) => {
                const premium = i >= insights.premiumFrom && tier !== "PREMIUM";
                return (
                  <div key={g.skill} style={S.step}>
                    <div style={{ flex: 1 }}>
                      <div style={S.stepTitle}>
                        {g.youHave ? `Take ${g.skill} from ${g.youHave.toLowerCase()} to advanced` : `Add ${g.skill}`}
                      </div>
                      <div style={S.stepMeta}>named in {g.pct}% of your field · {g.youHave ? `you're ${g.youHave.toLowerCase()}` : "not on your profile"}</div>
                    </div>
                    {i === 0 ? <span style={S.freeTag}>biggest gap</span> : premium ? <span style={S.premTag}>premium</span> : null}
                  </div>
                );
              })}
              {insights.certs.length > 0 && (
                <div style={S.step}>
                  <div style={{ flex: 1 }}>
                    <div style={S.stepTitle}>{insights.certs[0].label}</div>
                    <div style={S.stepMeta}>named in {insights.certs[0].jobs} of your field&apos;s postings</div>
                  </div>
                  {tier !== "PREMIUM" && <span style={S.premTag}>premium</span>}
                </div>
              )}
              <div style={S.foot}>Every step is counted from real postings, never invented. Free while we&apos;re new — the tag shows where premium will fall later.</div>
            </section>
          </>
        )}

        <section style={S.card}>
          <div style={S.cardLabel}>Your field and role</div>
          {!p.headline && (
            <div style={S.inferNote}>
              Pick your role so we scope your feed and roadmap to the right field — otherwise we have to guess, and skills like &quot;business development&quot; can pull you toward the wrong one.
            </div>
          )}
          <div style={S.row}>
            <select style={{ ...S.input, cursor: "pointer" }} value={p.headline ?? ""} onChange={(e) => set("headline", e.target.value || null)}>
              <option value="">Choose your role…</option>
              {roleGroups.map((g) => (
                <optgroup key={g.field} label={g.field}>
                  {g.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </optgroup>
              ))}
              {p.headline && !roleGroups.some((g) => g.roles.includes(p.headline!)) && (
                <option value={p.headline}>{p.headline} (from your résumé)</option>
              )}
            </select>
            <select style={S.select} value={p.seniority ?? "NOT_APPLICABLE"} onChange={(e) => set("seniority", e.target.value)}>
              {SENIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </div>
          <div style={S.provRow}><Badge kind="inferred" /> seniority · you choose the role, so it&apos;s never a guess</div>

          <div style={S.grid}>
            <div>
              <div style={S.qLabel}>Years of experience</div>
              <input style={S.input} type="number" value={p.yearsExperience ?? ""} onChange={(e) => set("yearsExperience", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <div style={S.qLabel}>Where you are <Badge kind="told" /></div>
              <input style={S.input} value={p.currentLocation ?? ""} onChange={(e) => set("currentLocation", e.target.value)} />
              {p.country && <div style={S.hint}>Feed scoped to {p.country}. Change your location to change it.</div>}
            </div>
          </div>

          <div style={S.qLabel}>Industries <Badge kind="inferred" /></div>
          <input style={S.wide} value={industriesText} placeholder="healthcare, b2b saas" onChange={(e) => { setIndustriesText(e.target.value); setSaved(false); }} />
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>Skills — tap to set how strong, × to remove</div>
          <div style={S.skills}>
            {p.skills.map((s, i) => (
              <div key={s.name} style={S.skillRow}>
                <div style={{ flex: 1, fontSize: 14 }}>{s.name}</div>
                <select style={S.skillSel} value={s.proficiency ?? ""} onChange={(e) => set("skills", p.skills.map((x, j) => j === i ? { ...x, proficiency: e.target.value || null } : x))}>
                  <option value="">level?</option>
                  {PROFICIENCIES.map((pr) => <option key={pr} value={pr}>{label(pr)}</option>)}
                </select>
                <Badge kind={skillBadge(s)} />
                <button aria-label={`Remove ${s.name}`} style={S.x} onClick={() => set("skills", p.skills.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input style={S.input} placeholder="Add a skill…" value={newSkill} onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSkill.trim()) {
                  set("skills", [...p.skills, { name: newSkill.trim(), proficiency: null, confidence: 1, source: "USER_ADDED" }]);
                  setNewSkill("");
                }
              }} />
          </div>
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>Experience <Badge kind="told" /></div>
          {p.workHistory.length === 0 && <div style={S.hint}>Nothing yet — add your roles so your profile and matches reflect them.</div>}
          {p.workHistory.map((w, i) => (
            <div key={i} style={S.histRow}>
              <input style={S.wide} placeholder="Job title" value={w.title ?? ""} onChange={(e) => set("workHistory", p.workHistory.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input style={S.input} placeholder="Company" value={w.company ?? ""} onChange={(e) => set("workHistory", p.workHistory.map((x, j) => j === i ? { ...x, company: e.target.value } : x))} />
                <input style={S.input} placeholder="e.g. 2021–Present" value={w.years ?? ""} onChange={(e) => set("workHistory", p.workHistory.map((x, j) => j === i ? { ...x, years: e.target.value } : x))} />
                <button aria-label="Remove" style={S.x} onClick={() => set("workHistory", p.workHistory.filter((_, j) => j !== i))}>×</button>
              </div>
            </div>
          ))}
          <button style={S.addRow} onClick={() => set("workHistory", [...p.workHistory, { title: "", company: "", years: "" }])}>+ Add experience</button>
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>Education <Badge kind="told" /></div>
          {p.education.length === 0 && <div style={S.hint}>Add your degrees and schools.</div>}
          {p.education.map((ed, i) => (
            <div key={i} style={S.histRow}>
              <input style={S.wide} placeholder="Degree" value={ed.degree ?? ""} onChange={(e) => set("education", p.education.map((x, j) => j === i ? { ...x, degree: e.target.value } : x))} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input style={S.input} placeholder="Institution" value={ed.institution ?? ""} onChange={(e) => set("education", p.education.map((x, j) => j === i ? { ...x, institution: e.target.value } : x))} />
                <input style={S.input} placeholder="Year" value={ed.year ?? ""} onChange={(e) => set("education", p.education.map((x, j) => j === i ? { ...x, year: e.target.value } : x))} />
                <button aria-label="Remove" style={S.x} onClick={() => set("education", p.education.filter((_, j) => j !== i))}>×</button>
              </div>
            </div>
          ))}
          <button style={S.addRow} onClick={() => set("education", [...p.education, { degree: "", institution: "", year: "" }])}>+ Add education</button>
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>Certifications & licenses <Badge kind="told" /></div>
          <div style={S.chips}>
            {p.certifications.map((c, i) => (
              <span key={c + i} style={S.certChip}>{c}<button aria-label={`Remove ${c}`} style={S.chipX} onClick={() => set("certifications", p.certifications.filter((_, j) => j !== i))}>×</button></span>
            ))}
          </div>
          <input style={{ ...S.wide, marginTop: 10 }} placeholder="Add a certification, then Enter" value={newCert}
            onChange={(e) => setNewCert(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newCert.trim()) { set("certifications", [...p.certifications, newCert.trim()]); setNewCert(""); } }} />
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>What you want <Badge kind="told" /></div>
          <div style={S.qLabel}>Work type</div>
          <div style={S.chips}>
            {WORK_TYPES.map((w) => <button key={w} style={p.employmentTypes.includes(w) ? S.pillOn : S.pillOff} onClick={() => toggle("employmentTypes", w)}>{label(w)}</button>)}
          </div>
          <div style={S.qLabel}>Location / remote</div>
          <div style={S.chips}>
            {REMOTE.map((r) => <button key={r.label} style={remoteOn(r.values) ? S.pillOn : S.pillOff} onClick={() => toggleRemote(r.values)}>{r.label}</button>)}
          </div>
          <div style={S.qLabel}>Where you'd consider working</div>
          <input style={S.wide} value={locationsText} placeholder="Austin, Denver, anywhere in California" onChange={(e) => { setLocationsText(e.target.value); setSaved(false); }} />

          <div style={S.grid}>
            <div>
              <div style={S.qLabel}>Won't go below</div>
              <input style={S.input} type="number" value={p.salaryFloor ?? ""} onChange={(e) => set("salaryFloor", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <div style={S.qLabel}>Aiming for</div>
              <input style={S.input} type="number" value={p.salaryTarget ?? ""} onChange={(e) => set("salaryTarget", e.target.value ? Number(e.target.value) : null)} />
            </div>
          </div>
          <div style={S.hint}>We hide jobs below your minimum. Your target only nudges ranking — you never lose a match for aiming high.</div>
        </section>

        {error && <p style={S.err}>{error}</p>}
        <div style={S.saveBar}>
          <button style={S.saveBtn} onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}</button>
          {saved && <span style={S.savedNote}>Re-scored your matches.</span>}
        </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  wrap: { maxWidth: 760, margin: "0 auto", padding: "0 0 80px" },
  back: { display: "inline-block", color: MUTED, textDecoration: "none", fontSize: 13, fontWeight: 600, marginBottom: 16 },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 30, margin: "0 0 8px" },
  tier: { fontSize: 12, fontWeight: 700, color: "#7a3cff", background: "#f0eaff", padding: "4px 12px", borderRadius: 20 },
  sub: { color: MUTED, fontSize: 15, lineHeight: 1.55, margin: "0 0 24px" },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 16 },
  inferNote: { fontSize: 12, color: "#8a5a00", background: "#fdf0d5", borderRadius: 8, padding: "8px 10px", marginBottom: 12, lineHeight: 1.45 } as const,
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 },
  stat: { background: "#f7f7fb", borderRadius: 10, padding: 14 },
  statNum: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 26, color: INDIGO },
  statLabel: { fontSize: 12, color: MUTED, lineHeight: 1.4, marginTop: 4 },
  diagnosis: { background: "#eef0ff", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "#3a34a8", lineHeight: 1.5, marginBottom: 14 },
  step: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #f2f2f5" },
  stepTitle: { fontSize: 14, color: INK },
  stepMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
  freeTag: { fontSize: 11, color: MUTED, whiteSpace: "nowrap" },
  premTag: { fontSize: 11, padding: "2px 9px", borderRadius: 12, background: "#f0eaff", color: "#7a3cff", whiteSpace: "nowrap" },
  foot: { fontSize: 12, color: MUTED, borderTop: "1px solid #f2f2f5", marginTop: 6, paddingTop: 12, lineHeight: 1.45 },
  cardLabel: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 12 },
  row: { display: "flex", gap: 10 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, margin: "14px 0 0" },
  input: { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 15, fontFamily: "inherit", background: "#fff" },
  wide: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 15, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  select: { padding: "10px 12px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 15, background: "#fff", fontFamily: "inherit" },
  provRow: { fontSize: 12, color: MUTED, marginTop: 8, display: "flex", alignItems: "center", gap: 6 },
  qLabel: { fontSize: 13, fontWeight: 600, color: INK, margin: "16px 0 6px", display: "flex", alignItems: "center", gap: 6 },
  hint: { fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.45 },
  skills: { display: "flex", flexDirection: "column", gap: 8 },
  skillRow: { display: "flex", alignItems: "center", gap: 10 },
  skillSel: { padding: "6px 8px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 13, background: "#fff", fontFamily: "inherit" },
  x: { border: "none", background: "none", color: MUTED, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  histRow: { padding: "12px 0", borderTop: "1px solid #f2f2f5" },
  addRow: { marginTop: 12, background: "#eef0ff", color: INDIGO, border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  reupBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: INDIGO, color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  reupBtnBusy: { display: "inline-flex", alignItems: "center", gap: 8, background: "#c7c7d1", color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "default", whiteSpace: "nowrap" },
  certChip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#f0eaff", color: "#5a3ccf", borderRadius: 999, fontSize: 13, fontWeight: 600 },
  chipX: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 },
  pillOn: { padding: "8px 16px", borderRadius: 20, border: `1px solid ${INDIGO}`, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { padding: "8px 16px", borderRadius: 20, border: "1px solid #d4d4d8", background: "#fff", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  err: { color: "#b42318", fontSize: 14, margin: "0 0 12px" },
  saveBar: { display: "flex", alignItems: "center", gap: 14, position: "sticky", bottom: 0, padding: "16px 0" },
  saveBtn: { padding: "13px 28px", background: INDIGO, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" },
  savedNote: { color: "#0f6e56", fontSize: 14, fontWeight: 600 },
};
