"use client";

/**
 * The review queue UI.
 *
 * Two things this deliberately shows that a "flagged content" list usually
 * hides: the SCORE and the REASONS. A queue that just says "suspicious" trains
 * a reviewer to rubber-stamp it; showing why the scorer fired lets a human
 * disagree with it, which is the entire point of having a human here — the
 * scorer has known false positives (an iGaming marketer, a pharmacologist)
 * and "Not spam" is the button that fixes them.
 *
 * Also shows how much was actually scanned, so an empty queue can be read
 * correctly rather than as proof that nothing is wrong.
 */
import { useCallback, useEffect, useState } from "react";
import HqShell from "../HqShell";
import type { CSSProperties } from "react";

interface ProfileRow {
  id: string; slug: string | null; name: string | null; createdAt: string;
  publicVisible: boolean; spamCleared: boolean;
  score: number; reasons: string[]; wouldReject: boolean; reported: boolean;
}
interface WorkRow {
  id: string; slug: string; title: string; author: string | null; authorSlug: string | null;
  status: string; publishedAt: string | null; score: number; reasons: string[]; reported: boolean;
}
interface ReportRow {
  id: string; kind: string; targetId: string; reason: string; note: string | null;
  reporterUserId: string | null; createdAt: string;
}
interface Payload {
  profiles: ProfileRow[]; works: WorkRow[]; reports: ReportRow[];
  threshold: number; scanned: { profiles: number; works: number; limit: number };
}

const REASON_LABELS: Record<string, string> = {
  SPAM: "Spam or advertising",
  IMPERSONATION: "Impersonation",
  OFFENSIVE: "Offensive or abusive",
  NOT_THEIR_WORK: "Not their work",
  OTHER: "Something else",
};

