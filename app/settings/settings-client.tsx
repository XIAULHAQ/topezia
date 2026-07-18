"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";
const DANGER = "#b42318";

interface Alert { id: string; label: string; confirmedAt: string | null; frequency: string; createdAt: string }
interface Account {
  authed: boolean;
  email: string | null;
  hasResumeText: boolean;
  activity: { clicks: number; saves: number; dismissals: number };
  alerts: Alert[];
  profile: unknown;
}

export default function SettingsClient() {
  const router = useRouter();
  const [acct, setAcct] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/account");
      if (!res.ok) throw new Error();
      setAcct(await res.json());
    } catch {
      setError("Couldn't load your settings.");
    }
  }
  useEffect(() => { load(); }, []);

  async function exportData() {
    setBusy("export");
    try {
      const res = await fetch("/api/account");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "topezia-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signout");
    try {
      await createClient().auth.signOut();
      router.push("/");
    } catch {
      setError("Couldn't sign out — try again.");
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/");
    } catch {
      setError("Couldn't delete — try again.");
      setBusy(null);
    }
  }

  if (error && !acct) return <div style={S.wrap}><p style={{ color: MUTED }}>{error}</p></div>;
  if (!acct) return <div style={S.wrap}><p style={{ color: MUTED }}>Loading…</p></div>;

  return (
      <div style={S.wrap}>
        <h1 style={S.h1}>Settings</h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <p style={{ ...S.sub, margin: 0 }}>{acct.authed && acct.email ? `Signed in as ${acct.email}.` : "You're using Topezia without an account — everything lives in this browser."}</p>
          {acct.authed && <button style={S.btn} disabled={busy !== null} onClick={signOut}>{busy === "signout" ? "Signing out…" : "Sign out"}</button>}
        </div>

        <section style={S.card}>
          <div style={S.cardLabel}>Job alerts</div>
          {acct.alerts.length === 0 ? (
            <p style={S.empty}>{acct.authed ? "No active alerts." : "Sign in to manage email alerts here."}</p>
          ) : (
            acct.alerts.map((a) => (
              <div key={a.id} style={S.alertRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15 }}>{a.label}</div>
                  <div style={S.meta}>{a.confirmedAt ? `${a.frequency.toLowerCase()} · confirmed` : "awaiting confirmation"}</div>
                </div>
                <button style={S.linkBtn} disabled={busy !== null} onClick={() => post("unsubscribe-alert", { alertId: a.id })}>Unsubscribe</button>
              </div>
            ))
          )}
        </section>

        <section style={S.card}>
          <div style={S.cardLabel}>Your data</div>
          <div style={S.meta}>You've viewed {acct.activity.clicks}, saved {acct.activity.saves}, and passed on {acct.activity.dismissals} jobs.</div>
          <div style={S.actions}>
            <button style={S.btn} disabled={busy !== null} onClick={exportData}>{busy === "export" ? "Preparing…" : "Export my data"}</button>
            {acct.hasResumeText && (
              <button style={S.btn} disabled={busy !== null} onClick={() => post("delete-resume-text")}>
                {busy === "delete-resume-text" ? "Deleting…" : "Delete stored résumé text"}
              </button>
            )}
          </div>
          {!acct.hasResumeText && <div style={S.meta}>No résumé text stored.</div>}
        </section>

        <section style={S.dangerCard}>
          <div style={{ ...S.cardLabel, color: DANGER }}>Delete account</div>
          <p style={S.meta}>Removes your profile, skills, matches, and activity. Can&apos;t be undone.</p>
          {!confirmDelete ? (
            <button style={S.dangerBtn} onClick={() => setConfirmDelete(true)}>Delete everything</button>
          ) : (
            <div style={S.actions}>
              <button style={S.dangerBtn} disabled={busy !== null} onClick={deleteAccount}>{busy === "delete" ? "Deleting…" : "Yes, delete permanently"}</button>
              <button style={S.btn} disabled={busy !== null} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
        </section>

        {error && <p style={{ color: DANGER, fontSize: 14 }}>{error}</p>}
      </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "'Plus Jakarta Sans', sans-serif", color: INK },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #ececf2" },
  brand: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, textDecoration: "none" },
  navLink: { color: MUTED, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  wrap: { maxWidth: 680, margin: "0 auto", padding: "0 0 60px" },
  h1: { fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 30, margin: "0 0 8px" },
  sub: { color: MUTED, fontSize: 15, margin: "0 0 24px" },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 16 },
  dangerCard: { background: "#fff", border: "1px solid #f3d0cc", borderRadius: 16, padding: 20, marginBottom: 16 },
  cardLabel: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 12 },
  empty: { color: MUTED, fontSize: 14, margin: 0 },
  meta: { color: MUTED, fontSize: 13, lineHeight: 1.5, margin: "4px 0" },
  alertRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #f2f2f5" },
  actions: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 },
  btn: { padding: "10px 18px", background: "#fff", color: INK, border: "1px solid #d4d4d8", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  linkBtn: { padding: "6px 10px", background: "none", color: INDIGO, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  dangerBtn: { padding: "10px 18px", background: DANGER, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
};
