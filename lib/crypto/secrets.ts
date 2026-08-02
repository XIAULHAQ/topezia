/**
 * Encrypting the things a customer hands us that are not ours.
 *
 * Store API credentials read a merchant's ORDERS — names, addresses, what
 * people bought. They are the most sensitive thing this product has ever been
 * given, and they belong to someone who is not even our customer (our
 * customer's customer's data). They are encrypted at rest with AES-256-GCM
 * and never leave the server.
 *
 * NO KEY, NO FEATURE. If TOPEZIA_SECRET_KEY is absent, `encryptSecret` throws
 * and connecting a store fails loudly. It never falls back to storing
 * plaintext, and it never quietly disables the check — a credential store
 * that silently stops encrypting is worse than one that refuses to run.
 *
 * Generate a key with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Rotating it makes every stored credential undecryptable, by design. Owners
 * reconnect their store; nothing is silently lost or wrongly decrypted.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the GCM standard
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.TOPEZIA_SECRET_KEY ?? "";
  if (!raw) throw new Error("TOPEZIA_SECRET_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("TOPEZIA_SECRET_KEY must be 32 bytes, base64-encoded");
  return buf;
}

/** True when this deployment can hold secrets at all — for telling an owner
 *  "not available here" instead of failing at save time. */
export function secretsAvailable(): boolean {
  try { key(); return true; } catch { return false; }
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version prefix is what
 *  makes a future algorithm change readable rather than a guessing game. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

/** Null on anything that doesn't decrypt cleanly — wrong key, tampering, a
 *  format we don't know. Callers treat that as "no credential", never as an
 *  empty one. */
export function decryptSecret(blob: string): string | null {
  try {
    const [version, iv, tag, data] = blob.split(".");
    if (version !== VERSION || !iv || !tag || !data) return null;
    const decipher = createDecipheriv(ALGO, key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Objects in, objects out — every adapter's credentials are a small record. */
export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(blob: string): T | null {
  const plain = decryptSecret(blob);
  if (plain === null) return null;
  try { return JSON.parse(plain) as T; } catch { return null; }
}

/** What an owner sees instead of the secret they saved: enough to recognise
 *  which key is in there, never enough to use it. */
export function maskSecret(s: string): string {
  const t = s.trim();
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}••••${t.slice(-4)}`;
}
