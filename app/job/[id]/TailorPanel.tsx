"use client";

/**
 * The tailor-resume slide-in panel — opened from TailorButton.tsx (and
 * MatchCard.tsx's CTA, via the shared `topezia:tailor-open` event, mirroring
 * ApplyBox.tsx's `topezia:apply-open` pattern) without leaving the job page.
 *
 * Section-nav rail on the left (All changes / Summary / Skills / Experience,
 * each with a real count) plus a "What changed" stats card — every number
 * there is derived from the actual diff between the person's main resume and
 * the AI-tailored draft, nothing invented. The diff itself is still the real
 * safety net for the tailor route's grounding-only defense (see
 * app/api/resume/tailor/route.ts's header comment): every change is visible,
 * and now individually reversible — a summary choice (Use this / Keep mine)
 * and a per-bullet Skip toggle — before the curated result is saved.
 *
 * "Save version" persists the CURATED content (post Use-this/Keep-mine and
 * post-Skip), not the raw AI draft, via the existing PUT /api/resume?jobId=
 * endpoint — no backend change needed, that route already whole-doc-upserts
 * a TailoredResumeDoc. Download and Preview render that same curated content,
 * so what the person sees is exactly what they'd get.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/app/_components/ui";
import type { ResumeContent } from "@/lib/resume/doc";
import { diffList, diffWords, skillMoves, removedSkills, type DiffItem } from "@/lib/resume/diff";
import { keywordCoverage } from "@/lib/resume/keyword-coverage";
import { PRINT_CSS, pageRule, usePrintMarking, useScaledSheet } from "@/lib/resume/print-sheet";
import { BLEEDS, TEMPLATES, ResumeSheet, sheetData, type TemplateId } from "../../resume/templates";

const INDIGO = "#4f46e5";
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
// The panel used to inherit the job page's Sora font by nesting inside
// <main style={{fontFamily:...}}>. Now that it's portaled to document.body
// (see the createPortal call below), it's no longer a descendant of that
// element, so it needs its own explicit font-family instead of falling back
// to the browser default.
const FONT = "var(--font-sora), var(--font-jakarta), sans-serif";
const RED_BG = "#FEF2F2", RED_FG = "#991B1B", RED_LINE = "#FECACA";
const GREEN_BG = "#F0FDF4", GREEN_FG = "#166534", GREEN_LINE = "#BBF7D0";

type SectionId = "all" | "summary" | "skills" | "exp";

export default function TailorPanel({
  main,
  tailored,
  job,
  jobSkills,
  applyHref,
  applyLabel,
  isNative,
  photo,
  publicUrl,
  qr,
  regenerating,
  onRegenerate,
  onSaved,
  onClose,
}: {
  main: ResumeContent;
  tailored: ResumeContent;
  job: { id: string; title: string; company: string };
  jobSkills: string[];
  applyHref: string;
  applyLabel: string;
  isNative: boolean;
  photo: string | null;
  publicUrl: string | null;
  qr: string | null;
  regenerating: boolean;
  onRegenerate: () => void;
  onSaved: (content: ResumeContent) => void;
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

  const [sec, setSec] = useState<SectionId>("all");
  const [openRole, setOpenRole] = useState(0);
  // Curation: which side of the summary to keep, and which tailored bullets
  // to drop. A fresh AI draft (Regenerate, or the panel's first open) resets
  // both — stale choices against a replaced draft would silently apply to
  // the wrong content.
  const [useTailoredSummary, setUseTailoredSummary] = useState(true);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  useEffect(() => {
    setUseTailoredSummary(true);
    setSkipped(new Set());
  }, [tailored]);

  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Case/whitespace-insensitive key: the model sometimes normalizes a
  // skill's capitalization ("brand management" -> "Brand management")
  // without meaning it as a real change. Bullets stay exact-match: a whole
  // sentence differing ONLY in case is vanishingly unlikely, and real
  // rewording there should be flagged.
  const moves = useMemo(() => skillMoves(main.skills, tailored.skills), [main.skills, tailored.skills]);
  const dropped = useMemo(() => removedSkills(main.skills, tailored.skills), [main.skills, tailored.skills]);
  const summary = useMemo(() => diffWords(main.summary, tailored.summary), [main.summary, tailored.summary]);
  const summaryChanged = main.summary.trim() !== tailored.summary.trim();
  const roles = useMemo(
    () => main.experience.map((role, i) => ({
      role,
      bullets: diffList(role.bullets, tailored.experience[i]?.bullets ?? role.bullets, (b) => b),
    })),
    [main.experience, tailored.experience]
  );
  const coverage = useMemo(() => keywordCoverage(jobSkills, tailored), [jobSkills, tailored]);

  const bulletsAdded = roles.reduce((n, r) => n + r.bullets.new.filter((b) => b.changed).length, 0);
  const wordsChanged = summary.new.filter((w) => w.changed && w.value.trim().length > 0).length;
  const skillsChangedCount = moves.filter((m) => m.status !== "same").length + dropped.length;
  const summaryChangedCount = summaryChanged ? 1 : 0;
  const allCount = summaryChangedCount + skillsChangedCount + bulletsAdded;

  const NAV: { id: SectionId; label: string; count: number }[] = [
    { id: "all", label: "All changes", count: allCount },
    { id: "summary", label: "Summary", count: summaryChangedCount },
    { id: "skills", label: "Skills", count: skillsChangedCount },
    { id: "exp", label: "Experience", count: bulletsAdded },
  ];
  const showSummary = sec === "all" || sec === "summary";
  const showSkills = sec === "all" || sec === "skills";
  const showExp = sec === "all" || sec === "exp";

  function toggleBullet(roleIdx: number, bulletIdx: number) {
    setSkipped((prev) => {
      const key = `${roleIdx}:${bulletIdx}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // The content that actually gets downloaded, previewed, and saved — the
  // tailored draft with the person's Use-this/Keep-mine and Skip choices
  // applied. The diff view above stays computed against the untouched
  // main/tailored pair: "what changed" describes the AI's proposal, not
  // what the person later decided to keep.
  const curated: ResumeContent = useMemo(() => ({
    ...tailored,
    summary: useTailoredSummary ? tailored.summary : main.summary,
    experience: tailored.experience.map((exp, i) => ({
      ...exp,
      bullets: exp.bullets.filter((_, bi) => !skipped.has(`${i}:${bi}`)),
    })),
  }), [tailored, main.summary, useTailoredSummary, skipped]);

  // Which design the DOWNLOAD/preview uses. Defaults to ATS-safe rather than
  // the person's Resume Builder template: this flow exists to produce a file
  // they upload into a company's application portal, and plain-text ATS
  // formatting is what survives those parsers — the designed template stays
  // one click away for when the resume goes to a human instead.
  const [printTemplate, setPrintTemplate] = useState<TemplateId>("ats");
  const [dlOpen, setDlOpen] = useState(false);
  const ownTemplateName = TEMPLATES.find((t) => t.id === tailored.template)?.name ?? "My design";
  const currentTemplateLabel = printTemplate === "ats" ? "ATS-safe" : ownTemplateName;

  const bleed = BLEEDS[printTemplate];
  usePrintMarking(bleed);
  const sheet = useMemo(() => sheetData(curated, photo, publicUrl, qr), [curated, photo, publicUrl, qr]);
  const previewScale = useScaledSheet(previewOpen);

  async function saveVersion() {
    setSaving(true);
    try {
      const res = await fetch("/api/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, content: curated }),
      });
      if (res.ok) {
        onSaved(curated);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  // Portaled to document.body: TailorButton (this panel's mount point) sits
  // inside the rail's `position: sticky` card (app/job/[id]/page.tsx), which
  // creates its own stacking context ranked below the site header's z-index
  // — no z-index on this panel, however high, can escape that trap while it
  // stays a descendant. Rendering at body level sidesteps it entirely.
  return createPortal(
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
      <style>{`
        @media print { .rb-tailor-chrome { display: none !important; } }
        .tp-modal { display: grid; grid-template-columns: 224px minmax(0,1fr); min-height: 0; flex: 1; }
        .tp-secrail { border-right: 1px solid ${LINE}; background: #F8FAFC; padding: 16px 12px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
        @media (max-width: 900px) {
          .tp-modal { grid-template-columns: minmax(0,1fr); grid-template-rows: auto minmax(0,1fr); }
          .tp-secrail { border-right: none; border-bottom: 1px solid ${LINE}; flex-direction: row; align-items: center; gap: 8px; overflow-x: auto; overflow-y: visible; }
          .tp-secaside { display: none; }
        }
      `}</style>
      <div className="rb-tailor-chrome" style={{ ...S.backdrop, opacity: visible ? 1 : 0 }} onClick={close} />
      <div className="rb-tailor-chrome" style={{ ...S.panel, transform: visible ? "translateX(0)" : "translateX(100%)" }} role="dialog" aria-modal="true" aria-label="Tailored resume">
        <div style={S.head}>
          <div style={{ minWidth: 0 }}>
            <h2 style={S.title}>Tailored for {job.company}</h2>
            <div style={S.sub}>{job.title}</div>
          </div>
          <button type="button" aria-label="Close" style={S.closeBtn} onClick={close}><span style={{ fontSize: 20, lineHeight: 1 }}>×</span></button>
        </div>

        <div className="tp-modal">
          <div className="tp-secrail">
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              {NAV.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSec(n.id)}
                  style={sec === n.id ? S.navBtnOn : S.navBtnOff}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>{n.label}</span>
                  <span style={sec === n.id ? S.navBadgeOn : S.navBadgeOff}>{n.count}</span>
                </button>
              ))}
            </div>
            <div className="tp-secaside" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={S.statsCard}>
                <div style={S.statsTitle}>What changed</div>
                <Stat k="Bullets added" v={bulletsAdded} color={GREEN_FG} />
                <Stat k="Words changed" v={wordsChanged} color={INK} />
                <Stat k="Skills reordered" v={skillsChangedCount} color={INK} />
                <Stat k="Keyword coverage" v={`${coverage.covered} / ${coverage.total}`} color={INK} />
              </div>
              <div style={S.honestCard}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>Keep it honest</div>
                <div style={{ fontSize: 10.5, lineHeight: 1.55, color: "#94A3C0" }}>Every bullet is rewritten from your own history — nothing new was invented. Review before you send.</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={S.legend}>
                <span style={S.legendItem}><span style={{ ...S.dot, background: RED_LINE }} />removed</span>
                <span style={S.legendItem}><span style={{ ...S.dot, background: GREEN_LINE }} />new / reworded</span>
              </div>
            </div>
          </div>

          <div style={S.body}>
            {showSummary && (
              <Section title="Summary" tag={summaryChanged ? "rewritten" : "unchanged"}>
                {summaryChanged && (
                  <div style={S.chooseRow}>
                    <button type="button" onClick={() => setUseTailoredSummary(true)} style={useTailoredSummary ? S.chooseOn : S.chooseOff}>Use this</button>
                    <button type="button" onClick={() => setUseTailoredSummary(false)} style={!useTailoredSummary ? S.chooseOn : S.chooseOff}>Keep mine</button>
                  </div>
                )}
                <TwoCol
                  left={<Prose items={summary.old} bg={RED_BG} fg={RED_FG} strike />}
                  right={<Prose items={summary.new} bg={GREEN_BG} fg={GREEN_FG} />}
                />
              </Section>
            )}

            {showSkills && (
              <Section title="Skills" tag={skillsChangedCount > 0 ? `${skillsChangedCount} changed` : "unchanged"}>
                <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 12 }}>
                  Same skills, reordered so the ones this posting names read first.
                  {dropped.length === 0 ? " Nothing was removed." : ""}
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {moves.map((m, i) => (
                    <span key={i} style={m.status === "same" ? S.chipPlain : { ...S.chip, background: m.status === "promoted" ? "#F0FDF4" : GREEN_BG, color: m.status === "promoted" ? "#15803D" : GREEN_FG, border: `1px solid ${m.status === "promoted" ? "#BBF7D0" : GREEN_LINE}` }}>
                      {m.name}
                      {m.status !== "same" && <span style={S.chipTag}>{m.status === "promoted" ? "MOVED UP" : "NEW"}</span>}
                    </span>
                  ))}
                </div>
                {dropped.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: RED_FG, marginBottom: 6 }}>Not carried over</div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {dropped.map((s) => <span key={s} style={{ ...S.chip, background: RED_BG, color: RED_FG, border: `1px solid ${RED_LINE}`, textDecoration: "line-through" }}>{s}</span>)}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {showExp && (
              <Section title="Experience" tag={`${bulletsAdded} bullets changed`}>
                {roles.map(({ role, bullets }, i) => {
                  const wasEmpty = role.bullets.length === 0;
                  const n = bullets.new.filter((b) => b.changed).length;
                  const open = openRole === i;
                  return (
                    <div key={i} style={S.roleCard}>
                      <button type="button" onClick={() => setOpenRole(open ? -1 : i)} style={S.roleHead}>
                        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{role.title || "Role"}</div>
                          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{role.company}{role.years ? ` · ${role.years}` : ""}</div>
                        </div>
                        {n > 0 && <span style={S.roleBadge}>{n} bullet{n === 1 ? "" : "s"} added</span>}
                        {wasEmpty && <span style={{ fontSize: 10.5, color: MUTED, fontWeight: 600, flex: "none" }}>was empty</span>}
                        <span style={{ color: MUTED, transform: open ? "rotate(180deg)" : "none", display: "grid", placeItems: "center", flex: "none" }}><Icon name="chev" size={15} /></span>
                      </button>
                      {open && (
                        <div style={{ padding: "4px 16px 14px" }}>
                          {bullets.new.map((b, bi) => {
                            const key = `${i}:${bi}`;
                            const skippedHere = skipped.has(key);
                            return (
                              <div key={bi} style={{ ...S.bulletRow, opacity: skippedHere ? 0.5 : 1 }}>
                                <span style={{ ...S.bulletMark, background: b.changed ? "#DCFCE7" : "#F1F5F9", color: b.changed ? "#15803D" : MUTED }}>
                                  <Icon name="check" size={11} />
                                </span>
                                <p style={{ margin: 0, flex: 1, fontSize: 12.5, lineHeight: 1.6, color: skippedHere ? MUTED : b.changed ? GREEN_FG : INK, textDecoration: skippedHere ? "line-through" : "none" }}>{b.value}</p>
                                <button type="button" onClick={() => toggleBullet(i, bi)} style={S.skipBtn}>{skippedHere ? "Include" : "Skip"}</button>
                              </div>
                            );
                          })}
                          {bullets.new.length === 0 && <p style={S.empty}>No bullets for this role.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Section>
            )}
          </div>
        </div>

        <div style={S.foot}>
          <button type="button" style={S.ghostBtn} onClick={onRegenerate} disabled={regenerating}>
            <Icon name="spark" size={14} />{regenerating ? "Regenerating…" : "Regenerate"}
          </button>
          <button type="button" style={S.ghostBtn} onClick={() => setPreviewOpen(true)}>
            <Icon name="eye" size={14} />Preview
          </button>
          <button type="button" style={S.ghostBtn} onClick={saveVersion} disabled={saving}>
            <Icon name="check" size={14} />{saving ? "Saving…" : justSaved ? "Saved" : "Save version"}
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ position: "relative", display: "flex" }}>
            <button type="button" style={S.downloadBtn} onClick={() => window.print()}>
              <Icon name="doc" size={15} />Download as {currentTemplateLabel}
            </button>
            <button type="button" aria-label="Choose design" onClick={() => setDlOpen((o) => !o)} style={S.caretBtn}>
              <span style={{ display: "inline-flex", transform: dlOpen ? "rotate(180deg)" : "none" }}><Icon name="chev" size={14} /></span>
            </button>
            {dlOpen && (
              <div style={S.dlMenu}>
                <button type="button" onClick={() => { setPrintTemplate("ats"); setDlOpen(false); }} style={printTemplate === "ats" ? S.dlOptOn : S.dlOptOff}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>ATS-safe</div>
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Plain text — for job-site uploads</div>
                </button>
                {tailored.template !== "ats" && (
                  <button type="button" onClick={() => { setPrintTemplate(tailored.template); setDlOpen(false); }} style={printTemplate === tailored.template ? S.dlOptOn : S.dlOptOff}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ownTemplateName}</div>
                    <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Your Resume Builder design</div>
                  </button>
                )}
              </div>
            )}
          </div>
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

      {previewOpen && (
        <div className="rb-tailor-chrome" style={S.previewBackdrop} onClick={() => setPreviewOpen(false)}>
          <div style={S.previewModal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Preview · {currentTemplateLabel}</div>
              <button type="button" aria-label="Close preview" style={S.closeBtn} onClick={() => setPreviewOpen(false)}><span style={{ fontSize: 16, lineHeight: 1 }}>×</span></button>
            </div>
            <div ref={previewScale.previewBox} style={{ width: "100%", overflow: "auto", padding: 20, background: "#F1F5F9" }}>
              <div style={{ width: previewScale.scale ? 794 * previewScale.scale : "100%", height: previewScale.scale ? previewScale.sheetH * previewScale.scale : undefined, margin: "0 auto" }}>
                <div
                  style={{
                    width: 794,
                    transform: previewScale.scale ? `scale(${previewScale.scale})` : undefined,
                    transformOrigin: "top left",
                    boxShadow: "0 18px 44px rgba(15,23,42,.15)",
                    border: `1px solid ${LINE}`,
                  }}
                >
                  <div ref={previewScale.sheetRef}>
                    <ResumeSheet id={printTemplate} d={sheet} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Off-screen print mount — see lib/resume/print-sheet.ts's nesting contract. */}
      <div id="resume-print" style={{ position: "fixed", left: -99999, top: 0 }}>
        <div style={{ width: 794 }}>
          <ResumeSheet id={printTemplate} d={sheet} />
        </div>
      </div>
    </>,
    document.body
  );
}

