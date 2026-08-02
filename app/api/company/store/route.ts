/**
 * GET    /api/company/store?siteId=  — is a store connected, and is it working?
 * POST   /api/company/store          — connect one (tested before it is saved).
 * DELETE /api/company/store?siteId=  — disconnect and forget the credentials.
 *
 * Owner only, and every query is scoped by companyId so another company's
 * siteId reads as absent rather than as a permission error.
 *
 * THE CREDENTIALS NEVER COME BACK OUT. Not to the browser, not to the owner
 * who typed them, not masked-but-recoverable — only a four-character hint so
 * they can tell which key is stored. There is no code path that returns a
 * decrypted credential to a client, and there must never be one.
 *
 * A connection is TESTED BEFORE IT IS SAVED. Storing a key that doesn't work
 * means the failure surfaces at a customer asking about their parcel, which
 * is the worst possible place to discover a typo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyOwner } from "@/lib/company/owner";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { secretsAvailable } from "@/lib/crypto/secrets";
import { checkCredentials, isStorePlatform, readCredentials, recordCheck, saveCredentials } from "@/lib/widget/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The site must belong to the caller's company — the where IS the check. */
async function ownedSite(companyId: string, siteId: string) {
  if (!siteId) return null;
  return prisma.widgetSite.findFirst({
    where: { id: siteId, companyId },
    select: { id: true, domain: true, orderLookup: true },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const site = await ownedSite(auth.owner.companyId, new URL(req.url).searchParams.get("siteId") ?? "");
  if (!site) return NextResponse.json({ error: "That website is no longer set up." }, { status: 404 });

  const cred = await prisma.siteStoreCredential.findUnique({
    where: { siteId: site.id },
    select: { platform: true, hint: true, lastCheckedAt: true, lastError: true, updatedAt: true },
  });

  return NextResponse.json({
    connected: Boolean(cred),
    // Never the secret. The hint is the last four characters of the key.
    store: cred ?? null,
    orderLookup: site.orderLookup,
    // A deployment with no encryption key cannot hold credentials at all,
    // and the page should say so rather than fail at save time.
    available: secretsAvailable(),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;
  const { userId, companyId } = auth.owner;

  // Each attempt reaches out to someone's shop with credentials. A tight
  // window keeps a typo'd form from hammering a merchant's server.
  if (!rateLimit(`store-connect:${userId}`, 12, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }
  if (!secretsAvailable()) {
    return NextResponse.json(
      { error: "This deployment can't store credentials yet — TOPEZIA_SECRET_KEY isn't set." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const site = await ownedSite(companyId, typeof body.siteId === "string" ? body.siteId : "");
  if (!site) return NextResponse.json({ error: "That website is no longer set up." }, { status: 404 });

  const platform = body.platform;
  if (!isStorePlatform(platform)) {
    return NextResponse.json({ error: "Pick WooCommerce, Shopify or BigCommerce." }, { status: 400 });
  }
  const cred = readCredentials(platform, body);
  if (!cred) return NextResponse.json({ error: "Fill in every field — and the store address must be https." }, { status: 400 });

  // Prove it works FIRST. A broken key that saved quietly would surface as a
  // confused customer, not as an error anyone here would see.
  const check = await checkCredentials(cred);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  await saveCredentials(site.id, cred);
  await recordCheck(site.id, null);

  return NextResponse.json({ ok: true, note: "note" in check ? check.note : undefined, platform });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCompanyOwner();
  if (!auth.ok) return auth.response;

  const site = await ownedSite(auth.owner.companyId, new URL(req.url).searchParams.get("siteId") ?? "");
  if (!site) return NextResponse.json({ error: "That website is no longer set up." }, { status: 404 });

  // Forget the key AND stop offering the feature — leaving the switch on with
  // nothing behind it would invite visitors to hand over details we can't use.
  await prisma.$transaction([
    prisma.siteStoreCredential.deleteMany({ where: { siteId: site.id } }),
    prisma.widgetSite.update({ where: { id: site.id }, data: { orderLookup: false } }),
  ]);
  return NextResponse.json({ ok: true });
}
