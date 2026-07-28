"use client";

/**
 * The tailor-resume slide-in panel — opened from TailorButton.tsx without
 * leaving the job page. Shows a red/green diff between the person's main
 * resume and the version AI-tailored for this specific posting, then lets
 * them download it or apply right there.
 *
 * The diff IS the safety net for the tailor route's grounding-only defense
 * (see app/api/resume/tailor/route.ts's header comment) — every change is
 * visible before the person downloads or applies anything.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "@/app/_components/ui";
import type { ResumeContent } from "@/lib/resume/doc";
import { diffList, diffWords, type DiffItem } from "@/lib/resume/diff";
import { PRINT_CSS, pageRule, usePrintMarking } from "@/lib/resume/print-sheet";
import { BLEEDS, ResumeSheet, sheetData } from "../../resume/templates";

const INDIGO = "#4f46e5";
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const RED_BG = "#FEF2F2", RED_FG = "#991B1B", RED_LINE = "#FECACA";
const GREEN_BG = "#F0FDF4", GREEN_FG = "#166534", GREEN_LINE = "#BBF7D0";

export default function TailorPanel({
  main,
  tailored,
  job,
  applyHref,
  applyLabel,
  isNative,
  photo,
  publicUrl,
  qr,
  regenerating,
  onRegenerate,
  onClose,
}: {
  main: ResumeContent;
  tailored: ResumeContent;
  job: { title: string; company: string };
  applyHref: string;
  applyLabel: string;
  isNative: boolean;
  photo: string | null;
  publicUrl: string | null;
  qr: string | null;
  regenerating: boolean;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  // Two-phase mount so the CSS transition actually plays on enter (start
  // off-screen, flip to in-place one frame later) and on exit (flip back,
  // then tell the parent to unmount once the transition would have finished).
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  function close() {
    setVisible(false);
    setTimeout(onClose, 220);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Case/whitespace-insensitive key: the model sometimes normalizes a
  // skill's capitalization ("brand management" -> "Brand management")
  // without meaning it as a real change — that shouldn't read as removed
  // one side and added the other. Bullets (below) stay exact-match: a whole
  // sentence differing ONLY in case is vanishingly unlikely, and real
  // rewording there should be flagged.
  const skills = diffList(main.skills, tailored.skills, (s) => s.trim().toLowerCase());
  const summary = diffWords(main.summary, tailored.summary);
  const roles = main.experience.map((role, i) => ({
    role,
    bullets: diffList(role.bullets, tailored.experience[i]?.bullets ?? role.bullets, (b) => b),
  }));

  // Print the TAILORED content — off-screen, exact two-level nesting under
  // #resume-print (see lib/resume/print-sheet.ts's contract). Not visible on
  // screen: this panel shows a textual diff, not a rendered sheet preview.
  const bleed = BLEEDS[tailored.template];
  usePrintMarking(bleed);
  const sheet = sheetData(tailored, photo, publicUrl, qr);

  return (
    <>
      {/* The shared print stylesheet is injected HERE, not assumed: the job
          page has no print CSS of its own (Resume Builder injects these tags
          itself), and without them window.print() just prints the job page
          while the off-screen sheet stays off-screen. */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: pageRule(bleed) }} />
      {/* Belt-and-suspenders on top of the shared print CSS's ancestor-chain
          hiding: this panel sits much deeper in the DOM (job page -> rail ->
          card -> button -> panel) than the Resume Builder page that mechanism
          was built for, and the panel's own visible diff content must never
          be what ends up on paper. An explicit class + rule doesn't depend on
          every intermediate level of THIS page's nesting being marked correctly. */}
      <style>{"@media print { .rb-tailor-chrome { display: none !important; } }"}</style>
      <div className="rb-tailor-chrome" style={{ ...S.backdrop, opacity: visible ? 1 : 0 }} onClick={close} />
      <div className="rb-tailor-chrome" style={{ ...S.panel, transform: visible ? "translateX(0)" : "translateX(100%)" }} role="dialog" aria-modal="true" aria-label="Tailored resume">
        <div style={S.head}>
          <div style={{ minWidth: 0 }}>
            <h2 style={S.title}>Tailored for {job.company}</h2>
            <div style={S.sub}>{job.title}</div>
          </div>
          <button type="button" aria-label="Close" style={S.closeBtn} onClick={close}><span style={{ fontSize: 20, lineHeight: 1 }}>×</span></button>
        </div>

        <div style={S.body}>
          <div style={S.legend}>
            <span style={S.legendItem}><span style={{ ...S.dot, background: RED_LINE }} />removed</span>
            <span style={S.legendItem}><span style={{ ...S.dot, background: GREEN_LINE }} />new / reworded</span>
          </div>

          <Section title="Summary">
            <TwoCol
              left={<Prose items={summary.old} bg={RED_BG} fg={RED_FG} strike />}
              right={<Prose items={summary.new} bg={GREEN_BG} fg={GREEN_FG} />}
            />
          </Section>

          <Section title="Skills">
            <TwoCol
              left={<Chips items={skills.old} bg={RED_BG} fg={RED_FG} line={RED_LINE} strike />}
              right={<Chips items={skills.new} bg={GREEN_BG} fg={GREEN_FG} line={GREEN_LINE} />}
            />
          </Section>

          <Section title="Experience">
            {roles.map(({ role, bullets }, i) => (
              <div key={i} style={{ marginBottom: i < roles.length - 1 ? 20 : 0 }}>
                <div style={S.roleTitle}>{role.title || "Role"}{role.company ? ` — ${role.company}` : ""}</div>
                <TwoCol
                  left={<BulletList items={bullets.old} bg={RED_BG} fg={RED_FG} strike />}
                  right={<BulletList items={bullets.new} bg={GREEN_BG} fg={GREEN_FG} />}
                />
              </div>
            ))}
          </Section>
        </div>

        <div style={S.foot}>
          <button type="button" style={S.ghostBtn} onClick={onRegenerate} disabled={regenerating}>
            <Icon name="spark" size={14} />{regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" style={S.downloadBtn} onClick={() => window.print()}>
            <Icon name="doc" size={15} />Download tailored resume
          </button>
          {isNative ? (
            <button
              type="button"
              style={S.applyBtn}
              onClick={() => {
                window.dispatchEvent(new Event("topezia:apply-open"));
                document.getElementById("job-apply-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
                close();
              }}
            >
              Apply on Topezia →
            </button>
          ) : (
            <a href={applyHref} target="_blank" rel="noreferrer" style={S.applyBtn} onClick={close}>{applyLabel}</a>
          )}
        </div>
      </div>

      {/* Off-screen print mount — see lib/resume/print-sheet.ts's nesting contract. */}
      <div id="resume-print" style={{ position: "fixed", left: -99999, top: 0 }}>
        <div style={{ width: 794 }}>
          <ResumeSheet id={tailored.template} d={sheet} />
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={S.twoCol}>
      <div>
        <div style={S.colLabel}>Your resume</div>
        {left}
      </div>
      <div>
        <div style={S.colLabel}>Tailored version</div>
        {right}
      </div>
    </div>
  );
}

