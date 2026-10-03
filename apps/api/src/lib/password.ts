import { type ScryptOptions, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with Node's built-in scrypt (no external dependency). Each
 * hash is self-describing — it stores the algorithm and its parameters
 * alongside the salt and derived key — so the verifier never needs to know the
 * current parameters and older hashes keep verifying if we tune them later.
 *
 * Stored form: `scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>`
 */

// promisify only surfaces scrypt's no-options overload; assert the signature
// that includes the ScryptOptions parameter we need (maxmem, N, r, p).
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const KEY_LENGTH = 32;
const SALT_BYTES = 16;
// N must be a power of two; 2^15 is a sensible interactive-login cost.
const DEFAULT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
// scrypt needs ~128 * N * r bytes; the default 32 MiB cap is too low for N=2^15.
const MAX_MEM = 64 * 1024 * 1024;

async function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return await scryptAsync(password, salt, KEY_LENGTH, { ...params, maxmem: MAX_MEM });
}

/** Hashes a plaintext password into the self-describing stored form. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derive(password, salt, DEFAULT_PARAMS);
  const { N, r, p } = DEFAULT_PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Verifies a plaintext password against a stored hash in constant time.
 * Returns false (rather than throwing) for any malformed or non-scrypt hash.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const expected = Buffer.from(hashB64 ?? '', 'base64');
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await derive(password, Buffer.from(saltB64 ?? '', 'base64'), { N, r, p });
  return timingSafeEqual(derived, expected);
}
