/**
 * POST /api/connect/wordpress/claim — WordPress exchanges its one-time token
 * for the site key, server to server.
 *
 * This is the only place the key is handed out, and it is handed to the
 * machine that asked for the connection rather than to a browser. `state`
 * alone is useless here: the token is what proves the caller is the same
 * WordPress install that started the handshake, and we only ever stored its
 * SHA-256.
 *
 * The three answers are deliberately shaped for a polling caller. "pending"
 * means keep waiting, "ready" carries the key, and everything else is a dead
 * end the plugin should stop on and explain. A plugin that can't tell
 * "they haven't finished yet" from "this failed" spins forever.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { mintToken, sameToken } from "@/lib/wordpress/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") ?? "").trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // The plugin polls while the person is approving, so this has to allow
  // real polling while still being useless for guessing tokens — which it
  // is anyway at 256 bits.
  if (!rateLimit(`wp-connect-claim:${ip}`, 240, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const state = typeof body.state === "string" ? body.state : "";
  const token = typeof body.claim_token === "string" ? body.claim_token : "";
  if (!state || !token) return NextResponse.json({ error: "Missing state or token." }, { status: 400 });

  const row = await prisma.wpConnect.findUnique({
    where: { state },
    select: {
      id: true, claimHash: true, status: true, expiresAt: true, host: true, details: true,
      site: { select: { id: true, siteToken: true, domain: true, enabled: true } },
      company: { select: { name: true, plan: true, slug: true } },
    },
  });

  // A wrong state and a wrong token are the same answer on purpose: neither
  // tells a prober whether the handshake it guessed at exists.
  if (!row || !sameToken(token, row.claimHash)) {
    return NextResponse.json({ status: "unknown", error: "This connection is no longer valid. Start again from the plugin." }, { status: 404 });
  }

  if (row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ status: "expired", error: "This connection timed out. Start again from the plugin." }, { status: 410 });
  }

  if (row.status === "PENDING") {
    return NextResponse.json({ status: "pending" });
  }

  if (row.status !== "APPROVED" && row.status !== "CLAIMED") {
    return NextResponse.json({ status: "expired", error: "This connection is no longer valid." }, { status: 410 });
  }

  if (!row.site) {
    // Approved, then the website was deleted on our side before the plugin
    // came back. Honest dead end rather than a key that answers nothing.
    return NextResponse.json(
      { status: "expired", error: "That website is no longer set up on Topezia. Start again from the plugin." },
      { status: 410 }
    );
  }

  // The plugin's own credential, minted here rather than at approval so it
  // is handed only to the machine that proved it started the handshake.
  //
  // RE-MINTED ON EVERY CLAIM, which makes this idempotent for a plugin that
  // stored the key and then lost the response to a network blip, and makes
  // reconnecting a real rotation: the previous key stops working the moment
  // a new one is issued, because only one hash is stored.
  const plugin = mintToken();

  const info = (row.details ?? {}) as Record<string, unknown>;
  await prisma.$transaction([
    prisma.widgetSite.update({
      where: { id: row.site.id },
      data: {
        pluginKeyHash: plugin.hash,
        pluginConnectedAt: new Date(),
        pluginInfo: {
          wp: info.wp ?? null,
          php: info.php ?? null,
          plugin: info.plugin ?? null,
          store: info.store ?? null,
        },
      },
    }),
    prisma.wpConnect.update({
      where: { id: row.id },
      data: { status: "CLAIMED", claimedAt: row.status === "CLAIMED" ? undefined : new Date() },
    }),
  ]);

  return NextResponse.json({
    status: "ready",
    site_key: row.site.siteToken,
    plugin_key: plugin.token,
    domain: row.site.domain,
    enabled: row.site.enabled,
    company: row.company ? { name: row.company.name, plan: row.company.plan, slug: row.company.slug } : null,
  });
}
