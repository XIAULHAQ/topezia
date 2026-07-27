"use client";

/**
 * Relocation fit — appears only when this specific match crosses a border for
 * the signed-in viewer (see lib/relocation/build.ts for the condition).
 *
 * Deliberately renders nothing while loading, not a skeleton: unlike
 * MatchCard, which always ends up showing something, most job views resolve
 * to "not applicable" here (a domestic match), and a skeleton that then
 * collapses to nothing on the common case is a layout-shift annoyance for no
 * benefit. It simply pops in once data confirms there's something real to say.
 *
 * Every figure is either a live currency conversion or a link to the
 * destination country's own official immigration authority — nothing here is
 * generated, and nothing claims a visa pathway exists or that the viewer
 * qualifies for one.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { SalaryPeriod } from "@prisma/client";

const INK = "#1a1a2e";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const TINT_BG = "#EEF2FF";
const TINT_TEXT = "#4338CA";

interface Card {
  originCountry: string;
  destCountry: string;
  salary: { min: number | null; max: number | null; currency: string; originalCurrency: string; period: SalaryPeriod | null } | null;
  visa: { label: string; url: string } | null;
}

const PERIOD_LABEL: Record<SalaryPeriod, string> = { YEAR: "/yr", HOUR: "/hr", DAY: "/day", PER_MILE: "/mile", PROJECT: "/project" };

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`; // an unrecognized ISO code should never crash the card
  }
}

export default function RelocationCard({ jobId }: { jobId: string }) {
  const [card, setCard] = useState<Card | null>(null);

  useEffect(() => {
    fetch(`/api/relocation/${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.show && d?.card) setCard(d.card); })
      .catch(() => {});
  }, [jobId]);

  if (!card) return null;

  const { salary, visa } = card;
  const period = salary?.period ? PERIOD_LABEL[salary.period] : "";
  const range = salary
    ? salary.min != null && salary.max != null
      ? `${formatMoney(salary.min, salary.currency)}–${formatMoney(salary.max, salary.currency)}${period}`
      : `${formatMoney((salary.min ?? salary.max)!, salary.currency)}${period}`
    : null;

  return (
    <section style={S.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={S.h2}>Relocation fit</h2>
        <span style={S.pill}>{card.originCountry} → {card.destCountry}</span>
      </div>

      {range && (
        <div style={{ marginBottom: visa ? 14 : 0 }}>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 3 }}>This role&rsquo;s range in your currency</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>{range}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>Converted from {salary!.originalCurrency} at today&rsquo;s exchange rate — approximate.</div>
        </div>
      )}

      {visa && (
        <div style={{ paddingTop: range ? 13 : 0, borderTop: range ? `1px solid ${LINE}` : "none" }}>
          <a href={visa.url} target="_blank" rel="noopener noreferrer" style={S.link}>
            Learn about work visas — {visa.label} ↗
          </a>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>General information from the official authority — not immigration advice specific to you.</div>
        </div>
      )}
    </section>
  );
}

const S: Record<string, CSSProperties> = {
  card: { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "22px 24px", margin: "18px 0" },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, color: INK },
  pill: { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: TINT_BG, color: TINT_TEXT },
  link: { fontSize: 13.5, fontWeight: 700, color: "#4f46e5", textDecoration: "none" },
};
