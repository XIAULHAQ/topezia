"use client";

/**
 * Shared design primitives for the redesigned app shell, feed and profile —
 * ported from the Topezia design system (Sora, light surfaces, dark hero
 * panels, indigo→violet gradient). One source of truth for colours, icons,
 * the brand mark and the match ring so the three surfaces stay identical.
 */
import type { CSSProperties, ReactNode } from "react";

export const C = {
  c1: "#6366F1", // gradient start (indigo)
  c2: "#8B5CF6", // gradient end (violet)
  ink: "#0F172A",
  slate: "#334155",
  mut: "#64748B",
  line: "#E2E8F0",
  bg: "#F1F5F9",
  navy: "#0F172A",
  navy2: "#1E1B4B",
};
export const GRAD = `linear-gradient(135deg, ${C.c1}, ${C.c2})`;
export const FONT = "'Sora', system-ui, sans-serif";

/** SVG path sets for the icon set (stroke, 24x24 viewBox). */
const PATHS: Record<string, string[]> = {
  home: ["M3 10 12 3l9 7v11H3V10z", "M9 21v-7h6v7"],
  feed: ["M4 4h16v16H4z", "M8 9h8", "M8 13h8", "M8 17h5"],
  search: ["M21 21l-4.35-4.35", "M11 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"],
  bookmark: ["M6 3h12v18l-6-4-6 4z"],
  briefcase: ["M4 8h16v12H4z", "M9 8V5h6v3"],
  chat: ["M4 4h16v12H7l-3 3z"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"],
  doc: ["M6 2h9l4 4v16H6z", "M14 2v5h5"],
  gauge: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  spark: ["M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"],
  settings: ["M4 7h10", "M18 7h2", "M14 4.5v5", "M4 17h2", "M10 17h10", "M10 14.5v5"],
  logout: ["M9 4H5v16h4", "M15 8l4 4-4 4", "M19 12H9"],
  bell: ["M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z", "M10 20a2 2 0 0 0 4 0"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M3 12h18", "M12 3c3 3.5 3 14.5 0 18", "M12 3c-3 3.5-3 14.5 0 18"],
  pin: ["M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z", "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  linkedin: ["M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4V8h4v2", "M2 9h4v12H2z", "M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  github: ["M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.5 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.5 3.3 6.6 6.4 7A3.4 3.4 0 0 0 9 18.1V22"],
  check: ["M4 12l5 5L20 7"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  star: ["M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-3-5.5 3 1-6.1L3 9.5l6.3-.9z"],
  zap: ["M13 2L4 14h6l-1 8 9-12h-6z"],
  award: ["M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M8.5 14L7 22l5-3 5 3-1.5-8"],
  plus: ["M12 5v14", "M5 12h14"],
  trend: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
  share: ["M4 12v8h16v-8", "M12 3v12", "M8 7l4-4 4 4"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  grad: ["M2 9l10-5 10 5-10 5z", "M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"],
  chev: ["M6 9l6 6 6-6"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  coins: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M15 9.5c-.6-1-1.7-1.5-3-1.5-1.8 0-3 1-3 2s1 1.7 3 2 3 1 3 2-1.2 2-3 2c-1.3 0-2.4-.5-3-1.5", "M12 6.5v11"],
  sliders: ["M4 7h10", "M18 7h2", "M14 4.5v5", "M4 17h2", "M10 17h10", "M10 14.5v5"],
  panel: ["M4 4h16v16H4z", "M9.5 4v16"],
  arrowR: ["M5 12h14", "M13 6l6 6-6 6"],
};

export function Icon({ name, size = 17, color }: { name: keyof typeof PATHS | string; size?: number; color?: string }) {
  const paths = PATHS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** The topezia infinity brand mark (gradient), used in the sidebar. */
export function BrandMark({ size = 26 }: { size?: number }) {
  const w = (size / 26) * 36;
  const gid = "tzbrand";
  return (
    <svg width={w} height={size} viewBox="0 0 36 26" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.c1} />
          <stop offset="1" stopColor={C.c2} />
        </linearGradient>
      </defs>
      <circle cx="10.5" cy="13" r="7.2" stroke={`url(#${gid})`} strokeWidth="4.2" fill="none" />
      <circle cx="25.5" cy="13" r="7.2" stroke={`url(#${gid})`} strokeWidth="4.2" fill="none" />
    </svg>
  );
}

/**
 * Circular match ring (0–100). Gradient arc on a light track, number centred.
 * `pending` renders a muted, indeterminate-looking ring for un-scored cards.
 */
export function MatchRing({ value, size = 44, pending = false }: { value: number; size?: number; pending?: boolean }) {
  const R = 41;
  const CIRC = 2 * Math.PI * R; // 257.6
  const dash = pending ? CIRC : CIRC * (1 - Math.max(0, Math.min(100, value)) / 100);
  const gid = `mr${size}`;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.c1} />
            <stop offset="1" stopColor={C.c2} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} stroke="#EEF2FF" strokeWidth="11" fill="none" />
        {!pending && (
          <circle
            cx="50"
            cy="50"
            r={R}
            stroke={`url(#${gid})`}
            strokeWidth="11"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRC.toFixed(1)}
            strokeDashoffset={dash.toFixed(1)}
            transform="rotate(-90 50 50)"
          />
        )}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size * 0.25, fontWeight: 800, color: pending ? "#c7c7d1" : C.ink }}>
        {pending ? "…" : value}
      </div>
    </div>
  );
}

/** A small "Coming soon" / "Sample" pill — the honest label on un-backed UI. */
export function SoonTag({ label = "Soon", style }: { label?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        background: "#F1F5F9",
        color: C.mut,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.3,
        borderRadius: 999,
        padding: "2px 8px",
        border: `1px solid ${C.line}`,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

/** Card wrapper matching the design's white rounded panels. */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "22px 24px", ...style }}>
      {children}
    </section>
  );
}
