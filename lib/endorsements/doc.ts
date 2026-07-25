/**
 * Requested recommendations and reviews — the shape, the caps, and the
 * honesty rules.
 *
 * ── What this is ─────────────────────────────────────────────────────────
 * A member creates a request, gets a standing link, and sends it to people
 * themselves. Whoever opens it writes the text at /r/{token}; each signed-in
 * account can answer a given link once, and the link keeps working until the
 * member deletes it. The member can hide what comes back but can never edit
 * it — the whole value is that the words are not theirs.
 *
 * Links used to be single-use with a 60-day expiry. That guarded against a
 * leaked link back when anyone holding it could write anonymously; now that
 * every author signs in with an account that cannot be the member's, and the
 * member can revoke the link or hide any response, the expiry only punished
 * the honest case — people reasonably want one link they can keep sharing.
 *
 * ── What it is NOT ───────────────────────────────────────────────────────
 * It is not verification. We do not check that the author is who they say
 * they are: the member holds the link and could open it themselves. So the
 * UI must describe the MECHANISM ("written by the person you invited")
 * rather than assert an identity ("verified"), and must never aggregate
 * ratings into a platform score, which would imply we measured something.
 *
 * Confirming an author's email would be the next honest rung and the schema
 * has room for it; until that exists, the wording here is the guarantee.
 *
 * ── Why hiding is allowed ────────────────────────────────────────────────
 * On a real review platform you cannot delete a bad review, because the
 * platform verified the transaction. We verified nothing, so a link that
 * leaked would otherwise be a way to plant something damaging on someone's
 * profile with no recourse. Hiding stays; that is exactly why the public
 * profile says these are the ones the member chose to show.
 */
import { randomBytes } from "crypto";

export const ENDORSEMENT_LIMITS = {
  text: 1200,
  authorName: 80,
  authorRole: 100,
  sentToLabel: 80,
  requestNote: 300,
  /** Standing links one profile may hold at once — a link generator is a
   *  spam vector if it is unbounded, even when we send no email ourselves. */
  maxPending: 25,
  /** Total submitted items we will render on a profile. */
  maxShown: 20,
  /** Responses one link may collect. Well above any honest use; exists so a
   *  link posted somewhere public can't grow a profile without bound. */
  maxPerLink: 50,
} as const;

/** Standing links don't expire — sign-in + revocation are the controls — but
 *  expiresAt is NOT NULL, so they carry this sentinel instead of a branch. */
export const NEVER_EXPIRES = new Date("2100-01-01T00:00:00Z");

export type EndorsementKind = "RECOMMENDATION" | "REVIEW";

/** 32 url-safe chars — guessing is not a threat model we want to think about. */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line (the endorsement body) keeps its paragraph breaks. */
export const cleanText = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

/** 1-5, or null. A rating only means anything on a REVIEW. */
export function cleanRating(v: unknown, kind: EndorsementKind): number | null {
  if (kind !== "REVIEW") return null;
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/** What the public write page is allowed to know about the person asking. */
export interface RequestContext {
  kind: EndorsementKind;
  memberName: string;
  memberHeadline: string | null;
  memberPhotoUrl: string | null;
  requestNote: string | null;
  /** REVIEW only — the piece of work being reviewed. */
  work: { title: string; url: string; thumb: string | null } | null;
  /** True when THIS signed-in viewer already answered this link (or, for
   *  legacy single-use rows, when anyone did). The form closes kindly. */
  alreadySubmitted: boolean;
  /** Only ever true for legacy single-use links minted before links became
   *  standing; new invites carry the NEVER_EXPIRES sentinel. */
  expired: boolean;
}

/** One endorsement as rendered on a profile. */
export interface PublicEndorsement {
  id: string;
  kind: EndorsementKind;
  authorName: string;
  authorRole: string | null;
  text: string;
  rating: number | null;
  submittedAt: string;
  work: { title: string; slug: string } | null;
}
