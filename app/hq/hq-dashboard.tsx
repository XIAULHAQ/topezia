"use client";

/**
 * The signed-in HQ dashboard body — rendered only after app/hq/page.tsx has
 * verified the session server-side, so this file never has to hold a secret.
 *
 * One place for both audiences: MEMBERS (job seekers who created a profile)
 * and the founding-employer WAITLIST.
 *
 * Everything below is real personal data: both endpoints are uncached, the
 * session cookie is httpOnly, and the page refuses indexing.
 */
import { useEffect, useState, type CSSProperties } from "react";

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
type WaitlistStats = {
  totalSignups: number;
  foundingMembers: { count: number; cap: number; remaining: number };
  byVertical: { vertical: string; count: number }[];
  recentSignups: {
    id: string; companyName: string; contactName: string; email: string;
    careersPageUrl: string; verticalSlug: string | null; hiringVolume: string | null;
    isFoundingMember: boolean; foundingRank: number | null; status: string; createdAt: string;
  }[];
};

const VERTICAL_LABELS: Record<string, string> = {
  "tech-software": "Tech & Software", marketing: "Marketing", "design-creative": "Design & Creative",
  "marketing-creative": "Marketing & Creative", "healthcare-allied": "Healthcare",
  "trucking-logistics": "Trucking & Logistics", other: "Other", unspecified: "Unspecified",
};

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", PK: "Pakistan", IN: "India", AE: "UAE",
  SA: "Saudi Arabia", CA: "Canada", AU: "Australia", DE: "Germany", FR: "France",
};
const countryLabel = (c: string) => (c === "Unknown" ? "Not set" : COUNTRY_NAMES[c] ?? c);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function HqDashboard() {
  const [tab, setTab] = useState<"members" | "waitlist">("members");
  const [members, setMembers] = useState<MemberStats | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The session cookie is httpOnly and rides along automatically — there is
    // no secret for this script to hold.
    const load = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed to load (${res.status})`);
      return res.json();
    };
    Promise.all([load("/api/hq/members"), load("/api/hq/waitlist-stats")])
      .then(([m, w]) => { setMembers(m); setWaitlist(w); })
      .catch((e) => setError(e.message));
  }, []);

  async function signOut() {
    await fetch("/api/hq/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/hq";
  }

  if (error) {
    return (
      <main style={S.page}>
        <div style={S.errorBox}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Can&apos;t load the dashboard</p>
          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>
            {error}. Your session may have expired — <a href="/hq" style={S.link}>sign in again</a>.
          </p>
        </div>
      </main>
    );
  }
  if (!members || !waitlist) return <main style={S.page}><p style={{ color: "#64748B" }}>Loading…</p></main>;

  return (
    <main style={S.page}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={S.h1}>Topezia HQ</h1>
          <p style={S.sub}>Members and founding-employer signups. Real personal data — uncached and excluded from search.</p>
        </div>
        <button onClick={signOut} style={S.signOut}>Sign out</button>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "22px 0 26px", flexWrap: "wrap" }}>
        <button onClick={() => setTab("members")} style={tab === "members" ? S.tabOn : S.tabOff}>
          Members · {members.total}
        </button>
        <button onClick={() => setTab("waitlist")} style={tab === "waitlist" ? S.tabOn : S.tabOff}>
          Employer waitlist · {waitlist.totalSignups}
        </button>
      </div>

      {tab === "members" ? (
        <>
          <div style={S.statGrid}>
            <Stat label="Profiles created" value={members.total} accent />
            <Stat label="With an account" value={members.withAccount} />
            <Stat label="Anonymous (no signup yet)" value={members.anonymous} />
            <Stat label="New in last 7 days" value={members.newLast7d} />
          </div>
          <p style={S.note}>
            &ldquo;Anonymous&rdquo; are visitors who uploaded a resume but never created an account — they have no email.
            That number is your signup-conversion gap.
          </p>

          <section style={S.section}>
            <h2 style={S.h2}>By country</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {members.byCountry.map((c) => (
                <BarRow key={c.country} label={countryLabel(c.country)} value={c.count}
                  max={Math.max(...members.byCountry.map((x) => x.count), 1)} />
              ))}
            </div>
          </section>

          <section style={S.section}>
            <h2 style={S.h2}>
              Members{members.total > members.listedCount ? ` · newest ${members.listedCount} of ${members.total}` : ""}
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>First name</th><th style={S.th}>Last name</th><th style={S.th}>Email</th>
                    <th style={S.th}>Country</th><th style={S.th}>Role</th><th style={S.th}>Skills</th><th style={S.th}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {members.members.map((m) => (
                    <tr key={m.id}>
                      <td style={S.td}>{m.firstName ?? <Dash />}</td>
                      <td style={S.td}>{m.lastName ?? <Dash />}</td>
                      <td style={S.td}>
                        {m.email ? <a href={`mailto:${m.email}`} style={S.link}>{m.email}</a> : <span style={S.anon}>anonymous</span>}
                      </td>
                      <td style={S.td}>{m.country ? countryLabel(m.country) : <Dash />}</td>
                      <td style={S.td}>{m.headline ?? <Dash />}</td>
                      <td style={S.td}>{m.skillCount}</td>
                      <td style={S.td}>{fmtDate(m.createdAt)}</td>
                    </tr>
                  ))}
                  {members.members.length === 0 && (
                    <tr><td style={S.td} colSpan={7}>No profiles yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <div style={S.statGrid}>
            <Stat label="Total signups" value={waitlist.totalSignups} accent />
            <Stat label="Founding members" value={`${waitlist.foundingMembers.count} / ${waitlist.foundingMembers.cap}`} />
            <Stat label="Slots remaining" value={waitlist.foundingMembers.remaining} />
          </div>

          <section style={S.section}>
            <h2 style={S.h2}>By vertical</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {waitlist.byVertical.map((v) => (
                <BarRow key={v.vertical} label={VERTICAL_LABELS[v.vertical] || v.vertical} value={v.count}
                  max={Math.max(...waitlist.byVertical.map((x) => x.count), 1)} />
              ))}
            </div>
          </section>

          <section style={S.section}>
            <h2 style={S.h2}>Recent signups</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Company</th><th style={S.th}>Contact</th><th style={S.th}>Vertical</th>
                    <th style={S.th}>Hiring</th><th style={S.th}>Founding</th><th style={S.th}>Careers page</th><th style={S.th}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.recentSignups.map((s) => (
                    <tr key={s.id}>
                      <td style={S.td}>{s.companyName}</td>
                      <td style={S.td}>
                        {s.contactName}<br />
                        <a href={`mailto:${s.email}`} style={S.link}>{s.email}</a>
                      </td>
                      <td style={S.td}>{s.verticalSlug ? VERTICAL_LABELS[s.verticalSlug] ?? s.verticalSlug : <Dash />}</td>
                      <td style={S.td}>{s.hiringVolume ?? <Dash />}</td>
                      <td style={S.td}>{s.isFoundingMember ? `#${s.foundingRank}` : <Dash />}</td>
                      <td style={S.td}>
                        {s.careersPageUrl
                          ? <a href={s.careersPageUrl} target="_blank" rel="noreferrer" style={S.link}>{s.careersPageUrl.replace(/^https?:\/\//, "").slice(0, 30)}</a>
                          : <Dash />}
                      </td>
                      <td style={S.td}>{fmtDate(s.createdAt)}</td>
                    </tr>
                  ))}
                  {waitlist.recentSignups.length === 0 && (
                    <tr><td style={S.td} colSpan={7}>No employer signups yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

const Dash = () => <span style={{ color: "#CBD5E1" }}>—</span>;

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{ ...S.stat, ...(accent ? { borderColor: "#C7D2FE", background: "#F5F3FF" } : {}) }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? "#4F46E5" : "#0F172A" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
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

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Sora', system-ui, sans-serif", color: "#0F172A", padding: "40px 24px 80px", maxWidth: 1100, margin: "0 auto" },
  h1: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.7px", margin: 0 },
  sub: { fontSize: 13.5, color: "#64748B", margin: "8px 0 0", lineHeight: 1.6 },
  note: { fontSize: 12.5, color: "#64748B", lineHeight: 1.6, margin: "12px 0 0" },
  h2: { fontSize: 15, fontWeight: 700, margin: "0 0 14px" },
  section: { marginTop: 34, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 22 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))", gap: 14 },
  stat: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "18px 20px" },
  tabOn: { background: "linear-gradient(135deg,#8B5CF6,#3B82F6)", color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tabOff: { background: "#fff", color: "#334155", border: "1px solid #E2E8F0", borderRadius: 999, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #E2E8F0", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748B", whiteSpace: "nowrap" },
  td: { padding: "11px 12px", borderBottom: "1px solid #F1F5F9", verticalAlign: "top" },
  link: { color: "#4F46E5", textDecoration: "none" },
  anon: { color: "#94A3B8", fontStyle: "italic" },
  errorBox: { background: "#fff", border: "1px solid #FECACA", borderRadius: 14, padding: 22, maxWidth: 560 },
  signOut: { flex: "none", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
  code: { background: "#F1F5F9", padding: "2px 6px", borderRadius: 5, fontSize: 12.5 },
};