function Prose({ items, bg, fg, strike }: { items: DiffItem<string>[]; bg: string; fg: string; strike?: boolean }) {
  if (!items.length) return <p style={S.empty}>—</p>;
  return (
    <p style={S.prose}>
      {items.map((it, i) =>
        it.changed
          ? <span key={i} style={{ background: bg, color: fg, textDecoration: strike ? "line-through" : "none", borderRadius: 3 }}>{it.value}</span>
          : <span key={i}>{it.value}</span>
      )}
    </p>
  );
}

function Chips({ items, bg, fg, line, strike }: { items: DiffItem<string>[]; bg: string; fg: string; line: string; strike?: boolean }) {
  if (!items.length) return <p style={S.empty}>—</p>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((it, i) => (
        <span key={i} style={it.changed ? { ...S.chip, background: bg, color: fg, border: `1px solid ${line}`, textDecoration: strike ? "line-through" : "none" } : S.chipPlain}>
          {it.value}
        </span>
      ))}
    </div>
  );
}

function BulletList({ items, bg, fg, strike }: { items: DiffItem<string>[]; bg: string; fg: string; strike?: boolean }) {
  if (!items.length) return <p style={S.empty}>No bullets yet.</p>;
  return (
    <ul style={S.bulletList}>
      {items.map((it, i) => (
        <li key={i} style={it.changed ? { background: bg, color: fg, textDecoration: strike ? "line-through" : "none", borderRadius: 6, padding: "4px 8px", margin: "0 -8px" } : { padding: "4px 0" }}>
          {it.value}
        </li>
      ))}
    </ul>
  );
}

const S: Record<string, CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 300, transition: "opacity .2s ease" },
  panel: {
    position: "fixed", top: 0, right: 0, bottom: 0, width: "min(1040px, 100vw)",
    background: "#fff", zIndex: 301, display: "flex", flexDirection: "column",
    boxShadow: "-24px 0 60px rgba(15,23,42,.25)", transition: "transform .22s ease",
  },
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "20px 24px", borderBottom: `1px solid ${LINE}`, flex: "none" },
  title: { margin: 0, fontSize: 18, fontWeight: 800, color: INK },
  sub: { fontSize: 13, color: MUTED, marginTop: 3 },
  closeBtn: { border: `1px solid ${LINE}`, background: "#fff", color: "#334155", width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", cursor: "pointer", flex: "none" },
  body: { flex: 1, overflowY: "auto", padding: "18px 24px" },
  legend: { display: "flex", gap: 16, marginBottom: 18, fontSize: 12, color: MUTED },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 3, display: "inline-block" },
  section: { marginBottom: 26 },
  sectionTitle: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, margin: "0 0 10px" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  colLabel: { fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  prose: { margin: 0, fontSize: 13, lineHeight: 1.7, color: INK },
  chip: { fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999 },
  chipPlain: { fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: "#F1F5F9", color: "#334155" },
  bulletList: { margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: INK },
  empty: { fontSize: 12.5, color: MUTED, margin: 0 },
  roleTitle: { fontSize: 13, fontWeight: 700, color: INK, marginBottom: 8 },
  foot: { display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderTop: `1px solid ${LINE}`, flex: "none", flexWrap: "wrap" },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${LINE}`, background: "#fff", color: "#334155", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  downloadBtn: { display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: "#F1F5F9", color: INK, borderRadius: 10, padding: "11px 18px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  applyBtn: { display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: INDIGO, color: "#fff", borderRadius: 10, padding: "11px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" },
};
