/**
 * POST /api/hq/blog/upload — receive one blog cover/body image.
 *
 * Same posture as /api/portfolio/upload: uploads never touch the bucket from
 * the browser. This route decides WHAT the file is (sniffed from magic
 * bytes — the declared Content-Type is attacker-controlled and ignored) and
 * WHERE it lands (`{uuid}.{ext}`, chosen here). Gated by the /hq password
 * session, re-checked here independently of the page-level gate.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { HQ_COOKIE, sessionValid } from "@/lib/hq-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType, imageDimensions, extensionFor } from "@/lib/portfolio/image";
import { BLOG_BUCKET, blogImageUrl } from "@/lib/blog/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // mirrors the bucket's own limit

export async function POST(request: NextRequest) {
  if (!sessionValid(request.cookies.get(HQ_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BYTES + 1024) {
    return NextResponse.json({ error: "Image is larger than 10MB." }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 10MB." }, { status: 413 });
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());

  const type = sniffImageType(buf);
  if (!type) {
    return NextResponse.json(
      { error: "That doesn't look like a JPEG, PNG, WebP or AVIF image." },
      { status: 415 }
    );
  }

  const dims = imageDimensions(buf, type);
  // Path is ours: a random name, an extension derived from the sniffed type.
  // The uploaded filename is discarded — user-controlled text has no
  // business in a storage key.
  const path = `${crypto.randomUUID()}.${extensionFor(type)}`;

  const admin = createAdminClient();
  if (!admin) {
    console.error("[blog/upload] SUPABASE_SERVICE_ROLE_KEY missing; cannot upload");
    return NextResponse.json({ error: "Uploads are temporarily unavailable." }, { status: 500 });
  }

  const { error } = await admin.storage.from(BLOG_BUCKET).upload(path, buf, {
    contentType: type,
    upsert: false, // a random path should never collide; if it does, fail loudly
    cacheControl: "31536000", // immutable — the path changes when the file does
  });
  if (error) {
    console.error("[blog/upload] storage rejected the object:", error.message);
    return NextResponse.json({ error: "Couldn't save that image. Try again." }, { status: 502 });
  }

  return NextResponse.json({
    path,
    url: blogImageUrl(path),
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    type,
  });
}
