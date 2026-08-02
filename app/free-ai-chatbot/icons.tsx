/**
 * The design's icon set, ported path-for-path from the .dc.html source.
 *
 * Every glyph is drawn on a 24×24 grid with round caps and joins, so they all
 * share a weight. Sizes and stroke widths are passed in because the design
 * uses the same glyph at 11px inside a tick and 19px inside a step card.
 */
const P: Record<string, string[]> = {
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  play: ["M8 5.5l11 6.5-11 6.5z"],
  link: [
    "M10 13a5 5 0 0 0 7.5.5l2-2A5 5 0 0 0 12.5 4.5l-1 1",
    "M14 11a5 5 0 0 0-7.5-.5l-2 2A5 5 0 0 0 11.5 19.5l1-1",
  ],
  tick: ["M4 12.5l5 5L20 6.5"],
  no: ["M6 6l12 12", "M18 6L6 18"],
  globe: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M3 12h18",
    "M12 3c2.6 2.6 3.9 5.6 3.9 9S14.6 18.4 12 21c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z",
  ],
  code: ["M9 7l-5 5 5 5", "M15 7l5 5-5 5"],
  inbox: ["M3 13h5l2 3h4l2-3h5", "M5 5h14l2 8v6H3v-6z"],
  cart: [
    "M3 4h2l2.4 11h10L20 7H6",
    "M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  ],
  box: ["M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z", "M4 7.5l8 4.5 8-4.5", "M12 12v9"],
  user: ["M4 21v-1.5A5.5 5.5 0 0 1 9.5 14h5a5.5 5.5 0 0 1 5.5 5.5V21", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  shield: ["M12 3l7.5 3v6c0 4.2-3 7.6-7.5 9-4.5-1.4-7.5-4.8-7.5-9V6L12 3z", "M9 12.2l2.2 2.2L15.5 10"],
  palette: [
    "M12 21a9 9 0 1 1 0-18c4.5 0 8 3 8 6.5 0 2.5-2 4-4.5 4H14a1.6 1.6 0 0 0-1.1 2.8A1.9 1.9 0 0 1 12 21z",
    "M7.5 11.5h.01",
    "M10.5 8h.01",
    "M15 8.5h.01",
  ],
  bell: ["M18 9a6 6 0 1 0-12 0c0 5-2 7-2 7h16s-2-2-2-7z", "M10.5 20a2 2 0 0 0 3 0"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  book: ["M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z", "M4 20.5V5.5"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  mic: ["M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z", "M5.5 11a6.5 6.5 0 0 0 13 0", "M12 18v3"],
  layers: ["M12 3l9 5-9 5-9-5 9-5z", "M3 13l9 5 9-5", "M3 17l9 5 9-5"],
  power: ["M12 4v8", "M7 6.5a7 7 0 1 0 10 0"],
  lang: ["M4 6h11", "M9 4v2c0 4-2 7-5 8.5", "M7 10c1.5 2.5 3.8 4.2 6 5", "M12.5 20l4-9 4 9", "M14 17h5"],
  sound: ["M5 10v4h3l4 3V7l-4 3H5z", "M16 9.5a3.5 3.5 0 0 1 0 5", "M18.5 7a7 7 0 0 1 0 10"],
  truck: [
    "M3 6h11v9H3z",
    "M14 9h4l3 3v3h-7",
    "M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  ],
  chart: ["M4 20V9", "M10 20V4", "M16 20v-7", "M22 20H2"],
};

export type IconName = keyof typeof P;

export function Icon({ n, s = 15, w = 1.8 }: { n: IconName; s?: number; w?: number }) {
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
