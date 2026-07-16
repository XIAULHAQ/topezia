"use client";

/**
 * Admin waitlist dashboard — /admin/waitlist?token=YOUR_ADMIN_ACCESS_TOKEN
 *
 * Visiting with ?token= once sets a cookie so you don't have to keep the
 * token in the URL. This is deliberately simple (see lib/admin-auth.ts) —
 * fine for one admin (you); upgrade to real auth in Phase 2 alongside
 * employer accounts.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type Stats = {
  totalSignups: number;
  foundingMembers: { count: number; cap: number; remaining: number };
  byVertical: { vertical: string; count: number }[];
  byStatus: { status: string; count: number }[];
  signupsByDay: Record<string, number>;
  recentSignups: {
    id: string;
    companyName: string;
    contactName: string;
    email: string;
    careersPageUrl: string;
    verticalSlug: string | null;
    hiringVolume: string | null;
    isFoundingMember: boolean;
    foundingRank: number | null;
    status: string;
    createdAt: string;
  }[];
};

const VERTICAL_LABELS: Record<string, string> = {
  "tech-software": "Tech & Software",
  "marketing-creative": "Marketing & Creative",
  "healthcare-allied": "Healthcare",
  "trucking-logistics": "Trucking & Logistics",
  other: "Other",
  unspecified: "Unspecified",
};

export default function AdminWaitlistPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Persist ?token= into a cookie on first visit so you can bookmark
    // /admin/waitlist without the token hanging around in the URL bar.
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      document.cookie = `admin_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    }

    fetch("/api/admin/waitlist-stats", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load stats");
        return res.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main style={styles.page}>
        <div style={styles.errorBox}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Can't load the dashboard</p>
          <p style={{ fontSize: 14, color: "#64748B" }}>
            {error}. Visit <code>/admin/waitlist?token=YOUR_ADMIN_ACCESS_TOKEN</code> once to
            authenticate.
          </p>
        </div>
      </main>
    );
  }

  if (!stats) {
    return (
      <main style={styles.page}>
        <p style={{ color: "#64748B" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>Founding Employer Waitlist</h1>

      <div style={styles.statGrid}>
        <StatCard label="Total signups" value={stats.totalSignups} />
        <StatCard
          label="Founding members"
          value={`${stats.foundingMembers.count} / ${stats.foundingMembers.cap}`}
          accent
        />
        <StatCard label="Slots remaining" value={stats.foundingMembers.remaining} />
      </div>

      <section style={styles.section}>
        <h2 style={styles.h2}>By vertical</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stats.byVertical.map((v) => (
            <BarRow
              key={v.vertical}
              label={VERTICAL_LABELS[v.vertical] || v.vertical}
              value={v.count}
              max={Math.max(...stats.byVertical.map((x) => x.count), 1)}
            />
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Recent signups</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Company</th>
                <th style={styles.th}>Contact</th>
                <th style={styles.th}>Vertical</th>
                <th style={styles.th}>Hiring</th>
                <th style={styles.th}>Founding</th>
                <th style={styles.th}>Careers page</th>
                <th style={styles.th}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentSignups.map((s) => (
                <tr key={s.id}>
                  <td style={styles.td}>{s.companyName}</td>
                  <td style={styles.td}>
                    {s.contactName}
                    <br />
                    <span style={{ color: "#94A3B8", fontSize: 12 }}>{s.email}</span>
                  </td>
                  <td style={styles.td}>
                    {s.verticalSlug ? VERTICAL_LABELS[s.verticalSlug] || s.verticalSlug : "—"}
                  </td>
                  <td style={styles.td}>{s.hiringVolume || "—"}</td>
                  <td style={styles.td}>
                    {s.isFoundingMember ? (
                      <span style={styles.badge}>#{s.foundingRank}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={styles.td}>
                    <a
                      href={s.careersPageUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#6366F1" }}
                    >
                      View ↗
                    </a>
                  </td>
                  <td style={{ ...styles.td, color: "#94A3B8", fontSize: 12 }}>
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div style={{ ...styles.statCard, ...(accent ? styles.statCardAccent : {}) }}>
      <p style={{ fontSize: 12, color: accent ? "#EEEDFE" : "#64748B", marginBottom: 6 }}>
        {label}
      </p>
      <p
        style={{
          fontFamily: "'Sora', system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 26,
          color: accent ? "#fff" : "#0F172A",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(4, Math.round((value / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 160, fontSize: 13, color: "#334155", flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: "#F1F5F9", borderRadius: 6, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #6366F1, #8B5CF6)",
            height: 18,
            borderRadius: 6,
          }}
        />
      </div>
      <span style={{ width: 30, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F8FAFC",
    padding: "40px 32px",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    color: "#0F172A",
  },
  h1: {
    fontFamily: "'Sora', system-ui, sans-serif",
    fontWeight: 800,
    fontSize: 24,
    marginBottom: 24,
  },
  h2: {
    fontFamily: "'Sora', system-ui, sans-serif",
    fontWeight: 700,
    fontSize: 16,
    marginBottom: 14,
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 32,
    maxWidth: 640,
  },
  statCard: {
    background: "#fff",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: "16px 18px",
  },
  statCardAccent: {
    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
    border: "none",
  },
  section: { marginBottom: 32, maxWidth: 900 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "2px solid #E2E8F0",
    color: "#64748B",
    fontWeight: 700,
    fontSize: 12,
  },
  td: { padding: "10px 10px", borderBottom: "1px solid #F1F5F9" },
  badge: {
    background: "#EEEDFE",
    color: "#3C3489",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 100,
  },
  errorBox: {
    background: "#fff",
    border: "1px solid #FCA5A5",
    borderRadius: 12,
    padding: 20,
    maxWidth: 480,
  },
};
