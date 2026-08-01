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
  pagesCrawled: number;
  crawledAt: string | null;
  crawlError: string | null;
  usage: { used: number; limit: number };
  limits: { pages: number; aiRepliesPerMonth: number };
};

type Fact = { id: string; question: string; answer: string; updatedAt: string };
type Gap = { question: string; count: number };

export default function WidgetClient() {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [site, setSite] = useState<Site | null | undefined>(undefined); // undefined = loading
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

  useEffect(() => {
    fetch("/api/company/widget", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { setGate("auth"); return null; }
        if (res.status === 409) { setGate("company"); return null; }
        if (!res.ok) throw new Error();
        return res.json() as Promise<{ site: Site | null }>;
      })
      .then((d) => {
        if (!d) return;
        setSite(d.site);
        if (d.site) setDomain(d.site.domain);
      })
      .catch(() => setError("Couldn't load the widget status."));
  }, []);

  useEffect(() => { loadFacts(); }, []);

  async function loadFacts() {
    try {
      const res = await fetch("/api/company/facts", { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as { facts: Fact[]; unanswered: Gap[] };
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
        body: JSON.stringify(teaching),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setTeachError(data.error ?? "Couldn't save that."); return; }
      setTeaching(null);
      await loadFacts();
    } catch {
      setTeachError("Couldn't save that.");
    } finally {
      setTeachBusy(false);
    }
  }

  async function forgetFact(id: string) {
    const res = await fetch(`/api/company/facts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setFacts((cur) => cur.filter((f) => f.id !== id));
  }

  async function scan() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = (await res.json().catch(() => ({}))) as { site?: Site; error?: string };
      if (!res.ok || !data.site) { setError(data.error ?? "Scan failed — try again."); return; }
      setSite(data.site);
      setDomain(data.site.domain);
    } catch {
      setError("Scan failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (!site) return;
    const res = await fetch("/api/company/widget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !site.enabled }),
    });
    if (res.ok) setSite({ ...site, enabled: !site.enabled });
  }

  async function toggleDigest() {
    if (!site) return;
    const res = await fetch("/api/company/widget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digestEnabled: !site.digestEnabled }),
    });
    if (res.ok) setSite({ ...site, digestEnabled: !site.digestEnabled });
  }

  const snippet = site
    ? `<script src="https://www.topezia.com/widget.js" data-topezia="${site.siteToken}" async></script>`
    : "";

  if (gate) return <EmployerGate title="Site chat" reason={gate} what="the site chat widget" />;
  if (site === undefined) {
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

      <div style={{ ...ES.card, marginBottom: 18 }}>
        <label style={ES.label}>Your website</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            style={{ ...ES.input, flex: 1, minWidth: 220 }}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yourcompany.com"
          />
          <button type="button" style={ES.btn} onClick={scan} disabled={busy || !domain.trim()}>
            {busy ? "Scanning…" : site ? "Re-scan site" : "Scan my site"}
          </button>
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
                `. Re-scan after you change the site. Free plan reads up to ${site.limits.pages} pages.`}
          </p>
        )}
      </div>

      {site && (
        <>
          <div style={{ ...ES.card, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={site.enabled ? ES.pillLive : ES.pillDraft}>{site.enabled ? "Widget is on" : "Widget is off"}</span>
              <span style={{ ...ES.empty, flex: 1, minWidth: 180 }}>
                {site.usage.used} of {site.usage.limit} AI replies used this month. After that the chat keeps
                taking messages — it just stops answering automatically.
                {site.branded && " On the free plan the chat shows a small “Add AI chat to your site. Free with Topezia.” line at the bottom."}
              </span>
              <button type="button" style={site.enabled ? ES.btnDanger : ES.btn} onClick={toggle}>
                {site.enabled ? "Turn off" : "Turn on"}
              </button>
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
