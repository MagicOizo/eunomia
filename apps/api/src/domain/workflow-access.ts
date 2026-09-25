import type { Pool, PoolConnection } from 'mariadb';

import { forbidden } from '../auth/errors.js';
import { type PermissionKey, hasPermission } from '../auth/permissions.js';
import { notFound } from '../lib/api-error.js';

type Queryable = Pool | PoolConnection;

/**
 * Every workflow entity ultimately belongs to one account, reached by walking
 * the chain back to Contracts. These helpers resolve that owning account UID so
 * a permission can be checked against it; each returns null when the entity
 * does not exist (or is soft-deleted).
 */

export async function accountForContract(
  db: Queryable,
  contractUID: string,
): Promise<string | null> {
  const rows = await db.query<Array<{ accountUID: string }>>(
    'SELECT accountUID FROM Contracts WHERE contractUID = ? AND contractStatus <> -1 LIMIT 1',
    [contractUID],
  );
  return rows[0]?.accountUID ?? null;
}

export async function accountForSubmission(
  db: Queryable,
  submissionUID: string,
): Promise<string | null> {
  const rows = await db.query<Array<{ accountUID: string }>>(
    `SELECT c.accountUID
       FROM Submissions s
       JOIN Contracts c ON c.contractUID = s.contractUID
      WHERE s.submissionUID = ? AND s.submissionStatus <> -1
      LIMIT 1`,
    [submissionUID],
  );
  return rows[0]?.accountUID ?? null;
}

export async function accountForBilling(db: Queryable, billingUID: string): Promise<string | null> {
  const rows = await db.query<Array<{ accountUID: string }>>(
    `SELECT c.accountUID
       FROM ServiceBillings b
       JOIN Contracts c ON c.contractUID = b.contractUID
      WHERE b.billingUID = ? AND b.billingStatus <> -1
      LIMIT 1`,
    [billingUID],
  );
  return rows[0]?.accountUID ?? null;
}

export async function accountForInvoice(db: Queryable, invoiceUID: string): Promise<string | null> {
  const rows = await db.query<Array<{ accountUID: string }>>(
    'SELECT accountUID FROM Invoices WHERE invoiceUID = ? AND invoiceStatus <> -1 LIMIT 1',
    [invoiceUID],
  );
  return rows[0]?.accountUID ?? null;
}

/** Throws forbidden() unless the user holds `permission` on `accountUID`. */
export async function authorizeAccount(
  db: Pool,
  userId: number,
  permission: PermissionKey,
  accountUID: string,
): Promise<void> {
  if (!(await hasPermission(db, userId, permission, accountUID))) throw forbidden();
}

/**
 * Resolves an entity's owning account via `resolver`, 404s if it is missing,
 * then authorizes `permission` on it. Returns the account UID for reuse.
 */
export async function requireEntityAccount(
  db: Pool,
  userId: number,
  permission: PermissionKey,
  resource: string,
  accountUID: string | null,
): Promise<string> {
  if (accountUID === null) throw notFound(resource);
  await authorizeAccount(db, userId, permission, accountUID);
  return accountUID;
}
