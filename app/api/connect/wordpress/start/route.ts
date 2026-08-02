/**
 * POST /api/connect/wordpress/start — a WordPress site asks to be connected.
 *
 * Called by the plugin from the customer's own server, never by a browser.
 * It hands back the URL to send the person to and a one-time token to claim
 * the key with afterwards.
 *
 * THIS ENDPOINT GRANTS NOTHING. It writes a pending row and returns two
 * random strings. Anyone on the internet may call it — which is fine,
 * because the only thing it can produce is a consent screen that a signed-in
 * human then has to approve for a website they say is theirs. Being open is
 * what lets the plugin work before the person has an account, which is the
 * entire point: install, click, sign up, live.
 *
 * No CORS headers, deliberately. There is no browser caller.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, RATE_LIMITED } from "@/lib/rate-limit";
import { normalizeDomain } from "@/lib/widget/crawl";
import { CONNECT_TTL_MS, mintToken, sanitizeDetails, safeReturnUrl } from "@/lib/wordpress/connect";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") ?? "").trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // A generous ceiling: one shared host can legitimately run many sites, and
  // a locked-out agency is a support ticket. Tight enough that nobody fills
  // the table from a laptop.
  if (!rateLimit(`wp-connect-start:${ip}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const siteUrlRaw = typeof body.site_url === "string" ? body.site_url.trim() : "";
  const norm = normalizeDomain(siteUrlRaw);
  if (!norm.ok) {
    // The plugin shows this verbatim, so it has to read as advice rather
    // than as a validation code. A local dev site lands here.
    return NextResponse.json(
      { error: `${norm.error} The chat needs a public address it can be visited at.` },
      { status: 400 }
    );
  }

  let siteUrl: string;
  try {
    siteUrl = new URL(siteUrlRaw.includes("://") ? siteUrlRaw : `https://${siteUrlRaw}`).origin;
  } catch {
    return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });
  }

  // One pending connection per host at a time. Re-running the wizard should
  // replace the abandoned attempt, not queue behind it.
  await prisma.wpConnect.deleteMany({
    where: { host: norm.host, status: "PENDING" },
  });

  const state = randomBytes(18).toString("base64url");
  const { token, hash } = mintToken();

  await prisma.wpConnect.create({
    data: {
      state,
      claimHash: hash,
      host: norm.host,
      siteUrl,
      returnUrl: safeReturnUrl(body.return_url, siteUrl),
      details: sanitizeDetails(body.details) as object,
      ip,
      expiresAt: new Date(Date.now() + CONNECT_TTL_MS),
    },
  });

  // Opportunistic sweep — cheaper than a cron for a table that is only ever
  // a few rows deep, and it keeps abandoned attempts from accumulating.
  prisma.wpConnect
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - CONNECT_TTL_MS) } } })
    .catch(() => {});

  return NextResponse.json({
    state,
    claim_token: token,
    authorize_url: `${SITE}/connect/wordpress?state=${encodeURIComponent(state)}`,
    expires_in: Math.floor(CONNECT_TTL_MS / 1000),
  });
}
