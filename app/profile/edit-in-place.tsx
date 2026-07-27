"use client";

/**
 * Edit-in-place for /profile — the LinkedIn pattern.
 *
 * Each section of the profile view gets a pencil that opens a modal editing
 * ONLY that section, saved with a field-level PATCH. This is what the API was
 * built for: updateProfileFields guards every field with `!== undefined`, so a
 * modal that sends `{ workHistory }` cannot touch skills or salary. The role
 * gate popup has PATCHed `{ headline, seniority }` alone since it shipped —
 * partial saves are proven behaviour, not a new trick.
 *
 * The full-form editor at /profile/edit stays, because two things genuinely
 * don't belong in a section modal: replacing the resume (re-parses the whole
 * profile) and job preferences/salary (not displayed on the profile page, so
 * there is no section to hang a pencil on). Everything a person can SEE on
 * /profile is now editable where they see it.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { C, GRAD, Icon } from "@/app/_components/ui";
import { COUNTRY_NAMES, COUNTRY_GROUPS, PICKER_ORDER } from "@/lib/countries";

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

const SENIORITIES = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC", "NOT_APPLICABLE"];
const PROFICIENCIES = ["FAMILIAR", "PROFICIENT", "ADVANCED", "EXPERT"];

export type SectionKey = "intro" | "skills" | "experience" | "education" | "certs" | "languages" | "eligibility" | "links";

export type EditSkill = { name: string; proficiency: string | null; source: string; tier?: "CORE" | "SECONDARY" };
export type EditLanguage = { name: string; level?: string };
export type EditableProfile = {
  fullName: string | null;
  headline: string | null;
  seniority: string | null;
  photoUrl: string | null;
  yearsExperience: number | null;
  currentLocation: string | null;
  industries: string[];
  skills: EditSkill[];
  workHistory: { title?: string; company?: string; years?: string }[];
  education: { degree?: string; institution?: string; year?: string }[];
  certifications: string[];
  languages: EditLanguage[];
  /** Where they may work without sponsorship, and where they'd move to. */
  authorizedCountries: string[];
  relocateCountries: string[];
  /** Skip the country picker: needs sponsorship anywhere they aren't authorized. */
  relocateAnywhere: boolean;
  /** Public links shown in the hero — null when unset. No email here:
   *  contact addresses are deliberately not a public-profile field. */
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
};

/** What a completed save hands back for the view to merge into its state. */
export type ProfilePatch = Partial<EditableProfile>;

const TITLES: Record<SectionKey, string> = {
  intro: "Edit intro",
  skills: "Edit skills",
  experience: "Edit experience",
  education: "Edit education",
  certs: "Edit certifications",
  languages: "Edit languages",
  eligibility: "Where you can work",
  links: "Edit links",
};

