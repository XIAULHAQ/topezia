"use client";

/**
 * Trucking questionnaire (spec §3.4) — the no-resume entry path for drivers.
 * 8 answers → same Profile shape → same /feed. Single screen, big tap targets
 * (drivers fill this on a phone), mirrors /onboard's look.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

const INDIGO = "#4f46e5";
const INK = "#1a1a2e";
const MUTED = "#6b7280";

type Opt = { value: string; label: string };

const CDL: Opt[] = [
  { value: "A", label: "Class A" },
  { value: "B", label: "Class B" },
  { value: "C", label: "Class C" },
  { value: "NONE", label: "No CDL yet" },
];
const ENDORSEMENTS: Opt[] = [
  { value: "HAZMAT", label: "Hazmat (H)" },
  { value: "TANKER", label: "Tanker (N)" },
  { value: "DOUBLES_TRIPLES", label: "Doubles/Triples (T)" },
  { value: "PASSENGER", label: "Passenger (P)" },
  { value: "SCHOOL_BUS", label: "School Bus (S)" },
];
const ROUTES: Opt[] = [
  { value: "OTR", label: "OTR / Long-haul" },
  { value: "REGIONAL", label: "Regional" },
  { value: "LOCAL", label: "Local" },
];
const HOME: Opt[] = [
  { value: "DAILY", label: "Home daily" },
  { value: "WEEKLY", label: "Home weekly" },
  { value: "BIWEEKLY", label: "Out 2–3 weeks" },
];
const FREIGHT: Opt[] = [
  { value: "DRY_VAN", label: "Dry Van" },
  { value: "REEFER", label: "Reefer" },
  { value: "FLATBED", label: "Flatbed" },
  { value: "TANKER", label: "Tanker" },
  { value: "AUTO_CARRIER", label: "Auto Hauling" },
  { value: "INTERMODAL", label: "Intermodal" },
  { value: "OVERSIZE", label: "Oversize" },
];

export default function DriveClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cdlClass, setCdlClass] = useState<string>("");
  const [endorsements, setEndorsements] = useState<string[]>([]);
  const [yearsDriving, setYearsDriving] = useState("");
  const [routePreference, setRoutePreference] = useState<string>("");
  const [homeTime, setHomeTime] = useState<string>("");
  const [freight, setFreight] = useState<string[]>([]);
  const [cleanRecord, setCleanRecord] = useState<boolean | null>(null);
  const [payFloor, setPayFloor] = useState("");
  const [payPeriod, setPayPeriod] = useState("YEAR");
  const [location, setLocation] = useState("");

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const ready = cdlClass && routePreference && homeTime && yearsDriving.trim() !== "";

  async function submit() {
    if (!ready) {
      setError("Please answer CDL class, years driving, route, and home-time.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cdlClass,
          endorsements,
          yearsDriving: parseInt(yearsDriving, 10),
          routePreference,
          homeTime,
          freight,
          cleanRecord: cleanRecord === true,
          payFloor: payFloor ? parseInt(payFloor, 10) : null,
          payPeriod,
          location: location.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push("/feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={S.brand}>topezia</div>
        <h1 style={S.h1}>Drive for a living? Skip the resume.</h1>
        <p style={S.sub}>
          Eight quick questions — we&apos;ll match you to real routes and tell you why each one fits.
          No resume, no account needed to start.
        </p>

        {/* 1. CDL class */}
        <div style={S.card}>
          <div style={S.q}>1. What CDL do you hold?</div>
          <div style={S.chips}>
            {CDL.map((o) => (
              <button key={o.value} style={cdlClass === o.value ? S.pillOn : S.pillOff} onClick={() => setCdlClass(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Endorsements */}
        <div style={S.card}>
          <div style={S.q}>2. Any endorsements? <span style={S.opt}>optional — tap all you hold</span></div>
          <div style={S.chips}>
            {ENDORSEMENTS.map((o) => (
              <button key={o.value} style={endorsements.includes(o.value) ? S.pillOn : S.pillOff} onClick={() => toggle(endorsements, o.value, setEndorsements)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Years driving */}
        <div style={S.card}>
          <div style={S.q}>3. How many years have you been driving?</div>
          <input
            style={S.numInput}
            type="number"
            min={0}
            max={60}
            inputMode="numeric"
            placeholder="e.g. 6"
            value={yearsDriving}
            onChange={(e) => setYearsDriving(e.target.value)}
          />
        </div>

        {/* 4. Route preference */}
        <div style={S.card}>
          <div style={S.q}>4. What kind of routes do you want?</div>
          <div style={S.chips}>
            {ROUTES.map((o) => (
              <button key={o.value} style={routePreference === o.value ? S.pillOn : S.pillOff} onClick={() => setRoutePreference(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Home time */}
        <div style={S.card}>
          <div style={S.q}>5. How much home time do you need?</div>
          <div style={S.chips}>
            {HOME.map((o) => (
              <button key={o.value} style={homeTime === o.value ? S.pillOn : S.pillOff} onClick={() => setHomeTime(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 6. Freight experience */}
        <div style={S.card}>
          <div style={S.q}>6. What freight have you hauled? <span style={S.opt}>optional</span></div>
          <div style={S.chips}>
            {FREIGHT.map((o) => (
              <button key={o.value} style={freight.includes(o.value) ? S.pillOn : S.pillOff} onClick={() => toggle(freight, o.value, setFreight)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 7. Clean record */}
        <div style={S.card}>
          <div style={S.q}>7. Clean driving record?</div>
          <div style={S.chips}>
            <button style={cleanRecord === true ? S.pillOn : S.pillOff} onClick={() => setCleanRecord(true)}>Yes</button>
            <button style={cleanRecord === false ? S.pillOn : S.pillOff} onClick={() => setCleanRecord(false)}>No / prefer not to say</button>
          </div>
        </div>

        {/* 8. Pay floor */}
        <div style={S.card}>
          <div style={S.q}>8. Your pay floor? <span style={S.opt}>optional — we hide anything below it</span></div>
          <div style={S.row}>
            <input
              style={S.numInput}
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Won't drive below"
              value={payFloor}
              onChange={(e) => setPayFloor(e.target.value)}
            />
            <select style={S.select} value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)}>
              <option value="YEAR">per year</option>
              <option value="HOUR">per hour</option>
              <option value="PER_MILE">per mile</option>
            </select>
          </div>
        </div>

        {/* Location — not one of the 8, but it scopes the feed to jobs you can take */}
        <div style={S.card}>
          <div style={S.q}>Where are you based? <span style={S.opt}>optional — helps us show routes near you</span></div>
          <input
            style={S.wideInput}
            placeholder="e.g. Dallas, TX"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        {error && <p style={S.error}>{error}</p>}
        <button style={btn(loading)} onClick={submit} disabled={loading}>
          {loading ? "Finding your routes…" : "Show my matches →"}
        </button>
        <p style={S.footnote}>
          Have a resume instead? <a href="/onboard" style={S.link}>Upload it here.</a> Edit any of this later from your feed.
        </p>
      </div>
    </main>
  );
}

const btn = (disabled: boolean): CSSProperties => ({
  width: "100%", padding: "15px 20px", marginTop: 20, fontSize: 16, fontWeight: 700,
  fontFamily: "var(--font-jakarta), sans-serif", color: "#fff",
  background: disabled ? "#c7c7d1" : INDIGO, border: "none", borderRadius: 12,
  cursor: disabled ? "default" : "pointer",
});

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f7f7fb", fontFamily: "var(--font-jakarta), sans-serif", color: INK, padding: "40px 16px" },
  wrap: { maxWidth: 640, margin: "0 auto" },
  brand: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 22, color: INDIGO, marginBottom: 28 },
  h1: { fontFamily: "var(--font-sora), sans-serif", fontWeight: 800, fontSize: 30, margin: "0 0 8px" },
  sub: { color: MUTED, fontSize: 16, margin: "0 0 20px", lineHeight: 1.5 },
  card: { background: "#fff", border: "1px solid #ececf2", borderRadius: 16, padding: 20, marginBottom: 14 },
  q: { fontSize: 16, fontWeight: 700, marginBottom: 12 },
  opt: { fontSize: 13, fontWeight: 500, color: MUTED },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  pillOn: { padding: "10px 15px", borderRadius: 999, border: `1px solid ${INDIGO}`, background: INDIGO, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  pillOff: { padding: "10px 15px", borderRadius: 999, border: "1px solid #d9d9e3", background: "#fff", color: INK, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  row: { display: "flex", gap: 10, flexWrap: "wrap" },
  numInput: { flex: 1, minWidth: 140, padding: "11px 13px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e2ea", fontFamily: "inherit", boxSizing: "border-box" },
  wideInput: { width: "100%", padding: "11px 13px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e2ea", fontFamily: "inherit", boxSizing: "border-box" },
  select: { padding: "11px 13px", fontSize: 15, borderRadius: 10, border: "1px solid #e2e2ea", background: "#fff", fontFamily: "inherit" },
  error: { color: "#dc2626", fontSize: 14, marginTop: 10 },
  footnote: { textAlign: "center", color: MUTED, fontSize: 13, marginTop: 14, lineHeight: 1.6 },
  link: { color: INDIGO, fontWeight: 700, textDecoration: "none" },
};
