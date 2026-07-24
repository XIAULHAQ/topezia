/**
 * POST /api/questionnaire — spec §3.4 (alternate entry path)
 *
 * The no-resume path. Two shapes share it, split on `kind`:
 *  - default (no kind): the trucking questionnaire, 8 answers — the original.
 *  - kind "GENERAL": role + seniority + years + location + typed skills, for
 *    anyone without a resume. See buildGeneralProfile for why it stays small.
 *
 * Both map DETERMINISTICALLY to the same Profile shape the resume flow
 * produces (no LLM), commit via createOrUpdateProfile with
 * entryPath=QUESTIONNAIRE, and drop the same anonymous-session cookie so
 * /feed finds the profile. Returns { profileId }.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createOrUpdateProfile } from "@/lib/matching/profile";
import { buildGeneralProfile, buildTruckingProfile, type GeneralAnswers, type TruckingAnswers } from "@/lib/matching/questionnaire";
import { ANON_COOKIE, ANON_COOKIE_MAX_AGE } from "@/lib/anon-session";
import { currentIdentity } from "@/lib/identity";

export const maxDuration = 60;

const SENIORITY = new Set(["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", "EXEC", "NOT_APPLICABLE"]);

/** Validate + coerce the GENERAL shape. Caps mirror the profile editor's. */
function parseGeneral(raw: Record<string, unknown>): { answers: GeneralAnswers } | { error: string } {
  const role = typeof raw.role === "string" ? raw.role.trim().slice(0, 80) : "";
  if (!role) return { error: "Pick your role." };

  const seniority = typeof raw.seniority === "string" && SENIORITY.has(raw.seniority) ? raw.seniority : null;
  if (!seniority) return { error: "Pick your seniority." };

  const years = Number(raw.yearsExperience);
  if (!Number.isFinite(years) || years < 0 || years > 60) return { error: "Enter your years of experience." };

  const skills = Array.isArray(raw.skills)
    ? [...new Set(raw.skills.filter((x): x is string => typeof x === "string").map((x) => x.trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean))].slice(0, 15)
    : [];
  if (skills.length === 0) return { error: "Add at least one skill — it's what we match on." };

  return {
    answers: {
      fullName: typeof raw.fullName === "string" ? raw.fullName.trim().slice(0, 120) || null : null,
      location: typeof raw.location === "string" ? raw.location.trim().slice(0, 120) || null : null,
      role,
      seniority: seniority as GeneralAnswers["seniority"],
      yearsExperience: Math.round(years),
      skills,
    },
  };
}

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

  // The GENERAL shape carries kind explicitly; the trucking form predates the
  // split and stays the unmarked default so /drive needs no change.
  const isGeneral = !!raw && typeof raw === "object" && (raw as Record<string, unknown>).kind === "GENERAL";

  let built: { parsed: ReturnType<typeof buildTruckingProfile>["parsed"]; preferences: ReturnType<typeof buildTruckingProfile>["preferences"]; resumeText: string };
  if (isGeneral) {
    const g = parseGeneral(raw as Record<string, unknown>);
    if ("error" in g) return NextResponse.json({ error: g.error }, { status: 400 });
    built = buildGeneralProfile(g.answers);
  } else {
    const parsed = parseAnswers(raw);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    built = buildTruckingProfile(parsed.answers);
  }
  const { parsed: parsedProfile, preferences, resumeText } = built;

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
