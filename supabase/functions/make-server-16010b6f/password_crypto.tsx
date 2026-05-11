/** PBKDF2-SHA256 password storage for legacy KV users (not Supabase Auth). */

const ITERATIONS = 100_000;
const PREFIX = "pbkdf2_sha256";

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPasswordPlain(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder().encode(plain);
  const key = await crypto.subtle.importKey("raw", enc, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  const hash = new Uint8Array(bits);
  return `${PREFIX}$${ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Returns true if stored value is our PBKDF2 format. */
export function isPasswordHashFormat(stored: unknown): boolean {
  return typeof stored === "string" && stored.startsWith(`${PREFIX}$`);
}

/**
 * Verify plain against stored hash OR legacy plaintext (migrate on success).
 * On legacy match, caller should replace `password` with `passwordHash` from hashPasswordPlain.
 */
export async function verifyPasswordPlain(plain: string, stored: unknown): Promise<boolean> {
  if (typeof stored !== "string" || !stored) return false;
  if (!isPasswordHashFormat(stored)) {
    return timingSafeEqual(stored, plain);
  }
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;
  const iter = Number(parts[1]);
  if (!Number.isFinite(iter) || iter < 10_000) return false;
  const salt = b64urlDecode(parts[2]!);
  const expectedHash = b64urlDecode(parts[3]!);
  const enc = new TextEncoder().encode(plain);
  const key = await crypto.subtle.importKey("raw", enc, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: iter,
      hash: "SHA-256",
    },
    key,
    256,
  );
  const got = new Uint8Array(bits);
  if (got.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i]! ^ expectedHash[i]!;
  return diff === 0;
}
