/**
 * "When will someone actually answer me?" — answered honestly or not at all.
 *
 * Every chat widget on the internet says "we typically reply instantly".
 * Most of them are lying, and visitors have learned to read it as noise.
 * This computes the phrase from THIS company's own history — the median gap
 * between a message arriving and the company's first reply to it — and
 * returns null when there isn't enough history to be truthful. Silence beats
 * a comforting number nobody has earned.
 *
 * Office hours are the other half: if the owner says the team works
 * weekdays 9–5, the chat says so when it's Sunday night, instead of letting
 * someone sit there expecting an answer.
 */
import { prisma } from "@/lib/prisma";

/** Fewer replies than this and the median is noise, not a pattern. */
const MIN_SAMPLES = 3;
const SAMPLE_SIZE = 25;

export type ReplyHours = {
  /** IANA zone, e.g. "America/New_York". */
  tz: string;
  /** ISO weekdays the team works: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** "HH:MM", 24h, in tz. */
  start: string;
  end: string;
};

/**
 * A human phrase for how fast this company actually replies, or null when
 * we don't know. Deliberately vague buckets: the median is real, but
 * promising "within 42 minutes" to the next visitor would not be.
 */
export async function replyTimePhrase(companyId: string): Promise<string | null> {
  const replied = await prisma.companyInquiry.findMany({
    where: { companyId, repliedAt: { not: null } },
    orderBy: { repliedAt: "desc" },
    take: SAMPLE_SIZE,
    select: {
      createdAt: true,
      messages: {
        where: { sender: "COMPANY" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const gaps = replied
    .flatMap((r) => (r.messages[0] ? [r.messages[0].createdAt.getTime() - r.createdAt.getTime()] : []))
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  if (gaps.length < MIN_SAMPLES) return null;

  const median = gaps[Math.floor(gaps.length / 2)];
  const hours = median / 3_600_000;
  if (hours <= 1) return "usually replies within an hour";
  if (hours <= 5) return "usually replies within a few hours";
  if (hours <= 30) return "usually replies within a day";
  if (hours <= 24 * 4) return "usually replies within a couple of days";
  return null; // Slower than that is not a selling point; say nothing.
}

export function parseReplyHours(value: unknown): ReplyHours | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const tz = typeof v.tz === "string" ? v.tz : "";
  const start = typeof v.start === "string" ? v.start : "";
  const end = typeof v.end === "string" ? v.end : "";
  const days = (Array.isArray(v.days) ? v.days : []).filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7);
  if (!tz || !days.length || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return null; }
  return { tz, days, start, end };
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Is anyone there right now, and when are they back? Returns null when the
 * owner hasn't set hours — in which case the widget says nothing about
 * availability, which is the honest default.
 */
export function officeState(hours: ReplyHours | null, now = new Date()): { open: boolean; backAt: string } | null {
  if (!hours) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: hours.tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayShort = get("weekday");
  const isoDay = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayShort) + 1;
  // Intl can render midnight as "24" in some locales/zones.
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));

  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const startMin = toMin(hours.start);
  const endMin = toMin(hours.end);

  const worksToday = hours.days.includes(isoDay);
  const open = worksToday && minutes >= startMin && minutes < endMin;
  if (open) return { open: true, backAt: "" };

  // Next working day: today if the shift hasn't started yet, else forward.
  const niceTime = (hhmm: string) => {
    const h = Number(hhmm.slice(0, 2));
    const m = hhmm.slice(3, 5);
    const suffix = h < 12 ? "am" : "pm";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === "00" ? `${h12}${suffix}` : `${h12}:${m}${suffix}`;
  };
  if (worksToday && minutes < startMin) return { open: false, backAt: `today at ${niceTime(hours.start)}` };

  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = ((isoDay - 1 + ahead) % 7) + 1;
    if (hours.days.includes(day)) {
      const label = ahead === 1 ? "tomorrow" : DAY_NAMES[day - 1];
      return { open: false, backAt: `${label} at ${niceTime(hours.start)}` };
    }
  }
  return { open: false, backAt: "" };
}

/** Hex guard for the accent colour — anything else is refused, not coerced. */
export function normalizeAccent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return null;
  return v.toLowerCase();
}

/** A darker partner for the accent, so the gradient still reads as a gradient. */
export function accentGradient(accent: string | null): string {
  if (!accent) return "linear-gradient(135deg,#8B5CF6,#3B82F6)";
  const n = parseInt(accent.slice(1), 16);
  const shade = (c: number) => Math.max(0, Math.round(c * 0.72));
  const hex = (c: number) => c.toString(16).padStart(2, "0");
  const dark = `#${hex(shade((n >> 16) & 255))}${hex(shade((n >> 8) & 255))}${hex(shade(n & 255))}`;
  return `linear-gradient(135deg,${accent},${dark})`;
}
