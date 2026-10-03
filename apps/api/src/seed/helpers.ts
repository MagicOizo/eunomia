import type { Pool } from 'mariadb';

import { placeholders } from '../crud/repository.js';
import { ENTITY_PREFIX, ID_ALPHABET, type EntityName } from '../lib/ids.js';

/**
 * Shared building blocks of the development seed. Every seeded row uses a
 * DETERMINISTIC public ID (prefix + "SEED" + an index) so re-running the seed
 * touches the same rows and never duplicates them.
 */

/**
 * The digits and capitals of the ID alphabet. Seed IDs stay out of its
 * lowercase half on purpose: the UID columns use a case-insensitive collation
 * (utf8mb4_uca1400_ai_ci), so a lowercase body would fold onto the capital of
 * the same letter — `iSEEDaaaaaaa` and `iSEEDAAAAAAA` are one and the same row
 * to the UNIQUE index, and `seedRow`'s ON DUPLICATE KEY UPDATE would drop the
 * second one without a word.
 */
const SEED_ALPHABET = ID_ALPHABET.slice(0, 32);

/** Builds a stable, valid public ID for a seed row from its entity and index. */
export function seedId(entity: EntityName, index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= SEED_ALPHABET.length) {
    throw new Error(
      `Seed index ${index} is out of range: use 0..${SEED_ALPHABET.length - 1} (see SEED_ALPHABET).`,
    );
  }
  // charAt returns a plain string (never undefined); the guard above keeps the
  // index inside the alphabet, so the body is always 7 valid characters.
  const body = SEED_ALPHABET.charAt(index).repeat(7);
  return `${ENTITY_PREFIX[entity]}SEED${body}`;
}

/** Inserts a row if its UID is not already present; a repeat run is a no-op. */
export async function seedRow(
  pool: Pool,
  table: string,
  row: Record<string, string | number | null>,
): Promise<void> {
  const columns = Object.keys(row);
  const [firstColumn] = columns;
  if (firstColumn === undefined) {
    throw new Error(`seedRow called with no columns for table ${table}`);
  }
  await pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders(columns)})
     ON DUPLICATE KEY UPDATE ${firstColumn} = ${firstColumn}`,
    Object.values(row),
  );
}

/**
 * The treatment years the seed data spans, relative to today: the current
 * year always carries data, so the invoice workspace opens on a filled year
 * whenever the seed is run.
 */
export function seedYear(offset: number): number {
  return new Date().getFullYear() + offset;
}

/** `YYYY-MM-DD` in a seed year, for dates that must fall into a given year. */
export function seedDate(offset: number, monthDay: string): string {
  return `${seedYear(offset)}-${monthDay}`;
}

/** A date relative to today, for the payment traffic light (due soon, overdue). */
export function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
