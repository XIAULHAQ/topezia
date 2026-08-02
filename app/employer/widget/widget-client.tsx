"use client";

/**
 * Set up and monitor the site chat widget: domain → scan → copy the snippet.
 * The AI reply budget is shown plainly — when it runs out the widget keeps
 * taking messages, so the number is information, not a threat.
 */
import { useEffect, useState } from "react";
import { EmployerSection, EmployerGate, ES } from "../_components/EmployerSection";

type Site = {
  id: string;
  domain: string;
  siteToken: string;
  enabled: boolean;
  branded: boolean;
  digestEnabled: boolean;
  accentColor: string | null;
  replyHours: { tz: string; days: number[]; start: string; end: string } | null;
  pagesCrawled: number;
  crawledAt: string | null;
  crawlError: string | null;
  storeKind: string | null;
  greeting: string | null;
  proactive: boolean;
  proactiveDelay: number;
  askContact: boolean;
  usage: { used: number; limit: number; pooled: boolean };
  stats: SiteStats;
};

type Limits = { id: string; sites: number; pages: number; aiRepliesPerMonth: number; facts: number };

type SiteStats = { leads: number; won: number; revenue: number };
type Fact = { id: string; question: string; answer: string; updatedAt: string };
type Gap = { question: string; count: number };

