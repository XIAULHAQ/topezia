"use client";

/**
 * Employer dashboard — built to the "Topezia Employer" design, with every
 * number sourced from a real row.
 *
 * The design shipped with illustrative data. Deliberately NOT rendered here,
 * because nothing in the schema backs them:
 *   - "Avg. time to reply 2.1d" / "Median time to first reply" — there is no
 *     employer messaging and no reply timestamp anywhere. Application.updatedAt
 *     moves on any edit, so deriving reply speed from it would be a guess
 *     presented as a measurement.
 *   - "Similar studios reply in 0.8 days" — needs a population of employers to
 *     benchmark against; there isn't one yet.
 *   - "Views → apply rate" — depends on the reply/benchmark pair above being
 *     meaningful alongside it; views and applications are both shown raw
 *     instead, which is the honest version of the same signal.
 *   - "3 credits left this month" — no posting quota exists in billing.
 *   - "Verified employer" badge — no verification process exists.
 *   - "better pages get 2.4x more applicants" — an invented statistic.
 *   - Messages / notification bell — no messaging or notification system.
 *
 * What IS real: views (JobView, counted from the day that shipped), applicants
 * and their pipeline stage, how long someone has been waiting, company profile
 * strength, the setup checklist, and sourced candidates (consent-gated, see
 * lib/employer/sourcing.ts).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { C, GRAD, FONT, Icon, Card } from "@/app/_components/ui";

type Company = { id: string; name: string; slug: string; tagline: string | null; about: string | null; website: string | null; location: string | null; logoPath: string | null; logoUrl: string | null };
type Posting = {
  id: string; kind: string; titleRaw: string; status: string; createdAt: string;
  locationState: string | null; country: string | null; remoteType: string;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string | null;
  total: number; byStage: Record<string, number>; views: number;
};
type PulseDay = { day: string; label: string; views: number; applications: number };
type Stats = {
  applicants: { total: number; last7: number; prev7: number };
  awaitingReview: number;
  postings: { live: number; draft: number; closed: number };
  views: { last7: number; prev7: number; total: number };
  viewsSince: string | null;
  pulse: PulseDay[];
};
type ChecklistItem = { label: string; done: boolean; action: "company" | "post" | "logo" | null };
type Applicant = {
  id: string; jobId: string; jobTitle: string; appliedAt: string; waitingDays: number;
  hasCoverNote: boolean; profileId: string; fullName: string | null; publicSlug: string | null;
  photoUrl: string | null; currentLocation: string | null; yearsExperience: number | null;
  seniority: string | null; match: number | null;
};
type Sourced = { profileId: string; fullName: string | null; publicSlug: string | null; currentLocation: string | null; photoUrl: string | null; yearsExperience: number | null; match: number };

const TABS = ["Live", "Draft", "Closed", "All"] as const;
type Tab = (typeof TABS)[number];

/** Pipeline columns, using the REAL stage names the API and the pipeline page
 *  use. The mock called these New/Reviewing/Interview/Offer; renaming stages
 *  in one surface only would make the dashboard and the pipeline disagree. */
const FUNNEL: { key: string; label: string }[] = [
  { key: "APPLIED", label: "New" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "SELECTED", label: "Selected" },
];

const initials = (s: string) =>
  s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

const fmtDelta = (now: number, prev: number): { text: string; good: boolean } | null => {
  if (now === prev) return null;
  // No prior week to compare against — "+100%" off a zero base is noise.
  if (prev === 0) return { text: `+${now}`, good: true };
  const pct = Math.round(((now - prev) / prev) * 100);
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, good: pct >= 0 };
};

