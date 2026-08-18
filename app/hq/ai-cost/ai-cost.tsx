"use client";

/**
 * The AI bill, broken down. Answers the four questions Phase 0 of the cost
 * strategy (docs/ai-cost-strategy.md) exists to answer:
 *   1. how much, and is it trending up or down (daily bars by bucket)
 *   2. which FEATURE is spending it (the table — this decides what to fix)
 *   3. which SITES drive the widget cost (top 20, with plan — a free site at
 *      the top of this list is the product decision in §4 of the strategy)
 *   4. is anything failing (a wall of 400s = empty balance, see 2026-08-16)
 *
 * Costs are write-time estimates at list price; the console is the invoice.
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import HqShell from "../HqShell";
import type { CostReport } from "@/lib/llm-report";

const usd = (n: number) => (n === 0 ? "$0.00" : n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);
const num = (n: number) => n.toLocaleString();
const BUCKET_COLOR: Record<string, string> = { widget: "#4F46E5", ingestion: "#0891B2", member: "#D97706", ops: "#64748B" };

export default function AiCostClient() {
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [data, setData] = useState<CostReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetch(`/api/hq/ai-cost?days=${days}`, { cache: "no-store" });
    if (!r.ok) { setErr("Couldn't load the report."); return; }
    setData(await r.json());
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const buckets = data ? Object.entries(data.byBucket).sort((a, b) => b[1].costUsd - a[1].costUsd) : [];
  const failed = data ? data.failures.reduce((a, f) => a + f.calls, 0) : 0;

  // Daily stacked bars: one column per day, one segment per bucket.
  const dayMap = new Map<string, Record<string, number>>();
  for (const d of data?.byDay ?? []) {
    const row = dayMap.get(d.day) ?? {};
    row[d.bucket] = (row[d.bucket] ?? 0) + d.costUsd;
    dayMap.set(d.day, row);
  }
  const dayRows = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const dayMax = Math.max(0.0001, ...dayRows.map(([, r]) => Object.values(r).reduce((a, b) => a + b, 0)));

  return (
    <HqShell
      title="AI cost"
      subtitle="Every model call, by feature, day and site. Estimated at list price when the call is made — the Anthropic console is the invoice; this is the breakdown."
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          {([7, 30, 90] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} style={days === d ? S.segOn : S.seg}>{d}d</button>
          ))}
        </div>
      }
    >
      {err && <div style={S.err}>{err}</div>}
      {!data && !err && <p style={S.mut}>Loading…</p>}
      {data && (
        <>
          <section style={S.tiles}>
            <div style={S.tile}>
              <div style={S.tileLabel}>Total, last {days} days</div>
              <div style={S.tileBig}>{usd(data.totalUsd)}</div>
              <div style={S.mut}>{num(data.totalCalls)} calls</div>
            </div>
            {buckets.map(([b, v]) => (
              <div key={b} style={S.tile}>
                <div style={{ ...S.tileLabel, color: BUCKET_COLOR[b] ?? "#334155" }}>{b}</div>
                <div style={S.tileBig}>{usd(v.costUsd)}</div>
                <div style={S.mut}>{num(v.calls)} calls · {data.totalUsd > 0 ? Math.round((v.costUsd / data.totalUsd) * 100) : 0}%</div>
              </div>
            ))}
            <div style={{ ...S.tile, ...(failed > 0 ? S.tileWarn : {}) }}>
              <div style={S.tileLabel}>Failed calls</div>
              <div style={S.tileBig}>{num(failed)}</div>
              <div style={S.mut}>{data.failures.map((f) => `${f.status ?? "network"}×${f.calls}`).join(" · ") || "none"}</div>
            </div>
          </section>

          {dayRows.length > 0 && (
            <section style={{ marginBottom: 30 }}>
              <h2 style={S.h2}>By day</h2>
              <div style={S.chart}>
                {dayRows.map(([day, row]) => {
                  const total = Object.values(row).reduce((a, b) => a + b, 0);
                  return (
                    <div key={day} style={S.col} title={`${day}: ${usd(total)}`}>
                      <div style={S.barWrap}>
                        {buckets.map(([b]) => {
                          const v = row[b] ?? 0;
                          return v > 0 ? <div key={b} style={{ height: `${(v / dayMax) * 100}%`, background: BUCKET_COLOR[b] ?? "#94A3B8" }} /> : null;
                        })}
                      </div>
                      <div style={S.colLabel}>{day.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section style={{ marginBottom: 30 }}>
            <h2 style={S.h2}>By feature</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Feature</th><th style={S.th}>Bucket</th>
                    <th style={S.thNum}>Cost</th><th style={S.thNum}>Share</th><th style={S.thNum}>Calls</th>
                    <th style={S.thNum}>$/call</th><th style={S.thNum}>In tokens</th><th style={S.thNum}>Out tokens</th>
                    <th style={S.thNum}>Avg ms</th><th style={S.thNum}>Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byFeature.map((f) => (
                    <tr key={f.feature}>
                      <td style={S.td}><code style={S.code}>{f.feature}</code></td>
                      <td style={S.td}><span style={{ ...S.pill, color: BUCKET_COLOR[f.bucket] ?? "#475569" }}>{f.bucket}</span></td>
                      <td style={S.tdNum}><b>{usd(f.costUsd)}</b></td>
                      <td style={S.tdNum}>{data.totalUsd > 0 ? `${Math.round((f.costUsd / data.totalUsd) * 100)}%` : "—"}</td>
                      <td style={S.tdNum}>{num(f.calls)}</td>
                      <td style={S.tdNum}>{f.calls ? `$${(f.costUsd / f.calls).toFixed(4)}` : "—"}</td>
                      <td style={S.tdNum}>{num(f.inputTokens)}</td>
                      <td style={S.tdNum}>{num(f.outputTokens)}</td>
                      <td style={S.tdNum}>{num(f.avgLatencyMs)}</td>
                      <td style={{ ...S.tdNum, color: f.failed ? "#B42318" : undefined }}>{f.failed || "—"}</td>
                    </tr>
                  ))}
                  {data.byFeature.length === 0 && <tr><td style={S.td} colSpan={10}><span style={S.mut}>No model calls recorded in this window.</span></td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={S.h2}>Top sites by widget spend</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr><th style={S.th}>Site</th><th style={S.th}>Company</th><th style={S.th}>Plan</th><th style={S.thNum}>Cost</th><th style={S.thNum}>Calls</th><th style={S.thNum}>$/call</th></tr>
                </thead>
                <tbody>
                  {data.topSites.map((s) => (
                    <tr key={s.siteId}>
                      <td style={S.td}>{s.domain ?? <span style={S.mut}>{s.siteId.slice(0, 8)}… (deleted)</span>}</td>
                      <td style={S.td}>{s.companyName ?? "—"}</td>
                      <td style={S.td}><span style={{ ...S.pill, ...(s.plan === "FREE" || !s.plan ? S.pillFree : {}) }}>{s.plan ?? "—"}</span></td>
                      <td style={S.tdNum}><b>{usd(s.costUsd)}</b></td>
                      <td style={S.tdNum}>{num(s.calls)}</td>
                      <td style={S.tdNum}>{s.calls ? `$${(s.costUsd / s.calls).toFixed(4)}` : "—"}</td>
                    </tr>
                  ))}
                  {data.topSites.length === 0 && <tr><td style={S.td} colSpan={6}><span style={S.mut}>No site-attributed calls in this window.</span></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </HqShell>
  );
}

const S: Record<string, CSSProperties> = {
  h2: { fontSize: 15, fontWeight: 800, margin: "0 0 12px" },
  mut: { color: "#64748B", fontSize: 13 },
  err: { background: "#FEF2F2", color: "#B42318", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  seg: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: "#334155", cursor: "pointer", fontFamily: "inherit" },
  segOn: { background: "#0F172A", border: "1px solid #0F172A", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 30 },
  tile: { background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 14px" },
  tileWarn: { borderColor: "#FECACA", background: "#FEF2F2" },
  tileLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#64748B" },
  tileBig: { fontSize: 24, fontWeight: 800, color: "#0F172A", margin: "4px 0 2px", fontVariantNumeric: "tabular-nums" },
  chart: { display: "flex", alignItems: "flex-end", gap: 4, height: 140, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 12px 6px", overflowX: "auto" },
  col: { flex: "1 0 14px", minWidth: 14, display: "flex", flexDirection: "column", alignItems: "stretch", height: "100%" },
  barWrap: { flex: 1, display: "flex", flexDirection: "column-reverse", borderRadius: 3, overflow: "hidden", background: "#F8FAFC" },
  colLabel: { fontSize: 9, color: "#94A3B8", textAlign: "center", marginTop: 4, whiteSpace: "nowrap" },
  table: { borderCollapse: "collapse", width: "100%", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, fontSize: 13 },
  th: { textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#64748B", padding: "10px 12px", borderBottom: "1px solid #E2E8F0" },
  thNum: { textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#64748B", padding: "10px 12px", borderBottom: "1px solid #E2E8F0" },
  td: { padding: "9px 12px", borderBottom: "1px solid #F1F5F9", verticalAlign: "top" },
  tdNum: { padding: "9px 12px", borderBottom: "1px solid #F1F5F9", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  code: { fontSize: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: "1px 6px", color: "#334155" },
  pill: { fontSize: 11, fontWeight: 700, background: "#F1F5F9", color: "#475569", borderRadius: 999, padding: "1px 8px" },
  pillFree: { background: "#FEF3C7", color: "#92400E" },
};
