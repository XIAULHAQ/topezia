/**
 * GET /.well-known/http-message-signatures-directory
 *
 * Our crawler's public key, where Cloudflare (and anyone else running Web Bot
 * Auth) looks to check a signature. Public by design: it is a public key.
 *
 * 404 when no key is configured, rather than an empty key set. "I don't do
 * this" is a different statement from "I do this and have no keys", and the
 * second would make a verifier think every signature we send is forged.
 */
import { NextResponse } from "next/server";
import { publicJwks, directoryHeaders, botAuthState } from "@/lib/bot-auth/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // the response carries a fresh signature

export async function GET() {
  const jwks = publicJwks();
  if (!jwks) {
    // Say which failure it is. Neither answer reveals anything about the key
    // — both are statements about configuration — and the alternative is an
    // opaque 404 that leaves whoever set it up guessing at the dashboard.
    const state = botAuthState();
    return NextResponse.json(
      {
        error:
          state === "invalid"
            ? "TOPEZIA_BOT_PRIVATE_KEY is set but is not a usable Ed25519 private key."
            : "TOPEZIA_BOT_PRIVATE_KEY is not set on this deployment.",
      },
      { status: 404 }
    );
  }

  return new NextResponse(JSON.stringify(jwks), {
    status: 200,
    headers: {
      // The media type is part of the spec, not a nicety — verifiers check it.
      "Content-Type": "application/http-message-signatures-directory+json",
      // Public and stable; let it be cached, but not so long that a key
      // rotation takes a day to propagate.
      "Cache-Control": "public, max-age=3600",
      ...directoryHeaders(),
    },
  });
}
