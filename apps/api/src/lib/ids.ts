import { randomInt } from 'node:crypto';

/**
 * Public identifiers are prefixed NanoIDs, never the auto-increment primary
 * key — carried over from the first attempt at this project (see
 * Notes/eunomia-plan.md, 2.3). Each ID is a one-character entity prefix plus
 * 11 characters from an unambiguous alphabet (no 0/O/1/I/l), so an ID is 12
 * characters total and safe to read aloud or copy by hand.
 */
export const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ID_BODY_LENGTH = 11;

/**
 * The entity prefixes. Adding a new entity means adding a prefix here; the
 * letters match the first attempt so existing IDs stay recognizable, with
 * new letters for the entities introduced in the rebuild.
 */
export const ENTITY_PREFIX = {
  account: 'a',
  company: 'v', // Versicherung
  contract: 'p', // Police
  premium: 'b', // Beitragsstand of a contract
  contractTerms: 'k', // Konditionen (deductible/cap/rate) of a contract
  facility: 'f',
  agency: 'c', // Collection agency
  agencyAccount: 'g', // Girokonto: the payment details of a collection agency
  submission: 'e', // Einreichung (new in the rebuild)
  invoice: 'i',
  serviceBilling: 's',
  allocation: 'l', // aLLocation (successor to the old Assignment)
  role: 'r', // Users themselves use a UUID (see 002 migration), roles a NanoID
} as const;

export type EntityName = keyof typeof ENTITY_PREFIX;

/**
 * Matches a valid public ID for the given prefix (prefix + 11 body chars).
 * The body class is built from ID_ALPHABET rather than written out beside it,
 * so the check cannot drift from what generateEntityId actually hands out —
 * a hand-written `a-z` let the excluded `l` through. Every character of the
 * alphabet is alphanumeric, hence safe inside a class without escaping.
 */
export function entityIdPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}[${ID_ALPHABET}]{${ID_BODY_LENGTH}}$`);
}

/**
 * Generates a fresh public ID for an entity. Uses crypto.randomInt for a
 * uniform, unbiased pick over the alphabet (no modulo bias).
 */
export function generateEntityId(entity: EntityName): string {
  let body = '';
  for (let i = 0; i < ID_BODY_LENGTH; i += 1) {
    body += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  }
  return ENTITY_PREFIX[entity] + body;
}
