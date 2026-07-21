"use client";

/**
 * /profile view — LinkedIn-style presentation of the REAL profile, ported from
 * the Topezia design. Real data drives the hero identity, About, Experience,
 * Education, Certifications, Top skills, "Improve your match" (from insights)
 * and Profile completion. Panels we can't back with data yet — AI Career Score,
 * the recruiter/views hero metrics, Projects, AI insights, Languages, Top
 * companies — render the design's shape but carry a clear "Sample"/"Coming
 * soon" badge so nothing reads as a real number about this person.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { C, GRAD, Icon, Card, SoonTag, initials } from "@/app/_components/ui";
import ShareMenu from "@/app/_components/ShareMenu";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

type Skill = { name: string; proficiency: string | null; source: string; tier?: "CORE" | "SECONDARY" };
interface Profile {
  fullName: string | null; headline: string | null; seniority: string | null; photoUrl: string | null;
  yearsExperience: number | null; currentLocation: string | null; country: string | null;
  industries: string[]; remoteTypes: string[]; skills: Skill[]; tier: string; entryPath: string; publicSlug: string | null;
  workHistory: { title?: string; company?: string; years?: string }[];
  education: { degree?: string; institution?: string; year?: string }[];
  certifications: string[];
}
interface Insights {
  fieldLabel: string | null; coveragePct: number | null; reliable: boolean;
  skillGaps: { skill: string; pct: number; youHave: string | null }[];
  seniority: { level: string; atOrAbove: number; below: number } | null;
}

const PROF_PCT: Record<string, number> = { EXPERT: 96, ADVANCED: 86, PROFICIENT: 72, FAMILIAR: 55 };
const profPct = (p: string | null) => (p ? PROF_PCT[p] ?? 65 : 65);
const TABS = ["Overview", "Experience", "Skills", "Projects", "Education"] as const;
type Tab = (typeof TABS)[number];

const HERO_LOGO_BG = ["linear-gradient(135deg,#334155,#0F172A)", "linear-gradient(135deg,#3B82F6,#22D3EE)"];

export default function ProfileView() {
  const [p, setP] = useState<Profile | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  // Own work, drafts included. Deliberately NOT folded into /api/profile:
  // that endpoint is on the dashboard's hot path and this is only needed on
  // one tab of one page.
  const [work, setWork] = useState<{ id: string; slug: string; title: string; status: string; coverUrl: string | null }[] | null>(null);
  // window doesn't exist during SSR, so the absolute URL is filled in after
  // mount rather than branching on it during render.
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => (r.ok ? r.json() : { portfolios: [] }))
      .then((d) => setWork(d.portfolios ?? []))
      .catch(() => setWork([]));
  }, []);

  useEffect(() => {
    fetch("/api/profile").then((r) => (r.ok ? r.json() : null)).then((d) => d && setP(d.profile)).catch(() => {});
    fetch("/api/profile/insights").then((r) => (r.ok ? r.json() : null)).then((d) => d && setIns(d.insights)).catch(() => {});
  }, []);

  if (!p) return <div style={{ color: C.mut, padding: "40px 0" }}>Loading your profile…</div>;

  const name = p.fullName || "Your profile";
  const avatarInitials = initials(p.fullName);
  const field = ins?.fieldLabel ? label(ins.fieldLabel.replace(/ roles.*/, "")) : p.industries[0] ? label(p.industries[0]) : "Your field";
  const isRemote = p.remoteTypes.some((r) => r.startsWith("REMOTE"));
  // Core skills first — "Top skills" should show what the person IS.
  const topSkills = [...p.skills]
    .sort((a, b) => {
      const at = a.tier === "SECONDARY" ? 1 : 0, bt = b.tier === "SECONDARY" ? 1 : 0;
      return at !== bt ? at - bt : profPct(b.proficiency) - profPct(a.proficiency);
    })
    .slice(0, 6);

  // Real, computed completion — counts what's actually filled in.
  const filled = [!!p.headline, p.skills.length > 0, !!p.currentLocation, p.workHistory.length > 0, p.education.length > 0, p.industries.length > 0];
  const completion = Math.round((filled.filter(Boolean).length / filled.length) * 100);
  const checklist = [
    { label: "Role & field", done: !!p.headline },
    { label: "Skills", done: p.skills.length > 0 },
    { label: "Location", done: !!p.currentLocation },
    { label: "Experience", done: p.workHistory.length > 0 },
    { label: "Education", done: p.education.length > 0 },
  ];

  const showAbout = tab === "Overview";
  const showExp = tab === "Overview" || tab === "Experience";
  const showProjects = tab === "Overview" || tab === "Projects";
  const showEdu = tab === "Overview" || tab === "Education";
  const showSkillsTab = tab === "Skills";

  return (
    <div>
      <style>{"@media (max-width:820px){.pv-grid{grid-template-columns:1fr!important}.pv-2col{grid-template-columns:1fr!important}.pv-hero{padding:22px 20px!important}}"}</style>
      {/* ── Hero ── */}
      <section className="pv-hero" style={S.hero}>
        <div style={S.heroGlow1} />
        <div style={S.heroGlow2} />
        <div style={{ position: "relative", display: "flex", gap: 26, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "none", padding: 4, borderRadius: "50%", background: GRAD }}>
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt={name} style={{ width: 112, height: 112, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block", background: C.navy }} />
            ) : (
              <div style={{ width: 112, height: 112, borderRadius: "50%", background: C.navy, display: "grid", placeItems: "center", fontSize: 34, fontWeight: 800, color: "#fff" }}>{avatarInitials}</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 280, paddingTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.6px" }}>{name}</h1>
              <span style={S.otwPill}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ADE80" }} />Open to opportunities</span>
            </div>
            <div style={{ fontSize: 15, color: "#C7CEE4", marginTop: 7, fontWeight: 500 }}>
              {p.headline || "Set your role"} · <span style={S.fieldGrad}>{field}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 13, color: "#94A3C0", fontSize: 12.5 }}>
              {p.currentLocation && <span style={S.metaItem}><Icon name="pin" size={14} />{p.currentLocation}</span>}
              {isRemote && <span style={S.metaItem}><Icon name="globe" size={14} />Open to remote</span>}
              {p.yearsExperience != null && <span style={S.metaItem}><Icon name="briefcase" size={14} />{p.yearsExperience}+ years experience</span>}
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 16, alignItems: "center" }}>
              {["linkedin", "github", "globe", "mail"].map((n) => (
                <span key={n} title="Social links — coming soon" style={S.social}><Icon name={n} size={16} /></span>
              ))}
              <SoonTag label="Links — soon" style={{ background: "rgba(255,255,255,.08)", color: "#94A3C0", borderColor: "rgba(255,255,255,.14)" }} />
            </div>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, paddingTop: 4 }}>
            <div style={S.scoreCard}>
              <div style={{ position: "relative", width: 66, height: 66 }}>
                <svg width="66" height="66" viewBox="0 0 100 100">
                  <defs><linearGradient id="pvsc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor="#22D3EE" /></linearGradient></defs>
                  <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,.12)" strokeWidth="9" fill="none" />
                  <circle cx="50" cy="50" r="42" stroke="url(#pvsc)" strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray="263.9" strokeDashoffset="60" transform="rotate(-90 50 50)" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 19, fontWeight: 800 }}>—</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".4px", color: "#A5B4FC", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>AI Career Score <SoonTag label="Soon" style={{ background: "rgba(255,255,255,.1)", color: "#A5B4FC", borderColor: "transparent" }} /></div>
                <div style={{ fontSize: 11.5, color: "#94A3C0", marginTop: 3, maxWidth: 160, lineHeight: 1.45 }}>A single score for your market strength — coming soon.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <a href="/profile/edit" style={S.editBtn}><Icon name="edit" size={15} />Edit profile</a>
              {p.publicSlug && (
                <ShareMenu
                  url={p.publicSlug ? `${origin}/p/${p.publicSlug}` : ""}
                  title="My Topezia profile"
                  tone="dark"
                  buttonStyle={{ ...S.shareBtn, cursor: "pointer", fontFamily: "inherit" }}
                ><Icon name="share" size={15} />Share</ShareMenu>
              )}
            </div>
          </div>
        </div>
        {/* hero metric strip — SAMPLE (we don't track profile views / recruiter contacts) */}
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,.09)", marginTop: 24 }}>
          {[["1,284", "Profile views this month"], ["342", "Search appearances"], ["12", "Recruiter contacts"], ["87", "Skill endorsements"]].map(([v, l], i) => (
            <div key={i} style={{ flex: 1, minWidth: 150, padding: "16px 0", borderRight: i < 3 ? "1px solid rgba(255,255,255,.06)" : "none" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,.5)" }}>{v}</span><SoonTag label="Sample" style={{ background: "rgba(255,255,255,.08)", color: "#94A3C0", borderColor: "transparent" }} /></div>
              <div style={{ fontSize: 11.5, color: "#8B96B5", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, margin: "20px 0", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={t === tab ? S.tabOn : S.tabOff}>{t}</button>
        ))}
      </div>

      {/* ── Two-column body ── */}
      <div className="pv-grid" style={S.grid}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {showAbout && (
            <Card>
              <SectionHead icon="user" title="About" />
              {p.headline || p.industries.length ? (
                <p style={S.about}>
                  {p.seniority && p.seniority !== "NOT_APPLICABLE" ? `${label(p.seniority)}-level ` : ""}{p.headline ?? "professional"}
                  {p.yearsExperience != null ? ` with ${p.yearsExperience}+ years of experience` : ""}
                  {p.industries.length ? ` across ${p.industries.map(label).join(", ")}` : ""}.
                </p>
              ) : (
                <p style={{ ...S.about, color: C.mut }}>Add your role and background from <a href="/profile/edit" style={S.inlineLink}>Edit profile</a>.</p>
              )}
              {p.industries.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  {p.industries.map((t) => <span key={t} style={S.softTag}>{label(t)}</span>)}
                </div>
              )}
            </Card>
          )}

          {showExp && (
            <Card>
              <SectionHead icon="briefcase" title="Experience" action={<a href="/profile/edit" style={S.headAction}><Icon name="plus" size={14} />Add</a>} />
              {p.workHistory.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {p.workHistory.map((ex, i) => (
                    <div key={i} style={{ display: "flex", gap: 16, position: "relative", paddingBottom: i < p.workHistory.length - 1 ? 22 : 0 }}>
                      <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: i === 0 ? GRAD : HERO_LOGO_BG[i % 2], color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{(ex.company ?? "?").slice(0, 2).toUpperCase()}</div>
                        {i < p.workHistory.length - 1 && <div style={{ width: 2, flex: 1, background: "linear-gradient(to bottom,#C7D2FE,transparent)", marginTop: 8 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{ex.title ?? "Role"}</h3>
                          {i === 0 && <span style={S.currentTag}>Most recent</span>}
                        </div>
                        {ex.company && <div style={{ fontSize: 12.5, color: C.c1, fontWeight: 600, marginTop: 3 }}>{ex.company}</div>}
                        {ex.years && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3 }}>{ex.years}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyRow text={p.entryPath === "QUESTIONNAIRE" ? "You joined via the quick questionnaire — add work history any time." : "No experience on file yet."} />
              )}
            </Card>
          )}

          {showProjects && (
            <Card>
              <SectionHead
                icon="image"
                title="My work"
                tag={<a href="/portfolio/mine" style={{ fontSize: 12.5, fontWeight: 600, color: C.c1, textDecoration: "none" }}>Manage</a>}
              />
              {work === null && <p style={{ ...S.about, color: C.mut, margin: 0 }}>Loading…</p>}
              {work !== null && work.length === 0 && (
                <p style={{ ...S.about, color: C.mut, margin: 0 }}>
                  Nothing published yet. <a href="/portfolio/new" style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>Add a piece of work</a> — it gets its own public page you can share with anyone.
                </p>
              )}
              {work !== null && work.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(150px,100%),1fr))", gap: 12 }}>
                  {work.map((w) => (
                    <a key={w.id} href={`/portfolio/${w.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div style={{ aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden", background: "#F1F5F9", display: "grid", placeItems: "center", color: C.mut }}>
                        {w.coverUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={w.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : <Icon name="image" size={18} />}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 7, lineHeight: 1.35 }}>{w.title}</div>
                      {w.status !== "PUBLISHED" && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#9A3412", marginTop: 3 }}>Draft — only you can see it</div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </Card>
          )}

          {showEdu && (
            <div className="pv-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
              <Card>
                <SectionHead icon="grad" title="Education" />
                {p.education.length > 0 ? p.education.map((e, i) => (
                  <div key={i} style={{ marginBottom: i < p.education.length - 1 ? 12 : 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{e.degree ?? "Degree"}</div>
                    {e.institution && <div style={{ fontSize: 12.5, color: C.c1, fontWeight: 600, marginTop: 3 }}>{e.institution}</div>}
                    {e.year && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3 }}>{e.year}</div>}
                  </div>
                )) : <EmptyRow text="No education added." />}
              </Card>
              <Card>
                <SectionHead icon="award" title="Certifications" />
                {p.certifications.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {p.certifications.map((c) => (
                      <div key={c} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: GRAD, flex: "none" }} />
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c}</div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyRow text="No certifications added." />}
              </Card>
            </div>
          )}

          {showSkillsTab && (
            <Card>
              <SectionHead icon="gauge" title="Core skills" />
              <div className="pv-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 28px" }}>
                {p.skills.filter((s) => s.tier !== "SECONDARY").map((s) => (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, marginBottom: 7 }}><span>{s.name}</span><span style={{ color: C.c1 }}>{s.proficiency ? label(s.proficiency) : "—"}</span></div>
                    <Bar pct={profPct(s.proficiency)} />
                  </div>
                ))}
              </div>
              {p.skills.some((s) => s.tier === "SECONDARY") && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.mut, margin: "22px 0 12px" }}>Also knows</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {p.skills.filter((s) => s.tier === "SECONDARY").map((s) => (
                      <span key={s.name} style={{ background: "#F1F5F9", border: `1px solid ${C.line}`, color: C.slate, fontSize: 12.5, fontWeight: 600, borderRadius: 999, padding: "6px 14px" }}>
                        {s.name}{s.proficiency ? ` · ${label(s.proficiency).toLowerCase()}` : ""}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

        </div>

        {/* ── Right column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <div style={{ position: "relative", width: 60, height: 60, flex: "none" }}>
                <svg width="60" height="60" viewBox="0 0 100 100">
                  <defs><linearGradient id="pvcomp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.c1} /><stop offset="1" stopColor={C.c2} /></linearGradient></defs>
                  <circle cx="50" cy="50" r="41" stroke="#EEF2FF" strokeWidth="11" fill="none" />
                  <circle cx="50" cy="50" r="41" stroke="url(#pvcomp)" strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray="257.6" strokeDashoffset={(257.6 * (1 - completion / 100)).toFixed(1)} transform="rotate(-90 50 50)" />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800 }}>{completion}%</div>
              </div>
              <div><div style={{ fontSize: 14.5, fontWeight: 700 }}>Profile completion</div><div style={{ fontSize: 11.5, color: C.mut, marginTop: 3, lineHeight: 1.5 }}>A fuller profile scores you against more of the market.</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {checklist.map((ck) => (
                <div key={ck.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: ck.done ? C.slate : C.mut, fontWeight: ck.done ? 500 : 600 }}>
                  {ck.done
                    ? <span style={{ width: 18, height: 18, borderRadius: "50%", background: GRAD, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Icon name="check" size={11} /></span>
                    : <span style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px dashed #94A3B8", flex: "none" }} />}
                  <span style={{ flex: 1 }}>{ck.label}</span>
                  {!ck.done && <a href="/profile/edit" style={{ fontSize: 11, color: C.c1, fontWeight: 600, textDecoration: "none" }}>Add</a>}
                </div>
              ))}
            </div>
          </Card>

          {topSkills.length > 0 && (
            <Card>
              <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}><h2 style={S.railH}>Top skills</h2><a href="/profile/edit" style={S.railLink}>Edit</a></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {topSkills.map((s) => (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}><span>{s.name}</span><span style={{ color: C.c1 }}>{s.proficiency ? label(s.proficiency) : "—"}</span></div>
                    <Bar pct={profPct(s.proficiency)} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* REAL: improve your match — from insights gaps */}
          {ins?.reliable && ins.skillGaps.length > 0 && (
            <Card>
              <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}><h2 style={S.railH}>Improve your match</h2><a href="/coach" style={S.railLink}>Full roadmap</a></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {ins.skillGaps.slice(0, 3).map((g) => (
                  <div key={g.skill} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>{g.skill.slice(0, 2).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>{g.skill}</div><div style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>named in {g.pct}% of your field</div></div>
                    <a href="/profile/edit" style={S.learnBtn}>Add</a>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.mut, marginTop: 12, lineHeight: 1.5 }}>Counted from real postings in your field — never invented.</div>
            </Card>
          )}

          {/* SAMPLE: AI insights */}
          <section style={S.dark}>
            <div style={S.darkGlow} />
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><Icon name="spark" size={18} color="#fff" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, flex: 1 }}>AI insights</h2><SoonTag label="Sample" style={{ background: "rgba(255,255,255,.1)", color: "#A5B4FC", borderColor: "transparent" }} /></div>
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
              {[["Interview chance", "High", "76%"], ["Salary potential", "Above market", "+18%"], ["Market demand", "Very high", "94%"], ["Profile strength", "Excellent", "92%"]].map(([l, t, v]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                  <span style={{ flex: 1, color: "#8B96B5" }}>{l}</span>
                  <span style={{ background: "rgba(99,102,241,.22)", border: "1px solid rgba(139,92,246,.4)", color: "#C4B5FD", fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: "3px 9px" }}>{t}</span>
                  <span style={{ fontWeight: 700, minWidth: 42, textAlign: "right", color: "rgba(255,255,255,.55)" }}>{v}</span>
                </div>
              ))}
            </div>
          </section>

          {/* COMING SOON: languages */}
          <Card>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}><h2 style={S.railH}>Languages</h2><SoonTag label="Coming soon" /></div>
            <p style={{ fontSize: 12.5, color: C.mut, margin: 0, lineHeight: 1.5 }}>Add the languages you work in to widen your matches. Coming soon.</p>
          </Card>

          {/* SAMPLE: top companies */}
          <Card>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}><h2 style={S.railH}>Top companies for you</h2><SoonTag label="Sample" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[["Stripe", "S"], ["OpenAI", "O"], ["Careem", "C"]].map(([nm, lt]) => (
                <div key={nm} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 800 }}>{lt}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700 }}>{nm}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ icon, title, action, tag }: { icon: string; title: string; action?: ReactNode; tag?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: "#EEF2FF", color: C.c1, display: "grid", placeItems: "center" }}><Icon name={icon} /></span>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>{title}</h2>
      {tag}
      {action}
    </div>
  );
}
function Bar({ pct }: { pct: number }) {
  return <div style={{ height: 6, background: "#EEF2FF", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${C.c1}, ${C.c2})`, width: `${pct}%` }} /></div>;
}
function EmptyRow({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, color: C.mut, background: "#F8FAFC", border: `1px dashed ${C.line}`, borderRadius: 10, padding: "14px 16px" }}>{text} <a href="/profile/edit" style={{ color: C.c1, fontWeight: 600, textDecoration: "none" }}>Edit profile →</a></div>;
}

const S: Record<string, CSSProperties> = {
  hero: { background: C.navy, borderRadius: 20, padding: "30px 32px 0", position: "relative", overflow: "hidden", color: "#fff" },
  heroGlow1: { position: "absolute", top: -120, right: -60, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,.34), transparent 68%)" },
  heroGlow2: { position: "absolute", bottom: -140, left: "22%", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.22), transparent 68%)" },
  otwPill: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,.14)", border: "1px solid rgba(34,197,94,.35)", color: "#4ADE80", fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: "5px 12px" },
  fieldGrad: { background: "linear-gradient(135deg,#A5B4FC,#C4B5FD)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontWeight: 600 },
  metaItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  social: { width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", display: "grid", placeItems: "center", color: "#C7CEE4", cursor: "default" },
  scoreCard: { display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "12px 18px 12px 12px" },
  editBtn: { background: GRAD, borderRadius: 11, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", textDecoration: "none", boxShadow: "0 6px 18px rgba(99,102,241,.35)" },
  shareBtn: { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 11, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "default", display: "inline-flex", alignItems: "center", gap: 7, color: "#fff" },
  grid: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 22, alignItems: "start" },
  tabOn: { padding: "9px 19px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", background: GRAD, color: "#fff", border: "1px solid transparent", boxShadow: "0 5px 14px rgba(99,102,241,.3)", fontFamily: "inherit" },
  tabOff: { padding: "9px 19px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#fff", color: C.slate, border: `1px solid ${C.line}`, fontFamily: "inherit" },
  about: { margin: 0, fontSize: 13.5, lineHeight: 1.75, color: C.slate },
  softTag: { background: "#F1F5F9", border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 13px", fontSize: 11.5, fontWeight: 500, color: C.slate },
  inlineLink: { color: C.c1, fontWeight: 600, textDecoration: "none" },
  headAction: { fontSize: 12.5, fontWeight: 600, color: C.c1, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 },
  currentTag: { background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0", fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: "2px 9px" },
  railH: { margin: 0, fontSize: 15, fontWeight: 700, flex: 1 },
  railLink: { fontSize: 12, fontWeight: 600, color: C.c1, textDecoration: "none" },
  learnBtn: { border: `1px solid #C7D2FE`, color: "#4F46E5", borderRadius: 8, padding: "6px 13px", fontSize: 11.5, fontWeight: 600, textDecoration: "none", flex: "none" },
  dark: { background: `linear-gradient(160deg, ${C.navy}, ${C.navy2})`, borderRadius: 16, padding: "22px 24px", color: "#fff", position: "relative", overflow: "hidden" },
  darkGlow: { position: "absolute", top: -60, right: -60, width: 190, height: 190, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.35), transparent 70%)" },
};
