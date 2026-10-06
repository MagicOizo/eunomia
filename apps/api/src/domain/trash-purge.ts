import { ERROR_CODES } from '@eunomia/shared';
import type { Pool } from 'mariadb';

import { type Queryable, hardDeleteRow, softDeleteRow } from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { conflict } from '../lib/api-error.js';
import { linksTo } from './trash-references.js';
import { TRASH_ENTITIES, entityOfTable } from './trash-registry.js';
import { type Located, blockers, deletedDescendants } from './trash-tree.js';

/**
 * Removing a record for good. It sits here rather than in `trash.ts` because it
 * has two callers since Slice 18: the trash route, where an administrator
 * presses the button, and the retention sweep (retention/sweep.ts), where the
 * period does it unattended. One mechanism, so the unattended path cannot
 * develop rules of its own — the same reason the reading half became
 * `trash-tree.ts` in Scheibe 13.
 */

/**
 * Removes the record for good, together with the deleted records below it and
 * the link rows that belong to it. Refuses while something active points at it.
 * Answers how many further records went with it, for the audit line.
 */
export async function purgeEntry(pool: Pool, located: Located): Promise<number> {
  const stopping = await blockers(pool, located);
  if (stopping.length > 0) {
    throw conflict('The record is still referenced by active records', {
      code: ERROR_CODES.STILL_REFERENCED,
      details: {
        entry: { kind: located.entity.key, label: located.entry.label },
        blockers: stopping,
      },
    });
  }

  return withTransaction(pool, async (conn) => {
    const below = await deletedDescendants(conn, located);
    // Children first, the record last — the foreign keys are all RESTRICT.
    for (const one of [...below, located]) {
      for (const link of await linksTo(conn, one.entity.table.table, one.entity.table.uidColumn)) {
        if (entityOfTable(link.table)) continue;
        // A link is not a record of its own (migration 007): it goes with the
        // row it links. What the database cascades itself is left to it.
        if (link.deleteRule === 'RESTRICT' || link.deleteRule === 'NO ACTION') {
          await conn.query(`DELETE FROM ${link.table} WHERE ${link.column} = ?`, [one.uid]);
        }
      }
      await hardDeleteRow(conn, one.entity.table, one.uid);
    }
    // A submission that just lost its last invoice is an empty shell no view
    // can show, so it follows its invoices into the trash — the same rule as
    // withdrawing the last invoice by hand (see submissions.ts).
    await softDeleteEmptySubmissions(conn);
    return below.length;
  });
}

/** Soft-deletes every active submission left without invoices. */
async function softDeleteEmptySubmissions(db: Queryable): Promise<void> {
  const rows = await db.query<Array<{ submissionUID: string }>>(
    `SELECT s.submissionUID FROM Submissions s
      WHERE s.submissionStatus <> -1
        AND NOT EXISTS (SELECT 1 FROM SubmissionInvoices si
                         WHERE si.submissionUID = s.submissionUID)`,
  );
  const entity = TRASH_ENTITIES.find((one) => one.key === 'submission');
  if (!entity) return;
  for (const row of rows) await softDeleteRow(db, entity.table, row.submissionUID);
}
