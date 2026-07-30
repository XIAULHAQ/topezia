"use client";

/**
 * /hq — the members view.
 *
 * Rendered only after app/hq/page.tsx has verified the session server-side, so
 * this file never has to hold a secret. Everything here is real personal data:
 * the endpoint is uncached, the session cookie is httpOnly, and the page
 * refuses indexing.
 *
 * The employer waitlist used to live here behind a client-side tab. It is now
 * its own route (/hq/waitlist) so it has a URL and doesn't load its data on
 * every visit to this page — see HqShell.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import HqShell from "./HqShell";

type Member = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  country: string | null;
  headline: string | null;
  skillCount: number;
  hasAccount: boolean;
  createdAt: string;
  publicSlug: string | null;
  publicHidden: boolean;
};
type MemberStats = {
  total: number;
  withAccount: number;
  anonymous: number;
  newLast7d: number;
  byCountry: { country: string; count: number }[];
  listedCount: number;
  listLimit: number;
  members: Member[];
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", PK: "Pakistan", IN: "India", AE: "UAE",
  SA: "Saudi Arabia", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France",
};
export const countryLabel = (c: string) => (c === "Unknown" ? "Not set" : COUNTRY_NAMES[c] ?? c);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function HqDashboard() {
  const [data, setData] = useState<MemberStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which row is mid-delete, and what has been typed to confirm it. */
  const [pending, setPending] = useState<{ id: string; typed: string; busy: boolean; err: string | null } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hq/members", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed to load (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function confirmDelete(m: Member) {
    if (!pending) return;
    setPending({ ...pending, busy: true, err: null });
    try {
      const res = await fetch(`/api/hq/members?id=${encodeURIComponent(m.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: pending.typed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPending({ ...pending, busy: false, err: body.error || `Failed (${res.status})` });
        return;
      }
      setPending(null);
      // Say plainly which of the two things happened. "Deleted" would be a lie
      // when the login survives because the service-role key isn't configured.
      setFlash(
        body.authUserDeleted
          ? `Deleted ${m.email ?? "that anonymous profile"} — profile and login both removed.`
          : `Profile data for ${m.email ?? "that anonymous profile"} is gone, but the LOGIN still exists${
              m.email ? " and can sign in and start over" : ""
            }. ${body.authError ?? ""}`.trim()
      );
      await load();
    } catch {
      setPending({ ...pending, busy: false, err: "Couldn't reach the server." });
    }
  }

  if (error) {
    return (
      <HqShell title="Members">
        <div style={S.errorBox}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Can&apos;t load the dashboard</p>
          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>
            {error}. Your session may have expired — <a href="/hq" style={S.link}>sign in again</a>.
          </p>
        </div>
      </HqShell>
    );
  }
  if (!data) return <HqShell title="Members"><p style={{ color: "#64748B" }}>Loading…</p></HqShell>;

  return (
    <HqShell
      title="Members"
      subtitle="Everyone who has created a profile, whether or not they went on to make an account."
      counts={{ members: data.total }}
    >
      {flash && (
        <div style={S.flash}>
          <span>{flash}</span>
          <button onClick={() => setFlash(null)} style={S.flashX} aria-label="Dismiss">×</button>
        </div>
      )}

      <div style={S.statGrid}>
        <Stat label="Profiles created" value={data.total} accent />
        <Stat label="With an account" value={data.withAccount} />
        <Stat label="Anonymous (no signup yet)" value={data.anonymous} />
        <Stat label="New in last 7 days" value={data.newLast7d} />
      </div>
      <p style={S.note}>
        &ldquo;Anonymous&rdquo; are visitors who uploaded a resume but never created an account — they have no email.
        That number is your signup-conversion gap.
      </p>

      <section style={S.section}>
        <h2 style={S.h2}>By country</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.byCountry.map((c) => (
            <BarRow key={c.country} label={countryLabel(c.country)} value={c.count}
              max={Math.max(...data.byCountry.map((x) => x.count), 1)} />
          ))}
        </div>
      </section>

      <section style={S.section}>
        <h2 style={S.h2}>
          All members{data.total > data.listedCount ? ` · newest ${data.listedCount} of ${data.total}` : ""}
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th><th style={S.th}>Email</th><th style={S.th}>Country</th>
                <th style={S.th}>Role</th><th style={S.th}>Skills</th><th style={S.th}>Joined</th>
                <th style={{ ...S.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
                const open = pending?.id === m.id;
                return (
                  <tr key={m.id} style={open ? { background: "#FEF2F2" } : undefined}>
                    <td style={S.td}>{name || <Dash />}</td>
                    <td style={S.td}>
                      {m.email ? <a href={`mailto:${m.email}`} style={S.link}>{m.email}</a> : <span style={S.anon}>anonymous</span>}
                    </td>
                    <td style={S.td}>{m.country ? countryLabel(m.country) : <Dash />}</td>
                    <td style={S.td}>{m.headline ?? <Dash />}</td>
                    <td style={S.td}>{m.skillCount}</td>
                    <td style={S.td}>{fmtDate(m.createdAt)}</td>
                    <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {m.publicSlug ? (
                        <a href={`/p/${m.publicSlug}`} target="_blank" rel="noopener noreferrer" style={S.viewBtn}>
                          View ↗
                        </a>
                      ) : (
                        <span style={S.noView} title={m.publicHidden ? "Their public page is switched off" : "No public page yet"}>
                          {m.publicHidden ? "hidden" : "no page"}
                        </span>
                      )}
                      <button
                        onClick={() => setPending(open ? null : { id: m.id, typed: "", busy: false, err: null })}
                        style={S.delBtn}
                      >
                        {open ? "Cancel" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {data.members.length === 0 && <tr><td style={S.td} colSpan={7}>No profiles yet.</td></tr>}
            </tbody>
          </table>
        </div>

        {pending && (() => {
          const m = data.members.find((x) => x.id === pending.id);
          if (!m) return null;
          const echo = m.email ?? "anonymous";
          return (
            <div style={S.confirm}>
              <p style={S.confirmHead}>
                Delete {m.firstName ? `${m.firstName}'s` : "this"} account and everything on it?
              </p>
              <p style={S.confirmBody}>
                Their profile, skills, portfolio, publications, recommendations and applications go with it.
                This cannot be undone, and there is no export first — take one from{" "}
                <code style={S.code}>/api/account</code> beforehand if you might need it.
              </p>
              {/* Typing the address, not just clicking OK. A dialog stops a
                  misclick; it does nothing about deleting the wrong row. */}
              <label style={S.confirmLabel}>
                Type <strong>{echo}</strong> to confirm
              </label>
              <input
                autoFocus
                value={pending.typed}
                onChange={(e) => setPending({ ...pending, typed: e.target.value, err: null })}
                placeholder={echo}
                style={S.confirmInput}
              />
              {pending.err && <p style={S.confirmErr}>{pending.err}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => confirmDelete(m)}
                  disabled={pending.busy || pending.typed.trim().toLowerCase() !== echo.toLowerCase()}
                  style={{
                    ...S.confirmGo,
                    opacity: pending.busy || pending.typed.trim().toLowerCase() !== echo.toLowerCase() ? 0.45 : 1,
                  }}
                >
                  {pending.busy ? "Deleting…" : "Delete permanently"}
                </button>
                <button onClick={() => setPending(null)} style={S.confirmCancel}>Keep them</button>
              </div>
            </div>
          );
        })()}
      </section>
    </HqShell>
  );
}

