/**
 * Removing storage objects a company no longer references.
 *
 * Server-only: it pulls in the service-role client, which must never be
 * reachable from a bundle the browser gets. Kept out of lib/company/storage.ts
 * for exactly that reason — that module is a pure URL builder and is imported
 * from places that render.
 *
 * Every caller deletes the ROW first and the bytes after, deliberately: an
 * orphaned object costs a fraction of a cent, while a row pointing at a
 * deleted file is a broken image on a public page. Failures are logged, never
 * surfaced — the user already saw the thing disappear, which is what they
 * asked for.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export async function removeObjects(bucket: string, paths: (string | null | undefined)[]): Promise<void> {
  const real = paths.filter((p): p is string => typeof p === "string" && p.length > 0);
  if (!real.length) return;

  const admin = createAdminClient();
  if (!admin) return; // no service-role key configured; nothing we can do here

  const { error } = await admin.storage.from(bucket).remove(real);
  if (error) console.error(`[company/cleanup] ${bucket} cleanup failed:`, error.message);
}
