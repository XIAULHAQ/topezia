/**
 * POST   /api/publications/image?id=…  — upload a publication's cover thumbnail.
 * DELETE /api/publications/image?id=…  — remove it.
 *
 * Modelled directly on app/api/company/logo/route.ts. The parts that matter,
 * and why they aren't shortcuts:
 *
 * - The file TYPE comes from sniffing magic bytes, never from the declared
 *   Content-Type or the filename. A client can claim anything; the bytes can't.
 *   SVG is rejected by omission — it's an executable document, and serving one
 *   from our own origin would be stored XSS.
 * - The storage PATH is chosen server-side from the owning profile id. If the
 *   client picked it, one member could overwrite another's cover.
 * - Ownership is checked by loading the publication THROUGH the signed-in
 *   member's profile, so an id belonging to someone else is a 404, not a 403 —
 *   it never confirms that the row exists.
 * - Uploads use the service role, because the bucket deliberately grants
 *   clients no INSERT/UPDATE/DELETE policy (see
 *   scripts/setup-publication-storage.sql).
 *
 * Replacing an image deletes the previous object AFTER the row is updated:
 * orphaned bytes are cheap, a row pointing at a deleted file is a broken image.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType, extensionFor } from "@/lib/portfolio/image";
import { PUBLICATION_BUCKET, publicationImageUrl } from "@/lib/publications/storage";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Matches the bucket's own file_size_limit. Checked here too so an oversized
// upload is refused before we stream the whole body into memory.
const MAX_BYTES = 2 * 1024 * 1024;

/** The publication, but only if it belongs to the signed-in member. */
async function ownPublication(userId: string, id: string) {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return null;
  const pub = await prisma.publication.findFirst({
    where: { id, profileId: profile.id },
    select: { id: true, imagePath: true },
  });
  return pub ? { ...pub, profileId: profile.id } : null;
}

export async function POST(request: Request) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (!rateLimit(`publication-image:${userId}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const pub = id ? await ownPublication(userId, id) : null;
  if (!pub) return NextResponse.json({ error: "No such publication." }, { status: 404 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 1024) {
    return NextResponse.json({ error: "That image is over 2MB — try a smaller one." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is over 2MB — try a smaller one." }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(buf);
  if (!type) {
    return NextResponse.json({ error: "That doesn't look like a JPG, PNG, WebP or AVIF." }, { status: 415 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("publication image upload: SUPABASE_SERVICE_ROLE_KEY not set");
    return NextResponse.json({ error: "Uploads aren't configured on this environment." }, { status: 500 });
  }

  const path = `${pub.profileId}/${crypto.randomUUID()}.${extensionFor(type)}`;
  const { error } = await admin.storage
    .from(PUBLICATION_BUCKET)
    .upload(path, buf, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (error) {
    console.error("publication image upload failed:", error.message);
    return NextResponse.json({ error: "Couldn't store that image — try again." }, { status: 502 });
  }

  // Owner-scoped write: the where clause IS the authorization.
  await prisma.publication.updateMany({
    where: { id: pub.id, profileId: pub.profileId },
    data: { imagePath: path },
  });

  // Old object goes only after the row points at the new one.
  if (pub.imagePath) {
    await admin.storage.from(PUBLICATION_BUCKET).remove([pub.imagePath]).catch(() => {
      /* orphaned bytes beat a broken image */
    });
  }

  return NextResponse.json({ imagePath: path, imageUrl: publicationImageUrl(path) });
}

export async function DELETE(request: Request) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const pub = id ? await ownPublication(userId, id) : null;
  if (!pub) return NextResponse.json({ error: "No such publication." }, { status: 404 });

  await prisma.publication.updateMany({
    where: { id: pub.id, profileId: pub.profileId },
    data: { imagePath: null },
  });

  if (pub.imagePath) {
    const admin = createAdminClient();
    await admin?.storage.from(PUBLICATION_BUCKET).remove([pub.imagePath]).catch(() => {
      /* best effort — the row is already clean, which is what users see */
    });
  }
  return NextResponse.json({ ok: true });
}