export default function EditInPlace({
  section,
  profile,
  roleGroups,
  onClose,
  onSaved,
}: {
  section: SectionKey;
  profile: EditableProfile;
  roleGroups: { field: string; roles: string[] }[];
  onClose: () => void;
  /** Called with the saved fields so the page updates without a refetch. */
  onSaved: (patch: ProfilePatch) => void;
}) {
  // Draft state per section — initialised once from the live profile. The
  // modal edits the draft; nothing touches the page until PATCH succeeds.
  const [draft, setDraft] = useState<ProfilePatch>(() => {
    switch (section) {
      case "intro":
        return {
          headline: profile.headline, seniority: profile.seniority, photoUrl: profile.photoUrl,
          yearsExperience: profile.yearsExperience, currentLocation: profile.currentLocation,
          industries: profile.industries,
        };
      case "skills": return { skills: profile.skills.map((s) => ({ ...s })) };
      case "experience": return { workHistory: profile.workHistory.map((w) => ({ ...w })) };
      case "education": return { education: profile.education.map((e) => ({ ...e })) };
      case "certs": return { certifications: [...profile.certifications] };
      case "languages": return { languages: (profile.languages ?? []).map((l) => ({ ...l })) };
      case "eligibility":
        return {
          authorizedCountries: [...(profile.authorizedCountries ?? [])],
          relocateCountries: [...(profile.relocateCountries ?? [])],
          relocateAnywhere: profile.relocateAnywhere ?? false,
        };
      case "links":
        return {
          linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl,
          websiteUrl: profile.websiteUrl,
        };
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [industriesText, setIndustriesText] = useState(profile.industries.join(", "));
  const [newSkill, setNewSkill] = useState("");
  const [newCert, setNewCert] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // Scroll-lock the page behind the modal.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const set = <K extends keyof ProfilePatch>(k: K, v: ProfilePatch[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setError(null);
    // Assemble ONLY this section's fields — anything omitted is untouched
    // server-side, which is the whole safety story of per-section editing.
    const patch: ProfilePatch = { ...draft };
    if (section === "intro") patch.industries = industriesText.split(",").map((s) => s.trim()).filter(Boolean);
    if (section === "experience") patch.workHistory = (draft.workHistory ?? []).filter((w) => w.title || w.company);
    if (section === "education") patch.education = (draft.education ?? []).filter((e) => e.degree || e.institution);
    if (section === "languages") patch.languages = (draft.languages ?? []).map((l) => ({ name: l.name.trim(), level: l.level?.trim() || undefined })).filter((l) => l.name);
    if (section === "eligibility") {
      patch.authorizedCountries = draft.authorizedCountries ?? [];
      patch.relocateAnywhere = draft.relocateAnywhere ?? false;
      // Explicit even when the toggle is on and the picker was hidden — the
      // server also clears this, but the patch body is what onSaved() merges
      // into the page's optimistic state, so it has to say so too.
      patch.relocateCountries = patch.relocateAnywhere ? [] : draft.relocateCountries ?? [];
    }
    if (section === "links") {
      // Empty string → null (a cleared field removes the link). The server
      // normalises and validates authoritatively; the https:// prefix is
      // mirrored here only so the merged page state renders a working anchor
      // immediately (a bare "linkedin.com/…" href would be a relative link).
      const url = (v: string | null | undefined) => {
        const s = v?.trim();
        return s ? (/^https?:\/\//i.test(s) ? s : `https://${s}`) : null;
      };
      patch.linkedinUrl = url(draft.linkedinUrl);
      patch.githubUrl = url(draft.githubUrl);
      patch.websiteUrl = url(draft.websiteUrl);
    }
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("save");
      onSaved(patch);
      onClose();
    } catch {
      setError("Couldn't save — try again.");
      setSaving(false);
    }
  }

  /** Downscale a picked image client-side and stage it as a data URI. */
  function pickPhoto(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 480;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      set("photoUrl", canvas.toDataURL("image/jpeg", 0.85));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setError("Couldn't read that image — try a JPG or PNG."); URL.revokeObjectURL(url); };
    img.src = url;
  }

  const skills = draft.skills ?? [];
  const upSkill = (name: string, p: Partial<EditSkill>) => set("skills", skills.map((x) => (x.name === name ? { ...x, ...p } : x)));
  const skillRow = (s: EditSkill) => (
    <div key={s.name} style={S.skillRow}>
      <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
      <select style={S.smallSel} value={s.proficiency ?? ""} onChange={(e) => upSkill(s.name, { proficiency: e.target.value || null })}>
        <option value="">level?</option>
        {PROFICIENCIES.map((pr) => <option key={pr} value={pr}>{label(pr)}</option>)}
      </select>
      <button type="button" style={S.tierBtn} title={s.tier === "SECONDARY" ? "Move to core" : "Move to 'also knows'"} onClick={() => upSkill(s.name, { tier: s.tier === "SECONDARY" ? "CORE" : "SECONDARY" })}>
        {s.tier === "SECONDARY" ? "→ core" : "→ also"}
      </button>
      <button type="button" aria-label={`Remove ${s.name}`} style={S.x} onClick={() => set("skills", skills.filter((x) => x.name !== s.name))}>×</button>
    </div>
  );

  let body: ReactNode = null;

  if (section === "intro") {
    body = (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
          {draft.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", border: `1px solid ${C.line}` }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#EEF2FF", color: C.c1, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20 }}>
              {(profile.fullName ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={S.ghostBtn}>
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ""; }} />
              {draft.photoUrl ? "Replace photo" : "Upload photo"}
            </label>
            {draft.photoUrl && <button type="button" style={S.ghostBtn} onClick={() => set("photoUrl", null)}>Remove</button>}
          </div>
        </div>

        <div style={S.qLabel}>Role</div>
        <select style={S.wide} value={draft.headline ?? ""} onChange={(e) => set("headline", e.target.value || null)}>
          <option value="">Choose your role…</option>
          {roleGroups.map((g) => (
            <optgroup key={g.field} label={g.field}>
              {g.roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </optgroup>
          ))}
          {draft.headline && !roleGroups.some((g) => g.roles.includes(draft.headline!)) && (
            <option value={draft.headline}>{draft.headline} (from your resume)</option>
          )}
        </select>

        <div style={S.two}>
          <div>
            <div style={S.qLabel}>Seniority</div>
            <select style={S.wide} value={draft.seniority ?? "NOT_APPLICABLE"} onChange={(e) => set("seniority", e.target.value)}>
              {SENIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </div>
          <div>
            <div style={S.qLabel}>Years of experience</div>
            <input style={S.wide} type="number" value={draft.yearsExperience ?? ""} onChange={(e) => set("yearsExperience", e.target.value ? Number(e.target.value) : null)} />
          </div>
        </div>

        <div style={S.qLabel}>Where you are</div>
        <input style={S.wide} value={draft.currentLocation ?? ""} placeholder="City, Country" onChange={(e) => set("currentLocation", e.target.value)} />
        <div style={S.hint}>Your feed is scoped to the country this resolves to.</div>

        <div style={S.qLabel}>Industries</div>
        <input style={S.wide} value={industriesText} placeholder="healthcare, b2b saas" onChange={(e) => setIndustriesText(e.target.value)} />
      </>
    );
  }

  if (section === "skills") {
    body = (
      <>
        <div style={S.groupLabel}>Core skills — your line of work</div>
        <div style={S.rows}>
          {skills.filter((s) => s.tier !== "SECONDARY").map(skillRow)}
          {skills.every((s) => s.tier === "SECONDARY") && <div style={S.hint}>No core skills yet — move some up, or add one below.</div>}
        </div>
        <div style={{ ...S.groupLabel, marginTop: 18 }}>Also knows — secondary</div>
        <div style={S.rows}>
          {skills.filter((s) => s.tier === "SECONDARY").map(skillRow)}
          {skills.every((s) => s.tier !== "SECONDARY") && <div style={S.hint}>Nothing here — use &quot;→ also&quot; to move a skill down.</div>}
        </div>
        <input
          style={{ ...S.wide, marginTop: 14 }}
          placeholder="Add a skill, then Enter (added as core)"
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newSkill.trim()) {
              e.preventDefault();
              set("skills", [...skills, { name: newSkill.trim(), proficiency: null, source: "USER_ADDED", tier: "CORE" }]);
              setNewSkill("");
            }
          }}
        />
      </>
    );
  }

  if (section === "experience") {
    const rows = draft.workHistory ?? [];
    body = (
      <>
        {rows.length === 0 && <div style={S.hint}>Nothing yet — add your roles so your matches reflect them.</div>}
        {rows.map((w, i) => (
          <div key={i} style={S.histRow}>
            <input style={S.wide} placeholder="Job title" value={w.title ?? ""} onChange={(e) => set("workHistory", rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input style={S.grow} placeholder="Company" value={w.company ?? ""} onChange={(e) => set("workHistory", rows.map((x, j) => (j === i ? { ...x, company: e.target.value } : x)))} />
              <input style={S.grow} placeholder="e.g. 2021–Present" value={w.years ?? ""} onChange={(e) => set("workHistory", rows.map((x, j) => (j === i ? { ...x, years: e.target.value } : x)))} />
              <button type="button" aria-label="Remove" style={S.x} onClick={() => set("workHistory", rows.filter((_, j) => j !== i))}>×</button>
            </div>
          </div>
        ))}
        <button type="button" style={S.addBtn} onClick={() => set("workHistory", [...rows, { title: "", company: "", years: "" }])}>+ Add experience</button>
      </>
    );
  }

  if (section === "education") {
    const rows = draft.education ?? [];
    body = (
      <>
        {rows.length === 0 && <div style={S.hint}>Add your degrees and schools.</div>}
        {rows.map((ed, i) => (
          <div key={i} style={S.histRow}>
            <input style={S.wide} placeholder="Degree" value={ed.degree ?? ""} onChange={(e) => set("education", rows.map((x, j) => (j === i ? { ...x, degree: e.target.value } : x)))} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input style={S.grow} placeholder="Institution" value={ed.institution ?? ""} onChange={(e) => set("education", rows.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)))} />
              <input style={S.grow} placeholder="Year" value={ed.year ?? ""} onChange={(e) => set("education", rows.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />
              <button type="button" aria-label="Remove" style={S.x} onClick={() => set("education", rows.filter((_, j) => j !== i))}>×</button>
            </div>
          </div>
        ))}
        <button type="button" style={S.addBtn} onClick={() => set("education", [...rows, { degree: "", institution: "", year: "" }])}>+ Add education</button>
      </>
    );
  }

  if (section === "certs") {
    const certs = draft.certifications ?? [];
    body = (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {certs.map((c, i) => (
            <span key={c + i} style={S.chip}>{c}<button type="button" aria-label={`Remove ${c}`} style={S.chipX} onClick={() => set("certifications", certs.filter((_, j) => j !== i))}>×</button></span>
          ))}
          {certs.length === 0 && <div style={S.hint}>No certifications yet.</div>}
        </div>
        <input
          style={{ ...S.wide, marginTop: 12 }}
          placeholder="Add a certification, then Enter"
          value={newCert}
          onChange={(e) => setNewCert(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newCert.trim()) {
              e.preventDefault();
              set("certifications", [...certs, newCert.trim()]);
              setNewCert("");
            }
          }}
        />
      </>
    );
  }

  if (section === "eligibility") {
    const authorized = draft.authorizedCountries ?? [];
    const relocate = draft.relocateCountries ?? [];
    const anywhere = draft.relocateAnywhere ?? false;
    body = (
      <>
        <div style={S.hint}>
          This is what scopes your job feed. It is deliberately separate from where you live — a US citizen in Karachi should see US jobs, and someone in Karachi who&apos;d move to the US should see those too.
        </div>
        <CountryPicker
          label="I can work here without sponsorship"
          hint="Citizenship, permanent residency, or a visa that already lets you work."
          selected={authorized}
          onChange={(v) => setDraft((d) => ({ ...d, authorizedCountries: v, relocateCountries: (d.relocateCountries ?? []).filter((c) => !v.includes(c)) }))}
        />
        <div style={{ height: 18 }} />

        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, relocateAnywhere: !anywhere, relocateCountries: !anywhere ? [] : d.relocateCountries }))}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: `1px solid ${anywhere ? C.c1 : C.line}`, background: anywhere ? "#EEF2FF" : "#fff", borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
        >
          <span style={{ flex: "none", width: 34, height: 20, borderRadius: 999, background: anywhere ? C.c1 : "#CBD5E1", position: "relative", transition: "background .15s" }}>
            <span style={{ position: "absolute", top: 2, left: anywhere ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
          </span>
          <span style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>I&apos;d relocate anywhere for the right job</div>
            <div style={{ fontSize: 12, color: C.mut, marginTop: 2, lineHeight: 1.4 }}>Skip picking countries one at a time — needs sponsorship everywhere you aren&apos;t already authorized.</div>
          </span>
        </button>

        {anywhere ? (
          <div style={{ ...S.hint, background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 10, padding: "9px 12px", marginTop: 14 }}>
            Most postings never mention sponsorship at all. We can only remove the ones that explicitly refuse it — the rest are shown with an honest &quot;not stated&quot; note, not a promise.
          </div>
        ) : (
          <>
            <div style={{ height: 18 }} />
            <CountryPicker
              label="I'd move here for the right job"
              hint="You'd need sponsorship. We'll show these jobs and hide the ones that say outright they don't sponsor."
              selected={relocate}
              exclude={authorized}
              onChange={(v) => setDraft((d) => ({ ...d, relocateCountries: v }))}
            />
            {relocate.length > 0 && (
              <div style={{ ...S.hint, background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", borderRadius: 10, padding: "9px 12px", marginTop: 14 }}>
                Most postings never mention sponsorship at all. We can only remove the ones that explicitly refuse it — the rest are shown with an honest &quot;not stated&quot; note, not a promise.
              </div>
            )}
          </>
        )}
      </>
    );
  }

  if (section === "languages") {
    const rows = draft.languages ?? [];
    body = (
      <>
        <div style={S.hint}>The languages you can work in. Level is your own words — &quot;Native&quot;, &quot;Fluent&quot;, &quot;Conversational&quot;.</div>
        {rows.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input style={{ ...S.wide, flex: 2 }} placeholder="Language — e.g. Urdu" value={l.name} onChange={(e) => set("languages", rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input style={{ ...S.wide, flex: 1 }} placeholder="Level" value={l.level ?? ""} onChange={(e) => set("languages", rows.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))} />
            <button type="button" aria-label="Remove" style={S.x} onClick={() => set("languages", rows.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" style={{ ...S.ghostBtn, marginTop: 12 }} onClick={() => set("languages", [...rows, { name: "", level: "" }])}>+ Add language</button>
      </>
    );
  }

  if (section === "links") {
    body = (
      <>
        <div style={S.hint}>Shown on your profile and your public page. Leave a field empty to hide that link.</div>
        <div style={S.qLabel}>LinkedIn</div>
        <input style={S.wide} placeholder="linkedin.com/in/your-name" value={draft.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value)} />
        <div style={S.qLabel}>GitHub</div>
        <input style={S.wide} placeholder="github.com/your-handle" value={draft.githubUrl ?? ""} onChange={(e) => set("githubUrl", e.target.value)} />
        <div style={S.qLabel}>Website / portfolio</div>
        <input style={S.wide} placeholder="yoursite.com" value={draft.websiteUrl ?? ""} onChange={(e) => set("websiteUrl", e.target.value)} />
        <div style={S.hint}>No email field on purpose — a public page shouldn&apos;t hand your address to scrapers. People reach you through these links.</div>
      </>
    );
  }

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label={TITLES[section]}>
      <div style={S.modal}>
        <div style={S.head}>
          <h2 style={S.title}>{TITLES[section]}</h2>
          <button type="button" aria-label="Close" style={S.close} onClick={onClose}><span style={{ fontSize: 18, lineHeight: 1 }}>×</span></button>
        </div>
        <div style={S.body}>{body}</div>
        <div style={S.foot}>
          {error && <span style={{ color: "#DC2626", fontSize: 13, fontWeight: 600, flex: 1 }}>{error}</span>}
          {!error && <span style={{ flex: 1, fontSize: 12, color: C.mut }}>Saving re-scores your matches.</span>}
          <button type="button" style={S.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" style={S.saveBtn} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/** The pencil that marks a section as editable in place. */
/**
 * Country multi-select with one-tap groups.
 *
 * Group shortcuts exist because work rights genuinely come in bundles: an EU
 * citizen may work in 29 countries, and making them tick 29 boxes would be our
 * data model leaking into their afternoon. Search is there because a flat list
 * of ~90 countries is not a UI.
 */
export function CountryPicker({ label, hint, selected, exclude = [], onChange }: {
  label: string;
  hint: string;
  selected: string[];
  exclude?: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = PICKER_ORDER
    .filter((c) => !selected.includes(c) && !exclude.includes(c))
    .filter((c) => !query || COUNTRY_NAMES[c].toLowerCase().includes(query) || c.toLowerCase() === query)
    .slice(0, query ? 8 : 6);

  const add = (c: string) => { if (!selected.includes(c)) onChange([...selected, c]); setQ(""); };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.5, marginBottom: 9 }}>{hint}</div>

      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
          {selected.map((c) => (
            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF2FF", color: "#4338CA", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600 }}>
              {COUNTRY_NAMES[c] ?? c}
              <button type="button" aria-label={`Remove ${COUNTRY_NAMES[c] ?? c}`} onClick={() => onChange(selected.filter((x) => x !== c))} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {COUNTRY_GROUPS.map((g) => {
          const addable = g.codes.filter((c) => !selected.includes(c) && !exclude.includes(c));
          if (!addable.length) return null;
          return (
            <button key={g.label} type="button" title={g.hint} onClick={() => onChange([...selected, ...addable])}
              style={{ background: "#F1F5F9", border: `1px solid ${C.line}`, color: C.slate, borderRadius: 999, padding: "5px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              + All {g.label}
            </button>
          );
        })}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search countries…"
        style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {matches.map((c) => (
          <button key={c} type="button" onClick={() => add(c)}
            style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.slate, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            + {COUNTRY_NAMES[c]}
          </button>
        ))}
        {query && matches.length === 0 && <span style={{ fontSize: 12, color: C.mut }}>No country matches “{q}”.</span>}
      </div>
    </div>
  );
}

export function EditPencil({ onClick, label: aria = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={aria} onClick={onClick} style={S.pencil}>
      <Icon name="edit" size={14} />
    </button>
  );
}

const S: Record<string, CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", zIndex: 120, padding: 16 },
  modal: { background: "#fff", borderRadius: 18, width: "100%", maxWidth: 560, maxHeight: "min(86vh, 720px)", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(15,23,42,.3)", overflow: "hidden" },
  head: { display: "flex", alignItems: "center", gap: 12, padding: "18px 22px 14px", borderBottom: `1px solid ${C.line}` },
  title: { margin: 0, fontSize: 17, fontWeight: 800, flex: 1 },
  close: { border: "none", background: "#F1F5F9", color: C.slate, width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", cursor: "pointer" },
  body: { padding: "16px 22px", overflowY: "auto" },
  foot: { display: "flex", alignItems: "center", gap: 10, padding: "14px 22px", borderTop: `1px solid ${C.line}` },
  cancelBtn: { border: `1px solid ${C.line}`, background: "#fff", color: C.slate, borderRadius: 10, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { border: "none", background: GRAD, color: "#fff", borderRadius: 10, padding: "10px 22px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  pencil: { border: `1px solid ${C.line}`, background: "#fff", color: C.slate, width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", cursor: "pointer", flex: "none" },
  qLabel: { fontSize: 13, fontWeight: 600, color: C.ink, margin: "14px 0 6px" },
  hint: { fontSize: 12, color: C.mut, marginTop: 6, lineHeight: 1.45 },
  wide: { width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid #D4D4D8`, fontSize: 14.5, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" },
  grow: { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 9, border: `1px solid #D4D4D8`, fontSize: 14.5, fontFamily: "inherit", background: "#fff" },
  two: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  ghostBtn: { display: "inline-block", border: `1px solid ${C.line}`, background: "#F8FAFC", color: C.slate, borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  groupLabel: { fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.mut, marginBottom: 10 },
  rows: { display: "flex", flexDirection: "column", gap: 8 },
  skillRow: { display: "flex", alignItems: "center", gap: 8 },
  smallSel: { padding: "6px 8px", borderRadius: 8, border: "1px solid #D4D4D8", fontSize: 12.5, background: "#fff", fontFamily: "inherit", flex: "none" },
  tierBtn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #DDD6FE", background: "#F5F3FF", color: "#7C3AED", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flex: "none" },
  x: { border: "none", background: "none", color: C.mut, fontSize: 19, cursor: "pointer", lineHeight: 1, padding: "0 4px", flex: "none" },
  histRow: { padding: "12px 0", borderTop: `1px solid #F2F2F5` },
  addBtn: { marginTop: 12, background: "#EEF2FF", color: C.c1, border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#F0EAFF", color: "#5A3CCF", borderRadius: 999, fontSize: 12.5, fontWeight: 600 },
  chipX: { background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 },
};
