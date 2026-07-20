/**
 * POST /api/portfolio/upload — receive one portfolio image.
 *
 * Uploads never touch the bucket from the browser. The bucket has a public read
 * policy and NO client write policy at all, so this route is the only way in,
 * and it decides three things the client is not trusted with:
 *
 *  1. WHO you are — a session, resolved server-side.
 *  2. WHAT the file is — sniffed from magic bytes. The declared Content-Type is
 *     attacker-controlled and is ignored.
 *  3. WHERE it lands — `{profileId}/{uuid}.{ext}`, chosen here. If the client
 *     picked the path it could write under another member's prefix and
 *     overwrite their cover.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { currentIdentity } from "@/lib/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType, imageDimensions, extensionFor } from "@/lib/portfolio/image";
import { PORTFOLIO_BUCKET, portfolioImageUrl } from "@/lib/portfolio/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // mirrors the bucket's own limit

export async function POST(request: Request) {
  const { userId, authed } = await currentIdentity();
  // Anonymous profiles can browse, but publishing work needs a real account —
  // otherwise uploads can't be attributed to anyone who could later claim them.
  if (!userId || !authed) return NextResponse.json({ error: "not-authenticated" }, { status: 401 });

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "no-profile" }, { status: 403 });

  // Cheap early rejection so an oversized body isn't buffered into memory first.
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

  // The actual bytes decide the type — not the browser's claim about them.
  const type = sniffImageType(buf);
  if (!type) {
    return NextResponse.json(
      { error: "That doesn't look like a JPEG, PNG, WebP or AVIF image." },
      { status: 415 }
    );
  }

  const dims = imageDimensions(buf, type);
  // Path is ours: the member's own prefix, a random name, an extension derived
  // from the sniffed type. The uploaded filename is discarded — it is
  // user-controlled text and has no business in a storage key.
  const path = `${profile.id}/${crypto.randomUUID()}.${extensionFor(type)}`;

  const admin = createAdminClient();
  if (!admin) {
    console.error("[portfolio/upload] SUPABASE_SERVICE_ROLE_KEY missing; cannot upload");
    return NextResponse.json({ error: "Uploads are temporarily unavailable." }, { status: 500 });
  }

  const { error } = await admin.storage.from(PORTFOLIO_BUCKET).upload(path, buf, {
    contentType: type,
    upsert: false, // a random path should never collide; if it does, fail loudly
    cacheControl: "31536000", // immutable — the path changes when the file does
  });
  if (error) {
    console.error("[portfolio/upload] storage rejected the object:", error.message);
    return NextResponse.json({ error: "Couldn't save that image. Try again." }, { status: 502 });
  }

  return NextResponse.json({
    path,
    url: portfolioImageUrl(path),
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    type,
  });
}
