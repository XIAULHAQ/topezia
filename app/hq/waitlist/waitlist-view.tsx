"use client";

/**
 * The founding-employer waitlist. Lifted out of the members dashboard, where it
 * was a client-side tab with no URL of its own.
 *
 * Shares Stat/BarRow and the style object with the members view deliberately:
 * two admin tables that look subtly different is how a dashboard starts to feel
 * untended.
 */
import { useEffect, useState } from "react";
import HqShell from "../HqShell";
import { Stat, BarRow, S, fmtDate } from "../hq-dashboard";

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

const Dash = () => <span style={{ color: "#CBD5E1" }}>—</span>;

export default function WaitlistView() {
  const [data, setData] = useState<WaitlistStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hq/waitlist-stats", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed to load (${res.status})`);
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  if (error) {
    return (
      <HqShell title="Employer waitlist">
        <div style={S.errorBox}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Can&apos;t load the waitlist</p>
          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6 }}>
            {error}. Your session may have expired — <a href="/hq" style={S.link}>sign in again</a>.
          </p>
        </div>
      </HqShell>
    );
  }
  if (!data) return <HqShell title="Employer waitlist"><p style={{ color: "#64748B" }}>Loading…</p></HqShell>;

  return (
    <HqShell
      title="Employer waitlist"
      subtitle="Companies that asked for early access, and where they sit against the founding-member cap."
      counts={{ waitlist: data.totalSignups }}
    >
      <div style={S.statGrid}>
        <Stat label="Total signups" value={data.totalSignups} accent />
        <Stat label="Founding members" value={`${data.foundingMembers.count} / ${data.foundingMembers.cap}`} />
        <Stat label="Slots remaining" value={data.foundingMembers.remaining} />
      </div>

      <section style={S.section}>
        <h2 style={S.h2}>By vertical</h2>
        {data.byVertical.length === 0 ? (
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Nothing yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.byVertical.map((v) => (
              <BarRow key={v.vertical} label={VERTICAL_LABELS[v.vertical] || v.vertical} value={v.count}
                max={Math.max(...data.byVertical.map((x) => x.count), 1)} />
            ))}
          </div>
        )}
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
              {data.recentSignups.map((s) => (
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
              {data.recentSignups.length === 0 && (
                <tr><td style={S.td} colSpan={7}>No employer signups yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </HqShell>
  );
}
