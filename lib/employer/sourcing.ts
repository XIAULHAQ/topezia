/**
 * "Sourced for you" — people who fit a posting but haven't applied to it.
 *
 * Reverse of the seeker-side matcher: instead of ranking jobs against one
 * profile's embedding, this ranks profiles against one posting's embedding.
 * Same pgvector cosine distance, same 0-100 provisional-score convention as
 * lib/matching/match.ts (`Math.round(similarity * 100)`).
 *
 * CONSENT IS THE POINT. Showing a job-seeker's profile to an employer they
 * never contacted is only acceptable for people who explicitly asked to be
 * found, so the SQL hard-filters on BOTH flags:
 *   - openToWork  — "I am looking" (defaults to FALSE; must be turned on)
 *   - publicVisible — "my profile may be seen" (the master privacy switch)
 * Neither is inferred and neither has a fallback path. If someone flips either
 * one off they leave this list on the next query. The employer also never
 * receives a contact address here — the card links to the person's own public
 * profile, which is the surface they control.
 *
 * The score is deliberately labelled provisional wherever it's rendered: it's
 * embedding similarity, not the Claude rerank the seeker side runs, because
 * reranking every candidate would spend a real LLM call per person per view.
 */
import { prisma } from "@/lib/prisma";

export interface SourcedCandidate {
  profileId: string;
  fullName: string | null;
  publicSlug: string | null;
  currentLocation: string | null;
  photoUrl: string | null;
  yearsExperience: number | null;
  /** 0-100, from embedding cosine similarity. Provisional by construction. */
  match: number;
}

/**
 * Below this, "matching candidates" stops being a useful claim — a cosine of
 * 0.5 against a job embedding is closer to noise than to a fit. Mirrors the
 * spirit of the seeker-side floors: show fewer, truer rows rather than pad.
 */
const MIN_SIMILARITY = 0.62;

export async function sourceCandidates(
  jobId: string,
  ownerUserId: string,
  limit = 5
): Promise<SourcedCandidate[]> {
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      fullName: string | null;
      publicSlug: string | null;
      currentLocation: string | null;
      photoUrl: string | null;
      yearsExperience: number | null;
      similarity: number;
    }[]
  >(
    `SELECT p.id,
            p."fullName",
            p."publicSlug",
            p."currentLocation",
            p."photoUrl",
            p."yearsExperience",
            1 - (p.embedding <=> j.embedding) AS similarity
     FROM "Profile" p
     CROSS JOIN "Job" j
     -- No ::uuid cast: these id columns are TEXT (Prisma String @id), and
     -- casting the parameter makes Postgres look for a text = uuid operator.
     WHERE j.id = $1
       AND j.embedding IS NOT NULL
       AND p.embedding IS NOT NULL
       -- Consent gates. Both required, no fallback.
       AND p."openToWork" = TRUE
       AND p."publicVisible" = TRUE
       -- Never source the employer themselves.
       AND p."userId" <> $2
       -- Already applied? They're in the pipeline, not a sourcing suggestion.
       AND NOT EXISTS (
         SELECT 1 FROM "Application" a WHERE a."jobId" = j.id AND a."profileId" = p.id
       )
       AND 1 - (p.embedding <=> j.embedding) >= $3::float8
     ORDER BY p.embedding <=> j.embedding
     LIMIT $4::int`,
    jobId,
    ownerUserId,
    MIN_SIMILARITY,
    limit
  );

  return rows.map((r) => ({
    profileId: r.id,
    fullName: r.fullName,
    publicSlug: r.publicSlug,
    currentLocation: r.currentLocation,
    photoUrl: r.photoUrl,
    yearsExperience: r.yearsExperience,
    match: Math.round(r.similarity * 100),
  }));
}

/**
 * How many people are even eligible to be sourced right now, ignoring the
 * posting. Lets the UI explain an empty list honestly ("nobody has turned on
 * open-to-work yet") instead of implying the posting is unattractive.
 */
export async function openToWorkPoolSize(): Promise<number> {
  return prisma.profile.count({ where: { openToWork: true, publicVisible: true } });
}
