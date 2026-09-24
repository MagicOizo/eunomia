import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for secrets kept in the database (see
 * Notes/eunomia-plan.md, 2.6): AES-256-GCM with a key that lives only in the
 * environment, so a database dump alone does not reveal an SMTP password or an
 * API token.
 *
 * The stored form is self-describing, like the password hashes in password.ts:
 *
 *   aes-256-gcm$<ivBase64>$<authTagBase64>$<ciphertextBase64>
 *
 * Carrying the algorithm means a future change of cipher can keep reading old
 * values instead of needing a migration, and it makes an encrypted value
 * recognizable at a glance in the table.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
/** 96 bits is the nonce size GCM is specified for. */
const IV_BYTES = 12;

/** Thrown for any key or payload problem, so callers can map it to one API error. */
export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/**
 * Validates and decodes the configured key. Separate from the cipher functions
 * so a malformed key is reported at startup (env.ts) rather than on the first
 * attempt to save a password.
 */
export function parseEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new SecretBoxError(
      `Encryption key must decode to ${KEY_BYTES} bytes, got ${key.length} — generate one with \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

/** True for a value written by encryptSecret (as opposed to a plaintext setting). */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${ALGORITHM}$`);
}

/** Encrypts a plaintext secret into the self-describing stored form. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    ALGORITHM,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('$');
}

/**
 * Decrypts a stored secret. Throws SecretBoxError for a malformed envelope and
 * for a wrong key — GCM's authentication tag is what makes the latter fail
 * loudly instead of returning garbage.
 */
export function decryptSecret(stored: string, key: Buffer): string {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== ALGORITHM) {
    throw new SecretBoxError('Stored secret is not in the aes-256-gcm envelope form.');
  }

  const [, ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64 ?? '', 'base64');
  const authTag = Buffer.from(tagB64 ?? '', 'base64');
  if (iv.length !== IV_BYTES || authTag.length !== 16) {
    throw new SecretBoxError('Stored secret has a malformed IV or authentication tag.');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(Buffer.from(cipherB64 ?? '', 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Either the key is not the one used to encrypt, or the value was altered.
    // Both are the same situation for a caller: this secret cannot be read.
    throw new SecretBoxError(
      'Stored secret could not be decrypted — CONFIG_ENCRYPTION_KEY does not match the value in the database.',
    );
  }
}
