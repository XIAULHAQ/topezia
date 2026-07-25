/**
 * Requested recommendations and reviews — the shape, the caps, and the
 * honesty rules.
 *
 * ── What this is ─────────────────────────────────────────────────────────
 * A member creates a request, gets a one-time link, and sends it to the
 * person themselves. That person writes the text at /r/{token}. The member
 * can hide what comes back but can never edit it — the whole value is that
 * the words are not theirs.
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
  /** Pending requests one profile may hold at once — a link generator is a
   *  spam vector if it is unbounded, even when we send no email ourselves. */
  maxPending: 25,
  /** Total submitted items we will render on a profile. */
  maxShown: 20,
} as const;

/** Invite links die; a permanent secret is a permanent attack surface. */
export const LINK_TTL_DAYS = 60;

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
  /** Already answered: the form is closed but we still say so kindly. */
  alreadySubmitted: boolean;
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
