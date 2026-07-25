"use client";

/**
 * Resume export designs.
 *
 * Every template renders from ONE normalised view model (SheetData) built in
 * `sheetData()`, so a template is only ever a layout decision — no template
 * gets to decide what a "core skill" is, or whether a project link is safe.
 * Add a design by writing a component, not by touching the data.
 *
 * ── One deliberate departure from the mockups ────────────────────────────
 * The design files are fixed 794×1123 boxes with `overflow: hidden`. Copied
 * literally that silently CLIPS anyone whose history doesn't fit — the fourth
 * job, the last two skills, gone with no warning, discovered by the person
 * reading the PDF rather than the person who wrote it. So the sheets keep the
 * 794px A4 width and their exact proportions but grow to their natural
 * height, and print pagination handles the overflow. A two-page resume is a
 * normal thing; a truncated one is a bug we shipped.
 */
import type { CSSProperties, ReactNode } from "react";
import { C, GRAD } from "@/app/_components/ui";
import type { ResumeContent } from "@/lib/resume/doc";

/** A4 at 96dpi — the width every design was drawn against. */
export const SHEET_W = 794;

export type TemplateId = "signal" | "ledger" | "grid" | "prism" | "atlas" | "studio" | "ats";

export const TEMPLATES: { id: TemplateId; name: string; blurb: string }[] = [
  { id: "signal", name: "Signal", blurb: "Topezia navy rail with your photo — product and marketing roles" },
  { id: "ledger", name: "Ledger", blurb: "Editorial serif, hanging dates — reads senior" },
  { id: "grid", name: "Grid", blurb: "Swiss, mono labels, one accent band — cleanest parse" },
  { id: "prism", name: "Prism", blurb: "Gradient masthead, skills grouped by discipline" },
  { id: "atlas", name: "Atlas", blurb: "Warm terracotta and teal on cream — its own palette" },
  { id: "studio", name: "Studio", blurb: "Warm paper, portrait hero, gallery footer — creative roles" },
  { id: "ats", name: "ATS-safe", blurb: "Plain single-column text, no graphics at all" },
];

/** Designs with their own built-in page padding print edge-to-edge. */
export const BLEEDS: Record<TemplateId, boolean> = {
  signal: true, ledger: true, grid: true, prism: true, atlas: true, studio: true, ats: false,
};

export interface SheetData {
  name: string;
  headline: string;
  summary: string;
  contacts: { k: string; v: string }[];
  experience: { title: string; company: string; years: string; bullets: string[] }[];
  education: { degree: string; institution: string; year: string }[];
  coreSkills: string[];
  extraSkills: string[];
  allSkills: string[];
  certifications: string[];
  projects: { title: string; url: string; thumb: string | null; short: string }[];
  languages: string[];
  quotes: { text: string; by: string }[];
  photo: string | null;
  publicUrl: string | null;
  publicShort: string | null;
  qr: string | null;
  focused: boolean;
}

const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

export function sheetData(doc: ResumeContent, photo: string | null, publicUrl: string | null, qr: string | null): SheetData {
  const coreSet = new Set((doc.focus?.core ?? []).map((s) => s.toLowerCase()));
  const focused = !!doc.focus && doc.skills.some((s) => coreSet.has(s.toLowerCase()));
  const core = focused ? doc.skills.filter((s) => coreSet.has(s.toLowerCase())) : doc.skills;
  const extra = focused ? doc.skills.filter((s) => !coreSet.has(s.toLowerCase())) : [];

  return {
    name: doc.contact.name || "Your Name",
    headline: doc.contact.headline,
    summary: doc.summary,
    contacts: ([["Email", doc.contact.email], ["Phone", doc.contact.phone], ["Based", doc.contact.location], ["Web", doc.contact.link]] as const)
      .filter(([, v]) => v).map(([k, v]) => ({ k, v })),
    experience: doc.experience.map((e) => ({ ...e, bullets: e.bullets.filter(Boolean) })),
    education: doc.education,
    coreSkills: core,
    extraSkills: extra,
    allSkills: doc.skills,
    certifications: doc.certifications,
    projects: doc.projects.map((p) => ({ ...p, short: short(p.url) })),
    languages: doc.languages.filter((l) => l.name).map((l) => (l.level ? `${l.name} — ${l.level}` : l.name)),
    quotes: doc.recommendations.filter((r) => r.text).map((r) => ({ text: r.text, by: [r.author, r.role].filter(Boolean).join(" — ") })),
    photo: doc.showPhoto ? photo : null,
    publicUrl,
    publicShort: publicUrl ? short(publicUrl) : null,
    qr,
    focused,
  };
}

/** Every sheet: fixed A4 width, natural height, its own font stack. */
const sheet = (font: string, bg: string, color: string): CSSProperties => ({
  width: SHEET_W, minHeight: 1123, background: bg, color, fontFamily: font,
  display: "flex", flexDirection: "column", overflow: "hidden",
});

const SORA = "var(--font-sora), system-ui, sans-serif";
const GARAMOND = "var(--font-garamond), Georgia, serif";
const INSTRUMENT = "var(--font-instrument), Georgia, serif";
const ARCHIVO = "var(--font-archivo), system-ui, sans-serif";
const MONO = "var(--font-plex-mono), ui-monospace, monospace";

export function ResumeSheet({ id, d }: { id: TemplateId; d: SheetData }) {
  switch (id) {
    case "ledger": return <Ledger d={d} />;
    case "grid": return <Grid d={d} />;
    case "prism": return <Prism d={d} />;
    case "atlas": return <Atlas d={d} />;
    case "studio": return <Studio d={d} />;
    case "ats": return <Ats d={d} />;
    default: return <Signal d={d} />;
  }
}

