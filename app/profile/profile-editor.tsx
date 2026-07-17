"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Prov = "RESUME" | "CONFIRMED" | "USER_ADDED";
interface Skill { name: string; proficiency: string | null; confidence: number; source: Prov }
interface Profile {
  fullName: string | null;
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
  const [industriesText, setIndustriesText] = useState("");
  const [locationsText, setLocationsText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) throw new Error("load");
        const data = await res.json();
        setP(data.profile);
        setIndustriesText((data.profile.industries || []).join(", "));
        setLocationsText((data.profile.locations || []).join(", "));
      } catch {
        setError("Couldn't load your profile.");
      }
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
          skills: p.skills.map((s) => ({ name: s.name, proficiency: s.proficiency, source: s.source })),
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

  if (error && !p) return <main style={S.page}><div style={S.wrap}><p style={{ color: MUTED }}>{error}</p></div></main>;
  if (!p) return <main style={S.page}><div style={S.wrap}><p style={{ color: MUTED }}>Loading your profile…</p></div></main>;

  return (
    <main style={S.page}>
      <header style={S.nav}>
        <Link href="/feed" style={S.brand}>topezia</Link>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <Link href="/feed" style={S.navLink}>Feed</Link>
          <Link href="/settings" style={S.navLink}>Settings</Link>
        </div>
      </header>

      <div style={S.wrap}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={S.h1}>{p.fullName || "Your profile"}</h1>
          {p.tier === "PREMIUM" && <span style={S.tier}>Premium</span>}
        </div>
        <p style={S.sub}>Edit anything. The badges show where we got it — your résumé, our inference, or your own hand. Saving re-scores your matches.</p>

        <section style={S.card}>
          <div style={S.cardLabel}>You look like a</div>
          <div style={S.row}>
            <input style={S.input} value={p.headline ?? ""} placeholder="e.g. backend engineer" onChange={(e) => set("headline", e.target.value)} />
            <select style={S.select} value={p.seniority ?? "NOT_APPLICABLE"} onChange={(e) => set("seniority", e.target.value)}>
              {SENIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </div>
          <div style={S.provRow}><Badge kind="told" /> headline · <Badge kind="inferred" /> seniority</div>

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
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  wrap: { maxWidth: 720, margin: "0 auto", padding: "36px 20px 80px" },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 30, margin: "0 0 8px" },
  tier: { fontSize: 12, fontWeight: 700, color: "#7a3cff", background: "#f0eaff", padding: "4px 12px", borderRadius: 20 },
  sub: { color: MUTED, fontSize: 15, lineHeight: 1.55, margin: "0 0 24px" },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 16 },
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
  pillOn: { padding: "8px 16px", borderRadius: 20, border: `1px solid ${INDIGO}`, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { padding: "8px 16px", borderRadius: 20, border: "1px solid #d4d4d8", background: "#fff", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  err: { color: "#b42318", fontSize: 14, margin: "0 0 12px" },
  saveBar: { display: "flex", alignItems: "center", gap: 14, position: "sticky", bottom: 0, padding: "16px 0" },
  saveBtn: { padding: "13px 28px", background: INDIGO, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" },
  savedNote: { color: "#0f6e56", fontSize: 14, fontWeight: 600 },
};
