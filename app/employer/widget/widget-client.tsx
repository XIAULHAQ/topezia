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
  pagesCrawled: number;
  crawledAt: string | null;
  crawlError: string | null;
  usage: { used: number; limit: number };
  limits: { pages: number; aiRepliesPerMonth: number };
};

export default function WidgetClient() {
  const [gate, setGate] = useState<"auth" | "company" | null>(null);
  const [site, setSite] = useState<Site | null | undefined>(undefined); // undefined = loading
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
              </span>
              <button type="button" style={site.enabled ? ES.btnDanger : ES.btn} onClick={toggle}>
                {site.enabled ? "Turn off" : "Turn on"}
              </button>
            </div>
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
