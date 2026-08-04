"use client";

/**
 * Site chat settings, built to the Chat Settings design.
 *
 * The page is a set of tabs over ONE selected website: plan, setup, teaching,
 * ecommerce, install, usage. Everything it can change goes through the same
 * endpoints it always did — this is a new arrangement of the same controls,
 * not a new API.
 *
 * TWO DEPARTURES FROM THE MOCKUP, both deliberate:
 *
 *  - The website switcher stays. The design draws a single site; Studio runs
 *    ten, and removing the switcher would strand nine of them.
 *  - "Answer all with AI" is not here. There is no endpoint behind it, and a
 *    button that does nothing is worse than an absent one. The per-question
 *    "Answer this" works, because that one is real.
 *
 * Prices arrive as props from the server page, read from Stripe at render
 * time, so this screen can't advertise a number we don't charge.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EmployerGate } from "../_components/EmployerSection";
import { Icon, type IconName } from "./icons";
import type { PlanOffer } from "./plans";
import BrandsCard from "./brands-card";

/* ── design tokens ──────────────────────────────────────────────────────── */
const C1 = "#8B5CF6";
const C2 = "#3B82F6";
const GRAD = `linear-gradient(135deg,${C1},${C2})`;
const INK = "#0F172A";
const SLATE = "#334155";
const MUT = "#64748B";
const LINE = "#E2E8F0";
const NIGHT = "#0B1120";

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
  proactiveSound: boolean;
  askContact: boolean;
  orderLookup: boolean;
  usage: { used: number; limit: number; pooled: boolean };
  stats: SiteStats;
};
type Limits = { id: string; sites: number; pages: number; aiRepliesPerMonth: number; facts: number };
type SiteStats = { leads: number; won: number; revenue: number };
type Fact = { id: string; question: string; answer: string; updatedAt: string };
type Gap = { question: string; count: number };
type Platform = "woocommerce" | "shopify" | "bigcommerce";
type StoreState = {
  connected: boolean;
  store: { platform: string; hint: string | null; lastCheckedAt: string | null; lastError: string | null } | null;
  orderLookup: boolean;
  available: boolean;
};
type Recent = { id: string; name: string; text: string; at: string };

const DAYS = [
  { n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" },
  { n: 5, label: "Fri" }, { n: 6, label: "Sat" }, { n: 7, label: "Sun" },
];
const SWATCHES: [string, string][] = [
  ["#8B5CF6", "Violet"], ["#3B82F6", "Blue"], ["#0E7490", "Teal"], ["#059669", "Green"],
  ["#B45309", "Amber"], ["#DC2626", "Red"], ["#DB2777", "Pink"], ["#0F172A", "Ink"],
];

const STORE_FIELDS: Record<Platform, { name: string; label: string; ph: string; secret?: boolean }[]> = {
  woocommerce: [
    { name: "storeUrl", label: "Store address", ph: "https://yourshop.com" },
    { name: "consumerKey", label: "Consumer key", ph: "ck_…" },
    { name: "consumerSecret", label: "Consumer secret", ph: "cs_…", secret: true },
  ],
  shopify: [
    { name: "shopDomain", label: "Store domain", ph: "yourshop.myshopify.com" },
    { name: "accessToken", label: "Admin API token", ph: "shpat_…", secret: true },
  ],
  bigcommerce: [
    { name: "storeHash", label: "Store hash", ph: "abc123" },
    { name: "accessToken", label: "Access token", ph: "Access token", secret: true },
  ],
};
const STORE_HELP: Record<Platform, string> = {
  woocommerce:
    "In WooCommerce: Settings → Advanced → REST API → Add key. Set permissions to Read — nothing here ever writes, and a read-only key can't be used to change an order.",
  shopify:
    "In Shopify: Settings → Apps and sales channels → Develop apps → create an app with the read_orders scope. Paste the Admin API access token below. That scope only reaches the last 60 days.",
  bigcommerce:
    "In BigCommerce: Settings → API accounts → Create a token with Orders set to read-only. The store hash is the code in your control panel URL.",
};
const STORE_LABEL: Record<string, string> = {
  woocommerce: "WooCommerce", shopify: "Shopify", bigcommerce: "BigCommerce",
};

type TabKey = "plans" | "setup" | "teach" | "commerce" | "install" | "plan";

/* ── small pieces from the design ───────────────────────────────────────── */

const CARD: CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden" };
const CARD_HEAD: CSSProperties = { padding: "20px 22px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" };
const CHIP: CSSProperties = { width: 34, height: 34, borderRadius: 10, background: "#F5F3FF", color: C1, display: "grid", placeItems: "center", flex: "none" };
const LABEL: CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: MUT };
const INPUT: CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 11, padding: "12px 14px", fontSize: 13.5, color: INK, outline: "none", fontFamily: "inherit", background: "#fff" };
const GHOST: CSSProperties = { whiteSpace: "nowrap", border: `1px solid ${LINE}`, borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: SLATE, cursor: "pointer", background: "#fff", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "inherit" };
const PRIMARY: CSSProperties = { whiteSpace: "nowrap", background: GRAD, color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: "0 6px 16px rgba(99,102,241,.28)", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "inherit" };
const HINT: CSSProperties = { background: "#F8FAFC", border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", fontSize: 12.3, lineHeight: 1.7, color: SLATE };

function Section({ icon, title, sub, right, children, tone }: {
  icon: IconName; title: string; sub?: string; right?: ReactNode; children?: ReactNode;
  tone?: { border: string; headBg: string; chipBg: string; chipFg: string; titleFg: string; subFg: string };
}) {
  return (
    <section style={{ ...CARD, ...(tone ? { border: `1px solid ${tone.border}` } : null) }}>
      <div style={{ ...CARD_HEAD, ...(tone ? { borderBottom: `1px solid ${tone.border}`, background: tone.headBg } : null) }}>
        <span style={{ ...CHIP, ...(tone ? { background: tone.chipBg, color: tone.chipFg } : null) }}><Icon n={icon} /></span>
        <span style={{ flex: 1, minWidth: 180 }}>
          <b style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: tone?.titleFg ?? INK }}>{title}</b>
          {sub && <span style={{ display: "block", fontSize: 12, color: tone?.subFg ?? MUT, marginTop: 3 }}>{sub}</span>}
        </span>
        {right}
      </div>
      {children && <div style={{ padding: "20px 22px" }}>{children}</div>}
    </section>
  );
}

/** The design's pill switch. */
function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      style={{
        flex: "none", width: 44, height: 25, borderRadius: 999, background: on ? GRAD : "#CBD5E1",
        padding: 3, cursor: "pointer", border: "none", display: "flex",
        justifyContent: on ? "flex-end" : "flex-start", transition: "background .2s",
      }}
    >
      <span style={{ width: 19, height: 19, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(15,23,42,.3)", display: "block" }} />
    </button>
  );
}

