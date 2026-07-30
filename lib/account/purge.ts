/**
 * Deleting a member, in one place.
 *
 * Two callers with the same obligation: the member deleting their own account
 * from /settings, and an admin deleting one from /hq. Those must not drift —
 * an admin delete that quietly leaves more behind than the self-service one is
 * the kind of difference nobody notices until it matters.
 *
 * What cascades and what does NOT is the whole reason this needs care.
 * ProfileSkill, MatchScore, Portfolio (and its media/saves/likes), Publication,
 * Endorsement, Application, InsightSnapshot and the résumé docs all carry
 * `onDelete: Cascade`, so deleting the Profile row removes them.
 * JobClick, JobSave and JobDismissal deliberately do NOT cascade — they are
 * behavioural signals the schema keeps on purpose — so they are removed here
 * explicitly, in the same transaction, or the delete fails on a foreign key.
 */
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PurgeResult {
  /** False when SUPABASE_SERVICE_ROLE_KEY isn't configured, or Supabase
   *  refused. The profile data is gone either way — this reports whether the
   *  LOGIN is also gone, which is the difference between "deleted" and
   *  "deleted but they can sign back in and start over". */
  authUserDeleted: boolean;
  /** Null when nothing was attempted (an anonymous profile has no login). */
  authError: string | null;
}

export async function purgeProfile(opts: {
  profileId: string;
  /** Supabase auth id. Pass null for an anonymous profile — there is no login
   *  to remove, and calling the admin API with a random uuid just errors. */
  userId: string | null;
}): Promise<PurgeResult> {
  const { profileId, userId } = opts;

  await prisma.$transaction([
    // JobView.profileId is a plain nullable column with no foreign key, so it
    // would not block the delete — but leaving it would keep a pointer to a
    // person who asked to be gone. Detached rather than deleted: the row is a
    // per-day dedup record an employer's view count depends on.
    prisma.jobView.updateMany({ where: { profileId }, data: { profileId: null } }),
    prisma.jobClick.deleteMany({ where: { profileId } }),
    prisma.jobSave.deleteMany({ where: { profileId } }),
    prisma.jobDismissal.deleteMany({ where: { profileId } }),
    prisma.profile.delete({ where: { id: profileId } }),
  ]);

  if (!userId) return { authUserDeleted: false, authError: null };

  const admin = createAdminClient();
  if (!admin) {
    console.warn("purgeProfile: SUPABASE_SERVICE_ROLE_KEY not set — profile deleted, auth user survives");
    return { authUserDeleted: false, authError: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("purgeProfile: auth user delete failed:", error.message);
    return { authUserDeleted: false, authError: error.message };
  }
  return { authUserDeleted: true, authError: null };
}

/**
 * A known remainder, stated rather than hidden: `JobView.viewerKey` is the
 * profile id for a signed-in viewer and is part of the row's unique index, so
 * it cannot be nulled without breaking the dedup those counts rely on. It is an
 * opaque id in an aggregate table with no name, email or content attached, but
 * it is not nothing, and anyone reasoning about erasure should know it stays.
 */
export const PURGE_REMAINDER = "JobView.viewerKey retains the profile id (dedup key for view counts).";