export default function SpamQueue() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hq/spam", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setErr(null);
    } catch {
      setErr("Couldn't load the queue.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string, id: string, note?: string) {
    setBusy(`${action}:${id}`);
    try {
      await fetch("/api/hq/spam", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, note }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (err) return <HqShell title="Review queue"><p style={S.err}>{err}</p></HqShell>;
  if (!data) return <HqShell title="Review queue"><p style={S.mut}>Loading…</p></HqShell>;

  const nothing = !data.profiles.length && !data.works.length && !data.reports.length;

  return (
    <HqShell
      title="Review queue"
      subtitle="Content the scorer flagged, plus anything a visitor reported."
      counts={{ queue: data.profiles.length + data.works.length + data.reports.length }}
    >
      <p style={S.sub}>
        Everything scoring {data.threshold} or above on the content scorer, plus anything a visitor
        reported. A score is a routing decision about a page, never a judgement about a person —
        the reasons are shown so you can disagree with it.
      </p>
      <p style={S.scan}>
        Scanned the {data.scanned.profiles.toLocaleString()} newest profiles and{" "}
        {data.scanned.works.toLocaleString()} newest published works (cap {data.scanned.limit.toLocaleString()} each).
        {data.scanned.profiles >= data.scanned.limit || data.scanned.works >= data.scanned.limit
          ? " The cap was reached — older rows were NOT scored this pass."
          : " That is everything there is."}
      </p>

      {nothing && <p style={S.empty}>Nothing flagged and nothing reported.</p>}

      {data.reports.length > 0 && (
        <section style={S.section}>
          <h2 style={S.h2}>Reports ({data.reports.length})</h2>
          {data.reports.map((r) => (
            <div key={r.id} style={S.card}>
              <div style={S.cardHead}>
                <strong>{REASON_LABELS[r.reason] ?? r.reason}</strong>
                <span style={S.badge}>{r.kind === "PROFILE" ? "profile" : "work"}</span>
                <span style={S.mutSm}>{r.reporterUserId ? "signed-in reporter" : "anonymous"}</span>
                <span style={S.mutSm}>{new Date(r.createdAt).toLocaleString("en-GB")}</span>
              </div>
              {r.note && <p style={S.note}>{r.note}</p>}
              <div style={S.actions}>
                <button style={S.btn} disabled={busy === `resolve-report:${r.id}`} onClick={() => act("resolve-report", r.id, "reviewed")}>
                  {busy === `resolve-report:${r.id}` ? "…" : "Mark reviewed"}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.profiles.length > 0 && (
        <section style={S.section}>
          <h2 style={S.h2}>Profiles ({data.profiles.length})</h2>
          {data.profiles.map((p) => (
            <div key={p.id} style={S.card}>
              <div style={S.cardHead}>
                <strong>{p.name ?? "(no name)"}</strong>
                <span style={p.score >= 60 ? S.scoreHi : S.score}>score {p.score}</span>
                {p.reported && <span style={S.badgeWarn}>reported</span>}
                {p.spamCleared && <span style={S.badgeOk}>cleared</span>}
                {!p.publicVisible && <span style={S.badgeWarn}>hidden</span>}
                {p.slug && (
                  <a style={S.link} href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer">
                    /p/{p.slug} ↗
                  </a>
                )}
              </div>
              {p.reasons.length > 0 && <p style={S.reasons}>{p.reasons.join(" · ")}</p>}
              <div style={S.actions}>
                {p.spamCleared ? (
                  <button style={S.btn} onClick={() => act("unclear-profile", p.id)}>Undo &quot;not spam&quot;</button>
                ) : (
                  <button style={S.btnOk} onClick={() => act("clear-profile", p.id)}>Not spam — index it</button>
                )}
                {p.publicVisible ? (
                  <button style={S.btnBad} onClick={() => act("hide-profile", p.id)}>Hide the page</button>
                ) : (
                  <button style={S.btn} onClick={() => act("show-profile", p.id)}>Un-hide</button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.works.length > 0 && (
        <section style={S.section}>
          <h2 style={S.h2}>Published work ({data.works.length})</h2>
          {data.works.map((w) => (
            <div key={w.id} style={S.card}>
              <div style={S.cardHead}>
                <strong>{w.title}</strong>
                <span style={w.score >= 60 ? S.scoreHi : S.score}>score {w.score}</span>
                {w.reported && <span style={S.badgeWarn}>reported</span>}
                <span style={S.mutSm}>by {w.author ?? "unknown"}</span>
                <a style={S.link} href={`/portfolio/${w.slug}`} target="_blank" rel="noopener noreferrer">
                  /portfolio/{w.slug} ↗
                </a>
              </div>
              {w.reasons.length > 0 && <p style={S.reasons}>{w.reasons.join(" · ")}</p>}
              <div style={S.actions}>
                <button style={S.btnBad} onClick={() => act("unpublish-work", w.id)}>
                  Back to draft
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </HqShell>
  );
}

const LINE = "#E2E8F0";
const MUT = "#64748B";

const S: Record<string, CSSProperties> = {
  sub: { fontSize: 13.5, color: MUT, lineHeight: 1.65, margin: "0 0 6px", maxWidth: 640 },
  scan: { fontSize: 12, color: MUT, margin: "0 0 26px" },
  empty: { fontSize: 14, color: MUT, padding: "28px 0" },
  section: { marginBottom: 34 },
  h2: { fontSize: 15, fontWeight: 800, margin: "0 0 12px" },
  card: { border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, background: "#fff" },
  cardHead: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13.5 },
  reasons: { margin: "8px 0 0", fontSize: 12, color: MUT, lineHeight: 1.55 },
  note: { margin: "8px 0 0", fontSize: 13, color: "#334155", lineHeight: 1.55 },
  actions: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },
  btn: { border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, background: "#fff", color: "#334155", cursor: "pointer" },
  btnOk: { border: "1px solid #059669", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, background: "#ECFDF5", color: "#065F46", cursor: "pointer" },
  btnBad: { border: "1px solid #DC2626", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, background: "#FEF2F2", color: "#991B1B", cursor: "pointer" },
  score: { fontSize: 11, fontWeight: 700, color: "#92400E", background: "#FEF3C7", borderRadius: 999, padding: "2px 8px" },
  scoreHi: { fontSize: 11, fontWeight: 700, color: "#991B1B", background: "#FEE2E2", borderRadius: 999, padding: "2px 8px" },
  badge: { fontSize: 11, fontWeight: 600, color: MUT, background: "#F1F5F9", borderRadius: 999, padding: "2px 8px" },
  badgeWarn: { fontSize: 11, fontWeight: 700, color: "#991B1B", background: "#FEE2E2", borderRadius: 999, padding: "2px 8px" },
  badgeOk: { fontSize: 11, fontWeight: 700, color: "#065F46", background: "#ECFDF5", borderRadius: 999, padding: "2px 8px" },
  link: { fontSize: 12, color: "#4F46E5", textDecoration: "none" },
  mut: { fontSize: 14, color: MUT },
  mutSm: { fontSize: 11.5, color: MUT },
  err: { fontSize: 14, color: "#B91C1C" },
};
