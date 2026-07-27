"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CountryPicker } from "./edit-in-place";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initials } from "@/app/_components/ui";
import { RoadmapTeaser, type Insights } from "@/app/_components/roadmap";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";
const NAVY = "#0F172A";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

type Prov = "RESUME" | "CONFIRMED" | "USER_ADDED";
type Tier = "CORE" | "SECONDARY";
interface Skill { name: string; proficiency: string | null; confidence: number; source: Prov; tier: Tier }
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
  authorizedCountries: string[];
  relocateCountries: string[];
  relocateAnywhere: boolean;
}


const SENIORITIES = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC", "NOT_APPLICABLE"];
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
    told: { t: "from your resume", bg: "#e7f6ee", fg: "#0f6e56" },
    inferred: { t: "we inferred", bg: "#eef0ff", fg: INDIGO },
    guess: { t: "confirm?", bg: "#fdf0d5", fg: "#8a5a00" },
    added: { t: "you added", bg: "#e7f6ee", fg: "#0f6e56" },
  }[kind];
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: map.bg, color: map.fg, whiteSpace: "nowrap" }}>{map.t}</span>;
}

export default function ProfileEditor() {
  const router = useRouter();
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reup, setReup] = useState<"idle" | "working">("idle");
  const [reupErr, setReupErr] = useState<string | null>(null);
  const [reupLong, setReupLong] = useState(false); // >7s — likely a scanned PDF

  useEffect(() => {
    if (reup !== "working") { setReupLong(false); return; }
    const t = setTimeout(() => setReupLong(true), 7000);
    return () => clearTimeout(t);
  }, [reup]);
  const [industriesText, setIndustriesText] = useState("");
  const [locationsText, setLocationsText] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [roleGroups, setRoleGroups] = useState<{ field: string; roles: string[] }[]>([]);
  // Role gate: people pick their field/role in a popup before they reach the
  // stats, so "where you stand" is scoped to the right field from the start.
  const [roleModal, setRoleModal] = useState(false);
  const [mRole, setMRole] = useState("");
  const [mSen, setMSen] = useState("MID");
  // Work eligibility, asked in the same first-run modal: where the feed should
  // be scoped to. Seeded from the parsed location, because that IS the right
  // answer for most people — they just need the chance to say otherwise.
  const [mAuth, setMAuth] = useState<string[]>([]);
  const [mReloc, setMReloc] = useState<string[]>([]);
  const [mShowReloc, setMShowReloc] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [mErr, setMErr] = useState<string | null>(null);

  async function loadInsights() {
    try {
      const res = await fetch("/api/profile/insights");
      if (!res.ok) return;
      const data = await res.json();
      setInsights(data.insights);
    } catch { /* insights are optional */ }
  }

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
        // No role yet → gate the screen with the role popup (only if we have a
        // taxonomy to offer, so we never trap someone with an empty list).
        if (!data.profile.headline && (data.roleGroups?.length ?? 0) > 0) {
          setMSen(data.profile.seniority || "MID");
          // Seed eligibility from what we already know: saved answers if any,
          // else the parsed country. Pre-filling matters — most people ARE
          // authorised where they live, so the question should read as a
          // confirmation they can correct, not a form they must fill.
          const seeded: string[] = (data.profile.authorizedCountries ?? []).length
            ? data.profile.authorizedCountries
            : data.profile.country ? [data.profile.country] : [];
          setMAuth(seeded);
          setMReloc(data.profile.relocateCountries ?? []);
          setRoleModal(true);
        }
      } catch {
        setError("Couldn't load your profile.");
      }
    })();
    // Insights load separately — they're a nice-to-have, never block the editor.
    loadInsights();
  }, []);

  /** Save the role chosen in the gate popup, then re-scope the stats to it. */
  async function saveRole() {
    if (!mRole) return;
    setSavingRole(true); setMErr(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: mRole, seniority: mSen, authorizedCountries: mAuth, relocateCountries: mReloc }),
      });
      if (!res.ok) throw new Error("save");
      setP((cur) => (cur ? { ...cur, headline: mRole, seniority: mSen } : cur));
      setRoleModal(false);
      setInsights(null);        // show the "scoring…" state while we re-scope
      await loadInsights();
    } catch {
      setMErr("Couldn't save that — try again.");
    } finally {
      setSavingRole(false);
    }
  }

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
          skills: p.skills.map((s) => ({ name: s.name, proficiency: s.proficiency, source: s.source, tier: s.tier })),
          workHistory: p.workHistory.filter((w) => w.title || w.company),
          education: p.education.filter((e) => e.degree || e.institution),
          certifications: p.certifications,
          authorizedCountries: p.authorizedCountries,
          relocateCountries: p.relocateAnywhere ? [] : p.relocateCountries,
          relocateAnywhere: p.relocateAnywhere,
        }),
      });
      if (!res.ok) throw new Error("save");
      setSaved(true);
      router.push("/profile"); // land back on the profile to see the result
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Re-upload a resume to overwrite the parsed side of the profile (skills,
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
      if (!res.ok) throw new Error("Couldn't save the new resume");
      window.location.reload(); // reload the editor with the fresh parse
    } catch (e) {
      setReupErr(e instanceof Error ? e.message : "Something went wrong");
      setReup("idle");
    }
  }

  if (error && !p) return <div style={S.wrap}><p style={{ color: MUTED }}>{error}</p></div>;
  if (!p) return <div style={S.wrap}><p style={{ color: MUTED }}>Loading your profile…</p></div>;

  const firstName = p.fullName?.trim().split(/\s+/)[0] || "there";

  return (
    <div style={S.wrap}>
      <Link href="/profile" style={S.back}>← Back to profile</Link>

        {/* Highlighted hero — the product's core value, photo + greeting + where you stand */}
        <section style={S.hero}>
          <div style={S.heroGlow} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoUrl} alt={p.fullName ?? "You"} style={S.heroAvatar} />
              ) : (
                <div style={S.heroAvatarFallback}>{initials(p.fullName)}</div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1 style={S.heroGreeting}>{greeting()}, {firstName} 👋</h1>
                {insights?.reliable && (
                  <div style={S.heroEyebrow}>Where you stand · you against {insights.targetJobs} {insights.fieldLabel ?? "roles"}</div>
                )}
              </div>
              {p.tier === "PREMIUM" && <span style={S.tier}>Premium</span>}
            </div>

            {insights === null ? (
              <p style={S.heroMsg}>Scoring you against every live posting in your field…</p>
            ) : insights.reliable ? (
              <div style={S.heroStats}>
                <div style={S.heroStat}><div style={S.heroNum}>{insights.coveragePct ?? "—"}%</div><div style={S.heroSub}>of the skills your field asks for, you already have</div></div>
                {insights.seniority && (
                  <div style={S.heroStat}><div style={S.heroNum}>{insights.seniority.atOrAbove}</div><div style={S.heroSub}>roles at or above your level ({label(insights.seniority.level)}); {insights.seniority.below} below</div></div>
                )}
                {insights.skillGaps[0] && (
                  <div style={S.heroStat}><div style={S.heroNum}>{insights.skillGaps[0].pct}%</div><div style={S.heroSub}>want {insights.skillGaps[0].skill}{insights.skillGaps[0].youHave ? ` — you're only ${insights.skillGaps[0].youHave.toLowerCase()}` : ", which you don't list"}</div></div>
                )}
              </div>
            ) : (
              <p style={S.heroMsg}>
                {insights.fieldLabel
                  ? <>Your market is still thin — only {insights.targetJobs} {insights.fieldLabel.replace(/ roles( \(broad\))?$/, "")} {insights.targetJobs === 1 ? "role is" : "roles are"} open to your region, too few for reliable stats yet. They sharpen as we add sources in your market.</>
                  : "Pick your role below and we'll scope your stats to the right field."}
              </p>
            )}
          </div>
        </section>

        {/* Roadmap teaser — the diagnosis stays beside editing; the full
            roadmap lives in Career Coach (/coach) */}
        {insights && insights.reliable && <RoadmapTeaser insights={insights} />}

        <div style={S.editHead}>
          <h2 style={S.h2}>Edit your profile</h2>
          <p style={{ ...S.sub, margin: 0 }}>The badges show where we got each thing — your resume, our inference, or your own hand. Saving re-scores your matches.</p>
        </div>

        <section style={S.card}>
          <div style={S.cardLabel}>Replace your resume</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <label style={reup === "working" ? S.reupBtnBusy : S.reupBtn}>
              <input type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" style={{ display: "none" }} disabled={reup === "working"} onChange={(e) => { const f = e.target.files?.[0]; if (f) reupload(f); }} />
              {reup === "working" ? "Reading your new resume…" : "Upload a new resume"}
            </label>
            <div style={{ ...S.hint, flex: 1, minWidth: 220, marginTop: 0 }}>Refreshes your skills, experience, education and photo from the new file. Your job preferences and salary stay as they are.</div>
          </div>
          {reupErr && <p style={{ color: "#dc2626", fontSize: 13, margin: "10px 0 0" }}>{reupErr}</p>}
          {reup === "working" && reupLong && (
            <p style={{ background: "#F5F3FF", border: "1.5px solid #C4B5FD", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#4C1D95", lineHeight: 1.5, margin: "12px 0 0" }}>
              <strong>Taking a little longer —</strong> your PDF looks like a scanned or image-based file, so we&apos;re
              reading the pages the way a person would. That adds 10–20 seconds; everything still imports.
            </p>
          )}
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>Where you can work</div>
          <div style={{ ...S.hint, marginTop: 0 }}>
            This is what actually scopes your job feed — it&apos;s the only thing on this page that filters which jobs you see.
          </div>
          <CountryPicker
            label="I can work here without sponsorship"
            hint="Citizenship, permanent residency, or a visa that already lets you work."
            selected={p.authorizedCountries}
            onChange={(v) => { set("authorizedCountries", v); set("relocateCountries", p.relocateCountries.filter((c) => !v.includes(c))); }}
          />
          <div style={{ height: 16 }} />
          <button
            type="button"
            onClick={() => { set("relocateAnywhere", !p.relocateAnywhere); if (!p.relocateAnywhere) set("relocateCountries", []); }}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: `1px solid ${p.relocateAnywhere ? INDIGO : "#d4d4d8"}`, background: p.relocateAnywhere ? "#eef0ff" : "#fff", borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
          >
            <span style={{ flex: "none", width: 34, height: 20, borderRadius: 999, background: p.relocateAnywhere ? INDIGO : "#CBD5E1", position: "relative", transition: "background .15s" }}>
              <span style={{ position: "absolute", top: 2, left: p.relocateAnywhere ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
            </span>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>I&apos;d relocate anywhere for the right job</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>Skip picking countries one at a time — needs sponsorship everywhere you aren&apos;t already authorized.</div>
            </span>
          </button>
          {!p.relocateAnywhere && (
            <>
              <div style={{ height: 16 }} />
              <CountryPicker
                label="I'd move here for the right job"
                hint="You'd need sponsorship. We'll show these jobs and hide the ones that say outright they don't sponsor."
                selected={p.relocateCountries}
                exclude={p.authorizedCountries}
                onChange={(v) => set("relocateCountries", v)}
              />
            </>
          )}
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
          <div style={S.hint}>Shown on your public profile as a stated preference — it doesn&apos;t filter your feed. &quot;Where you can work&quot; above is what does that.</div>

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

        {/* Role gate — shown before the stats when no role is set yet. */}
        {roleModal && (
          <div style={S.overlay}>
            <div style={S.modal}>
              <div style={S.modalBar} />
              <div style={S.modalKicker}>First, one quick thing</div>
              <h2 style={S.modalTitle}>What&apos;s your field and role?</h2>
              <p style={S.modalSub}>We scope your stats, roadmap and job feed to this. Pick the closest — you can change it anytime.</p>

              <div style={S.qLabel}>Your role</div>
              <select style={{ ...S.wide, cursor: "pointer" }} value={mRole} onChange={(e) => setMRole(e.target.value)} autoFocus>
                <option value="">Choose your role…</option>
                {roleGroups.map((g) => (
                  <optgroup key={g.field} label={g.field}>
                    {g.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </optgroup>
                ))}
              </select>

              <div style={S.qLabel}>Seniority</div>
              <select style={{ ...S.wide, cursor: "pointer" }} value={mSen} onChange={(e) => setMSen(e.target.value)}>
                {SENIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>

              {/* Work eligibility — the other thing that scopes the feed. It is
                  seeded from the parsed location, so the common case is already
                  correct and this reads as a confirmation, not a form. */}
              <div style={{ ...S.qLabel, marginTop: 18 }}>Where can you work?</div>
              <CountryPicker
                label=""
                hint="Countries where you don't need sponsorship — citizenship, residency, or a visa you already hold."
                selected={mAuth}
                onChange={setMAuth}
              />
              {mShowReloc ? (
                <div style={{ marginTop: 14 }}>
                  <CountryPicker
                    label=""
                    hint="You'd move here for the right job and would need sponsoring. We'll show those jobs and drop the ones that say outright they don't sponsor."
                    selected={mReloc}
                    exclude={mAuth}
                    onChange={setMReloc}
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setMShowReloc(true)}
                  style={{ background: "none", border: "none", color: INDIGO, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "8px 0 0" }}>
                  I&apos;d also relocate somewhere →
                </button>
              )}

              {mErr && <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0" }}>{mErr}</p>}
              <button style={{ ...S.saveBtn, width: "100%", marginTop: 20, opacity: mRole && !savingRole ? 1 : 0.55 }} disabled={!mRole || savingRole} onClick={saveRole}>
                {savingRole ? "Setting up your stats…" : "Show me where I stand →"}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "var(--font-jakarta), sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  wrap: { maxWidth: 760, margin: "0 auto", padding: "0 0 80px" },
  back: { display: "inline-block", color: MUTED, textDecoration: "none", fontSize: 13, fontWeight: 600, marginBottom: 16 },
  h1: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 30, margin: "0 0 8px" },
  tier: { fontSize: 12, fontWeight: 700, color: "#7a3cff", background: "#f0eaff", padding: "4px 12px", borderRadius: 20 },
  sub: { color: MUTED, fontSize: 15, lineHeight: 1.55, margin: "0 0 24px" },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 16 },
  // Highlighted stats hero — matches the feed's dark "Good morning" hero.
  hero: { background: NAVY, borderRadius: 18, padding: "22px 24px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 16 },
  heroGlow: { position: "absolute", top: -100, right: -40, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)", pointerEvents: "none" },
  heroAvatar: { width: 56, height: 56, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", border: "2px solid rgba(255,255,255,.25)", flex: "none" },
  heroAvatarFallback: { width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20, flex: "none" },
  heroGreeting: { margin: 0, fontFamily: "var(--font-sora), sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px" },
  heroEyebrow: { fontSize: 11, color: "#B9C0D4", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 },
  heroMsg: { margin: "14px 0 0", fontSize: 13, color: "#B9C0D4", lineHeight: 1.6, maxWidth: 560, position: "relative" },
  heroStats: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 },
  heroStat: { flex: "1 1 170px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" },
  heroNum: { fontFamily: "var(--font-sora), sans-serif", fontSize: 26, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" },
  heroSub: { fontSize: 12, color: "#B9C0D4", marginTop: 5, lineHeight: 1.5 },
  editHead: { margin: "26px 0 14px" },
  h2: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 20, margin: "0 0 6px", color: INK },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 },
  modal: { background: "#fff", borderRadius: 18, padding: "28px 26px", maxWidth: 460, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,.3)", position: "relative", overflow: "hidden" },
  modalBar: { position: "absolute", left: 0, right: 0, top: 0, height: 5, background: "linear-gradient(135deg,#6366F1,#8B5CF6)" },
  modalKicker: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#8B5CF6", marginBottom: 8 },
  modalTitle: { fontFamily: "var(--font-sora), sans-serif", fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: INK },
  modalSub: { fontSize: 14, color: MUTED, lineHeight: 1.55, margin: "0 0 20px" },
  cardLabel: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 12 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, margin: "14px 0 0" },
  input: { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 15, fontFamily: "inherit", background: "#fff" },
  wide: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 15, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  qLabel: { fontSize: 13, fontWeight: 600, color: INK, margin: "16px 0 6px", display: "flex", alignItems: "center", gap: 6 },
  hint: { fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.45 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  reupBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: INDIGO, color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  reupBtnBusy: { display: "inline-flex", alignItems: "center", gap: 8, background: "#c7c7d1", color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "default", whiteSpace: "nowrap" },
  certChip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#f0eaff", color: "#5a3ccf", borderRadius: 999, fontSize: 13, fontWeight: 600 },
  chipX: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 },
  pillOn: { padding: "8px 16px", borderRadius: 20, border: `1px solid ${INDIGO}`, background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { padding: "8px 16px", borderRadius: 20, border: "1px solid #d4d4d8", background: "#fff", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  err: { color: "#b42318", fontSize: 14, margin: "0 0 12px" },
  // A full-width white stripe so the save action is always findable — the
  // button floating transparently over content was easy to lose.
  saveBar: { display: "flex", alignItems: "center", gap: 14, position: "sticky", bottom: 0, padding: "14px 20px", background: "#fff", borderTop: "1px solid #ececf2", boxShadow: "0 -8px 20px rgba(15,23,42,.07)", width: "100%", boxSizing: "border-box", borderRadius: "12px 12px 0 0", zIndex: 20 },
  saveBtn: { flex: "1 1 auto", maxWidth: 340, padding: "13px 28px", background: INDIGO, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" },
  savedNote: { color: "#0f6e56", fontSize: 14, fontWeight: 600 },
};
