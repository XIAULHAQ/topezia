/**
 * Pure display helpers for a SeoJob card — shared between the server-rendered
 * SeoPageView and the client-side JobsInteractive filter/group UI so both
 * describe "where" and "how much" the exact same way.
 */
import type { SeoJob } from "./pages";

/**
 * These helpers only ever read location, salary and remote fields, so they take
 * the row WITHOUT `descriptionRaw`. That keeps them usable from the client
 * component, which deliberately never receives descriptions — see CardJob in
 * app/jobs/_components/JobsInteractive.tsx. A full SeoJob still satisfies this.
 */
type DisplayJob = Omit<SeoJob, "descriptionRaw">;

export const label = (s: string) =>
  s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us", "US");

const REGION_LABEL: Record<string, string> = {
  GLOBAL: "Anywhere", EMEA: "EMEA", APAC: "APAC", LATAM: "LatAm", ANZ: "ANZ",
  EUROPE: "Europe", NORTH_AMERICA: "North America",
};

/**
 * Where the job is, in words a reader recognises.
 *
 * label(remoteType) rendered REMOTE_INTL as "Remote Intl" — raw enum, and on a
 * UK page it called a UK-remote job "international". Say the actual scope.
 */
export function placeLabel(j: DisplayJob): string {
  if (!j.remoteType.startsWith("REMOTE")) {
    return j.locationState || REGION_LABEL[j.remoteScope ?? ""] || j.country || label(j.remoteType);
  }
  const scope = j.remoteScope;
  if (!scope) return "Remote";
  if (scope === "US") return "Remote (US)";
  return `Remote (${REGION_LABEL[scope] ?? scope})`;
}

const CUR_SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹", PKR: "Rs", AUD: "A$", CAD: "C$", AED: "AED ", SAR: "SAR " };

/**
 * Pay, in the currency it was actually posted in.
 *
 * Projects carry a fixed budget for the whole engagement rather than a salary,
 * and it is never FX-converted — showing a client's PKR budget as dollars
 * would invent a number nobody agreed to.
 */
export function salaryText(j: DisplayJob): string | null {
  if (j.salaryMin == null || j.salaryMax == null) return null;
  const sym = CUR_SYM[j.salaryCurrency] ?? `${j.salaryCurrency} `;
  const unit =
    j.salaryPeriod === "HOUR" ? "/hr"
    : j.salaryPeriod === "PROJECT" ? " budget"
    : j.salaryPeriod === "YEAR" ? "/yr" : "";
  const fmt = (n: number) => (n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`);
  return `${fmt(j.salaryMin)}–${fmt(j.salaryMax)}${unit}`;
}

export function freshness(d: Date): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 3.6e6));
  if (h < 1) return "verified just now";
  if (h < 48) return `verified ${h}h ago`;
  return `verified ${Math.round(h / 24)}d ago`;
}

/**
 * Yearly-USD salary tier for the facet sidebar. Anything posted hourly, per
 * project, or in another currency is left out rather than force-converted or
 * mis-bucketed — an honest "not counted here" beats a wrong number.
 */
export function salaryBandOf(j: DisplayJob): string | null {
  if (j.salaryPeriod !== "YEAR" || j.salaryCurrency !== "USD" || j.salaryMax == null) return null;
  const v = j.salaryMax;
  if (v >= 150000) return "$150k+";
  if (v >= 100000) return "$100k – $150k";
  if (v >= 50000) return "$50k – $100k";
  return "Under $50k";
}

export const SALARY_BAND_ORDER = ["$150k+", "$100k – $150k", "$50k – $100k", "Under $50k"];
