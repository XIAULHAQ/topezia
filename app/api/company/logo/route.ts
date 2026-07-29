/**
 * POST /api/company/logo — upload the signed-in employer's company logo.
 * DELETE /api/company/logo — remove it.
 *
 * Modelled directly on app/api/portfolio/upload/route.ts. The parts that
 * matter, and why they aren't shortcuts:
 *
 * - The file TYPE comes from sniffing magic bytes, never from the declared
 *   Content-Type or the filename. A client can claim anything; the bytes can't.
 *   SVG is rejected by omission — it's an executable document, and serving one
 *   from our own origin would be stored XSS.
 * - The storage PATH is chosen server-side from the company id. If the client
 *   picked it, one employer could overwrite another's logo.
 * - Ownership is the Company row's ownerUserId. There is one company per
 *   account (schema-enforced), so "my company" is unambiguous.
 * - Uploads use the service role, because the bucket deliberately grants
 *   clients no INSERT/UPDATE/DELETE policy (see scripts/setup-logo-storage.sql).
 *
 * Replacing a logo deletes the previous object AFTER the row is updated:
 * orphaned bytes are cheap, a row pointing at a deleted file is a broken image.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType, extensionFor } from "@/lib/portfolio/image";
import { LOGO_BUCKET, companyLogoUrl } from "@/lib/company/storage";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Matches the bucket's own file_size_limit. Checked here too so an oversized
// upload is refused before we stream the whole body into memory.
const MAX_BYTES = 2 * 1024 * 1024;

async function ownCompany(userId: string) {
  return prisma.company.findUnique({ where: { ownerUserId: userId }, select: { id: true, logoPath: true } });
}

export async function POST(request: Request) {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (!rateLimit(`company-logo:${userId}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const company = await ownCompany(userId);
  if (!company) {
    return NextResponse.json({ error: "Create your company page first — the logo belongs to it." }, { status: 409 });
  }

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
    console.error("company logo upload: SUPABASE_SERVICE_ROLE_KEY not set");
    return NextResponse.json({ error: "Uploads aren't configured on this environment." }, { status: 500 });
  }

  const path = `${company.id}/${crypto.randomUUID()}.${extensionFor(type)}`;
  const { error } = await admin.storage
    .from(LOGO_BUCKET)
    .upload(path, buf, { contentType: type, upsert: false, cacheControl: "31536000" });
  if (error) {
    console.error("company logo upload failed:", error.message);
    return NextResponse.json({ error: "Couldn't store that image — try again." }, { status: 502 });
  }

  // Owner-scoped write: the where clause IS the authorization.
  await prisma.company.updateMany({ where: { ownerUserId: userId }, data: { logoPath: path } });

  // Old object goes only after the row points at the new one.
  if (company.logoPath) {
    await admin.storage.from(LOGO_BUCKET).remove([company.logoPath]).catch(() => {
      /* orphaned bytes beat a broken image */
    });
  }

  return NextResponse.json({ logoPath: path, logoUrl: companyLogoUrl(path) });
}

export async function DELETE() {
  const { userId, authed } = await currentIdentity();
  if (!userId || !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const company = await ownCompany(userId);
  if (!company) return NextResponse.json({ error: "No company to edit." }, { status: 404 });

  await prisma.company.updateMany({ where: { ownerUserId: userId }, data: { logoPath: null } });

  if (company.logoPath) {
    const admin = createAdminClient();
    await admin?.storage.from(LOGO_BUCKET).remove([company.logoPath]).catch(() => {
      /* best effort — the row is already clean, which is what users see */
    });
  }
  return NextResponse.json({ ok: true });
}
