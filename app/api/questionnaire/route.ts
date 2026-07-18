/**
 * POST /api/questionnaire — spec §3.4 (alternate entry path, trucking)
 *
 * The no-résumé path for drivers. Takes the 8 answers, maps them to the same
 * Profile shape the résumé flow produces (deterministically — no LLM), commits
 * it via createOrUpdateProfile with entryPath=QUESTIONNAIRE, and drops the same
 * anonymous-session cookie so /feed finds the profile. Returns { profileId }.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createOrUpdateProfile } from "@/lib/matching/profile";
import { buildTruckingProfile, type TruckingAnswers } from "@/lib/matching/questionnaire";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE } from "@/lib/anon-session";
import { currentIdentity } from "@/lib/identity";

export const maxDuration = 60;

const CDL = new Set(["A", "B", "C", "NONE"]);
const ROUTES = new Set(["OTR", "REGIONAL", "LOCAL"]);
const HOME = new Set(["DAILY", "WEEKLY", "BIWEEKLY"]);
const ENDORSEMENTS = new Set(["HAZMAT", "TANKER", "DOUBLES_TRIPLES", "PASSENGER", "SCHOOL_BUS"]);
const FREIGHT = new Set(["DRY_VAN", "REEFER", "FLATBED", "TANKER", "AUTO_CARRIER", "INTERMODAL", "OVERSIZE"]);
const PERIODS = new Set(["YEAR", "HOUR", "PER_MILE"]);

/** Validate + coerce the raw body into TruckingAnswers, or return an error string. */
function parseAnswers(raw: unknown): { answers: TruckingAnswers } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Missing answers." };
  const b = raw as Record<string, unknown>;

  if (typeof b.cdlClass !== "string" || !CDL.has(b.cdlClass)) return { error: "Pick your CDL class." };
  if (typeof b.routePreference !== "string" || !ROUTES.has(b.routePreference)) return { error: "Pick a route preference." };
  if (typeof b.homeTime !== "string" || !HOME.has(b.homeTime)) return { error: "Pick your home-time." };

  const years = Number(b.yearsDriving);
  if (!Number.isFinite(years) || years < 0 || years > 60) return { error: "Enter your years driving." };

  const endorsements = Array.isArray(b.endorsements)
    ? b.endorsements.filter((e): e is string => typeof e === "string" && ENDORSEMENTS.has(e))
    : [];
  const freight = Array.isArray(b.freight)
    ? b.freight.filter((f): f is string => typeof f === "string" && FREIGHT.has(f))
    : [];

  const payFloorRaw = b.payFloor;
  const payFloor =
    payFloorRaw === null || payFloorRaw === undefined || payFloorRaw === ""
      ? null
      : Number(payFloorRaw);
  if (payFloor !== null && (!Number.isFinite(payFloor) || payFloor < 0)) return { error: "Pay floor looks off." };
  const payPeriod = typeof b.payPeriod === "string" && PERIODS.has(b.payPeriod) ? b.payPeriod : "YEAR";

  return {
    answers: {
      fullName: typeof b.fullName === "string" ? b.fullName : null,
      location: typeof b.location === "string" ? b.location : null,
      cdlClass: b.cdlClass as TruckingAnswers["cdlClass"],
      endorsements: endorsements as TruckingAnswers["endorsements"],
      yearsDriving: Math.round(years),
      routePreference: b.routePreference as TruckingAnswers["routePreference"],
      homeTime: b.homeTime as TruckingAnswers["homeTime"],
      freight: freight as TruckingAnswers["freight"],
      cleanRecord: b.cleanRecord === true,
      payFloor: payFloor === null ? null : Math.round(payFloor),
      payPeriod: payPeriod as TruckingAnswers["payPeriod"],
    },
  };
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseAnswers(raw);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { parsed: parsedProfile, preferences, resumeText } = buildTruckingProfile(parsed.answers);

  // Signed-in users key to the auth id; anonymous visitors get a one-off id in a
  // cookie (migrated to the account on later sign-in) — identical to /api/profile.
  const { userId, authed } = await currentIdentity();
  const uid = userId ?? randomUUID();

  try {
    const { profileId, embedded } = await createOrUpdateProfile({
      userId: uid,
      resumeText,
      parsed: parsedProfile,
      preferences,
      entryPath: "QUESTIONNAIRE",
    });
    const res = NextResponse.json({ profileId, embedded });
    if (!authed) {
      res.cookies.set(ANON_COOKIE, uid, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: ANON_COOKIE_MAX_AGE,
        path: "/",
      });
    }
    return res;
  } catch (err) {
    console.error("questionnaire save failed:", err);
    return NextResponse.json({ error: "Couldn't save your profile — try again." }, { status: 502 });
  }
}
