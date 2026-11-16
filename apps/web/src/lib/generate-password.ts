/**
 * The characters a generated password is made of: letters and digits without
 * the ones that are mistaken for each other when read aloud or copied off a
 * screen (0/O, 1/l/I). 57 characters, so 16 of them carry about 93 bits.
 */
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const GROUPS = 4;
const GROUP_LENGTH = 4;

/**
 * A password for a new user (Slice 91): the administrator hands it on once,
 * the user changes it under the profile. Four groups of four, joined by `-`,
 * so it can be read out in pieces. Drawn from `crypto.getRandomValues` with
 * rejection sampling — a plain modulo would favour the first characters.
 */
export function generatePassword(random: (length: number) => Uint8Array = randomBytes): string {
  const size = PASSWORD_ALPHABET.length;
  // The largest multiple of `size` that fits in a byte; anything at or above
  // it would skew the draw and is thrown away.
  const limit = 256 - (256 % size);
  const picked: string[] = [];
  while (picked.length < GROUPS * GROUP_LENGTH) {
    for (const byte of random(32)) {
      if (byte >= limit) continue;
      picked.push(PASSWORD_ALPHABET[byte % size]!);
      if (picked.length === GROUPS * GROUP_LENGTH) break;
    }
  }
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i += 1) {
    groups.push(picked.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
