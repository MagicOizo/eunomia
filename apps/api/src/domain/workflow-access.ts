import type { PermissionKey } from '@eunomia/shared';
import type { Pool, PoolConnection } from 'mariadb';

import { forbidden } from '../auth/errors.js';
import { hasPermission } from '../auth/permissions.js';
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

async function accountForSubmission(db: Queryable, submissionUID: string): Promise<string | null> {
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

async function accountForBilling(db: Queryable, billingUID: string): Promise<string | null> {
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

async function accountForInvoice(db: Queryable, invoiceUID: string): Promise<string | null> {
  const rows = await db.query<Array<{ accountUID: string }>>(
    'SELECT accountUID FROM Invoices WHERE invoiceUID = ? AND invoiceStatus <> -1 LIMIT 1',
    [invoiceUID],
  );
  return rows[0]?.accountUID ?? null;
}

/** The owning account of an allocation, via its invoice. */
async function accountForAllocation(db: Queryable, allocationUID: string): Promise<string | null> {
  const rows = await db.query<Array<{ accountUID: string }>>(
    `SELECT i.accountUID
       FROM Allocations a
       JOIN Invoices i ON i.invoiceUID = a.invoiceUID
      WHERE a.allocationUID = ? AND a.allocationStatus <> -1
      LIMIT 1`,
    [allocationUID],
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
  if (!(await hasPermission(db, userId, permission, accountUID))) {
    throw forbidden(permission, accountUID);
  }
}

/**
 * 404 before 403, in that order: an account that could not be resolved means
 * the entity is gone, which is answered before the permission on it is looked
 * at. This is the only place the order is written down.
 */
async function requireEntityAccount(
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

/**
 * Builds the guard every single-entity endpoint needs: resolve the owning
 * account, 404, authorize, and hand the account UID back for reuse. The
 * resource name lives here once instead of at every call site.
 */
function entityAccess(
  resolve: (db: Pool, uid: string) => Promise<string | null>,
  resource: string,
) {
  return async (
    db: Pool,
    userId: number,
    permission: PermissionKey,
    uid: string,
  ): Promise<string> =>
    requireEntityAccount(db, userId, permission, resource, await resolve(db, uid));
}

export const requireContractAccount = entityAccess(accountForContract, 'Contract');
export const requireSubmissionAccount = entityAccess(accountForSubmission, 'Submission');
export const requireBillingAccount = entityAccess(accountForBilling, 'Service billing');
export const requireInvoiceAccount = entityAccess(accountForInvoice, 'Invoice');
export const requireAllocationAccount = entityAccess(accountForAllocation, 'Allocation');