function ToggleRow({ title, body, on, onFlip, extra, last }: {
  title: string; body: string; on: boolean; onFlip: () => void; extra?: ReactNode; last?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "15px 16px", background: "#fff", borderBottom: last ? "none" : "1px solid #F1F5F9" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontSize: 13.2, fontWeight: 700 }}>{title}</b>
        <span style={{ display: "block", fontSize: 11.8, color: MUT, lineHeight: 1.6, marginTop: 4, textWrap: "pretty" }}>{body}</span>
        {on && extra}
      </span>
      <Switch on={on} onClick={onFlip} label={title} />
    </div>
  );
}

/* ── the page ───────────────────────────────────────────────────────────── */

export default function WidgetClient({ offers }: { offers: PlanOffer[] }) {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [sites, setSites] = useState<Site[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [planId, setPlanId] = useState<string>("FREE");
  const [canAddSite, setCanAddSite] = useState(false);
  const [addingSite, setAddingSite] = useState(false);
  const [totals, setTotals] = useState<SiteStats | null>(null);
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("setup");
  const [yearly, setYearly] = useState(false);

  const [store, setStore] = useState<StoreState | undefined>(undefined);
  const [platform, setPlatform] = useState<Platform>("woocommerce");
  const [storeForm, setStoreForm] = useState<Record<string, string>>({});
  const [storeBusy, setStoreBusy] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeNote, setStoreNote] = useState<string | null>(null);

  const [facts, setFacts] = useState<Fact[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [teaching, setTeaching] = useState<{ id?: string; question: string; answer: string } | null>(null);
  const [teachBusy, setTeachBusy] = useState(false);
  const [teachError, setTeachError] = useState<string | null>(null);

  const [hoursDraft, setHoursDraft] = useState<NonNullable<Site["replyHours"]> | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [greetDraft, setGreetDraft] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const teachTop = useRef<HTMLDivElement>(null);

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
      setPlanId(d.plan ?? "FREE");
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

  useEffect(() => { if (selectedId) loadFacts(selectedId); }, [selectedId]);

  async function loadFacts(siteId: string) {
    try {
      const res = await fetch(`/api/company/facts?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { facts: Fact[]; unanswered: Gap[] };
      setFacts(d.facts ?? []);
      setGaps(d.unanswered ?? []);
    } catch { /* the section just stays empty */ }
  }

  /** The three most recent chat leads, for the panel beside the preview.
   *  Real rows or nothing — the panel disappears rather than invent activity. */
  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const res = await fetch("/api/company/inquiries", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { inquiries?: { id: string; source?: string; visitorName?: string | null; message?: string; createdAt: string }[] };
        const rows = (d.inquiries ?? [])
          .filter((i) => i.source === "WIDGET")
          .slice(0, 3)
          .map((i) => ({ id: i.id, name: i.visitorName || "Visitor", text: (i.message ?? "").split("\n")[0], at: i.createdAt }));
        if (!stale) setRecent(rows);
      } catch { /* the panel just doesn't render */ }
    })();
    return () => { stale = true; };
  }, []);

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

  useEffect(() => {
    if (!selectedId) { setStore(undefined); return; }
    let stale = false;
    (async () => {
      const res = await fetch(`/api/company/store?siteId=${encodeURIComponent(selectedId)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as StoreState;
      if (!stale && res.ok) setStore(data);
    })();
    return () => { stale = true; };
  }, [selectedId]);

  async function connectStore() {
    if (!site || storeBusy) return;
    setStoreBusy(true); setStoreError(null); setStoreNote(null);
    try {
      const res = await fetch("/api/company/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...storeForm, platform, siteId: site.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string };
      if (!res.ok || !data.ok) { setStoreError(data.error ?? "Couldn't connect that store."); return; }
      setStoreNote(data.note ?? "Connected and tested.");
      setStoreForm({});
      const fresh = await fetch(`/api/company/store?siteId=${site.id}`, { cache: "no-store" });
      if (fresh.ok) setStore((await fresh.json()) as StoreState);
    } finally {
      setStoreBusy(false);
    }
  }

  async function disconnectStore() {
    if (!site || storeBusy) return;
    setStoreBusy(true); setStoreError(null); setStoreNote(null);
    try {
      await fetch(`/api/company/store?siteId=${site.id}`, { method: "DELETE" });
      setStore({ connected: false, store: null, orderLookup: false, available: store?.available ?? true });
      setSites((cur) => (cur ?? []).map((x) => (x.id === site.id ? { ...x, orderLookup: false } : x)));
    } finally {
      setStoreBusy(false);
    }
  }

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

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    }).catch(() => {});
  }

  const site = sites?.find((x) => x.id === selectedId) ?? null;
  const brand = site?.accentColor ?? C1;
  const snippet = site ? `<script src="https://www.topezia.com/widget.js" data-topezia="${site.siteToken}" async></script>` : "";
  const pagePct = limits && limits.pages ? Math.min(100, ((site?.pagesCrawled ?? 0) / limits.pages) * 100) : 0;
  const replyPct = site && site.usage.limit ? Math.min(100, (site.usage.used / site.usage.limit) * 100) : 0;
  const factPct = limits && limits.facts ? Math.min(100, (facts.length / limits.facts) * 100) : 0;

  const TABS: { k: TabKey; label: string; icon: IconName; count: number }[] = useMemo(() => ([
    { k: "plans", label: "Your plan", icon: "money", count: 0 },
    { k: "setup", label: "Setup", icon: "globe", count: 0 },
    { k: "teach", label: "Teach the bot", icon: "book", count: gaps.length },
    { k: "commerce", label: "Ecommerce", icon: "truck", count: 0 },
    { k: "install", label: "Install", icon: "code", count: 0 },
    { k: "plan", label: "Usage & plan", icon: "chart", count: 0 },
  ]), [gaps.length]);

  if (gate) return <EmployerGate title="Site chat" reason={gate} what="the site chat widget" />;
  if (sites === undefined) {
    return <div style={{ ...CARD, padding: 22 }}><p style={{ fontSize: 13, color: MUT, margin: 0 }}>{error ?? "Loading…"}</p></div>;
  }

  const live = Boolean(site?.enabled);

  return (
    <div style={{ fontFamily: "var(--font-sora), system-ui, sans-serif", color: INK }}>
      <style>{`
        #wg-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
        #wg-work{grid-template-columns:minmax(0,1fr) 372px}
        #wg-plans{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
        @media (max-width:1280px){#wg-work{grid-template-columns:minmax(0,1fr)}#wg-aside{position:static !important;max-width:400px}}
        @media (max-width:1100px){#wg-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .wg-ghost:hover{border-color:#A5B4FC;color:${C1}}
      `}</style>

      {/* ── header ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.8px" }}>Site chat</h1>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
              background: live ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${live ? "#A7F3D0" : "#FECACA"}`,
              color: live ? "#047857" : "#B91C1C", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: live ? "#22C55E" : "#EF4444" }} />
              {live ? "Widget is on" : "Widget is off"}
            </span>
          </div>
          <p style={{ margin: "7px 0 0", fontSize: 13.3, lineHeight: 1.65, color: MUT, maxWidth: 640, textWrap: "pretty" }}>
            An AI assistant for your own website. It answers from your site&apos;s pages, and every real lead lands in
            your Topezia inbox.
          </p>
        </div>
        {site && (
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", paddingTop: 4 }}>
            <button type="button"
              onClick={() => patchSite({ enabled: !site.enabled }, { enabled: !site.enabled })}
              style={{ ...GHOST, borderColor: live ? "#FECACA" : "#A7F3D0", color: live ? "#B91C1C" : "#047857", borderRadius: 10, padding: "10px 16px", fontSize: 12.5 }}>
              <Icon n="power" s={15} />{live ? "Turn off" : "Turn on"}
            </button>
            <button type="button" style={{ ...PRIMARY, padding: "10px 18px" }} onClick={() => setTab("install")}>
              <Icon n="code" s={15} />Install code
            </button>
          </div>
        )}
      </div>

      {/* The switcher the design leaves out — Studio runs ten websites and
          every one of them needs reaching. */}
      {(sites.length > 1 || canAddSite) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
          {sites.map((s) => {
            const on = s.id === selectedId && !addingSite;
            return (
              <button key={s.id} type="button"
                onClick={() => { setSelectedId(s.id); setDomain(s.domain); setAddingSite(false); setError(null); }}
                style={{
                  border: `1px solid ${on ? "#C7D2FE" : LINE}`, background: on ? "#EEF2FF" : "#fff",
                  color: on ? "#4F46E5" : SLATE, borderRadius: 999, padding: "8px 15px",
                  fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                {s.domain}{!s.enabled && <span style={{ color: "#94A3B8", fontWeight: 600 }}> · off</span>}
              </button>
            );
          })}
          {canAddSite ? (
            <button type="button" onClick={() => { setAddingSite(true); setDomain(""); setError(null); }}
              style={{ ...GHOST, borderStyle: "dashed", borderRadius: 999, padding: "8px 15px", fontSize: 12.5 }}>
              + Add a website
            </button>
          ) : (
            limits && limits.sites > 1 && <span style={{ fontSize: 12, color: MUT }}>{sites.length} of {limits.sites} websites used.</span>
          )}
        </div>
      )}

      {/* Which websites share a knowledge base. Renders itself away when
          there is only one, so a single-site company never sees it. */}
      <BrandsCard siteCount={sites.length} onChanged={() => void loadSites()} />

      {error && <p style={{ fontSize: 12.5, color: "#B91C1C", marginTop: 12 }}>{error}</p>}

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      {site && (
        <div id="wg-kpis" style={{ display: "grid", gap: 12, margin: "16px 0 4px" }}>
          {([
            { label: "Leads from chat", icon: "user" as IconName, big: String(site.stats.leads), unit: "this month",
              note: site.stats.leads > 0 ? "Every one is sitting in your inbox" : "Nothing yet — they land in Messages", fg: INK, bar: false, pct: 0 },
            { label: "Became work", icon: "brief" as IconName, big: String(site.stats.won), unit: "marked won",
              note: "Mark a conversation won in Messages", fg: INK, bar: false, pct: 0 },
            { label: "Revenue", icon: "money" as IconName, big: `$${site.stats.revenue.toLocaleString()}`, unit: "you entered",
              note: "Only ever counts what you tell it", fg: site.stats.revenue > 0 ? "#047857" : INK, bar: false, pct: 0 },
            { label: "AI replies", icon: "bolt" as IconName, big: site.usage.used.toLocaleString(), unit: `of ${site.usage.limit.toLocaleString()}`,
              note: `${replyPct.toFixed(replyPct < 10 ? 1 : 0)}% of your monthly allowance${site.usage.pooled ? ", shared across your sites" : ""}`,
              fg: "#4F46E5", bar: true, pct: replyPct },
          ]).map((k) => (
            <div key={k.label} style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 15, padding: "17px 18px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "1.1px", textTransform: "uppercase", color: MUT }}>
                <Icon n={k.icon} s={13} />{k.label}
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 11 }}>
                <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-1px", color: k.fg }}>{k.big}</span>
                <span style={{ fontSize: 11.5, color: MUT }}>{k.unit}</span>
              </div>
              {k.bar && (
                <span style={{ display: "block", height: 5, borderRadius: 999, background: "#F1F5F9", marginTop: 11, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${k.pct}%`, background: `linear-gradient(90deg,${C1},${C2})`, borderRadius: 999 }} />
                </span>
              )}
              <span style={{ display: "block", fontSize: 11.3, color: MUT, marginTop: 9, lineHeight: 1.5 }}>{k.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── tab band ─────────────────────────────────────────────────────── */}
      <div style={{ background: NIGHT, borderRadius: 14, boxShadow: "0 6px 18px rgba(11,17,32,.18)", margin: "16px 0 20px" }}>
        <div style={{ padding: "0 12px", display: "flex", gap: 6, overflowX: "auto" }}>
          {TABS.map((t) => {
            const on = t.k === tab;
            return (
              <button key={t.k} type="button" onClick={() => setTab(t.k)} style={{
                flex: "none", display: "inline-flex", alignItems: "center", gap: 9, margin: "9px 0",
                padding: "11px 17px", borderRadius: 11, fontSize: 13.2, fontWeight: 700,
                color: on ? "#fff" : "#93A0BE", background: on ? GRAD : "transparent", border: "none",
                boxShadow: on ? "0 6px 18px rgba(99,102,241,.4)" : "none", cursor: "pointer",
                whiteSpace: "nowrap", fontFamily: "inherit", transition: "background .18s,color .18s",
              }}>
                <Icon n={t.icon} s={15} />{t.label}
                {t.count > 0 && (
                  <span style={{ background: on ? "rgba(255,255,255,.25)" : "#FEF3C7", color: on ? "#fff" : "#B45309", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {settingsError && <p style={{ fontSize: 12.5, color: "#B91C1C", marginBottom: 12 }}>{settingsError}</p>}

      <div id="wg-work" style={{ display: "grid", gap: 20, alignItems: "start", gridTemplateColumns: tab === "setup" ? undefined : "minmax(0,1fr)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

          {/* ── PLANS ────────────────────────────────────────────────────── */}
          {tab === "plans" && (
            <Section icon="money" title="Choose your package"
              sub="Leads and your inbox are free on every plan — what you pay for is AI capacity"
              right={
                <span style={{ flex: "none", display: "inline-flex", gap: 3, background: "#F1F5F9", borderRadius: 10, padding: 3 }}>
                  {[["Monthly", false], ["Yearly · save 2 months", true]].map(([label, y]) => (
                    <button key={String(y)} type="button" onClick={() => setYearly(Boolean(y))} style={{
                      whiteSpace: "nowrap", borderRadius: 8, padding: "7px 13px", fontSize: 11.8, fontWeight: 600,
                      cursor: "pointer", border: "none", fontFamily: "inherit",
                      background: yearly === y ? "#fff" : "transparent", color: yearly === y ? INK : MUT,
                      boxShadow: yearly === y ? "0 2px 6px rgba(15,23,42,.12)" : "none",
                    }}>{label}</button>
                  ))}
                </span>
              }
            >
              <div id="wg-plans" style={{ display: "grid", gap: 14, alignItems: "start" }}>
                {offers.map((p) => {
                  const cur = p.id === planId;
                  const dark = p.id === "PRO";
                  return (
                    <div key={p.id} style={{
                      background: dark ? NIGHT : "#fff",
                      border: cur ? `2px solid ${C1}` : `1px solid ${dark ? "rgba(255,255,255,.14)" : LINE}`,
                      borderRadius: 18, padding: "24px 22px", position: "relative",
                      boxShadow: dark ? "0 22px 50px rgba(15,23,42,.26)" : cur ? "0 14px 34px rgba(139,92,246,.16)" : "none",
                      color: dark ? "#fff" : INK,
                    }}>
                      {(cur || dark) && (
                        <span style={{
                          position: "absolute", top: -11, left: 22, whiteSpace: "nowrap",
                          background: cur ? "linear-gradient(135deg,#059669,#0E7490)" : GRAD,
                          color: "#fff", borderRadius: 999, padding: "5px 13px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".4px",
                        }}>{cur ? "Your plan" : "Most popular"}</span>
                      )}
                      <b style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{p.name}</b>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 11 }}>
                        <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1.4px" }}>{yearly ? p.yearly : p.monthly}</span>
                        <span style={{ fontSize: 12.5, color: dark ? "#8794B3" : MUT }}>{yearly ? p.perYear : p.perMonth}</span>
                      </span>
                      <span style={{ display: "block", fontSize: 11.3, color: dark ? "#8794B3" : MUT, marginTop: 5 }}>
                        {yearly ? p.noteYearly : p.noteMonthly}
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${dark ? "rgba(255,255,255,.12)" : LINE}` }}>
                        {p.feats.map((ft) => (
                          <span key={ft} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.3, lineHeight: 1.6, color: dark ? "#C7CEE4" : SLATE }}>
                            <span style={{ flex: "none", width: 17, height: 17, borderRadius: 5, background: dark ? "rgba(74,222,128,.16)" : "#ECFDF5", color: dark ? "#4ADE80" : "#059669", display: "grid", placeItems: "center", marginTop: 1 }}>
                              <Icon n="tick" s={11} w={2.8} />
                            </span>
                            <span style={{ flex: 1, textWrap: "pretty" }}>{ft}</span>
                          </span>
                        ))}
                      </span>
                      {cur ? (
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", marginTop: 20, background: "#F1F5F9", border: `1px solid ${LINE}`, color: "#94A3B8", borderRadius: 11, padding: "11px 16px", fontSize: 13, fontWeight: 700 }}>
                          Current plan
                        </span>
                      ) : p.forSale ? (
                        <a href="/employer/billing" style={{
                          display: "flex", alignItems: "center", justifyContent: "center", marginTop: 20,
                          background: dark ? GRAD : "#fff", border: `1px solid ${dark ? "transparent" : "#C7D2FE"}`,
                          color: dark ? "#fff" : "#4F46E5", borderRadius: 11, padding: "11px 16px",
                          fontSize: 13, fontWeight: 700, textDecoration: "none",
                        }}>{p.id === "FREE" ? "Manage billing" : `Upgrade to ${p.name}`}</a>
                      ) : (
                        <span style={{ display: "block", marginTop: 20, textAlign: "center", fontSize: 12.3, color: "#94A3B8" }}>Not on sale yet</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ ...HINT, marginTop: 20 }}>
                Changing plan happens in billing, and we bill the difference pro rata. Run out of AI replies and the
                chat doesn&apos;t go dark — it keeps taking messages, so you never lose a lead to a limit.
              </div>
            </Section>
          )}

          {/* ── SETUP ────────────────────────────────────────────────────── */}
          {tab === "setup" && (
            <>
              <Section icon="globe" title={addingSite ? "Add a website" : "What the chat has read"}
                sub={
                  busy ? "Reading your site — this takes up to a minute."
                    : site && !addingSite
                      ? site.crawlError
                        ? `Last scan: ${site.crawlError}`
                        : `Knows ${site.pagesCrawled} page${site.pagesCrawled === 1 ? "" : "s"} of ${site.domain}${site.crawledAt ? ` · last scanned ${new Date(site.crawledAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`
                      : "Type your domain and we'll read it the way a new employee would"
                }
                right={
                  <button type="button" className="wg-ghost" style={GHOST} onClick={scanSite} disabled={busy || !domain.trim()}>
                    <Icon n="refresh" s={15} />{busy ? "Scanning…" : addingSite ? "Add and scan" : "Re-scan site"}
                  </button>
                }
              >
                <label style={LABEL}>Your website</label>
                <div style={{ display: "flex", gap: 10, marginTop: 9, flexWrap: "wrap" }}>
                  <input style={{ ...INPUT, flex: 1, minWidth: 220 }} value={domain}
                    onChange={(e) => setDomain(e.target.value)} placeholder="yourcompany.com" />
                  {addingSite && sites.length > 0 && (
                    <button type="button" style={GHOST} onClick={() => { setAddingSite(false); setDomain(site?.domain ?? ""); setError(null); }}>Cancel</button>
                  )}
                  {!addingSite && sites.length > 1 && site && (
                    <button type="button" style={{ ...GHOST, color: "#B91C1C" }} onClick={() => removeSite(site)}>
                      <Icon n="trash" s={15} />Remove
                    </button>
                  )}
                </div>
                {limits && site && !addingSite && (
                  <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 14, background: "#F8FAFC", border: `1px solid ${LINE}`, borderRadius: 11, padding: "12px 14px" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.3, color: SLATE, lineHeight: 1.6 }}>
                      {site.pagesCrawled} of {limits.pages.toLocaleString()} pages used on your plan
                    </span>
                    <span style={{ flex: "none", width: 130, height: 6, borderRadius: 999, background: LINE, overflow: "hidden" }}>
                      <span style={{ display: "block", width: `${pagePct}%`, height: "100%", background: `linear-gradient(90deg,${C1},${C2})` }} />
                    </span>
                  </div>
                )}
              </Section>

              {site && !addingSite && (
                <>
                  <Section icon="palette" title="Appearance" sub="Your colour on the bubble, buttons and replies">
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      {SWATCHES.map(([hex, name]) => {
                        const on = (site.accentColor ?? C1).toLowerCase() === hex.toLowerCase();
                        return (
                          <button key={hex} type="button" title={name} aria-label={name}
                            onClick={() => patchSite({ accentColor: hex }, { accentColor: hex })}
                            style={{
                              width: 34, height: 34, borderRadius: 11, background: hex, cursor: "pointer", border: "none",
                              boxShadow: on ? `0 0 0 2px #fff, 0 0 0 4px ${hex}` : "inset 0 0 0 1px rgba(15,23,42,.08)",
                              display: "grid", placeItems: "center", color: "#fff",
                            }}>
                            {on && <Icon n="tick" s={14} w={3} />}
                          </button>
                        );
                      })}
                      <input type="color" aria-label="Custom colour" value={site.accentColor ?? C1}
                        onChange={(e) => patchSite({ accentColor: e.target.value }, { accentColor: e.target.value })}
                        style={{ width: 44, height: 34, padding: 0, border: `1px solid ${LINE}`, borderRadius: 11, background: "#fff", cursor: "pointer" }} />
                      {site.accentColor && (
                        <button type="button" className="wg-ghost" style={{ ...GHOST, padding: "8px 13px", fontSize: 11.5 }}
                          onClick={() => patchSite({ accentColor: null }, { accentColor: null })}>Reset</button>
                      )}
                    </div>
                  </Section>

                  <Section icon="chat" title="How the chat opens" sub="It opens itself once per visit — never twice">
                    <label style={LABEL}>Opening line</label>
                    <textarea rows={2} maxLength={300}
                      value={greetDraft ?? site.greeting ?? ""}
                      onChange={(e) => setGreetDraft(e.target.value)}
                      placeholder="Hi — I'm the assistant. Ask me anything, or leave a message and a real person will follow up."
                      style={{ ...INPUT, width: "100%", marginTop: 9, lineHeight: 1.6, resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                      <button type="button" style={{ ...PRIMARY, padding: "9px 16px" }} disabled={greetDraft === null}
                        onClick={async () => { await patchSite({ greeting: greetDraft }, { greeting: greetDraft || null }); setGreetDraft(null); }}>
                        Save greeting
                      </button>
                      {(site.greeting || greetDraft) && (
                        <button type="button" className="wg-ghost" style={GHOST}
                          onClick={async () => { await patchSite({ greeting: "" }, { greeting: null }); setGreetDraft(null); }}>
                          Use the automatic one
                        </button>
                      )}
                      <span style={{ flex: 1, minWidth: 200, fontSize: 11.5, color: MUT, lineHeight: 1.6 }}>
                        Leave it empty and the chat names whatever page they&apos;re on — usually better than a generic hello.
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 18, border: `1px solid ${LINE}`, borderRadius: 13, overflow: "hidden" }}>
                      <ToggleRow
                        title="Open by itself"
                        body="The chat introduces itself to someone who lingers, reads a long way down, or moves to leave."
                        on={site.proactive}
                        onFlip={() => patchSite({ proactive: !site.proactive }, { proactive: !site.proactive })}
                        extra={
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 11, fontSize: 12, color: SLATE, flexWrap: "wrap" }}>
                            after
                            <input type="number" min={3} max={300} defaultValue={site.proactiveDelay}
                              onBlur={(e) => patchSite({ proactiveDelay: Number(e.target.value) }, { proactiveDelay: Number(e.target.value) })}
                              style={{ ...INPUT, width: 62, padding: "7px 10px", fontSize: 12.5, textAlign: "center", borderRadius: 8 }} />
                            seconds, a deep scroll, or a move to leave
                          </span>
                        }
                      />
                      <ToggleRow
                        title="Play a chime"
                        body="A soft two-note chime when it opens itself. Browsers only allow sound after a click, so a brand-new visit opens quietly."
                        on={site.proactiveSound}
                        onFlip={() => patchSite({ proactiveSound: !site.proactiveSound }, { proactiveSound: !site.proactiveSound })}
                      />
                      <ToggleRow
                        title="Ask for contact details"
                        body="After the first answer it asks for a name, email and phone. Skippable — it keeps answering either way."
                        on={site.askContact}
                        onFlip={() => patchSite({ askContact: !site.askContact }, { askContact: !site.askContact })}
                        last
                      />
                    </div>
                  </Section>

                  <Section icon="clock" title="When your team is around"
                    sub="Outside these hours it says so, instead of letting someone sit waiting"
                    right={
                      !site.replyHours && !hoursDraft ? (
                        <button type="button" className="wg-ghost" style={GHOST}
                          onClick={() => setHoursDraft({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" })}>
                          <Icon n="plus" s={15} w={2.2} />Set your hours
                        </button>
                      ) : undefined
                    }
                  >
                    {site.replyHours && !hoursDraft ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700 }}>
                          {site.replyHours.days.map((d) => DAYS.find((x) => x.n === d)?.label).join(" ")} · {site.replyHours.start}–{site.replyHours.end}
                        </span>
                        <span style={{ fontSize: 12, color: MUT }}>{site.replyHours.tz}</span>
                        <button type="button" className="wg-ghost" style={GHOST} onClick={() => setHoursDraft(site.replyHours)}>Edit</button>
                        <button type="button" className="wg-ghost" style={GHOST} onClick={() => patchSite({ replyHours: null }, { replyHours: null })}>Turn off</button>
                      </div>
                    ) : hoursDraft ? (
                      <div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                          {DAYS.map((d) => {
                            const on = hoursDraft.days.includes(d.n);
                            return (
                              <button key={d.n} type="button"
                                onClick={() => setHoursDraft({ ...hoursDraft, days: on ? hoursDraft.days.filter((x) => x !== d.n) : [...hoursDraft.days, d.n].sort() })}
                                style={{
                                  border: `1px solid ${on ? "#C7D2FE" : LINE}`, background: on ? "#EEF2FF" : "#fff",
                                  color: on ? "#4F46E5" : SLATE, borderRadius: 9, padding: "7px 12px",
                                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                                }}>{d.label}</button>
                            );
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <input type="time" value={hoursDraft.start} onChange={(e) => setHoursDraft({ ...hoursDraft, start: e.target.value })} style={{ ...INPUT, width: 130 }} />
                          <span style={{ fontSize: 12.5, color: MUT }}>to</span>
                          <input type="time" value={hoursDraft.end} onChange={(e) => setHoursDraft({ ...hoursDraft, end: e.target.value })} style={{ ...INPUT, width: 130 }} />
                          <span style={{ fontSize: 12, color: MUT }}>{hoursDraft.tz}</span>
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                          <button type="button" style={{ ...PRIMARY, padding: "9px 16px" }}
                            onClick={async () => { await patchSite({ replyHours: hoursDraft }, { replyHours: hoursDraft }); setHoursDraft(null); }}>
                            Save hours
                          </button>
                          <button type="button" className="wg-ghost" style={GHOST} onClick={() => setHoursDraft(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 12.5, color: MUT, lineHeight: 1.7 }}>
                        Leave it off and the chat says nothing about availability — better than implying someone&apos;s
                        there at 2am.
                      </p>
                    )}
                  </Section>
                </>
              )}
            </>
          )}

          {/* ── TEACH ────────────────────────────────────────────────────── */}
          {tab === "teach" && site && (
            <>
              {gaps.length > 0 && (
                <Section icon="alert" title="Asked, but your site had no answer"
                  sub={`${gaps.length} question${gaps.length === 1 ? "" : "s"} waiting — each one is a real visitor you nearly lost`}
                  tone={{ border: "#FDE68A", headBg: "#FFFBEB", chipBg: "#FEF3C7", chipFg: "#B45309", titleFg: "#92400E", subFg: "#B45309" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {gaps.map((g) => (
                      <div key={g.question} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 14px", flexWrap: "wrap" }}>
                        <span style={{ flex: 1, minWidth: 160, fontSize: 12.8, color: SLATE, lineHeight: 1.55 }}>“{g.question}”</span>
                        <span style={{ flex: "none", fontSize: 10.5, color: MUT, background: "#F1F5F9", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>{g.count}×</span>
                        <button type="button" style={{ ...PRIMARY, padding: "7px 14px", fontSize: 11.5, boxShadow: "none" }}
                          onClick={() => { setTeaching({ question: g.question, answer: "" }); teachTop.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                          Answer this
                        </button>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <div ref={teachTop}>
                <Section icon="book" title="What you've taught it"
                  sub="What you write here wins over your pages — re-scanning never erases it"
                  right={
                    <>
                      {limits && (
                        <span style={{ flex: "none", whiteSpace: "nowrap", background: "#EEF2FF", color: "#4F46E5", borderRadius: 999, padding: "4px 11px", fontSize: 11, fontWeight: 700 }}>
                          {facts.length} of {limits.facts}
                        </span>
                      )}
                      <button type="button" className="wg-ghost" style={GHOST} onClick={() => setTeaching({ question: "", answer: "" })}>
                        <Icon n="plus" s={15} w={2.2} />Teach an answer
                      </button>
                    </>
                  }
                >
                  {teaching && (
                    <div style={{ border: "1px solid #C7D2FE", background: "#FAFAFF", borderRadius: 13, padding: 16, marginBottom: 14 }}>
                      <label style={LABEL}>When someone asks</label>
                      <input style={{ ...INPUT, width: "100%", marginTop: 8 }} value={teaching.question}
                        placeholder="do you ship to Canada?"
                        onChange={(e) => setTeaching({ ...teaching, question: e.target.value })} />
                      <label style={{ ...LABEL, marginTop: 12 }}>Say this</label>
                      <textarea rows={3} style={{ ...INPUT, width: "100%", marginTop: 8, lineHeight: 1.6, resize: "vertical" }}
                        value={teaching.answer} placeholder="Yes — Canada is $45 and takes about a week longer."
                        onChange={(e) => setTeaching({ ...teaching, answer: e.target.value })} />
                      {teachError && <p style={{ fontSize: 12, color: "#B91C1C", margin: "8px 0 0" }}>{teachError}</p>}
                      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                        <button type="button" style={{ ...PRIMARY, padding: "9px 16px" }} onClick={saveTeach}
                          disabled={teachBusy || !teaching.question.trim() || !teaching.answer.trim()}>
                          {teachBusy ? "Saving…" : "Save answer"}
                        </button>
                        <button type="button" className="wg-ghost" style={GHOST} onClick={() => { setTeaching(null); setTeachError(null); }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {facts.length === 0 && !teaching ? (
                    <p style={{ margin: 0, fontSize: 12.5, color: MUT, lineHeight: 1.7 }}>
                      Nothing taught yet. Anything your website doesn&apos;t spell out — pricing rules, what you don&apos;t
                      do, shipping, lead times — belongs here.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {facts.map((f) => (
                        <div key={f.id} style={{ border: `1px solid ${LINE}`, borderRadius: 13, padding: "16px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <b style={{ flex: 1, minWidth: 180, fontSize: 13.3, fontWeight: 700 }}>{f.question}</b>
                            <button type="button" onClick={() => setTeaching({ id: f.id, question: f.question, answer: f.answer })}
                              style={{ background: "none", border: "none", fontSize: 11.5, fontWeight: 600, color: C1, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                            <button type="button" onClick={() => forgetFact(f.id)}
                              style={{ background: "none", border: "none", fontSize: 11.5, fontWeight: 600, color: "#DC2626", cursor: "pointer", fontFamily: "inherit" }}>Forget</button>
                          </div>
                          <p style={{ margin: "9px 0 0", fontSize: 12.5, lineHeight: 1.65, color: SLATE }}>{f.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </>
          )}

          {/* ── COMMERCE ─────────────────────────────────────────────────── */}
          {tab === "commerce" && site && (
            <Section icon="truck" title="Order tracking"
              sub="Let the chat answer “where is my order?” from your store"
              right={
                <span style={{
                  flex: "none", whiteSpace: "nowrap", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 700,
                  background: store?.connected ? "#ECFDF5" : "#F1F5F9", color: store?.connected ? "#047857" : MUT,
                }}>
                  {store?.connected ? `${STORE_LABEL[store.store?.platform ?? ""] ?? "Store"} connected` : "Not connected"}
                </span>
              }
            >
              <p style={{ margin: 0, fontSize: 12.8, lineHeight: 1.7, color: SLATE, textWrap: "pretty" }}>
                It asks for the order number <b style={{ fontWeight: 700 }}>and</b> the email or postcode on that order
                before it says anything — a number on its own could be anyone&apos;s. It reads orders, never changes
                them, and never guesses a delivery date.
              </p>

              {store?.available === false ? (
                <div style={{ ...HINT, marginTop: 16 }}>
                  Not available on this deployment yet — the encryption key for storing store credentials isn&apos;t set.
                </div>
              ) : store?.connected ? (
                <div style={{ marginTop: 16 }}>
                  {store.store?.lastError && (
                    <p style={{ fontSize: 12, color: "#B91C1C", margin: "0 0 10px" }}>Last check failed: {store.store.lastError}</p>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, border: `1px solid ${LINE}`, borderRadius: 13, padding: "15px 16px" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: "block", fontSize: 13.2, fontWeight: 700 }}>Answer order questions</b>
                      <span style={{ display: "block", fontSize: 11.8, color: MUT, lineHeight: 1.6, marginTop: 4 }}>
                        {site.orderLookup ? "Live on your site now." : "Connected but not switched on — visitors won't be asked for an order number."}
                        {store.store?.hint && ` Key ${store.store.hint}.`}
                      </span>
                    </span>
                    <Switch on={site.orderLookup} label="Answer order questions"
                      onClick={() => patchSite({ orderLookup: !site.orderLookup }, { orderLookup: !site.orderLookup })} />
                  </div>
                  <button type="button" className="wg-ghost" style={{ ...GHOST, marginTop: 12 }} onClick={disconnectStore} disabled={storeBusy}>
                    Disconnect store
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                    {(["woocommerce", "shopify", "bigcommerce"] as Platform[]).map((p) => {
                      const on = p === platform;
                      return (
                        <button key={p} type="button" onClick={() => { setPlatform(p); setStoreForm({}); setStoreError(null); setStoreNote(null); }}
                          style={{
                            flex: "none", whiteSpace: "nowrap", border: `1px solid ${on ? "transparent" : LINE}`,
                            background: on ? GRAD : "#fff", color: on ? "#fff" : SLATE, borderRadius: 10,
                            padding: "9px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                            boxShadow: on ? "0 6px 16px rgba(99,102,241,.26)" : "none", fontFamily: "inherit",
                          }}>{STORE_LABEL[p]}</button>
                      );
                    })}
                  </div>
                  <div style={{ ...HINT, marginTop: 16 }}>{STORE_HELP[platform]}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12, marginTop: 16 }}>
                    {STORE_FIELDS[platform].map((f) => (
                      <label key={f.name} style={{ display: "block" }}>
                        <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: MUT, marginBottom: 7 }}>{f.label}</span>
                        <input style={{ ...INPUT, width: "100%", borderRadius: 10, padding: "11px 13px", fontSize: 13 }}
                          type={f.secret ? "password" : "text"} autoComplete="off" placeholder={f.ph}
                          value={storeForm[f.name] ?? ""}
                          onChange={(e) => setStoreForm((cur) => ({ ...cur, [f.name]: e.target.value }))} />
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 16, flexWrap: "wrap" }}>
                    <button type="button" style={PRIMARY} onClick={connectStore} disabled={storeBusy}>
                      {storeBusy ? "Testing…" : "Connect and test"}
                    </button>
                    <span style={{ flex: 1, minWidth: 200, fontSize: 12, color: MUT, lineHeight: 1.6 }}>
                      We test the connection before saving, so you find out here rather than from a customer.
                    </span>
                  </div>
                </>
              )}
              {storeError && <p style={{ fontSize: 12.5, color: "#B91C1C", margin: "12px 0 0" }}>{storeError}</p>}
              {storeNote && <p style={{ fontSize: 12.5, color: "#047857", margin: "12px 0 0" }}>{storeNote}</p>}
            </Section>
          )}

          {/* ── INSTALL ──────────────────────────────────────────────────── */}
          {tab === "install" && site && (
            <>
              <Section icon="code" title="Any site — paste one line"
                sub="Right before </body>. Works on Wix, Squarespace, Webflow, plain HTML.">
                <div style={{ background: NIGHT, borderRadius: 12, padding: "15px 17px", overflowX: "auto" }}>
                  <code style={{ fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.3, color: "#A5F3FC", whiteSpace: "nowrap" }}>{snippet}</code>
                </div>
                <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
                  <button type="button" style={{ ...PRIMARY, padding: "10px 18px" }} onClick={() => copy(snippet, "snippet")}>
                    <Icon n="copy" s={15} />{copied === "snippet" ? "Copied" : "Copy snippet"}
                  </button>
                  <a className="wg-ghost" style={{ ...GHOST, borderRadius: 10, padding: "10px 16px", fontSize: 12.5, textDecoration: "none" }}
                    href={`mailto:?subject=${encodeURIComponent(`Please add this to ${site.domain}`)}&body=${encodeURIComponent(`Hi,\n\nPlease paste this line into ${site.domain}, just before the closing </body> tag:\n\n${snippet}\n\nThat's the whole job — nothing else changes.\n\nThanks`)}`}>
                    Email it to a developer
                  </a>
                </div>
              </Section>

              <Section icon="book" title="WordPress? Use the plugin"
                sub="Install once, paste your key, done — no theme editing">
                <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                  {[
                    "Download the plugin below.",
                    "In WordPress: Plugins → Add New → Upload Plugin, choose the zip, activate.",
                    "In Settings → Topezia Chat, paste your site key.",
                  ].map((text, i) => (
                    <span key={text} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 12.8, lineHeight: 1.65, color: SLATE }}>
                      <span style={{ flex: "none", width: 21, height: 21, borderRadius: 7, background: "#EEF2FF", color: "#4F46E5", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 800 }}>{i + 1}</span>
                      <span style={{ flex: 1, textWrap: "pretty" }}>{text}</span>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 16, background: "#F8FAFC", border: `1px solid ${LINE}`, borderRadius: 11, padding: "12px 14px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: MUT }}>Site key</span>
                  <code style={{ flex: 1, minWidth: 180, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 12.3, color: INK }}>{site.siteToken}</code>
                  <button type="button" className="wg-ghost" style={{ ...GHOST, borderRadius: 8, padding: "7px 13px", fontSize: 11.5 }} onClick={() => copy(site.siteToken, "key")}>
                    {copied === "key" ? "Copied" : "Copy key"}
                  </button>
                </div>
                <a href="/topezia-chat.zip" download style={{ ...PRIMARY, marginTop: 14, textDecoration: "none", padding: "10px 18px" }}>
                  <Icon n="down" s={15} />Download WordPress plugin
                </a>
              </Section>
            </>
          )}

          {/* ── USAGE & PLAN ─────────────────────────────────────────────── */}
          {tab === "plan" && site && limits && (
            <>
              <Section icon="chart" title="Usage this month"
                sub={`${limits.id.charAt(0) + limits.id.slice(1).toLowerCase()} plan${site.usage.pooled ? " · shared across your websites" : ""}`}
                right={
                  <button type="button" onClick={() => setTab("plans")}
                    style={{ flex: "none", background: "none", border: "none", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: C1, cursor: "pointer", fontFamily: "inherit" }}>
                    Compare plans →
                  </button>
                }
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {[
                    { label: "AI replies", used: site.usage.used, cap: site.usage.limit, pct: replyPct, note: "After that the chat keeps taking messages — it just stops answering automatically." },
                    { label: "Pages scanned", used: site.pagesCrawled, cap: limits.pages, pct: pagePct, note: "Re-scan after you change the site." },
                    { label: "Answers you taught it", used: facts.length, cap: limits.facts, pct: factPct, note: "What you write wins over your pages." },
                  ].map((u) => (
                    <div key={u.label}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                        <b style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 700 }}>{u.label}</b>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: C1 }}>{u.used.toLocaleString()}</span>
                        <span style={{ fontSize: 11.5, color: MUT }}>of {u.cap.toLocaleString()}</span>
                      </span>
                      <span style={{ display: "block", height: 7, borderRadius: 999, background: "#F1F5F9", marginTop: 9, overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: `${u.pct}%`, background: `linear-gradient(90deg,${C1},${C2})`, borderRadius: 999 }} />
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, color: MUT, marginTop: 7, lineHeight: 1.55 }}>{u.note}</span>
                    </div>
                  ))}
                  <div style={HINT}>
                    Run out of AI replies and the chat doesn&apos;t go dark — it keeps taking messages, so you never
                    lose a lead to a limit.
                  </div>
                </div>
              </Section>

              <Section icon="mail" title="Weekly digest"
                sub="What visitors asked, what your site couldn't answer, who's waiting — Mondays. Quiet weeks send nothing."
                right={<Switch on={site.digestEnabled} label="Weekly digest"
                  onClick={() => patchSite({ digestEnabled: !site.digestEnabled }, { digestEnabled: !site.digestEnabled })} />}
              />

              {sites.length > 1 && totals && (
                <Section icon="brief" title="Across all your websites"
                  sub="Counted from what you marked won in Messages — never a guess">
                  <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
                    {[["Leads from chat", String(totals.leads)], ["Became work", String(totals.won)], ["You marked won", `$${totals.revenue.toLocaleString()}`]].map(([l, v]) => (
                      <span key={l}>
                        <b style={{ display: "block", fontSize: 24, fontWeight: 800, letterSpacing: "-1px" }}>{v}</b>
                        <span style={{ fontSize: 11.5, color: MUT }}>{l}</span>
                      </span>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        {/* ── live preview ─────────────────────────────────────────────────
            Only on Setup, where the things it shows are the things being
            edited. Everything in it is the real setting, not a mock-up of one. */}
        {tab === "setup" && site && !addingSite && (
          <aside id="wg-aside" style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: 18, boxShadow: "0 16px 40px rgba(15,23,42,.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
                <b style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Live preview</b>
                <span style={{ flex: "none", whiteSpace: "nowrap", fontSize: 11, color: MUT }}>Updates as you edit</span>
              </div>
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 15, overflow: "hidden", background: "#F8FAFC" }}>
                <div style={{ background: brand, padding: "13px 15px", display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
                  <span style={{ flex: "none", width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.22)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>
                    {site.domain.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 12.5, fontWeight: 700 }}>{site.domain}</b>
                    <span style={{ display: "block", fontSize: 10.5, opacity: .85, marginTop: 2 }}>
                      {site.enabled ? "Usually replies within an hour" : "Currently offline"}
                    </span>
                  </span>
                  <span style={{ opacity: .8, fontSize: 13 }}>✕</span>
                </div>
                <div style={{ padding: 15, display: "flex", flexDirection: "column", gap: 9, minHeight: 220 }}>
                  <span style={{ alignSelf: "flex-start", maxWidth: "88%", background: brand, color: "#fff", borderRadius: "14px 14px 14px 4px", padding: "11px 14px", fontSize: 12.3, lineHeight: 1.6, textWrap: "pretty" }}>
                    {(greetDraft ?? site.greeting ?? "").trim() || "Hi — anything I can help with on this page?"}
                  </span>
                  <span style={{ alignSelf: "flex-end", maxWidth: "88%", background: "#fff", border: `1px solid ${LINE}`, borderRadius: "14px 14px 4px 14px", padding: "11px 14px", fontSize: 12.3, lineHeight: 1.6 }}>
                    do you design logos for ranch brands?
                  </span>
                  <span style={{ alignSelf: "flex-start", maxWidth: "88%", background: brand, color: "#fff", borderRadius: "14px 14px 14px 4px", padding: "11px 14px", fontSize: 12.3, lineHeight: 1.6, textWrap: "pretty" }}>
                    That&apos;s most of what we do — the logo work sits in our portfolio. Want me to pass you to the team?
                  </span>
                  {site.askContact && (
                    <span style={{ width: "92%", alignSelf: "flex-start", border: `1px solid ${LINE}`, background: "#fff", borderRadius: 12, padding: "12px 13px" }}>
                      <b style={{ display: "block", fontSize: 11.8, fontWeight: 700 }}>Who am I talking to?</b>
                      <span style={{ display: "block", border: `1px solid ${LINE}`, borderRadius: 7, padding: "7px 10px", fontSize: 10.5, color: "#94A3B8", marginTop: 9 }}>
                        Email — the reply goes here
                      </span>
                      <span style={{ display: "block", textAlign: "center", marginTop: 9, background: brand, color: "#fff", borderRadius: 7, padding: 7, fontSize: 10.5, fontWeight: 700 }}>
                        Save my details
                      </span>
                    </span>
                  )}
                </div>
                <div style={{ borderTop: `1px solid ${LINE}`, padding: "10px 13px", display: "flex", alignItems: "center", gap: 9, background: "#fff" }}>
                  <span style={{ flex: 1, fontSize: 11.5, color: "#94A3B8" }}>Ask a question…</span>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: brand, color: "#fff", display: "grid", placeItems: "center" }}><Icon n="send" s={14} /></span>
                </div>
                {site.branded && (
                  <div style={{ textAlign: "center", padding: 8, fontSize: 10, color: "#94A3B8", background: "#F8FAFC", borderTop: `1px solid ${LINE}` }}>
                    Add AI chat to your site. Free with Topezia.
                  </div>
                )}
              </div>
            </div>

            {recent.length > 0 && (
              <div style={{ background: NIGHT, borderRadius: 16, padding: "19px 20px", color: "#fff", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -60, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,.45),transparent 68%)" }} />
                <div style={{ position: "relative" }}>
                  <b style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>Latest from the chat</b>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 13 }}>
                    {recent.map((r) => (
                      <a key={r.id} href="/employer/inquiries" style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "#C7CEE4", textDecoration: "none" }}>
                        <span style={{ flex: "none", width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,.1)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800, color: "#fff" }}>
                          {r.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 11.8, lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.text}</span>
                          <span style={{ display: "block", fontSize: 10, color: "#7C89A8", marginTop: 3 }}>
                            {new Date(r.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          </span>
                        </span>
                      </a>
                    ))}
                  </div>
                  <a href="/employer/inquiries" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 15, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.16)", color: "#fff", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                    Open inbox
                  </a>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
