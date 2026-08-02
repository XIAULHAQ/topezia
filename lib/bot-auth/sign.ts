/**
 * Web Bot Auth — proving the crawler is us, cryptographically.
 *
 * WHY THIS AND NOT AN IP LIST. Cloudflare's Verified Bots programme accepts
 * three proofs of identity: a published list of dedicated IPs, reverse DNS,
 * or a signature. We run on Vercel, whose egress addresses are shared and
 * not ours to publish, so the first two are simply unavailable. The
 * signature route needs nothing but a key we control.
 *
 * What it buys: a customer behind Cloudflare's Bot Fight Mode stops having
 * to weaken their own security to let us read their site. That matters
 * commercially — Bot Fight Mode is ON by default on free zones, which is
 * most small-business WordPress, and the failure is silent. Rodeo Graphics
 * spent an unknown stretch answering visitors from one page because of it.
 *
 * The shape is RFC 9421 HTTP Message Signatures with the profile Cloudflare
 * documents: an Ed25519 key, published as a JWK Set at
 * /.well-known/http-message-signatures-directory, and three headers on every
 * request — Signature-Agent, Signature-Input, Signature.
 *
 * WITHOUT A KEY CONFIGURED THIS DOES NOTHING. No headers, no errors, no
 * behaviour change. An unsigned crawler is exactly what we had before, so a
 * missing env var degrades to the old world rather than breaking crawling.
 */
import { createHash, createPrivateKey, createPublicKey, sign as nodeSign, type KeyObject } from "crypto";

/** How long a signature is good for. Short: it only has to survive flight. */
const TTL_SECONDS = 300;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.topezia.com").replace(/\/$/, "");

/** The directory URL that Signature-Agent points at, and where the key lives. */
export const DIRECTORY_URL = `${SITE}/.well-known/http-message-signatures-directory`;

type Key = { priv: KeyObject; jwk: { kty: "OKP"; crv: "Ed25519"; x: string }; thumbprint: string };

let cached: Key | null | undefined;

/**
 * The signing key, from TOPEZIA_BOT_PRIVATE_KEY (a PKCS#8 Ed25519 key, PEM,
 * base64-encoded so it survives being an environment variable).
 *
 * Returns null — never throws — when absent or unusable. A broken key must
 * not take the crawler down with it.
 */
function key(): Key | null {
  if (cached !== undefined) return cached;
  cached = null;

  const raw = process.env.TOPEZIA_BOT_PRIVATE_KEY;
  if (!raw) return cached;

  try {
    const pem = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const priv = createPrivateKey(pem);
    if (priv.asymmetricKeyType !== "ed25519") {
      console.error("[bot-auth] TOPEZIA_BOT_PRIVATE_KEY is not an Ed25519 key — requests will be unsigned");
      return cached;
    }
    const pub = createPublicKey(priv).export({ format: "jwk" }) as { kty: string; crv: string; x: string };
    const jwk = { kty: "OKP" as const, crv: "Ed25519" as const, x: pub.x };

    // RFC 7638 thumbprint: SHA-256 over the canonical JWK — required members
    // only, lexicographic order, no whitespace. This is the keyid.
    const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
    const thumbprint = createHash("sha256").update(canonical).digest("base64url");

    cached = { priv, jwk, thumbprint };
  } catch (err) {
    console.error("[bot-auth] could not load signing key:", err instanceof Error ? err.message : err);
  }
  return cached;
}

export function botAuthConfigured(): boolean {
  return key() !== null;
}

/** The public key set served at the well-known directory. */
export function publicJwks(): { keys: Array<{ kty: string; crv: string; x: string }> } | null {
  const k = key();
  return k ? { keys: [k.jwk] } : null;
}

/** RFC 8941 serialisation of the bits we emit: quoted strings and integers. */
const quoted = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Build the signature base and sign it.
 *
 * Covered components are `@authority` (the host we're calling) and
 * `signature-agent` (where our key lives). Cloudflare requires at least
 * `@authority`; including signature-agent binds the signature to the
 * directory it should be checked against, so a captured signature can't be
 * replayed while claiming a different operator.
 */
function signFor(
  authority: string,
  params: { created: number; expires: number; keyid: string; tag: string; label: string }
): { input: string; signature: string } | null {
  const k = key();
  if (!k) return null;

  const paramString =
    `("@authority" "signature-agent")` +
    `;created=${params.created};expires=${params.expires}` +
    `;keyid=${quoted(params.keyid)};alg="ed25519";tag=${quoted(params.tag)}`;

  const base =
    `"@authority": ${authority}\n` +
    `"signature-agent": ${quoted(DIRECTORY_URL)}\n` +
    `"@signature-params": ${paramString}`;

  const sig = nodeSign(null, Buffer.from(base, "utf8"), k.priv);
  return {
    input: `${params.label}=${paramString}`,
    signature: `${params.label}=:${sig.toString("base64")}:`,
  };
}

/**
 * Headers to attach to an outgoing crawl request, or {} when unconfigured.
 *
 * `url` is the request target; only its authority is signed, so the same
 * signature is valid for every path on a host within its short lifetime —
 * which is what makes signing a few hundred page fetches cheap.
 */
export function signedHeaders(url: string): Record<string, string> {
  const k = key();
  if (!k) return {};
  let authority: string;
  try {
    authority = new URL(url).host;
  } catch {
    return {};
  }

  const created = Math.floor(Date.now() / 1000);
  const signed = signFor(authority, {
    created,
    expires: created + TTL_SECONDS,
    keyid: k.thumbprint,
    tag: "web-bot-auth",
    label: "sig1",
  });
  if (!signed) return {};

  return {
    "Signature-Agent": quoted(DIRECTORY_URL),
    "Signature-Input": signed.input,
    Signature: signed.signature,
  };
}

/**
 * The directory's own signature. Cloudflare asks the key set itself to be
 * signed with the key it contains — a small proof that whoever serves the
 * directory holds the private half.
 */
export function directoryHeaders(): Record<string, string> {
  const k = key();
  if (!k) return {};
  let authority: string;
  try {
    authority = new URL(DIRECTORY_URL).host;
  } catch {
    return {};
  }
  const created = Math.floor(Date.now() / 1000);
  const signed = signFor(authority, {
    created,
    expires: created + TTL_SECONDS,
    keyid: k.thumbprint,
    tag: "http-message-signatures-directory",
    label: "sig1",
  });
  if (!signed) return {};
  return {
    "Signature-Agent": quoted(DIRECTORY_URL),
    "Signature-Input": signed.input,
    Signature: signed.signature,
  };
}
