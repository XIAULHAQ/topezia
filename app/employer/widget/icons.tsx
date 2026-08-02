/**
 * The Chat Settings design's icon set, ported path-for-path.
 *
 * Same 24×24 grid, round caps and joins as the rest of the design system, so
 * a 13px KPI glyph and a 17px section glyph read as one family.
 */
const P: Record<string, string[]> = {
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  user: ["M4 21v-1.5A5.5 5.5 0 0 1 9.5 14h5a5.5 5.5 0 0 1 5.5 5.5V21", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  brief: ["M3 8h18v12H3z", "M9 8V5h6v3"],
  money: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.5 0-2.5.8-2.5 2s1 1.8 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.3",
    "M12 6.2v11.6",
  ],
  plus: ["M12 5v14", "M5 12h14"],
  power: ["M12 4v8", "M7 6.5a7 7 0 1 0 10 0"],
  code: ["M9 7l-5 5 5 5", "M15 7l5 5-5 5"],
  globe: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M3 12h18",
    "M12 3c2.6 2.6 3.9 5.6 3.9 9S14.6 18.4 12 21c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z",
  ],
  refresh: ["M20 11a8 8 0 1 0-.7 4.5", "M20 5v6h-6"],
  palette: [
    "M12 21a9 9 0 1 1 0-18c4.5 0 8 3 8 6.5 0 2.5-2 4-4.5 4H14a1.6 1.6 0 0 0-1.1 2.8A1.9 1.9 0 0 1 12 21z",
    "M7.5 11.5h.01",
    "M10.5 8h.01",
    "M15 8.5h.01",
  ],
  chat: ["M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  truck: [
    "M3 6h11v9H3z",
    "M14 9h4l3 3v3h-7",
    "M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  ],
  book: ["M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z", "M4 20.5V5.5"],
  alert: ["M12 4l9 16H3l9-16z", "M12 10v4", "M12 17h.01"],
  chart: ["M4 20V9", "M10 20V4", "M16 20v-7", "M22 20H2"],
  copy: ["M9 9h11v11H9z", "M15 9V4H4v11h5"],
  down: ["M12 4v11", "M7.5 11.5L12 16l4.5-4.5", "M4 20h16"],
  send: ["M4 12l16-8-6 8 6 8-16-8z"],
  tick: ["M4 12.5l5 5L20 6.5"],
  bolt: ["M13 3L5 14h6l-1 7 8-11h-6l1-7z"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
};

export type IconName = keyof typeof P;

export function Icon({ n, s = 17, w = 1.8 }: { n: IconName; s?: number; w?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
      aria-hidden
    >
      {P[n].map((d, i) => <path d={d} key={i} />)}
    </svg>
  );
}