function Section({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div style={S.section}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h3 style={S.sectionTitle}>{title}</h3>
        <span style={{ height: 1, flex: 1, background: LINE }} />
        {tag && <span style={{ fontSize: 11, fontWeight: 700, color: "#059669" }}>{tag}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ k, v, color }: { k: string; v: number | string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, color: MUTED }}>
      <span>{k}</span><b style={{ color }}>{v}</b>
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

const S: Record<string, CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 300, transition: "opacity .2s ease" },
  panel: {
    position: "fixed", top: 0, right: 0, bottom: 0, width: "min(1080px, 100vw)",
    background: "#fff", zIndex: 301, display: "flex", flexDirection: "column",
    boxShadow: "-24px 0 60px rgba(15,23,42,.25)", transition: "transform .22s ease",
    fontFamily: FONT,
  },
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 22px", borderBottom: `1px solid ${LINE}`, flex: "none" },
  title: { margin: 0, fontSize: 17, fontWeight: 800, color: INK },
  sub: { fontSize: 12.5, color: MUTED, marginTop: 3 },
  closeBtn: { border: `1px solid ${LINE}`, background: "#fff", color: "#334155", width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", cursor: "pointer", flex: "none" },
  body: { overflowY: "auto", padding: "20px 24px 26px", minWidth: 0 },
  navBtnOn: { display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 9, border: "none", background: "#fff", color: INK, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  navBtnOff: { display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 9, border: "none", background: "transparent", color: "#475569", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  navBadgeOn: { background: "#EEF2FF", color: "#4F46E5", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 7px", flex: "none" },
  navBadgeOff: { background: "#E2E8F0", color: "#64748B", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 7px", flex: "none" },
  statsCard: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  statsTitle: { fontSize: 11.5, fontWeight: 700, marginBottom: 2, color: INK },
  honestCard: { background: INK, borderRadius: 12, padding: 14, color: "#fff" },
  legend: { display: "flex", flexDirection: "column", gap: 6, padding: "0 8px", fontSize: 11, color: MUTED },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 2, display: "inline-block" },
  section: { marginBottom: 26 },
  sectionTitle: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, margin: 0, whiteSpace: "nowrap" },
  chooseRow: { display: "flex", gap: 8, marginBottom: 10 },
  chooseOn: { border: `1.5px solid ${INDIGO}`, background: "#EEF2FF", color: INDIGO, borderRadius: 999, padding: "5px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  chooseOff: { border: `1px solid ${LINE}`, background: "#fff", color: "#334155", borderRadius: 999, padding: "5px 13px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  colLabel: { fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 },
  prose: { margin: 0, fontSize: 13, lineHeight: 1.7, color: INK },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 8 },
  chipPlain: { display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 8, background: "#F8FAFC", color: "#334155", border: `1px solid ${LINE}` },
  chipTag: { fontSize: 9, fontWeight: 700, letterSpacing: 0.4, opacity: 0.8 },
  empty: { fontSize: 12.5, color: MUTED, margin: 0 },
  roleCard: { border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", marginBottom: 10 },
  roleHead: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", cursor: "pointer", background: "#F8FAFC", border: "none", fontFamily: "inherit", textAlign: "left" },
  roleBadge: { flex: "none", background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px" },
  bulletRow: { display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid #F1F5F9" },
  bulletMark: { width: 18, height: 18, flex: "none", marginTop: 1, borderRadius: 6, display: "grid", placeItems: "center" },
  skipBtn: { flex: "none", fontSize: 10.5, fontWeight: 600, color: MUTED, border: `1px solid ${LINE}`, background: "#fff", borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit" },
  foot: { display: "flex", alignItems: "center", gap: 8, padding: "14px 22px", borderTop: `1px solid ${LINE}`, flex: "none", flexWrap: "wrap" },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${LINE}`, background: "#fff", color: "#334155", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  downloadBtn: { display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: "#F1F5F9", color: INK, borderRadius: "10px 0 0 10px", padding: "10px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  caretBtn: { border: "none", borderLeft: `1px solid #E2E8F0`, background: "#F1F5F9", color: MUTED, borderRadius: "0 10px 10px 0", padding: "10px 10px", cursor: "pointer", display: "grid", placeItems: "center" },
  dlMenu: { position: "absolute", bottom: "calc(100% + 8px)", right: 0, width: 230, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: "0 14px 40px rgba(15,23,42,.18)", padding: 6, zIndex: 5 },
  dlOptOn: { display: "block", width: "100%", textAlign: "left", border: "none", background: "#EEF2FF", borderRadius: 9, padding: "9px 10px", cursor: "pointer", fontFamily: "inherit", color: "#4F46E5" },
  dlOptOff: { display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", borderRadius: 9, padding: "9px 10px", cursor: "pointer", fontFamily: "inherit", color: INK },
  applyBtn: { display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: INDIGO, color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "none", whiteSpace: "nowrap" },
  previewBackdrop: { position: "fixed", inset: 0, zIndex: 320, background: "rgba(15,23,42,.6)", display: "grid", placeItems: "center", padding: 20 },
  previewModal: { width: "min(880px, 96vw)", maxHeight: "92vh", background: "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(15,23,42,.4)", fontFamily: FONT },
};