const DAYS = [
  { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" },
  { n: 5, label: "Fri" }, { n: 6, label: "Sat" }, { n: 7, label: "Sun" },
];
const SWATCHES = ["#8B5CF6", "#2563EB", "#0E7490", "#059669", "#B45309", "#DC2626", "#DB2777", "#0F172A"];

export default function WidgetClient() {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [sites, setSites] = useState<Site[] | undefined>(undefined); // undefined = loading
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [canAddSite, setCanAddSite] = useState(false);
  const [addingSite, setAddingSite] = useState(false);
  const [totals, setTotals] = useState<SiteStats | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Teach the bot
  const [facts, setFacts] = useState<Fact[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [teaching, setTeaching] = useState<{ id?: string; question: string; answer: string } | null>(null);
  const [teachBusy, setTeachBusy] = useState(false);
  const [teachError, setTeachError] = useState<string | null>(null);

  const [hoursDraft, setHoursDraft] = useState<NonNullable<Site["replyHours"]> | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [greetDraft, setGreetDraft] = useState<string | null>(null);

  useEffect(() => { loadSites(true); }, []);

  async function loadSites(first = false) {
    try {
      const res = await fetch("/api/company/widget", { cache: "no-store" });
      if (res.status === 401) { setGate("auth"); return; }
      if (res.status === 409) { setGate("company"); return; }
      if (!res.ok) throw new Error();
      const d = (await res.json()) as {
        sites: Site[]; stats: SiteStats; plan: string; limits: Limits; pooled: boolean; canAddSite: boolean;
      };
      setSites(d.sites);
      setTotals(d.stats ?? null);
      setLimits(d.limits ?? null);
      setCanAddSite(d.canAddSite);
      if (first || !selectedId) {
        const firstSite = d.sites[0] ?? null;
        setSelectedId(firstSite?.id ?? null);
        setDomain(firstSite?.domain ?? "");
        setAddingSite(d.sites.length === 0);
      }
    } catch {
      setError("Couldn't load the widget status.");
      setSites([]);
    }
  }

  // Facts, gaps and the teaching cap all belong to the SELECTED site.
  useEffect(() => { if (selectedId) loadFacts(selectedId); }, [selectedId]);

  async function loadFacts(siteId: string) {
    try {
      const res = await fetch(`/api/company/facts?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { facts: Fact[]; unanswered: Gap[]; limits: { perSite: number } };
      setFacts(d.facts ?? []);
      setGaps(d.unanswered ?? []);
    } catch { /* the section just stays empty */ }
  }

  async function saveTeach() {
    if (!teaching || teachBusy || !teaching.question.trim() || !teaching.answer.trim()) return;
    setTeachBusy(true); setTeachError(null);
    try {
      const res = await fetch("/api/company/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...teaching, siteId: selectedId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setTeachError(data.error ?? "Couldn't save that."); return; }
      setTeaching(null);
      if (selectedId) await loadFacts(selectedId);
    } catch {
      setTeachError("Couldn't save that.");
    } finally {
      setTeachBusy(false);
    }
  }

  /** One PATCH for every appearance setting on this page. */
  async function patchSite(patch: Record<string, unknown>, optimistic: Partial<Site>) {
    if (!site) return;
    setSettingsError(null);
    const res = await fetch("/api/company/widget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, siteId: site.id }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { setSettingsError(data.error ?? "Couldn't save that."); return; }
    setSites((cur) => (cur ?? []).map((x) => (x.id === site.id ? { ...x, ...optimistic } : x)));
  }

  /** Scan a new website, or re-scan the selected one. */
  async function scanSite() {
    if (busy || !domain.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, siteId: addingSite ? undefined : selectedId }),
      });
      const data = (await res.json().catch(() => ({}))) as { site?: Site; error?: string };
      if (!res.ok || !data.site) { setError(data.error ?? "Scan failed — try again."); return; }
      setAddingSite(false);
      setSelectedId(data.site.id);
      setDomain(data.site.domain);
      await loadSites();
    } catch {
      setError("Scan failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSite(s: Site) {
    if (!confirm(`Remove ${s.domain}? Its chat stops answering. Messages it already brought you stay in your inbox.`)) return;
    const res = await fetch(`/api/company/widget?siteId=${encodeURIComponent(s.id)}`, { method: "DELETE" });
    if (!res.ok) { setError("Couldn't remove that website."); return; }
    setSelectedId(null);
    await loadSites(true);
  }

  async function forgetFact(id: string) {
    const res = await fetch(`/api/company/facts?id=${encodeURIComponent(id)}&siteId=${encodeURIComponent(selectedId ?? "")}`, { method: "DELETE" });
    if (res.ok) setFacts((cur) => cur.filter((f) => f.id !== id));
  }

  const site = sites?.find((x) => x.id === selectedId) ?? null;

  const toggle = () => site && patchSite({ enabled: !site.enabled }, { enabled: !site.enabled });
  const toggleDigest = () => site && patchSite({ digestEnabled: !site.digestEnabled }, { digestEnabled: !site.digestEnabled });

  const snippet = site
    ? `<script src="https://www.topezia.com/widget.js" data-topezia="${site.siteToken}" async></script>`
    : "";

  if (gate) return <EmployerGate title="Site chat" reason={gate} what="the site chat widget" />;
  if (sites === undefined) {
    return (
      <EmployerSection title="Site chat">
        <div style={ES.card}><p style={ES.empty}>{error ?? "Loading…"}</p></div>
      </EmployerSection>
    );
  }

  return (
    <EmployerSection
      title="Site chat"
      subtitle="An AI assistant for your own website. It answers from your site's pages, and every real lead lands in your Topezia inbox — the bot handles the questions, you handle the people."
    >
      {error && <p style={ES.error}>{error}</p>}

      {/* One website or ten: the switcher only earns its space once there
          is a choice to make, or a plan that allows one. */}
      {(sites.length > 1 || canAddSite) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          {sites.map((s) => {
            const on = s.id === selectedId && !addingSite;
            return (
              <button key={s.id} type="button"
                onClick={() => { setSelectedId(s.id); setDomain(s.domain); setAddingSite(false); setError(null); }}
                style={{
                  border: "1px solid", borderColor: on ? "#C7D2FE" : "#E2E8F0", background: on ? "#EEF2FF" : "#fff",
                  color: on ? "#4F46E5" : "#334155", borderRadius: 999, padding: "8px 15px",
                  fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                {s.domain}
                {!s.enabled && <span style={{ color: "#94A3B8", fontWeight: 600 }}> · off</span>}
              </button>
            );
          })}
          {canAddSite ? (
            <button type="button"
              onClick={() => { setAddingSite(true); setDomain(""); setError(null); }}
              style={{ ...ES.btnGhost, borderStyle: "dashed", padding: "8px 15px", fontSize: 12.5 }}>
              + Add a website
            </button>
          ) : (
            limits && limits.sites > 1 && (
              <span style={{ ...ES.empty }}>{sites.length} of {limits.sites} websites used.</span>
            )
          )}
        </div>
      )}

      {/* Whole-account totals, only when there's more than one site to add up. */}
      {sites.length > 1 && totals && totals.leads > 0 && (
        <div style={{ ...ES.card, marginBottom: 18 }}>
          <label style={ES.label}>Across all your websites</label>
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap", margin: "6px 0 0" }}>
            <span><b style={S2.stat}>{totals.leads}</b><span style={S2.statLabel}>leads from chat</span></span>
            <span><b style={S2.stat}>{totals.won}</b><span style={S2.statLabel}>became work</span></span>
            <span><b style={{ ...S2.stat, color: totals.revenue > 0 ? "#047857" : "#0F172A" }}>${totals.revenue.toLocaleString()}</b><span style={S2.statLabel}>you marked won</span></span>
          </div>
        </div>
      )}

      <div style={{ ...ES.card, marginBottom: 18 }}>
        <label style={ES.label}>{addingSite ? "Add a website" : "Your website"}</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            style={{ ...ES.input, flex: 1, minWidth: 220 }}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yourcompany.com"
          />
          <button type="button" style={ES.btn} onClick={scanSite} disabled={busy || !domain.trim()}>
            {busy ? "Scanning…" : addingSite ? "Add and scan" : "Re-scan site"}
          </button>
          {addingSite && sites.length > 0 && (
            <button type="button" style={ES.btnGhost}
              onClick={() => { setAddingSite(false); setDomain(site?.domain ?? ""); setError(null); }}>
              Cancel
            </button>
          )}
        </div>
        {busy && (
          <p style={{ ...ES.empty, marginTop: 10 }}>
            Reading your site — this takes up to a minute. The bot only ever answers from what it finds here.
          </p>
        )}
        {site && !busy && (
          <p style={{ ...ES.empty, marginTop: 10 }}>
            {site.crawlError
              ? `Last scan: ${site.crawlError}`
              : `Knows ${site.pagesCrawled} page${site.pagesCrawled === 1 ? "" : "s"} of ${site.domain}` +
                (site.crawledAt ? `, scanned ${new Date(site.crawledAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "") +
                `. Re-scan after you change the site${limits ? `. Your plan reads up to ${limits.pages.toLocaleString()} pages` : ""}.`}
          </p>
        )}
      </div>

      {site && !addingSite && (
        <>
          <div style={{ ...ES.card, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={site.enabled ? ES.pillLive : ES.pillDraft}>{site.enabled ? "Widget is on" : "Widget is off"}</span>
              <span style={{ ...ES.empty, flex: 1, minWidth: 180 }}>
                {site.usage.used} of {site.usage.limit} AI replies used this month
                {site.usage.pooled ? " across all your websites" : ""}. After that the chat keeps
                taking messages — it just stops answering automatically.
                {site.branded && " On the free plan the chat shows a small “Add AI chat to your site. Free with Topezia.” line at the bottom."}
              </span>
              <button type="button" style={site.enabled ? ES.btnDanger : ES.btn} onClick={toggle}>
                {site.enabled ? "Turn off" : "Turn on"}
              </button>
              {sites.length > 1 && (
                <button type="button" style={{ ...ES.btnGhost, color: "#B91C1C" }} onClick={() => removeSite(site)}>
                  Remove
                </button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderTop: "1px solid #F1F5F9", paddingTop: 12 }}>
              <span style={{ ...ES.empty, flex: 1, minWidth: 180 }}>
                Weekly digest: what visitors asked, what your site couldn&apos;t answer, and what&apos;s waiting in your
                inbox — one email on Mondays. Quiet weeks send nothing.
              </span>
              <button type="button" style={site.digestEnabled ? ES.btnGhost : ES.btn} onClick={toggleDigest}>
                {site.digestEnabled ? "Turn digest off" : "Turn digest on"}
              </button>
            </div>
          </div>

          {/* What the chat has produced. Leads are counted; won and revenue
              are only ever what the owner marked in Messages — we have no
              payment rail, so nothing here is estimated. */}
          {site.stats.leads > 0 && (
            <div style={{ ...ES.card, marginBottom: 18 }}>
              <label style={ES.label}>What {sites.length > 1 ? site.domain : "the chat"} has brought in</label>
              <div style={{ display: "flex", gap: 26, flexWrap: "wrap", margin: "6px 0 10px" }}>
                <span><b style={S2.stat}>{site.stats.leads}</b><span style={S2.statLabel}>leads from chat</span></span>
                <span><b style={S2.stat}>{site.stats.won}</b><span style={S2.statLabel}>became work</span></span>
                <span><b style={{ ...S2.stat, color: site.stats.revenue > 0 ? "#047857" : "#0F172A" }}>${site.stats.revenue.toLocaleString()}</b><span style={S2.statLabel}>you marked won</span></span>
              </div>
              <p style={{ ...ES.empty, margin: 0 }}>
                {site.stats.won === 0
                  ? "Mark a conversation “won” in Messages when it turns into work — these totals only ever count what you tell them, never a guess."
                  : "Counted from the conversations you marked won in Messages. Only your own numbers appear here."}
              </p>
            </div>
          )}

          {/* Appearance + hours. Both are honesty features as much as
              branding ones: the colour makes it theirs, the hours stop the
              chat implying someone's there at 2am. */}
          <div style={{ ...ES.card, marginBottom: 18 }}>
            <label style={ES.label}>Appearance</label>
            <p style={{ ...ES.empty, margin: "0 0 10px" }}>Your colour on the chat bubble, buttons and replies.</p>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
              {SWATCHES.map((c) => {
                const on = (site.accentColor ?? "#8B5CF6").toLowerCase() === c.toLowerCase();
                return (
                  <button key={c} type="button" aria-label={c} title={c}
                    onClick={() => patchSite({ accentColor: c }, { accentColor: c })}
                    style={{ width: 30, height: 30, borderRadius: 9, background: c, cursor: "pointer",
                             border: on ? "3px solid #0F172A" : "1px solid rgba(15,23,42,.15)" }} />
                );
              })}
              <input type="color" aria-label="Custom colour"
                value={site.accentColor ?? "#8B5CF6"}
                onChange={(e) => patchSite({ accentColor: e.target.value }, { accentColor: e.target.value })}
                style={{ width: 42, height: 30, padding: 0, border: "1px solid #E2E8F0", borderRadius: 9, background: "#fff", cursor: "pointer" }} />
              {site.accentColor && (
                <button type="button" style={{ ...ES.btnGhost, padding: "6px 12px", fontSize: 11.5 }}
                  onClick={() => patchSite({ accentColor: null }, { accentColor: null })}>
                  Reset
                </button>
              )}
            </div>

            <label style={ES.label}>How the chat opens</label>
            <p style={{ ...ES.empty, margin: "0 0 10px" }}>
              Your own opening line, and whether the chat introduces itself to someone who lingers, reads a long
              way down, or moves to leave. It opens itself once per visit — never twice.
            </p>
            <textarea
              style={{ ...ES.input, minHeight: 64, resize: "vertical", marginBottom: 10 }}
              maxLength={300}
              value={greetDraft ?? site.greeting ?? ""}
              placeholder={`Hi — I'm the ${"{your company}"} assistant. Ask me anything, or leave a message and a real person will follow up.`}
              onChange={(e) => setGreetDraft(e.target.value)}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
              <button type="button" style={ES.btn} disabled={greetDraft === null}
                onClick={async () => { await patchSite({ greeting: greetDraft }, { greeting: greetDraft || null }); setGreetDraft(null); }}>
                Save greeting
              </button>
              {(site.greeting || greetDraft) && (
                <button type="button" style={ES.btnGhost}
                  onClick={async () => { await patchSite({ greeting: "" }, { greeting: null }); setGreetDraft(null); }}>
                  Use the automatic one
                </button>
              )}
              <span style={{ ...ES.empty, flex: 1, minWidth: 200 }}>
                Leave it empty and the chat names whatever page they&apos;re on — usually better than a generic hello.
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <button type="button" style={site.proactive ? ES.btnGhost : ES.btn}
                onClick={() => patchSite({ proactive: !site.proactive }, { proactive: !site.proactive })}>
                {site.proactive ? "Don't open by itself" : "Open by itself"}
              </button>
              {site.proactive && (
                <label style={{ ...ES.empty, display: "flex", gap: 8, alignItems: "center" }}>
                  after
                  <input type="number" min={3} max={300} defaultValue={site.proactiveDelay}
                    style={{ ...ES.input, width: 80 }}
                    onBlur={(e) => patchSite({ proactiveDelay: Number(e.target.value) }, { proactiveDelay: Number(e.target.value) })} />
                  seconds, a deep scroll, or a move to leave
                </label>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
              <button type="button" style={site.askContact ? ES.btnGhost : ES.btn}
                onClick={() => patchSite({ askContact: !site.askContact }, { askContact: !site.askContact })}>
                {site.askContact ? "Don't ask for contact details" : "Ask for contact details"}
              </button>
              <span style={{ ...ES.empty, flex: 1, minWidth: 200 }}>
                After the first answer the chat asks for a name, email and phone. Skippable — it keeps answering
                either way — and anyone who fills it in lands in your inbox straight away.
              </span>
            </div>

            <label style={ES.label}>When your team is around</label>
            <p style={{ ...ES.empty, margin: "0 0 10px" }}>
              Outside these hours the chat says plainly that nobody&apos;s there and when you&apos;re back, instead of
              letting someone sit waiting. Leave it off and it says nothing about availability.
            </p>
            {site.replyHours && !hoursDraft ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={ES.pillLive}>
                  {site.replyHours.days.map((d) => DAYS.find((x) => x.n === d)?.label).join(" ")} · {site.replyHours.start}–{site.replyHours.end}
                </span>
                <span style={{ ...ES.empty }}>{site.replyHours.tz}</span>
                <button type="button" style={{ ...ES.btnGhost, padding: "6px 12px", fontSize: 11.5 }} onClick={() => setHoursDraft(site.replyHours)}>Edit</button>
                <button type="button" style={{ ...ES.btnGhost, padding: "6px 12px", fontSize: 11.5 }} onClick={() => patchSite({ replyHours: null }, { replyHours: null })}>Turn off</button>
              </div>
            ) : hoursDraft ? (
              <div style={{ border: "1px solid #E0E7FF", borderRadius: 12, padding: 14, background: "#FAFAFF" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {DAYS.map((d) => {
                    const on = hoursDraft.days.includes(d.n);
                    return (
                      <button key={d.n} type="button"
                        onClick={() => setHoursDraft({ ...hoursDraft, days: on ? hoursDraft.days.filter((x) => x !== d.n) : [...hoursDraft.days, d.n].sort() })}
                        style={{ border: "1px solid", borderColor: on ? "#C7D2FE" : "#E2E8F0", background: on ? "#EEF2FF" : "#fff",
                                 color: on ? "#4F46E5" : "#64748B", borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                  <input type="time" value={hoursDraft.start} onChange={(e) => setHoursDraft({ ...hoursDraft, start: e.target.value })} style={{ ...ES.input, width: 130 }} />
                  <span style={{ color: "#94A3B8" }}>to</span>
                  <input type="time" value={hoursDraft.end} onChange={(e) => setHoursDraft({ ...hoursDraft, end: e.target.value })} style={{ ...ES.input, width: 130 }} />
                  <span style={{ ...ES.empty }}>{hoursDraft.tz}</span>
                </div>
                {settingsError && <p style={ES.error}>{settingsError}</p>}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" style={ES.btn}
                    onClick={async () => { await patchSite({ replyHours: hoursDraft }, { replyHours: hoursDraft }); setHoursDraft(null); }}>
                    Save hours
                  </button>
                  <button type="button" style={ES.btnGhost} onClick={() => { setHoursDraft(null); setSettingsError(null); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" style={ES.btnGhost}
                onClick={() => setHoursDraft({
                  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                  days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00",
                })}>
                + Set your hours
              </button>
            )}
            {settingsError && !hoursDraft && <p style={ES.error}>{settingsError}</p>}
          </div>

          {/* Teach the bot — owner-written answers outrank the crawl, and
              survive re-scans. The gap list is what visitors actually asked
              and didn't get an answer to. */}
          <div style={{ ...ES.card, marginBottom: 18 }}>
            <label style={ES.label}>Teach the bot</label>
            <p style={{ ...ES.empty, margin: "0 0 14px" }}>
              Anything your website doesn&apos;t spell out — pricing rules, what you don&apos;t do, shipping,
              lead times. What you write here wins over your site&apos;s pages, and re-scanning never erases it.
            </p>

            {gaps.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Asked, but your site had no answer
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {gaps.map((g) => (
                    <div key={g.question} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "9px 12px" }}>
                      <span style={{ flex: 1, minWidth: 180, fontSize: 12.8, color: "#334155", lineHeight: 1.5 }}>
                        &ldquo;{g.question}&rdquo;{g.count > 1 && <span style={{ color: "#92400E", fontWeight: 700 }}> · asked {g.count}×</span>}
                      </span>
                      <button type="button" style={{ ...ES.btn, padding: "7px 14px", fontSize: 12 }}
                        onClick={() => { setTeaching({ question: g.question, answer: "" }); setTeachError(null); }}>
                        Answer this
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {teaching ? (
              <div style={{ border: "1px solid #E0E7FF", borderRadius: 12, padding: 14, marginBottom: 14, background: "#FAFAFF" }}>
                <label style={ES.label}>When someone asks…</label>
                <input
                  style={{ ...ES.input, marginBottom: 12 }}
                  value={teaching.question}
                  maxLength={200}
                  placeholder="Do you ship to Canada?"
                  onChange={(e) => setTeaching({ ...teaching, question: e.target.value })}
                />
                <label style={ES.label}>…say this</label>
                <textarea
                  style={{ ...ES.input, minHeight: 92, resize: "vertical", marginBottom: 12 }}
                  value={teaching.answer}
                  maxLength={900}
                  placeholder="Yes — we ship anywhere in Canada and the US. Shipping is quoted at checkout and usually runs $18–$40."
                  onChange={(e) => setTeaching({ ...teaching, answer: e.target.value })}
                />
                {teachError && <p style={ES.error}>{teachError}</p>}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" style={ES.btn} disabled={teachBusy || !teaching.question.trim() || !teaching.answer.trim()} onClick={saveTeach}>
                    {teachBusy ? "Saving…" : "Save answer"}
                  </button>
                  <button type="button" style={ES.btnGhost} onClick={() => { setTeaching(null); setTeachError(null); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" style={{ ...ES.btnGhost, marginBottom: facts.length ? 14 : 0 }}
                onClick={() => { setTeaching({ question: "", answer: "" }); setTeachError(null); }}>
                + Teach an answer
              </button>
            )}

            {facts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  What you&apos;ve taught it ({facts.length})
                </span>
                {facts.map((f) => (
                  <div key={f.id} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: "10px 13px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <b style={{ flex: 1, minWidth: 160, fontSize: 12.8, color: "#0F172A" }}>{f.question}</b>
                      <button type="button" style={{ border: 0, background: "none", color: "#4F46E5", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        onClick={() => { setTeaching({ id: f.id, question: f.question, answer: f.answer }); setTeachError(null); }}>
                        Edit
                      </button>
                      <button type="button" style={{ border: 0, background: "none", color: "#B91C1C", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        onClick={() => forgetFact(f.id)}>
                        Forget
                      </button>
                    </div>
                    <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "#475569", lineHeight: 1.6 }}>{f.answer}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ ...ES.card, marginBottom: 18 }}>
            <label style={ES.label}>WordPress site? Use the plugin</label>
            <p style={{ ...ES.empty, margin: "0 0 12px" }}>
              Install it once, paste your site key, done — no theme editing, and updates come from us.
            </p>
            <ol style={{ margin: "0 0 14px", paddingLeft: 20, color: "#475569", fontSize: 13, lineHeight: 1.8 }}>
              <li>Download the plugin below.</li>
              <li>In WordPress: <b>Plugins → Add New → Upload Plugin</b>, choose the zip, activate.</li>
              <li>In <b>Settings → Topezia Chat</b>, paste your site key: <code style={{ background: "#F1F5F9", borderRadius: 6, padding: "2px 7px", fontSize: 12 }}>{site.siteToken}</code></li>
            </ol>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <a href="/downloads/topezia-chat.zip" style={{ ...ES.btn }} download>
                Download WordPress plugin
              </a>
              <button
                type="button"
                style={ES.btnGhost}
                onClick={() => { navigator.clipboard.writeText(site.siteToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
              >
                {copied ? "Copied ✓" : "Copy site key"}
              </button>
            </div>
          </div>

          <div style={ES.card}>
            <label style={ES.label}>Any other site: add this right before &lt;/body&gt;</label>
            <pre style={{ background: "#0F172A", color: "#E2E8F0", borderRadius: 10, padding: "14px 16px", fontSize: 12, overflowX: "auto", margin: "0 0 12px" }}>
              {snippet}
            </pre>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                style={ES.btn}
                onClick={() => { navigator.clipboard.writeText(snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
              >
                {copied ? "Copied ✓" : "Copy snippet"}
              </button>
              <span style={ES.empty}>
                Works on Wix, Squarespace, Webflow, plain HTML — anywhere you can add a script tag.
              </span>
            </div>
          </div>
        </>
      )}
    </EmployerSection>
  );
}

const S2: Record<string, React.CSSProperties> = {
  stat: { display: "block", fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", color: "#0F172A" },
  statLabel: { display: "block", fontSize: 11.5, color: "#64748B", marginTop: 2 },
};
