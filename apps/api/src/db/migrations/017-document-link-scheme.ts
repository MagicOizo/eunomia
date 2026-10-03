import { isHttpUrl } from '@eunomia/shared';

import type { MigrationContext } from '../umzug.js';

/**
 * Clears document links a browser must not follow.
 *
 * Until now `documentLink` was validated with zod's `.url()`, which only asks
 * whether the WHATWG parser accepts the value — not what scheme it carries. A
 * `javascript:` link therefore made it into the column, and from there into an
 * `<a href>` in the payment information, where a click would run it in the
 * origin that holds the access token (Sicherheits-Review, SEC-01).
 *
 * The schemas now refuse anything but http(s). This is the stored side of the
 * same rule. Decided by the author (2026-10-03): an invalid document link has
 * no business in a production database, so it is removed rather than kept and
 * worked around in the interface. Nothing else about the row is touched — the
 * invoice or billing itself is untouched data, only the link goes.
 *
 * The verdict comes from the same `isHttpUrl` the schemas use, not from a
 * REGEXP written out here, so exactly the rule that is enforced from now on is
 * the rule applied to the stock (the precedent for importing into a migration
 * is 002, which generates its UIDs with `generateEntityId`). The price is that
 * a later change to that helper would also change what this migration does on
 * a database that has not run it yet; for a check this narrow — the scheme of a
 * URL — that is the better trade than a second copy of the rule.
 *
 * What it clears is logged with the UIDs, so an operator can see afterwards
 * which rows lost a link and ask the person who entered it.
 */

interface LinkRow {
  uid: string;
  documentLink: string;
}

const TABLES = [
  { table: 'Invoices', uidColumn: 'invoiceUID' },
  { table: 'ServiceBillings', uidColumn: 'billingUID' },
];

export async function up({ context: pool }: MigrationContext): Promise<void> {
  for (const { table, uidColumn } of TABLES) {
    const rows = await pool.query<LinkRow[]>(
      `SELECT ${uidColumn} AS uid, documentLink FROM ${table} WHERE documentLink IS NOT NULL`,
    );
    const unsafe = rows.filter((row) => !isHttpUrl(row.documentLink));
    if (unsafe.length === 0) continue;

    const uids = unsafe.map((row) => row.uid);
    await pool.query(
      `UPDATE ${table} SET documentLink = NULL
        WHERE ${uidColumn} IN (${uids.map(() => '?').join(', ')})`,
      uids,
    );
    console.info(
      `017: cleared ${String(unsafe.length)} document link(s) in ${table} that were not http(s): ${uids.join(', ')}`,
    );
  }
}

/**
 * Nothing to undo: the values are gone, and a migration cannot invent them
 * back. Present so the migration can be rolled back as part of a sequence
 * without the runner stopping on a missing `down`.
 */
export async function down(): Promise<void> {
  // Intentionally empty — see above.
}
