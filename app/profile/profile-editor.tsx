"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { initials } from "@/app/_components/ui";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";
const NAVY = "#0F172A";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

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
interface NextSkill { skill: string; withSkill: string; pairJobs: number; pairPct: number }
interface LadderStep { skill: string; nextPct: number; yourPct: number; jobs: number }
interface Insights {
  fieldLabel: string | null;
  targetJobs: number;
  seniority: { level: string; atOrAbove: number; below: number } | null;
  coveragePct: number | null;
  skillGaps: SkillGap[];
  nextSkills: NextSkill[];
  ladder: { from: string; to: string; atLevelJobs: number; nextLevelJobs: number; steps: LadderStep[] } | null;
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

// A to-scale demand meter. The number always rides beside the bar — the bar is
// the shape, the label is the fact, so nothing reads by color alone.
function Meter({ pct, color = "#8B5CF6" }: { pct: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "1 1 220px", minWidth: 160 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: "#f1f1f6" }}>
        <div style={{ width: pct === 0 ? 0 : `${Math.max(2, Math.min(100, pct))}%`, height: "100%", borderRadius: 4, background: color }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
    </div>
  );
}

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
  // Role gate: people pick their field/role in a popup before they reach the
  // stats, so "where you stand" is scoped to the right field from the start.
  const [roleModal, setRoleModal] = useState(false);
  const [mRole, setMRole] = useState("");
  const [mSen, setMSen] = useState("MID");
  const [savingRole, setSavingRole] = useState(false);
  const [mErr, setMErr] = useState<string | null>(null);

  async function loadInsights() {
    try {
      const res = await fetch("/api/profile/insights");
      if (!res.ok) return;
      const data = await res.json();
      setInsights(data.insights);
      setTier(data.tier ?? "FREE");
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
        body: JSON.stringify({ headline: mRole, seniority: mSen }),
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

        {/* Roadmap — the second half of the pitch, kept right under the stats */}
        {insights && insights.reliable && (
          <section style={S.roadmapCard}>
            <div style={S.cardLabel}>Your roadmap · what these jobs ask that you don&apos;t have yet</div>
            <div style={S.diagnosis}>
              <i className="ti" aria-hidden="true" />
              Biggest lever: <strong>{insights.skillGaps[0].skill}</strong> — named in {insights.skillGaps[0].pct}% of {insights.fieldLabel ?? "these roles"}.
            </div>
            <div style={S.secSub}>Each bar is the share of the {insights.targetJobs} postings in your field that name it.</div>
            {insights.skillGaps.map((g, i) => {
              const premium = i >= insights.premiumFrom && tier !== "PREMIUM";
              return (
                <div key={g.skill} style={S.gapRow}>
                  <div style={S.rowTop}>
                    <div style={S.rowTitle}>{g.youHave ? `Take ${g.skill} from ${g.youHave.toLowerCase()} to advanced` : `Add ${g.skill}`}</div>
                    {i === 0 ? <span style={S.freeTag}>biggest gap</span> : premium ? <span style={S.premTag}>premium</span> : null}
                  </div>
                  <div style={S.meterRow}>
                    <Meter pct={g.pct} />
                    <span style={S.meterNote}>{g.youHave ? `you're ${g.youHave.toLowerCase()} today` : "not on your profile yet"}</span>
                  </div>
                </div>
              );
            })}
            {/* Learn-this-next: gaps ranked by the pull of skills you already have */}
            {insights.nextSkills.length > 0 && (
              <div style={S.sec}>
                <div style={S.secHead}><span style={S.secDot} />Learn this next · what rides along with skills you have</div>
                <div style={S.secSub}>Of the postings asking for a skill you already have, the share that also name the next one.</div>
                {insights.nextSkills.map((n, i) => {
                  const premium = i >= 1 && tier !== "PREMIUM";
                  return (
                    <div key={n.skill} style={S.gapRow}>
                      <div style={S.rowTop}>
                        <div style={{ ...S.rowTitle, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={S.chipHave}>you have · {n.withSkill}</span>
                          <span aria-hidden="true" style={{ color: MUTED }}>→</span>
                          <span style={S.chipNext}>{n.skill}</span>
                        </div>
                        {i === 0 ? <span style={S.freeTag}>strongest pull</span> : premium ? <span style={S.premTag}>premium</span> : null}
                      </div>
                      <div style={S.meterRow}>
                        <Meter pct={n.pairPct} />
                        <span style={S.meterNote}>{n.pairJobs} postings name both</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Ladder: the counted diff between your level's postings and the next level's */}
            {insights.ladder && (
              <div style={S.sec}>
                <div style={S.secHead}><span style={S.secDot} />The jump to {label(insights.ladder.to)} · what the next level&apos;s postings add</div>
                <div style={S.secSub}>
                  How often the {insights.ladder.nextLevelJobs} {label(insights.ladder.to).toLowerCase()} postings in your field name it, against the {insights.ladder.atLevelJobs} at your level.
                </div>
                {insights.ladder.steps.map((s, i) => {
                  const premium = i >= 1 && tier !== "PREMIUM";
                  return (
                    <div key={s.skill} style={S.gapRow}>
                      <div style={S.rowTop}>
                        <div style={S.rowTitle}>{s.skill}</div>
                        {i === 0 ? <span style={S.freeTag}>next-level diff</span> : premium ? <span style={S.premTag}>premium</span> : null}
                      </div>
                      <div style={S.lvlRow}><span style={S.lvlLabel}>{label(insights.ladder!.to).toLowerCase()}</span><Meter pct={s.nextPct} /></div>
                      <div style={S.lvlRow}><span style={S.lvlLabel}>you</span><Meter pct={s.yourPct} color="#c9cbd6" /></div>
                    </div>
                  );
                })}
              </div>
            )}
            {insights.certs.length > 0 && (
              <div style={S.sec}>
                <div style={S.secHead}><span style={S.secDot} />Certifications your field names</div>
                <div style={S.gapRow}>
                  <div style={S.rowTop}>
                    <div style={S.rowTitle}>{insights.certs[0].label}</div>
                    {tier !== "PREMIUM" && <span style={S.premTag}>premium</span>}
                  </div>
                  <div style={S.rowMeta}>named in {insights.certs[0].jobs} of your field&apos;s postings</div>
                </div>
              </div>
            )}
            <div style={S.foot}>Every step is counted from real postings, never invented. Free while we&apos;re new — the tag shows where premium will fall later.</div>
          </section>
        )}

        <div style={S.editHead}>
          <h2 style={S.h2}>Edit your profile</h2>
          <p style={{ ...S.sub, margin: 0 }}>The badges show where we got each thing — your résumé, our inference, or your own hand. Saving re-scores your matches.</p>
        </div>

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
  // Highlighted stats hero — matches the feed's dark "Good morning" hero.
  hero: { background: NAVY, borderRadius: 18, padding: "22px 24px", color: "#fff", position: "relative", overflow: "hidden", marginBottom: 16 },
  heroGlow: { position: "absolute", top: -100, right: -40, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)", pointerEvents: "none" },
  heroAvatar: { width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,.25)", flex: "none" },
  heroAvatarFallback: { width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20, flex: "none" },
  heroGreeting: { margin: 0, fontFamily: "'Sora', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px" },
  heroEyebrow: { fontSize: 11, color: "#B9C0D4", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 },
  heroMsg: { margin: "14px 0 0", fontSize: 13, color: "#B9C0D4", lineHeight: 1.6, maxWidth: 560, position: "relative" },
  heroStats: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 },
  heroStat: { flex: "1 1 170px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" },
  heroNum: { fontFamily: "'Sora', sans-serif", fontSize: 26, fontWeight: 800, background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" },
  heroSub: { fontSize: 12, color: "#B9C0D4", marginTop: 5, lineHeight: 1.5 },
  roadmapCard: { background: "#fff", border: "1px solid #ececf2", borderTop: "3px solid #8B5CF6", borderRadius: 16, padding: 20, marginBottom: 22 },
  editHead: { margin: "26px 0 14px" },
  h2: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 20, margin: "0 0 6px", color: INK },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 },
  modal: { background: "#fff", borderRadius: 18, padding: "28px 26px", maxWidth: 460, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,.3)", position: "relative", overflow: "hidden" },
  modalBar: { position: "absolute", left: 0, right: 0, top: 0, height: 5, background: "linear-gradient(135deg,#6366F1,#8B5CF6)" },
  modalKicker: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#8B5CF6", marginBottom: 8 },
  modalTitle: { fontFamily: "'Sora', sans-serif", fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: INK },
  modalSub: { fontSize: 14, color: MUTED, lineHeight: 1.55, margin: "0 0 20px" },
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
  // Roadmap sections — one violet accent for every demand meter, chips for the
  // pairing lens, gray only as the labeled "your level" reference bar.
  sec: { marginTop: 22 },
  secHead: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED },
  secDot: { width: 7, height: 7, borderRadius: "50%", background: "#8B5CF6", flexShrink: 0 },
  secSub: { fontSize: 12, color: MUTED, lineHeight: 1.45, margin: "4px 0 2px" },
  gapRow: { padding: "13px 0 12px", borderTop: "1px solid #f2f2f5", marginTop: 10 },
  rowTop: { display: "flex", alignItems: "center", gap: 10 },
  rowTitle: { fontSize: 14, fontWeight: 600, color: INK, flex: 1, minWidth: 0 },
  rowMeta: { fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.45 },
  meterRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
  meterNote: { fontSize: 12, color: MUTED, whiteSpace: "nowrap" },
  chipHave: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: "#e7f6ee", color: "#0f6e56", whiteSpace: "nowrap" },
  chipNext: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: "#eef0ff", color: "#3a34a8", whiteSpace: "nowrap" },
  lvlRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 7 },
  lvlLabel: { fontSize: 11, fontWeight: 700, color: MUTED, width: 46, flexShrink: 0, letterSpacing: 0.3 },
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