const Dash = () => <span style={{ color: "#CBD5E1" }}>—</span>;

export function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{ ...S.stat, ...(accent ? { borderColor: "#C7D2FE", background: "#F5F3FF" } : {}) }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? "#4F46E5" : "#0F172A" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

export function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 150, fontSize: 13, color: "#334155", flex: "none" }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "#F1F5F9", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${(value / max) * 100}%`, height: "100%", background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", borderRadius: 999 }} />
      </div>
      <div style={{ width: 40, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

export const S: Record<string, CSSProperties> = {
  note: { fontSize: 12.5, color: "#64748B", lineHeight: 1.6, margin: "12px 0 0" },
  h2: { fontSize: 15, fontWeight: 700, margin: "0 0 14px" },
  section: { marginTop: 30, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 22 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(190px,100%),1fr))", gap: 14 },
  stat: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "18px 20px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #E2E8F0", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748B", whiteSpace: "nowrap" },
  td: { padding: "11px 12px", borderBottom: "1px solid #F1F5F9", verticalAlign: "middle" },
  link: { color: "#4F46E5", textDecoration: "none" },
  anon: { color: "#94A3B8", fontStyle: "italic" },
  errorBox: { background: "#fff", border: "1px solid #FECACA", borderRadius: 14, padding: 22, maxWidth: 560 },
  code: { background: "#F1F5F9", padding: "2px 6px", borderRadius: 5, fontSize: 12.5 },
  viewBtn: { display: "inline-block", border: "1px solid #E2E8F0", borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 600, color: "#334155", textDecoration: "none", marginRight: 6 },
  noView: { display: "inline-block", fontSize: 11.5, color: "#94A3B8", marginRight: 6 },
  delBtn: { border: "1px solid #FECACA", background: "#fff", color: "#B91C1C", borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  confirm: { marginTop: 18, border: "1px solid #FECACA", background: "#FEF2F2", borderRadius: 12, padding: 18, maxWidth: 560 },
  confirmHead: { margin: 0, fontSize: 14, fontWeight: 800, color: "#991B1B" },
  confirmBody: { margin: "8px 0 14px", fontSize: 13, color: "#7F1D1D", lineHeight: 1.6 },
  confirmLabel: { display: "block", fontSize: 12.5, color: "#7F1D1D", marginBottom: 6 },
  confirmInput: { width: "100%", boxSizing: "border-box", border: "1px solid #FCA5A5", borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "inherit" },
  confirmErr: { margin: "8px 0 0", fontSize: 12.5, color: "#B91C1C" },
  confirmGo: { border: "none", background: "#DC2626", color: "#fff", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  confirmCancel: { border: "1px solid #E2E8F0", background: "#fff", color: "#334155", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  flash: { display: "flex", alignItems: "flex-start", gap: 12, background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", borderRadius: 12, padding: "12px 14px", fontSize: 13, lineHeight: 1.55, marginBottom: 20 },
  flashX: { border: "none", background: "none", color: "#065F46", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 0, flex: "none" },
};