export default function EmployerClient() {
  const [company, setCompany] = useState<Company | null>(null);
  const [postings, setPostings] = useState<Posting[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [strength, setStrength] = useState(0);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("Live");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", tagline: "", about: "", website: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourced, setSourced] = useState<{ candidates: Sourced[]; poolSize: number; jobTitle: string } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  async function load() {
    const d = await fetch("/api/employer/dashboard").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) { setAuthed(false); setPostings([]); return; }
    setAuthed(d.authed ?? false);
    setCompany(d.company ?? null);
    setPostings(d.postings ?? []);
    setStats(d.stats ?? null);
    setChecklist(d.checklist ?? []);
    setStrength(d.strength ?? 0);
    setApplicants(d.applicants ?? []);
  }
  useEffect(() => { load(); }, []);

  // Sourcing is scoped to ONE posting — "who fits this brief" only means
  // something against a specific brief. Uses the newest live posting.
  const sourceTarget = useMemo(
    () => (postings ?? []).find((p) => p.status === "LIVE") ?? null,
    [postings]
  );
  useEffect(() => {
    if (!sourceTarget) { setSourced(null); return; }
    fetch(`/api/employer/sourced?jobId=${encodeURIComponent(sourceTarget.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSourced(d))
      .catch(() => {});
  }, [sourceTarget?.id]);

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

  /** Publishing a draft runs real enrichment server-side, so it can take a
   *  few seconds and can come back with blockers. */
  async function setStatus(p: Posting, status: "LIVE" | "EXPIRED") {
    setBusyId(p.id); setError(null);
    try {
      const res = await fetch(`/api/postings/${p.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't update that posting.");
    } finally {
      setBusyId(null);
    }
  }

  async function shortlist(a: Applicant) {
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/applications/${a.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "SHORTLISTED" }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  /** Sends the raw file — the server sniffs its real bytes to decide the type.
   *  Deliberately not downscaled client-side the way profile photos are: a logo
   *  is a small mark already, and re-encoding it through a canvas would soften
   *  crisp edges and drop PNG transparency. */
  async function uploadLogo(file: File) {
    setLogoBusy(true); setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/company/logo", { method: "POST", body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error);
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't upload that logo — try again.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true); setError(null);
    try {
      const res = await fetch("/api/company/logo", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't remove that logo.");
    } finally {
      setLogoBusy(false);
    }
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

  const shown = (postings ?? []).filter((p) =>
    tab === "All" ? true
      : tab === "Live" ? p.status === "LIVE"
      : tab === "Draft" ? p.status === "DRAFT"
      : p.status !== "LIVE" && p.status !== "DRAFT"
  );
  const counts = {
    Live: (postings ?? []).filter((p) => p.status === "LIVE").length,
    Draft: (postings ?? []).filter((p) => p.status === "DRAFT").length,
    Closed: (postings ?? []).filter((p) => p.status !== "LIVE" && p.status !== "DRAFT").length,
    All: (postings ?? []).length,
  };

  const viewDelta = stats ? fmtDelta(stats.views.last7, stats.views.prev7) : null;
  const appDelta = stats ? fmtDelta(stats.applicants.last7, stats.applicants.prev7) : null;
  const pulseMax = Math.max(1, ...(stats?.pulse ?? []).map((d) => Math.max(d.views, d.applications)));

  return (
    <div style={{ fontFamily: FONT }}>
      <style>{`
        .emp-cols { display: grid; grid-template-columns: minmax(0,1fr) 320px; gap: 22px; align-items: start; }
        .emp-kpi { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
        @media (max-width: 1180px) {
          .emp-cols { grid-template-columns: minmax(0,1fr); }
          .emp-kpi { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }
      `}</style>

      {/* ── Header hero ── */}
      <section style={S.hero}>
        <div style={S.heroGlow} />
        <div style={{ position: "relative", display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "none", textAlign: "center" }}>
            <label
              style={{ ...S.logoRing, cursor: company ? "pointer" : "default", opacity: logoBusy ? 0.5 : 1, display: "inline-block" }}
              title={company ? "Upload a logo (JPG, PNG, WebP or AVIF, up to 2MB)" : "Create your company page first"}
            >
              <div style={S.logoTile}>
                {company?.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={company.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 11, background: "#fff" }} />
                  : <span style={{ position: "relative", fontSize: 24, fontWeight: 800, letterSpacing: "-1px" }}>{initials(company?.name ?? "You")}</span>}
              </div>
              {company && (
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={logoBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = ""; // let the same file be re-picked after an error
                    if (f) uploadLogo(f);
                  }}
                  style={{ display: "none" }}
                />
              )}
            </label>
            {company && (
              <div style={{ marginTop: 8, fontSize: 10.5, color: "#8B96B5", display: "flex", gap: 8, justifyContent: "center" }}>
                <span>{logoBusy ? "Uploading…" : company.logoUrl ? "Replace" : "Add logo"}</span>
                {company.logoUrl && !logoBusy && (
                  <button type="button" onClick={removeLogo} style={S.logoRemove}>Remove</button>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.7px" }}>
              {company ? company.name : "Post jobs & projects"}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: "#94A3C0" }}>
              {company?.location && <span style={S.heroMeta}><Icon name="pin" size={13} />{company.location}</span>}
              {company?.website && <span style={S.heroMeta}><Icon name="globe" size={13} />{company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>}
              {company && (
                <a href={`/company/${company.slug}`} style={{ ...S.heroMeta, color: "#A5B4FC", fontWeight: 600, textDecoration: "none" }}>
                  <Icon name="link" size={13} />topezia.com/company/{company.slug}
                </a>
              )}
              {!company && <span>Anyone can post — as yourself, or under a company page.</span>}
            </div>
            {company && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                <span style={{ fontSize: 11.5, color: "#8B96B5" }}>Profile strength</span>
                <span style={S.meterTrack}><span style={{ ...S.meterFill, width: `${strength}%` }} /></span>
                <b style={{ fontSize: 12 }}>{strength}%</b>
                {strength < 100 && (
                  <span style={{ fontSize: 11.5, color: "#8B96B5" }}>
                    — {checklist.filter((c) => !c.done).length} item{checklist.filter((c) => !c.done).length === 1 ? "" : "s"} left below
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: "none", display: "flex", gap: 9, flexWrap: "wrap" }}>
            <button type="button" onClick={openEdit} style={S.heroGhost}>
              <Icon name="edit" size={14} />{company ? "Edit company" : "Add company page"}
            </button>
            <Link href="/employer/new" style={S.heroCta}><Icon name="plus" size={15} />Post a job or project</Link>
          </div>
        </div>
      </section>

      {/* ── KPIs — every one counted, none estimated ── */}
      {stats && (
        <div className="emp-kpi" style={{ margin: "16px 0 22px" }}>
          <Kpi
            icon="eye" label="Posting views"
            value={stats.views.last7.toLocaleString()}
            delta={viewDelta}
            sub={
              stats.viewsSince
                ? "last 7 days vs the 7 before"
                : "counting starts from your first view — nothing before today exists"
            }
          />
          <Kpi
            icon="user" label="Applicants"
            value={stats.applicants.total.toLocaleString()}
            delta={appDelta}
            sub={stats.applicants.last7 > 0 ? `${stats.applicants.last7} in the last 7 days` : "none in the last 7 days"}
          />
          <Kpi
            icon="clock" label="Waiting on you"
            value={String(stats.awaitingReview)}
            delta={stats.awaitingReview > 0 ? { text: "review", good: false } : null}
            sub={stats.awaitingReview > 0 ? "applied 3+ days ago, still unreviewed" : "nobody is waiting on a decision"}
          />
          <Kpi
            icon="briefcase" label="Active postings"
            value={String(stats.postings.live)}
            delta={stats.postings.draft > 0 ? { text: `${stats.postings.draft} draft`, good: true } : null}
            sub={stats.postings.closed > 0 ? `${stats.postings.closed} closed` : "free while we grow"}
          />
        </div>
      )}

      {editing && (
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
            <button type="button" onClick={() => setEditing(false)} style={S.ghost}>Cancel</button>
          </div>
        </Card>
      )}

      {error && !editing && <div style={{ color: "#b42318", fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div className="emp-cols">
        {/* ── Left column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          <section style={S.panel}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <h2 style={{ ...S.h2, margin: 0 }}>Your postings</h2>
              <div style={{ flex: 1 }} />
              <div style={S.tabWrap}>
                {TABS.map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)} style={t === tab ? S.tabOn : S.tabOff}>
                    {t}{counts[t] > 0 ? ` · ${counts[t]}` : ""}
                  </button>
                ))}
              </div>
            </div>

            {shown.length === 0 && (
              <p style={{ color: C.mut, fontSize: 13.5, margin: 0 }}>
                {(postings ?? []).length === 0
                  ? "Nothing yet. Your first posting goes live immediately — same feed, same honest matching as every other job here. No company page needed."
                  : `No ${tab.toLowerCase()} postings.`}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {shown.map((p) => (
                <article key={p.id} style={S.postCard}>
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                        <Link href={`/employer/${p.id}`} style={{ fontSize: 15, fontWeight: 700, color: C.ink, textDecoration: "none" }}>{p.titleRaw}</Link>
                        <span style={p.kind === "PROJECT" ? S.projTag : S.jobTag}>{p.kind === "PROJECT" ? "Project" : "Job"}</span>
                        <span style={p.status === "LIVE" ? S.liveTag : p.status === "DRAFT" ? S.draftTag : S.closedTag}>
                          {p.status === "LIVE" ? "Live" : p.status === "DRAFT" ? "Draft" : "Closed"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: C.mut }}>
                        <span style={S.meta}><Icon name="clock" size={13} />{p.status === "DRAFT" ? "Saved" : "Posted"} {relDays(p.createdAt)}</span>
                        {p.status !== "DRAFT" && <span style={S.meta}><Icon name="eye" size={13} />{p.views} view{p.views === 1 ? "" : "s"}</span>}
                      </div>
                    </div>
                    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
                      {p.status === "DRAFT" ? (
                        <button type="button" onClick={() => setStatus(p, "LIVE")} disabled={busyId === p.id} style={{ ...S.cta, border: "none", cursor: "pointer", fontFamily: "inherit", opacity: busyId === p.id ? 0.6 : 1 }}>
                          {busyId === p.id ? "Publishing…" : "Publish"}
                        </button>
                      ) : (
                        <>
                          <Link href={`/employer/${p.id}`} style={S.ghost}>View pipeline</Link>
                          <button type="button" onClick={() => setStatus(p, p.status === "LIVE" ? "EXPIRED" : "LIVE")} disabled={busyId === p.id} style={S.ghost}>
                            {p.status === "LIVE" ? "Close" : "Reopen"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {p.status !== "DRAFT" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      {FUNNEL.map((f) => {
                        const n = p.byStage[f.key] ?? 0;
                        const hot = f.key === "APPLIED" && n > 0;
                        return (
                          <div key={f.key} style={{ ...S.stage, background: hot ? "#EEF2FF" : "#F8FAFC", borderColor: hot ? "#C7D2FE" : C.line }}>
                            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px", color: hot ? "#4F46E5" : C.ink }}>{n}</div>
                            <div style={{ fontSize: 10.5, color: C.mut, marginTop: 2, fontWeight: 600 }}>{f.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {p.status === "DRAFT" && (
                    <div style={S.nudge}>
                      <span style={{ color: C.c1, display: "inline-flex" }}><Icon name="spark" size={14} /></span>
                      <span style={{ flex: 1 }}>Only you can see this. Publishing runs the same matching every other posting gets.</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          {/* ── Needs your review ── */}
          <section style={S.panel}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
              <h2 style={{ ...S.h2, margin: 0 }}>Needs your review</h2>
              <span style={{ fontSize: 11.5, color: C.mut }}>
                {applicants.length === 0
                  ? "nobody is waiting"
                  : `${applicants.length} awaiting a first decision`}
              </span>
            </div>
            {applicants.length === 0 ? (
              <p style={{ color: C.mut, fontSize: 13, margin: "8px 0 0", lineHeight: 1.6 }}>
                {stats && stats.postings.live === 0
                  ? "Publish a posting and applicants will land here."
                  : "No new applicants yet. They appear here the moment someone applies."}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {applicants.map((a) => (
                  <div key={a.id} style={S.candRow}>
                    <div style={S.avatar}>
                      {a.photoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={a.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", borderRadius: 12 }} />
                        : initials(a.fullName ?? "?")}
                    </div>
                    <div style={{ flex: 1, minWidth: 170 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.fullName ?? "Someone"}</div>
                      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3 }}>
                        {[a.currentLocation, a.yearsExperience ? `${Math.round(a.yearsExperience)} yrs` : null].filter(Boolean).join(" · ") || "Profile in progress"}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 140, fontSize: 11.5, color: C.slate }}>
                      <div style={{ fontWeight: 600 }}>{a.jobTitle}</div>
                      <div style={{ color: a.waitingDays >= 3 ? "#B45309" : C.mut, marginTop: 3 }}>
                        Applied {a.waitingDays === 0 ? "today" : `${a.waitingDays}d ago`}
                      </div>
                    </div>
                    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* Only rendered when a real cached score exists — never
                          computed on the fly, never guessed. */}
                      {a.match !== null && (
                        <span style={{ ...S.matchPill, background: a.match >= 80 ? "#DCFCE7" : "#EEF2FF", color: a.match >= 80 ? "#15803D" : "#4F46E5" }}>
                          {a.match}% match
                        </span>
                      )}
                      {a.publicSlug && <a href={`/p/${a.publicSlug}`} target="_blank" rel="noreferrer" style={S.ghost}>Profile</a>}
                      <button type="button" onClick={() => shortlist(a)} disabled={busyId === a.id} style={{ ...S.cta, border: "none", cursor: "pointer", fontFamily: "inherit", padding: "8px 15px", fontSize: 11.5, opacity: busyId === a.id ? 0.6 : 1 }}>
                        {busyId === a.id ? "…" : "Shortlist"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Right rail ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {company && checklist.length > 0 && (
            <section style={S.panel}>
              <h2 style={{ ...S.h2, margin: "0 0 4px" }}>Finish your setup</h2>
              <div style={{ fontSize: 11.5, color: C.mut, marginBottom: 14 }}>
                {checklist.filter((c) => c.done).length} of {checklist.length} done
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {checklist.map((ch) => (
                  <div key={ch.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: ch.done ? "#94A3B8" : C.slate }}>
                    <span style={{ ...S.checkDot, background: ch.done ? "#22C55E" : "transparent", borderColor: ch.done ? "#22C55E" : "#CBD5E1" }}>
                      {ch.done && <Icon name="check" size={11} color="#fff" />}
                    </span>
                    <span style={{ flex: 1, textDecoration: ch.done ? "line-through" : "none" }}>{ch.label}</span>
                    {!ch.done && ch.action === "company" && <button type="button" onClick={openEdit} style={S.miniLink}>Add</button>}
                    {!ch.done && ch.action === "post" && <Link href="/employer/new" style={S.miniLink}>Post</Link>}
                    {!ch.done && ch.action === "logo" && (
                      <label style={{ ...S.miniLink, cursor: "pointer" }}>
                        {logoBusy ? "…" : "Upload"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          disabled={logoBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) uploadLogo(f);
                          }}
                          style={{ display: "none" }}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats && (
            <section style={S.panel}>
              <h2 style={{ ...S.h2, margin: "0 0 4px" }}>Hiring pulse</h2>
              <div style={{ fontSize: 11.5, color: C.mut, marginBottom: 14 }}>last 7 days</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 92, marginBottom: 12 }}>
                {stats.pulse.map((d) => (
                  <div key={d.day} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 7 }}>
                    <div style={{ width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, flex: 1 }}>
                      <div title={`${d.views} view${d.views === 1 ? "" : "s"}`} style={{ width: "45%", height: `${(d.views / pulseMax) * 100}%`, minHeight: d.views ? 4 : 0, borderRadius: "4px 4px 2px 2px", background: GRAD }} />
                      <div title={`${d.applications} applicant${d.applications === 1 ? "" : "s"}`} style={{ width: "45%", height: `${(d.applications / pulseMax) * 100}%`, minHeight: d.applications ? 4 : 0, borderRadius: "4px 4px 2px 2px", background: "#22C55E" }} />
                    </div>
                    <span style={{ fontSize: 9.5, color: C.mut, fontWeight: 600, flex: "none" }}>{d.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.mut, borderTop: `1px solid #F1F5F9`, paddingTop: 12 }}>
                <span style={S.legend}><span style={{ ...S.dot, background: "#8B5CF6" }} />views</span>
                <span style={S.legend}><span style={{ ...S.dot, background: "#22C55E" }} />applicants</span>
              </div>
              {stats.views.total === 0 && (
                <p style={{ fontSize: 11, color: C.mut, lineHeight: 1.55, margin: "10px 0 0" }}>
                  View counting started when this dashboard shipped — there's no history before that, so an empty week here means exactly that and nothing more.
                </p>
              )}
            </section>
          )}

          {/* ── Sourced candidates ── */}
          {sourceTarget && (
            <section style={S.dark}>
              <div style={S.darkGlow} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon name="spark" size={18} color="#fff" />
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Sourced for you</h2>
              </div>
              {sourced && sourced.candidates.length > 0 ? (
                <>
                  <p style={{ position: "relative", margin: "0 0 14px", fontSize: 12, lineHeight: 1.6, color: "#C7CEE4" }}>
                    People who opted in to being found and fit <b style={{ color: "#fff" }}>{sourceTarget.titleRaw}</b> — they haven&apos;t applied.
                  </p>
                  <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 9 }}>
                    {sourced.candidates.map((s) => (
                      <a key={s.profileId} href={s.publicSlug ? `/p/${s.publicSlug}` : undefined} target="_blank" rel="noreferrer" style={S.sourceRow}>
                        <div style={S.sourceAvatar}>{initials(s.fullName ?? "?")}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{s.fullName ?? "Someone"}</div>
                          <div style={{ fontSize: 10.5, color: "#94A3C0", marginTop: 2 }}>
                            {[s.currentLocation, s.yearsExperience ? `${Math.round(s.yearsExperience)} yrs` : null].filter(Boolean).join(" · ") || "Open to work"}
                          </div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#4ADE80" }}>{s.match}%</span>
                      </a>
                    ))}
                  </div>
                  <p style={{ position: "relative", fontSize: 10.5, color: "#8B96B5", lineHeight: 1.5, margin: "12px 0 0" }}>
                    Similarity match, not a full AI review — open a profile to judge for yourself.
                  </p>
                </>
              ) : (
                <p style={{ position: "relative", margin: 0, fontSize: 12, lineHeight: 1.65, color: "#C7CEE4" }}>
                  {sourced === null
                    ? "Looking for people who fit this posting…"
                    : sourced.poolSize === 0
                    ? "Nobody has switched on “open to work” yet, so there's no one to surface. This only ever shows people who asked to be found."
                    : `No one in the open-to-work pool is a close enough fit for ${sourceTarget.titleRaw} yet. We'd rather show nothing than pad the list.`}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, delta, sub }: {
  icon: string; label: string; value: string;
  delta: { text: string; good: boolean } | null; sub: string;
}) {
  return (
    <div style={S.kpi}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.mut, fontSize: 11.5, fontWeight: 600 }}>
        <Icon name={icon} size={14} />{label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 12 }}>
        <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-1px" }}>{value}</div>
        {delta && <span style={{ fontSize: 11, fontWeight: 700, color: delta.good ? "#059669" : "#DC2626" }}>{delta.text}</span>}
      </div>
      <div style={{ fontSize: 11, color: C.mut, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>
    </div>
  );
}

function relDays(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return m === 1 ? "a month ago" : `${m} months ago`;
}

const S: Record<string, CSSProperties> = {
  h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.4px", margin: 0 },
  h2: { fontSize: 16, fontWeight: 700, margin: "0 0 14px" },
  label: { fontSize: 12, fontWeight: 700, color: C.slate, margin: "0 0 5px" },
  input: { width: "100%", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit" },
  cta: { background: GRAD, color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 13.5, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 },
  ghost: { border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "9px 15px", fontSize: 12, fontWeight: 600, color: C.slate, textDecoration: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },

  hero: { background: C.navy, borderRadius: 20, padding: "26px 30px", color: "#fff", position: "relative", overflow: "hidden" },
  heroGlow: { position: "absolute", top: -140, right: -60, width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.32), transparent 68%)", pointerEvents: "none" },
  heroMeta: { display: "inline-flex", alignItems: "center", gap: 6 },
  heroGhost: { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 11, padding: "11px 17px", fontSize: 13, fontWeight: 600, color: "#E2E8F0", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: "inherit" },
  heroCta: { background: GRAD, borderRadius: 11, padding: "11px 18px", fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7, boxShadow: "0 6px 18px rgba(99,102,241,.35)" },
  logoRing: { flex: "none", padding: 3, borderRadius: 18, background: GRAD },
  logoTile: { width: 72, height: 72, borderRadius: 15, background: C.navy, display: "grid", placeItems: "center", position: "relative", overflow: "hidden" },
  logoRemove: { background: "none", border: "none", color: "#8B96B5", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit", padding: 0, textDecoration: "underline" },
  meterTrack: { width: 150, height: 6, borderRadius: 999, background: "rgba(255,255,255,.12)", overflow: "hidden", display: "inline-block" },
  meterFill: { display: "block", height: "100%", background: GRAD },

  kpi: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "18px 20px" },
  panel: { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, padding: "22px 24px" },

  tabWrap: { display: "flex", gap: 6, background: "#F1F5F9", borderRadius: 999, padding: 4 },
  tabOn: { padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: C.ink, border: "none", fontFamily: "inherit", boxShadow: "0 2px 6px rgba(15,23,42,.08)" },
  tabOff: { padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "transparent", color: C.mut, border: "none", fontFamily: "inherit" },

  postCard: { border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px" },
  meta: { display: "inline-flex", alignItems: "center", gap: 5 },
  stage: { flex: 1, minWidth: 100, border: "1px solid", borderRadius: 11, padding: "10px 12px" },
  nudge: { display: "flex", alignItems: "center", gap: 9, marginTop: 14, padding: "10px 12px", background: "#F8FAFC", borderRadius: 11, fontSize: 11.5, color: C.slate },

  candRow: { display: "flex", alignItems: "center", gap: 14, padding: "15px 6px", borderTop: "1px solid #F1F5F9", flexWrap: "wrap" },
  avatar: { width: 40, height: 40, flex: "none", borderRadius: 12, background: GRAD, color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, overflow: "hidden" },
  matchPill: { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "5px 11px" },

  checkDot: { width: 20, height: 20, flex: "none", borderRadius: "50%", border: "1.5px solid", display: "grid", placeItems: "center" },
  miniLink: { fontSize: 11.5, fontWeight: 700, color: C.c1, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit", textDecoration: "none", padding: 0 },
  legend: { display: "inline-flex", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 2, display: "inline-block" },

  dark: { background: "linear-gradient(160deg,#0F172A,#1E1B4B)", borderRadius: 18, padding: "22px 24px", color: "#fff", position: "relative", overflow: "hidden" },
  darkGlow: { position: "absolute", top: -60, right: -60, width: 190, height: 190, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.35), transparent 70%)" },
  sourceRow: { display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 11, padding: "10px 12px", textDecoration: "none", color: "#fff" },
  sourceAvatar: { width: 30, height: 30, flex: "none", borderRadius: 9, background: GRAD, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 },

  jobTag: { fontSize: 11, fontWeight: 700, color: "#4F46E5", background: "#EEF2FF", borderRadius: 999, padding: "3px 9px" },
  projTag: { fontSize: 11, fontWeight: 700, color: "#7C3AED", background: "#F5F3FF", borderRadius: 999, padding: "3px 9px" },
  liveTag: { fontSize: 11, fontWeight: 700, color: "#047857", background: "#ECFDF5", borderRadius: 999, padding: "3px 9px" },
  draftTag: { fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FEF3C7", borderRadius: 999, padding: "3px 9px" },
  closedTag: { fontSize: 11, fontWeight: 700, color: "#64748B", background: "#F1F5F9", borderRadius: 999, padding: "3px 9px" },
};
