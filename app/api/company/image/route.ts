/**
 * POST /api/company/image?kind=work|article|client — one image, uploaded by a
 * company owner.
 *
 * Modelled on app/api/portfolio/upload and app/api/company/logo, and the parts
 * that matter are the same in all three:
 *
 *  - The file TYPE is sniffed from magic bytes. The declared Content-Type and
 *    the filename are attacker-controlled and both ignored. SVG is rejected by
 *    omission — it is an executable document, and serving one from our own
 *    origin would be stored XSS.
 *  - The PATH is chosen here, from the company id. If the client picked it,
 *    one company could overwrite another's cover.
 *  - Uploads use the service role because the buckets deliberately grant
 *    clients no write policy at all.
 *
 * `kind` picks the bucket rather than the caller naming it: client logos live
 * in `logos` (small, company-scoped cleanup) and everything else in `company`.
 * A caller that could name the bucket could put a 10MB photo in the logo
 * bucket, or write into `blog`.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireCompanyOwner } from "@/lib/company/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType, imageDimensions, extensionFor } from "@/lib/portfolio/image";
import { COMPANY_BUCKET, LOGO_BUCKET, companyImageUrl, companyLogoUrl } from "@/lib/company/storage";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-kind destination and size cap, matching each bucket's own limit. */
const KINDS = {
  work: { bucket: COMPANY_BUCKET, folder: "", max: 10 * 1024 * 1024, url: companyImageUrl },
  article: { bucket: COMPANY_BUCKET, folder: "", max: 10 * 1024 * 1024, url: companyImageUrl },
  client: { bucket: LOGO_BUCKET, folder: "clients/", max: 2 * 1024 * 1024, url: companyLogoUrl },
} as const;

type Kind = keyof typeof KINDS;

export async function POST(request: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId } = auth.owner;

  if (!rateLimit(`company-image:${userId}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  const kindRaw = new URL(request.url).searchParams.get("kind") ?? "work";
  if (!(kindRaw in KINDS)) return NextResponse.json({ error: "Unknown image kind." }, { status: 400 });
  const kind = KINDS[kindRaw as Kind];

  const mb = Math.round(kind.max / (1024 * 1024));
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > kind.max + 1024) {
    return NextResponse.json({ error: `That image is over ${mb}MB — try a smaller one.` }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > kind.max) {
    return NextResponse.json({ error: `That image is over ${mb}MB — try a smaller one.` }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(buf);
  if (!type) {
    return NextResponse.json({ error: "That doesn't look like a JPEG, PNG, WebP or AVIF image." }, { status: 415 });
  }

  const dims = imageDimensions(buf, type);
  const path = `${companyId}/${kind.folder}${crypto.randomUUID()}.${extensionFor(type)}`;

  const admin = createAdminClient();
  if (!admin) {
    console.error("[company/image] SUPABASE_SERVICE_ROLE_KEY missing; cannot upload");
    return NextResponse.json({ error: "Uploads are temporarily unavailable." }, { status: 500 });
  }

  const { error } = await admin.storage.from(kind.bucket).upload(path, buf, {
    contentType: type,
    upsert: false, // a random path should never collide; if it does, fail loudly
    cacheControl: "31536000", // immutable — the path changes when the file does
  });
  if (error) {
    console.error("[company/image] storage rejected the object:", error.message);
    return NextResponse.json({ error: "Couldn't save that image. Try again." }, { status: 502 });
  }

  return NextResponse.json({
    path,
    url: kind.url(path),
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  });
}