/* ── 1b Signal — navy rail, photo, portfolio row ─────────────────────── */
function Signal({ d }: { d: SheetData }) {
  return (
    <div style={{ ...sheet(SORA, "#fff", "#1B1F2A"), display: "grid", gridTemplateColumns: "274px minmax(0,1fr)" }}>
      <div style={{ background: C.navy, color: "#fff", padding: "44px 30px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ position: "absolute", top: -120, right: -90, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,.46), transparent 68%)" }} />
        <div style={{ position: "absolute", bottom: -140, left: -70, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,.34), transparent 70%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {d.photo && (
            <div style={{ padding: 3, borderRadius: "50%", background: GRAD }}>
              <div style={{ padding: 3, background: C.navy, borderRadius: "50%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.photo} alt="" style={{ width: 124, height: 124, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
              </div>
            </div>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.2 }}>{d.name}</div>
            {d.headline && <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, letterSpacing: 1.6, textTransform: "uppercase", color: "#A9B2CC" }}>{d.headline}</div>}
          </div>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 9 }}>
          {d.contacts.map((c) => (
            <div key={c.k} style={{ fontSize: 10.5, color: "#C6CDE0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.v}</div>
          ))}
        </div>
        {d.coreSkills.length > 0 && (
          <RailBlock title={d.focused ? "Core skills" : "Skills"}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {d.coreSkills.map((s) => <span key={s} style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.13)", borderRadius: 6, padding: "4px 8px", fontSize: 9.5, color: "#DBE1F0" }}>{s}</span>)}
            </div>
          </RailBlock>
        )}
        {d.extraSkills.length > 0 && <RailBlock title="Also"><div style={{ fontSize: 10, lineHeight: 1.85, color: "#B4BCD2" }}>{d.extraSkills.join(" · ")}</div></RailBlock>}
        {d.languages.length > 0 && <RailBlock title="Languages"><div style={{ display: "grid", gap: 6 }}>{d.languages.map((l) => <div key={l} style={{ fontSize: 10, color: "#C6CDE0" }}>{l}</div>)}</div></RailBlock>}
        {d.certifications.length > 0 && <RailBlock title="Certifications"><div style={{ fontSize: 10, lineHeight: 1.8, color: "#B4BCD2" }}>{d.certifications.join(" · ")}</div></RailBlock>}
        <div className="rb-flex" style={{ flex: 1 }} />
        {d.publicShort && (
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.1)" }}>
            {d.qr && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.qr} alt="" style={{ width: 42, height: 42, background: "#fff", padding: 2, borderRadius: 4 }} />}
            <div style={{ fontSize: 9, lineHeight: 1.5, color: "#8C96B4" }}>Full profile<br />{d.publicShort}</div>
          </div>
        )}
      </div>

      <div style={{ padding: "44px 40px", display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
        {d.summary && <Block label="Profile"><p style={{ margin: 0, fontSize: 11.8, lineHeight: 1.72, color: "#3C4252" }}>{d.summary}</p></Block>}
        {d.experience.length > 0 && (
          <Block label="Experience" rule>
            <div style={{ display: "grid", gap: 15 }}>
              {d.experience.map((r, i) => (
                <div key={i} className="rb-keep" style={{ display: "flex", gap: 13 }}>
                  <div style={{ flex: "none", width: 2, borderRadius: 2, background: GRAD }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{r.title}</div>
                      {r.years && <div style={{ flex: "none", fontSize: 9.5, fontWeight: 600, color: "#8992A6" }}>{r.years}</div>}
                    </div>
                    {r.company && <div style={{ fontSize: 11, fontWeight: 600, color: C.c1, marginTop: 3 }}>{r.company}</div>}
                    {r.bullets.length > 0 && (
                      <ul style={{ margin: "7px 0 0", paddingLeft: 15, display: "grid", gap: 4 }}>
                        {r.bullets.map((b, j) => <li key={j} style={{ fontSize: 11, lineHeight: 1.62, color: "#4A5164" }}>{b}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Block>
        )}
        {d.education.length > 0 && (
          <Block label="Education" rule>
            {d.education.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{e.degree}</div>
                  {e.institution && <div style={{ fontSize: 11, color: "#8992A6", marginTop: 2 }}>{e.institution}</div>}
                </div>
                {e.year && <div style={{ flex: "none", fontSize: 9.5, fontWeight: 600, color: "#8992A6" }}>{e.year}</div>}
              </div>
            ))}
          </Block>
        )}
        {d.projects.length > 0 && (
          <Block label="Selected work" rule>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
              {d.projects.slice(0, 6).map((p) => (
                <a key={p.url} href={p.url} className="rb-keep" style={{ border: "1px solid #E6E9F0", borderRadius: 10, overflow: "hidden", textDecoration: "none", color: "inherit", display: "block" }}>
                  <div style={{ aspectRatio: "16/10", background: "#EEF1FA" }}>
                    {p.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                  </div>
                  <div style={{ padding: "8px 9px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div>
                    <div style={{ fontSize: 9, color: "#98A0B2", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.short}</div>
                  </div>
                </a>
              ))}
            </div>
          </Block>
        )}
        <div className="rb-flex" style={{ flex: 1 }} />
        {d.quotes[0] && (
          <div className="rb-keep" style={{ background: "#F6F7FC", border: "1px solid #E6E9F0", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12 }}>
            <div style={{ flex: "none", fontSize: 26, lineHeight: 1, color: C.c2, fontFamily: INSTRUMENT }}>&ldquo;</div>
            <div>
              <p style={{ margin: 0, fontSize: 10.8, lineHeight: 1.62, color: "#3C4252" }}>{d.quotes[0].text}</p>
              {d.quotes[0].by && <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "#8992A6", marginTop: 7 }}>{d.quotes[0].by}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", color: "#8C96B4", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Block({ label, children, rule }: { label: string; children: ReactNode; rule?: boolean }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: rule ? 15 : 8 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", color: "#8992A6", flex: "none" }}>{label}</div>
        {rule && <div style={{ flex: 1, height: 1, background: "#E6E9F0" }} />}
      </div>
      {children}
    </div>
  );
}

/* ── 1a Ledger — editorial serif, hanging dates ──────────────────────── */
function Ledger({ d }: { d: SheetData }) {
  const Rule = ({ label }: { label: string }) => (
    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
      <div style={{ fontFamily: SORA, fontSize: 9.5, fontWeight: 700, letterSpacing: 2.4, textTransform: "uppercase", flex: "none" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "#D3D7DF" }} />
    </div>
  );
  return (
    <div style={{ ...sheet(GARAMOND, "#fff", "#191B20"), padding: "64px 68px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 28, paddingBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: INSTRUMENT, fontSize: 47, lineHeight: 1, letterSpacing: "-0.5px" }}>{d.name}</div>
          {d.headline && <div style={{ marginTop: 11, fontFamily: SORA, fontSize: 10, fontWeight: 600, letterSpacing: 2.6, textTransform: "uppercase", color: "#6D7484" }}>{d.headline}</div>}
        </div>
        <div style={{ flex: "none", textAlign: "right", fontFamily: SORA, fontSize: 10.5, lineHeight: 1.85, color: "#4B5262" }}>
          {d.contacts.map((c) => <div key={c.k}>{c.v}</div>)}
          {d.publicShort && <div style={{ color: C.c1 }}>{d.publicShort}</div>}
        </div>
      </div>
      <div style={{ height: 2, background: "#191B20" }} />
      <div style={{ height: 1, background: "#191B20", marginTop: 2 }} />

      {d.summary && <p style={{ margin: "22px 0 0", fontSize: 15.5, lineHeight: 1.62, color: "#2C3038" }}>{d.summary}</p>}

      {d.experience.length > 0 && (
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "0 22px" }}>
          <Rule label="Experience" />
          {d.experience.map((r, i) => (
            <div key={i} className="rb-keep" style={{ display: "contents" }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: "#7A8091", paddingTop: 5, paddingBottom: 20 }}>{r.years}</div>
              <div style={{ paddingBottom: 20, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25 }}>{r.title}</div>
                {r.company && <div style={{ fontFamily: SORA, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.9, textTransform: "uppercase", color: C.c1, marginTop: 5 }}>{r.company}</div>}
                {r.bullets.length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 16, display: "grid", gap: 4 }}>
                    {r.bullets.map((b, j) => <li key={j} style={{ fontSize: 14.2, lineHeight: 1.55, color: "#3A3F4A" }}>{b}</li>)}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {d.education.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "0 22px", marginTop: 4 }}>
          <Rule label="Education" />
          {d.education.map((e, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: "#7A8091", paddingTop: 4, paddingBottom: 12 }}>{e.year}</div>
              <div style={{ paddingBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{e.degree}</div>
                {e.institution && <div style={{ fontFamily: SORA, fontSize: 10.5, color: "#6D7484", marginTop: 4 }}>{e.institution}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "0 22px" }}>
        <Rule label="Capabilities" />
        {d.coreSkills.length > 0 && <>
          <LedgerKey>{d.focused ? "Core" : "Skills"}</LedgerKey>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "#2C3038" }}>{d.coreSkills.join(" · ")}</div>
        </>}
        {d.extraSkills.length > 0 && <>
          <LedgerKey pad>Also</LedgerKey>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "#2C3038", paddingTop: 7 }}>{d.extraSkills.join(" · ")}</div>
        </>}
        {d.certifications.length > 0 && <>
          <LedgerKey pad>Certified</LedgerKey>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "#2C3038", paddingTop: 7 }}>{d.certifications.join(" · ")}</div>
        </>}
        {d.languages.length > 0 && <>
          <LedgerKey pad>Languages</LedgerKey>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "#2C3038", paddingTop: 7 }}>{d.languages.join("  ·  ")}</div>
        </>}
        {d.projects.length > 0 && <>
          <LedgerKey pad>Work</LedgerKey>
          <div style={{ paddingTop: 7, display: "grid", gap: 3 }}>
            {d.projects.slice(0, 5).map((p) => (
              <a key={p.url} href={p.url} style={{ textDecoration: "none", color: "#2C3038", fontSize: 14 }}>
                {p.title} <span style={{ fontFamily: MONO, fontSize: 9, color: "#7A8091" }}>{p.short}</span>
              </a>
            ))}
          </div>
        </>}
      </div>

      <div className="rb-flex" style={{ flex: 1 }} />
      {(d.quotes[0] || d.publicShort) && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18, borderTop: "1px solid #D3D7DF", paddingTop: 14, marginTop: 20 }}>
          {d.quotes[0] && (
            <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: 1.5, fontStyle: "italic", color: "#3A3F4A" }}>
              &ldquo;{d.quotes[0].text}&rdquo;{d.quotes[0].by && <span style={{ fontStyle: "normal", fontFamily: SORA, fontSize: 9.5, letterSpacing: 0.6, textTransform: "uppercase", color: "#7A8091" }}> — {d.quotes[0].by}</span>}
            </p>
          )}
          {d.publicShort && <div style={{ flex: "none", fontFamily: SORA, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", color: "#989FAF", textAlign: "right", lineHeight: 1.7 }}>Portfolio<br />{d.publicShort}</div>}
        </div>
      )}
    </div>
  );
}

const LedgerKey = ({ children, pad }: { children: ReactNode; pad?: boolean }) => (
  <div style={{ fontFamily: SORA, fontSize: 9, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase", color: "#7A8091", paddingTop: pad ? 11 : 4 }}>{children}</div>
);

/* ── 1c Grid — Swiss, mono labels, accent band ───────────────────────── */
function Grid({ d }: { d: SheetData }) {
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase", color: "#14161A", paddingTop: 2 }}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </>
  );
  return (
    <div style={sheet(ARCHIVO, "#FBFBF9", "#14161A")}>
      <div style={{ height: 9, background: GRAD, flex: "none" }} />
      <div style={{ padding: "52px 62px 46px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 232px", gap: 34, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 54, fontWeight: 800, letterSpacing: "-2.4px", lineHeight: 0.98 }}>{d.name}</div>
            {d.headline && <div style={{ marginTop: 16, display: "inline-block", background: "#14161A", color: "#FBFBF9", fontFamily: MONO, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", padding: "6px 11px" }}>{d.headline}</div>}
          </div>
          <div style={{ display: "grid", gap: 9, paddingTop: 6 }}>
            {d.contacts.map((c) => (
              <div key={c.k} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr)", gap: 10, alignItems: "baseline", borderBottom: "1px solid #E0DFDA", paddingBottom: 7 }}>
                <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase", color: "#8A8A82" }}>{c.k}</div>
                <div style={{ fontSize: 10.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.v}</div>
              </div>
            ))}
          </div>
        </div>

        {d.summary && <p style={{ margin: "34px 0 0", maxWidth: 640, fontSize: 13.6, lineHeight: 1.6, color: "#2A2D33" }}>{d.summary}</p>}

        {d.experience.length > 0 && (
          <div style={{ marginTop: 38, display: "grid", gridTemplateColumns: "106px minmax(0,1fr)", gap: "0 26px" }}>
            <div style={{ gridColumn: "1 / -1", height: 1, background: "#14161A", marginBottom: 18 }} />
            <Row label="Experience">
              <div style={{ display: "grid", gap: 22 }}>
                {d.experience.map((r, i) => (
                  <div key={i} className="rb-keep" style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                      <div style={{ flex: 1, fontSize: 16, fontWeight: 700, letterSpacing: "-0.4px", lineHeight: 1.25 }}>{r.title}</div>
                      {r.years && <div style={{ flex: "none", fontFamily: MONO, fontSize: 9, color: "#8A8A82" }}>{r.years}</div>}
                    </div>
                    {r.company && <div style={{ fontSize: 11.5, fontWeight: 600, color: "#5B5F68", marginTop: 4 }}>{r.company}</div>}
                    {r.bullets.length > 0 && (
                      <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
                        {r.bullets.map((b, j) => (
                          <div key={j} style={{ display: "flex", gap: 10, fontSize: 11.6, lineHeight: 1.58, color: "#3A3D44" }}>
                            <span style={{ flex: "none", width: 5, height: 5, background: C.c1, marginTop: 7 }} /><span>{b}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Row>
          </div>
        )}

        {d.education.length > 0 && (
          <div style={{ marginTop: 34, display: "grid", gridTemplateColumns: "106px minmax(0,1fr)", gap: "0 26px" }}>
            <div style={{ gridColumn: "1 / -1", height: 1, background: "#14161A", marginBottom: 18 }} />
            <Row label="Education">
              {d.education.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px" }}>{e.degree}</div>
                    {e.institution && <div style={{ fontSize: 11.5, color: "#5B5F68", marginTop: 3 }}>{e.institution}</div>}
                  </div>
                  {e.year && <div style={{ flex: "none", fontFamily: MONO, fontSize: 9, color: "#8A8A82" }}>{e.year}</div>}
                </div>
              ))}
            </Row>
          </div>
        )}

        <div style={{ marginTop: 34, display: "grid", gridTemplateColumns: "106px minmax(0,1fr)", gap: "14px 26px" }}>
          <div style={{ gridColumn: "1 / -1", height: 1, background: "#14161A", marginBottom: 4 }} />
          {d.allSkills.length > 0 && (
            <Row label={d.focused ? "Core" : "Skills"}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(d.focused ? d.coreSkills : d.allSkills).map((s) => (
                  <span key={s} style={{ border: "1px solid #D8D7D1", borderRadius: 3, padding: "4px 8px", fontSize: 10, fontWeight: 500, color: "#2A2D33", background: "#fff" }}>{s}</span>
                ))}
              </div>
            </Row>
          )}
          {d.focused && d.extraSkills.length > 0 && <Row label="Also"><div style={{ fontSize: 11, color: "#5B5F68", lineHeight: 1.6 }}>{d.extraSkills.join(" · ")}</div></Row>}
          {d.certifications.length > 0 && <Row label="Certified"><div style={{ fontSize: 11.5, color: "#2A2D33", lineHeight: 1.6 }}>{d.certifications.join(" · ")}</div></Row>}
          {d.languages.length > 0 && <Row label="Languages"><div style={{ fontSize: 11.5, color: "#2A2D33", lineHeight: 1.6 }}>{d.languages.join("  ·  ")}</div></Row>}
          {d.projects.length > 0 && (
            <Row label="Work">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                {d.projects.map((p) => (
                  <a key={p.url} href={p.url} style={{ minWidth: 0, textDecoration: "none", color: "inherit" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700 }}>{p.title}</div>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: "#8A8A82", marginTop: 2 }}>{p.short}</div>
                  </a>
                ))}
              </div>
            </Row>
          )}
        </div>

        <div className="rb-flex" style={{ flex: 1 }} />
        {(d.quotes[0] || d.publicShort) && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, paddingTop: 16, marginTop: 20, borderTop: "1px solid #E0DFDA" }}>
            {d.quotes[0] && (
              <div style={{ flex: 1, fontSize: 11.4, lineHeight: 1.55, color: "#3A3D44" }}>
                &ldquo;{d.quotes[0].text}&rdquo; {d.quotes[0].by && <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.6, textTransform: "uppercase", color: "#8A8A82" }}>{d.quotes[0].by}</span>}
              </div>
            )}
            {d.publicShort && <div style={{ flex: "none", fontFamily: MONO, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase", color: "#8A8A82", textAlign: "right", lineHeight: 1.8 }}>Topezia<br />{d.publicShort}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 2a Prism — gradient masthead, tinted skill cards ────────────────── */
const PRISM_TINTS = [
  { tint: "#EEF2FF", line: "#E0E5FF", text: "#3730A3" },
  { tint: "#F5F3FF", line: "#EAE4FF", text: "#5B21B6" },
  { tint: "#ECFEFF", line: "#D6F5F9", text: "#0E5F6B" },
];

function Prism({ d }: { d: SheetData }) {
  // The mockup groups skills by discipline. We have no discipline taxonomy for
  // a member's own skill list, so we chunk in order instead — honest columns
  // rather than invented categories.
  const groups: string[][] = [];
  const per = Math.ceil(Math.max(1, d.coreSkills.length) / 3);
  for (let i = 0; i < d.coreSkills.length; i += per) groups.push(d.coreSkills.slice(i, i + per));

  const Head = ({ title }: { title: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.c1 }} />
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{title}</div>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.c2}, transparent)` }} />
    </div>
  );

  return (
    <div style={sheet(SORA, "#fff", "#181C27")}>
      <div style={{ flex: "none", position: "relative", overflow: "hidden", background: `linear-gradient(118deg, ${C.c1}, ${C.c2} 58%, #22D3EE)`, padding: "44px 46px 34px", color: "#fff" }}>
        <div style={{ position: "absolute", top: -160, right: -80, width: 340, height: 340, borderRadius: "50%", background: "rgba(255,255,255,.14)" }} />
        <div style={{ position: "absolute", bottom: -120, right: 120, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,.09)" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 22 }}>
          {d.photo && (
            <div style={{ flex: "none", width: 104, height: 104, borderRadius: 26, overflow: "hidden", border: "3px solid rgba(255,255,255,.55)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-1.4px", lineHeight: 1.05 }}>{d.name}</div>
            {d.headline && <div style={{ marginTop: 12, display: "inline-flex", background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.32)", borderRadius: 999, padding: "6px 14px", fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase" }}>{d.headline}</div>}
          </div>
        </div>
        {d.contacts.length > 0 && (
          <div style={{ position: "relative", marginTop: 26, display: "grid", gridTemplateColumns: `repeat(${Math.min(4, d.contacts.length)}, minmax(0,1fr))`, gap: 10 }}>
            {d.contacts.map((c) => (
              <div key={c.k} style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 11, padding: "9px 11px", minWidth: 0 }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>{c.k}</div>
                <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 246px", minHeight: 0 }}>
        <div style={{ padding: "30px 30px 30px 46px", display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
          {d.summary && <p style={{ margin: 0, fontSize: 12.2, lineHeight: 1.7, color: "#3E4557" }}>{d.summary}</p>}
          {d.experience.length > 0 && (
            <div>
              <Head title="Experience" />
              <div style={{ display: "grid", gap: 17 }}>
                {d.experience.map((r, i) => (
                  <div key={i} className="rb-keep" style={{ display: "flex", gap: 14, minWidth: 0 }}>
                    <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, paddingTop: 4 }}>
                      <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#fff", border: `3px solid ${C.c1}` }} />
                      <span style={{ flex: 1, width: 2, background: `linear-gradient(180deg, ${C.c2}, #E7E9F2)` }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                        <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, lineHeight: 1.28 }}>{r.title}</div>
                        {r.years && <div style={{ flex: "none", fontSize: 9.5, fontWeight: 700, color: C.c1, background: "#F2F1FE", borderRadius: 5, padding: "3px 7px" }}>{r.years}</div>}
                      </div>
                      {r.company && <div style={{ fontSize: 11, fontWeight: 600, color: "#6C7385", marginTop: 4 }}>{r.company}</div>}
                      {r.bullets.length > 0 && (
                        <div style={{ marginTop: 7, display: "grid", gap: 5 }}>
                          {r.bullets.map((b, j) => (
                            <div key={j} style={{ display: "flex", gap: 9, fontSize: 11.2, lineHeight: 1.6, color: "#4A5164" }}>
                              <span style={{ flex: "none", width: 4, height: 4, borderRadius: "50%", background: C.c2, marginTop: 7 }} /><span>{b}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.education.length > 0 && (
            <div>
              <Head title="Education" />
              {d.education.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 7 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.8, fontWeight: 700 }}>{e.degree}</div>
                    {e.institution && <div style={{ fontSize: 11, color: "#6C7385", marginTop: 3 }}>{e.institution}</div>}
                  </div>
                  {e.year && <div style={{ flex: "none", fontSize: 9.5, fontWeight: 700, color: C.c1, background: "#F2F1FE", borderRadius: 5, padding: "3px 7px" }}>{e.year}</div>}
                </div>
              ))}
            </div>
          )}
          {d.projects.length > 0 && (
            <div>
              <Head title="Selected work" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
                {d.projects.slice(0, 6).map((p) => (
                  <a key={p.url} href={p.url} className="rb-keep" style={{ borderRadius: 11, overflow: "hidden", background: "#F6F7FC", border: "1px solid #E7E9F2", textDecoration: "none", color: "inherit", display: "block" }}>
                    <div style={{ aspectRatio: "16/10", background: "#E9ECF8" }}>
                      {p.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    </div>
                    <div style={{ padding: "8px 9px" }}><div style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div></div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ background: "#FAFAFE", borderLeft: "1px solid #ECEDF6", padding: "30px 30px 30px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((g, i) => (
            <div key={i} style={{ borderRadius: 13, padding: "13px 14px", background: PRISM_TINTS[i % 3].tint, border: `1px solid ${PRISM_TINTS[i % 3].line}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: PRISM_TINTS[i % 3].text, marginBottom: 9 }}>
                {i === 0 ? (d.focused ? "Core" : "Skills") : " "}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {g.map((s) => <span key={s} style={{ background: "#fff", border: "1px solid rgba(24,28,39,.07)", borderRadius: 6, padding: "4px 8px", fontSize: 9.5, fontWeight: 600, color: "#2E3444" }}>{s}</span>)}
              </div>
            </div>
          ))}
          {d.extraSkills.length > 0 && <PrismCard title="Also">{d.extraSkills.join(" · ")}</PrismCard>}
          {d.certifications.length > 0 && <PrismCard title="Certified">{d.certifications.join(" · ")}</PrismCard>}
          {d.languages.length > 0 && (
            <div style={{ borderRadius: 13, padding: "13px 14px", background: "#fff", border: "1px solid #ECEDF6" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "#6C7385", marginBottom: 9 }}>Languages</div>
              <div style={{ display: "grid", gap: 5 }}>{d.languages.map((l) => <div key={l} style={{ fontSize: 9.8, color: "#4A5164" }}>{l}</div>)}</div>
            </div>
          )}
          <div className="rb-flex" style={{ flex: 1 }} />
          {d.quotes[0] && (
            <div className="rb-keep" style={{ borderRadius: 13, padding: 14, background: GRAD, color: "#fff" }}>
              <div style={{ fontFamily: INSTRUMENT, fontSize: 26, lineHeight: 0.7 }}>&ldquo;</div>
              <p style={{ margin: "6px 0 0", fontSize: 9.8, lineHeight: 1.65 }}>{d.quotes[0].text}</p>
              {d.quotes[0].by && <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,.78)", marginTop: 8 }}>{d.quotes[0].by}</div>}
            </div>
          )}
          {d.qr && d.publicShort && (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.qr} alt="" style={{ width: 40, height: 40 }} />
              <div style={{ fontSize: 8.5, color: "#6C7385", lineHeight: 1.5 }}>{d.publicShort}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: "none", height: 8, background: `linear-gradient(90deg, ${C.c1}, ${C.c2} 60%, #22D3EE)` }} />
    </div>
  );
}

const PrismCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <div style={{ borderRadius: 13, padding: "13px 14px", background: "#fff", border: "1px solid #ECEDF6" }}>
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "#6C7385", marginBottom: 9 }}>{title}</div>
    <div style={{ fontSize: 9.8, lineHeight: 1.8, color: "#4A5164" }}>{children}</div>
  </div>
);

/* ── 2b Atlas — terracotta + teal on cream, vertical spine ───────────── */
const TERRA = "#C2542A";
const TEAL = "#0E7C86";

function Atlas({ d }: { d: SheetData }) {
  const Head = ({ n, title }: { n: string; title: string }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 11 }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", color: TERRA, flex: "none" }}>{n} / {title}</div>
      <div style={{ flex: 1, height: 2, background: "#EADFCF" }} />
    </div>
  );
  return (
    <div style={{ ...sheet(ARCHIVO, "#FBF6EE", "#1E2430"), display: "grid", gridTemplateColumns: "54px minmax(0,1fr)" }}>
      <div style={{ background: TERRA, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: MONO, fontSize: 9, letterSpacing: 3.4, textTransform: "uppercase", color: "rgba(251,246,238,.9)" }}>
          {d.publicShort ?? "topezia.com"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "38px 46px 24px", display: "flex", gap: 26, alignItems: "flex-start" }}>
          {d.photo && (
            <div style={{ flex: "none", padding: 5, borderRadius: "50%", background: TEAL }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.photo} alt="" style={{ width: 112, height: 112, borderRadius: "50%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-1.8px", lineHeight: 1 }}>{d.name}</div>
            <div style={{ marginTop: 12, height: 5, width: 96, background: TERRA }} />
            {d.headline && <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 10, letterSpacing: 2.2, textTransform: "uppercase", color: TEAL }}>{d.headline}</div>}
          </div>
        </div>

        {d.contacts.length > 0 && (
          <div style={{ background: TEAL, color: "#F1FAFA", padding: "14px 46px", display: "grid", gridTemplateColumns: `repeat(${Math.min(4, d.contacts.length)}, minmax(0,1fr))`, gap: 14 }}>
            {d.contacts.map((c) => (
              <div key={c.k} style={{ minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(241,250,250,.65)" }}>{c.k}</div>
                <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.v}</div>
              </div>
            ))}
          </div>
        )}

        {d.summary && <div style={{ padding: "22px 46px 0" }}><p style={{ margin: 0, fontSize: 12.6, lineHeight: 1.6, color: "#2E3542", maxWidth: 620 }}>{d.summary}</p></div>}

        <div style={{ padding: "22px 46px 0", flex: 1, display: "flex", flexDirection: "column", gap: 19, minHeight: 0 }}>
          {d.experience.length > 0 && (
            <div>
              <Head n="01" title="Experience" />
              <div style={{ display: "grid", gap: 14 }}>
                {d.experience.map((r, i) => (
                  <div key={i} className="rb-keep" style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                      <div style={{ flex: 1, fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.4px", lineHeight: 1.24 }}>{r.title}</div>
                      {r.years && <div style={{ flex: "none", fontFamily: MONO, fontSize: 9, color: "#8A8378" }}>{r.years}</div>}
                    </div>
                    {r.company && <div style={{ fontSize: 11.5, fontWeight: 700, color: TEAL, marginTop: 4 }}>{r.company}</div>}
                    {r.bullets.length > 0 && (
                      <div style={{ marginTop: 7, display: "grid", gap: 5 }}>
                        {r.bullets.map((b, j) => (
                          <div key={j} style={{ display: "flex", gap: 10, fontSize: 11, lineHeight: 1.55, color: "#3A4150" }}>
                            <span style={{ flex: "none", width: 6, height: 2, background: TERRA, marginTop: 8 }} /><span>{b}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 26 }}>
            {d.allSkills.length > 0 && (
              <div>
                <Head n="02" title="Skills" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {(d.focused ? d.coreSkills : d.allSkills).map((s) => (
                    <span key={s} style={{ border: "1.5px solid #E3D6C3", borderRadius: 999, padding: "4px 10px", fontSize: 9.8, fontWeight: 600, color: "#2E3542", background: "#fff" }}>{s}</span>
                  ))}
                </div>
                {d.focused && d.extraSkills.length > 0 && (
                  <div style={{ fontSize: 10, color: "#6B6459", marginTop: 8, lineHeight: 1.6 }}>Also: {d.extraSkills.join(" · ")}</div>
                )}
              </div>
            )}
            <div>
              {d.education.length > 0 && (
                <>
                  <Head n="03" title="Education" />
                  {d.education.map((e, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.3px" }}>{e.degree}</div>
                      <div style={{ fontSize: 11, color: "#6B6459", marginTop: 3 }}>{[e.institution, e.year].filter(Boolean).join(" · ")}</div>
                    </div>
                  ))}
                </>
              )}
              {d.languages.length > 0 && (
                <>
                  <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.6, textTransform: "uppercase", color: "#8A8378" }}>Languages</div>
                  <div style={{ fontSize: 11, color: "#2E3542", marginTop: 5, lineHeight: 1.65 }}>{d.languages.join("  ·  ")}</div>
                </>
              )}
              {d.certifications.length > 0 && (
                <>
                  <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.6, textTransform: "uppercase", color: "#8A8378" }}>Certified</div>
                  <div style={{ fontSize: 11, color: "#2E3542", marginTop: 5, lineHeight: 1.65 }}>{d.certifications.join(" · ")}</div>
                </>
              )}
            </div>
          </div>

          {d.projects.length > 0 && (
            <div>
              <Head n="04" title="Selected work" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
                {d.projects.slice(0, 6).map((p) => (
                  <a key={p.url} href={p.url} className="rb-keep" style={{ background: "#fff", border: "1px solid #EADFCF", overflow: "hidden", textDecoration: "none", color: "inherit", display: "block" }}>
                    <div style={{ aspectRatio: "16/10", background: "#F2E9DC" }}>
                      {p.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    </div>
                    <div style={{ padding: "7px 10px" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: "#8A8378", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.short}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {d.quotes[0] && (
          <div style={{ marginTop: 18, background: "#1E2430", color: "#F4F1EC", padding: "14px 46px", display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ flex: 1, fontSize: 11.4, lineHeight: 1.55 }}>&ldquo;{d.quotes[0].text}&rdquo;</div>
            {d.quotes[0].by && <div style={{ flex: "none", fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.2, textTransform: "uppercase", color: "#9AA3B2", textAlign: "right", lineHeight: 1.7 }}>{d.quotes[0].by}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ATS-safe — plain single column, no graphics ─────────────────────── */
function Ats({ d }: { d: SheetData }) {
  const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
    <section style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, borderBottom: "1px solid #D1D5DB", paddingBottom: 3, marginBottom: 8, color: "#111827" }}>{title}</div>
      {children}
    </section>
  );
  const body: CSSProperties = { fontSize: 12, lineHeight: 1.55, margin: 0, color: "#1F2937" };
  return (
    <div style={{ ...sheet(GARAMOND, "#fff", "#111827"), padding: "56px 60px", minHeight: 1050 }}>
      <header style={{ borderBottom: "2px solid #111827", paddingBottom: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.3px" }}>{d.name}</div>
        {d.headline && <div style={{ fontSize: 13.5, marginTop: 3, color: "#374151" }}>{d.headline}</div>}
        <div style={{ fontSize: 11, color: "#4B5563", marginTop: 6 }}>{d.contacts.map((c) => c.v).join("  ·  ")}</div>
      </header>
      {d.summary && <Sec title="Summary"><p style={body}>{d.summary}</p></Sec>}
      {d.experience.length > 0 && (
        <Sec title="Experience">
          {d.experience.map((r, i) => (
            <div key={i} className="rb-keep" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{[r.title, r.company].filter(Boolean).join(" — ")}</span>
                {r.years && <span style={{ fontSize: 11, color: "#4B5563", flex: "none" }}>{r.years}</span>}
              </div>
              {r.bullets.length > 0 && (
                <ul style={{ margin: "5px 0 0", paddingLeft: 18 }}>
                  {r.bullets.map((b, j) => <li key={j} style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 3 }}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
        </Sec>
      )}
      {d.education.length > 0 && (
        <Sec title="Education">
          {d.education.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <span style={body}>{[e.degree, e.institution].filter(Boolean).join(" — ")}</span>
              {e.year && <span style={{ fontSize: 11, color: "#4B5563", flex: "none" }}>{e.year}</span>}
            </div>
          ))}
        </Sec>
      )}
      {d.allSkills.length > 0 && (
        <Sec title={d.focused ? "Core Skills" : "Skills"}>
          <p style={body}>{(d.focused ? d.coreSkills : d.allSkills).join("  ·  ")}</p>
          {d.focused && d.extraSkills.length > 0 && <p style={{ ...body, fontSize: 10.5, color: "#4B5563", marginTop: 4 }}>Additional: {d.extraSkills.join("  ·  ")}</p>}
        </Sec>
      )}
      {d.certifications.length > 0 && <Sec title="Certifications"><p style={body}>{d.certifications.join("  ·  ")}</p></Sec>}
      {d.projects.length > 0 && (
        <Sec title="Selected Projects">
          {d.projects.map((p) => (
            <div key={p.url} style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{p.title}</span>
              <span style={{ fontSize: 10, color: "#374151" }}> — {p.short}</span>
            </div>
          ))}
        </Sec>
      )}
      {d.languages.length > 0 && <Sec title="Languages"><p style={body}>{d.languages.join("  ·  ")}</p></Sec>}
      {d.quotes.length > 0 && (
        <Sec title="Recommendations">
          {d.quotes.map((q, i) => (
            <div key={i} className="rb-keep" style={{ marginBottom: 8 }}>
              <p style={{ ...body, fontStyle: "italic" }}>&ldquo;{q.text}&rdquo;</p>
              {q.by && <div style={{ fontSize: 10.5, color: "#4B5563", marginTop: 2 }}>— {q.by}</div>}
            </div>
          ))}
        </Sec>
      )}
      {d.publicShort && (
        <div style={{ borderTop: "1px solid #D1D5DB", paddingTop: 10, marginTop: 4, fontSize: 10, color: "#4B5563" }}>
          Full profile &amp; portfolio: {d.publicShort}
        </div>
      )}
    </div>
  );
}

/* ── 7 Studio — warm paper, portrait hero, gallery footer ─────────────── */
/* Two honest departures from the mock, both because the mock hard-codes
   data we don't have or can't claim:
   - Its right-hand vertical caption says "15 Years Experience"; nothing in
     the resume doc stores years-of-experience, and deriving one would be a
     guess printed as a fact. The location (real, member-typed) takes that
     visual slot instead.
   - Its skills carry 5-dot proficiency ratings; the resume doc has no
     proficiency, so dots-as-rating would be an invented measurement. Each
     skill gets a single ink dot as a marker — same texture, no claim. */
function Studio({ d }: { d: SheetData }) {
  const INK = "#1F2430", MUT = "#6E6A61", FAINT = "#9A9488", RULE = "#C9C4B9";
  const vertical: CSSProperties = {
    writingMode: "vertical-rl", fontSize: 8.5, fontWeight: 600, letterSpacing: 4,
    textTransform: "uppercase", color: "#8C877C", whiteSpace: "nowrap",
  };
  const colHead: CSSProperties = {
    fontSize: 9, fontWeight: 600, letterSpacing: 3.2, textTransform: "uppercase",
    color: INK, paddingBottom: 9, borderBottom: `1px solid ${RULE}`,
  };
  const itemTitle: CSSProperties = { fontSize: 10.5, fontWeight: 700, lineHeight: 1.35 };
  const itemSub: CSSProperties = { fontSize: 9, color: MUT, marginTop: 4, lineHeight: 1.6 };
  // The mock breaks the name across two lines; split on the middle word so
  // "Muhammad Zia Ul Haq" reads Muhammad / Zia Ul Haq rather than one long line.
  const words = d.name.split(/\s+/);
  const head = words.slice(0, Math.max(1, Math.floor(words.length / 2))).join(" ");
  const tail = words.slice(Math.max(1, Math.floor(words.length / 2))).join(" ");
  const located = d.contacts.find((c) => c.k === "Based")?.v ?? null;
  const [site, path] = d.publicShort ? [d.publicShort.split("/")[0], d.publicShort.slice(d.publicShort.indexOf("/"))] : [null, null];

  return (
    <div style={{ ...sheet(ARCHIVO, "#F4F2ED", INK), padding: "56px 54px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: 5.4, textTransform: "uppercase", lineHeight: 1.5 }}>
            {head}{tail && <><br />{tail}</>}<span style={{ color: FAINT }}>.</span>
          </div>
        </div>
        {site && (
          <div style={{ flex: "none", textAlign: "right", fontSize: 9, fontWeight: 500, letterSpacing: 2.6, textTransform: "uppercase", color: "#5C5A53", lineHeight: 1.9 }}>
            {site}{path && <><br />{path}</>}
          </div>
        )}
      </div>

      {d.photo ? (
        <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "24px minmax(0,1fr) 24px", gap: "0 14px", alignItems: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
            {d.headline && <div style={{ ...vertical, transform: "rotate(180deg)" }}>{d.headline}</div>}
          </div>
          <div style={{ position: "relative", display: "grid", placeItems: "center", padding: "0 90px" }}>
            <div style={{ width: "100%", maxWidth: 400, aspectRatio: "1 / 1", borderRadius: "50%", overflow: "hidden", background: "#E4E1D9" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            {located && <div style={vertical}>{located}</div>}
          </div>
        </div>
      ) : (
        // No photo (or hidden): the hero collapses to a quiet caption row so
        // the page doesn't open with an empty grey circle.
        (d.headline || located) && (
          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 16, fontSize: 9, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: "#8C877C" }}>
            <span>{d.headline}</span>{located && <span>{located}</span>}
          </div>
        )
      )}

      {d.summary && (
        <p style={{ margin: "24px auto 0", maxWidth: 560, textAlign: "center", fontSize: 10.5, lineHeight: 1.75, color: "#4A4740" }}>{d.summary}</p>
      )}

      <div className="rb-flex" style={{ flex: 1, minHeight: 22 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "0 26px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={colHead}>Education</div>
          {d.education.map((e, i) => (
            <div key={i} className="rb-keep">
              <div style={itemTitle}>{e.degree}</div>
              <div style={itemSub}>{e.institution}{e.year && <><br />{e.year}</>}</div>
            </div>
          ))}
          {d.languages.length > 0 && (
            <div className="rb-keep">
              <div style={itemTitle}>Languages</div>
              <div style={itemSub}>{d.languages.map((l, i) => <span key={i}>{l}{i < d.languages.length - 1 && <br />}</span>)}</div>
            </div>
          )}
          {d.certifications.length > 0 && (
            <div className="rb-keep">
              <div style={itemTitle}>Certifications</div>
              <div style={itemSub}>{d.certifications.map((c, i) => <span key={i}>{c}{i < d.certifications.length - 1 && <br />}</span>)}</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={colHead}>Experience</div>
          {d.experience.map((r, i) => (
            <div key={i} className="rb-keep">
              <div style={itemTitle}>{r.title}</div>
              {r.company && <div style={itemSub}>{r.company}</div>}
              {r.years && <div style={{ fontSize: 9, color: FAINT, marginTop: 2, letterSpacing: 0.4 }}>{r.years}</div>}
              {r.bullets.length > 0 && (
                <ul style={{ margin: "5px 0 0", paddingLeft: 12 }}>
                  {r.bullets.map((b, j) => <li key={j} style={{ fontSize: 8.8, lineHeight: 1.55, color: "#4A4740", marginBottom: 2 }}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={colHead}>{d.focused ? "Core skills" : "Skills & tools"}</div>
          {d.coreSkills.map((sk) => (
            <div key={sk} className="rb-keep" style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: INK, position: "relative", top: -1 }} />
              <div style={itemTitle}>{sk}</div>
            </div>
          ))}
          {d.extraSkills.length > 0 && (
            <div className="rb-keep">
              <div style={{ ...itemTitle, color: MUT }}>Also</div>
              <div style={itemSub}>{d.extraSkills.join(" · ")}</div>
            </div>
          )}
        </div>
      </div>

      {d.projects.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={colHead}>Selected work</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "10px 26px", marginTop: 12 }}>
            {d.projects.slice(0, 6).map((p) => (
              <a key={p.url} href={p.url} className="rb-keep" style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
                <div style={itemTitle}>{p.title}</div>
                <div style={{ ...itemSub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.short}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {d.quotes[0] && (
        <div className="rb-keep" style={{ marginTop: 22, maxWidth: 560 }}>
          <p style={{ margin: 0, fontSize: 9.5, lineHeight: 1.7, color: "#4A4740", fontStyle: "italic" }}>&ldquo;{d.quotes[0].text}&rdquo;</p>
          {d.quotes[0].by && <div style={{ fontSize: 8.5, letterSpacing: 2, textTransform: "uppercase", color: MUT, marginTop: 6 }}>{d.quotes[0].by}</div>}
        </div>
      )}

      <div style={{ marginTop: 22, paddingTop: 12, borderTop: `1px solid ${RULE}`, display: "flex", gap: 18, alignItems: "center" }}>
        {d.contacts.filter((c) => c.k !== "Based").map((c) => (
          <div key={c.k} style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: MUT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.v}</div>
        ))}
        {located && <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: MUT, flex: "none" }}>{located}</div>}
        <div style={{ flex: 1 }} />
        {d.qr && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.qr} alt="" style={{ width: 34, height: 34, flex: "none" }} />}
      </div>
    </div>
  );
}
