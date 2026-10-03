import type { PermissionKey } from '@eunomia/shared';
import type { Pool } from 'mariadb';

import { forbidden } from '../auth/errors.js';
import { hasPermission } from '../auth/permissions.js';
import { crudTable, getRow } from '../crud/repository.js';
import { notFound } from '../lib/api-error.js';

/**
 * A row of the policy table, in the types the database guarantees: `DATE` and
 * `VARCHAR` arrive as strings (the pool runs on `dateStrings`), `DECIMAL` and
 * the status flags as numbers (`decimalAsNumber`, `bigIntAsNumber`).
 *
 * `contractKind` and `bonusForfeitRule` are plain strings here although the
 * application knows only two values each: the columns are `VARCHAR(16)`
 * (migration 006), so the database promises nothing, and the two places that
 * need the union check the value they read with `oneOf()` instead of being
 * told it by this type.
 */
export type ContractRow = {
  contractUID: string;
  contractNumber: string;
  companyUID: string;
  accountUID: string;
  contractKind: string;
  contractBegin: string;
  contractEnd: string | null;
  bonusForfeitRule: string;
  claimFreeYearsAtStart: number;
  claimFreeCountingFromYear: number | null;
  contractStatus: number;
};

/** The stable policy row (see Notes/eunomia-plan.md, 2.3 "Datenmodell v3"). */
export const contractsTable = crudTable<ContractRow>({
  table: 'Contracts',
  uidColumn: 'contractUID',
  statusColumn: 'contractStatus',
  entity: 'contract',
  columns: [
    'contractNumber',
    'companyUID',
    'accountUID',
    'contractKind',
    'contractBegin',
    'contractEnd',
    'bonusForfeitRule',
    'claimFreeYearsAtStart',
    'claimFreeCountingFromYear',
  ],
});

/**
 * Loads a contract and asserts the caller holds `permission` on its account —
 * a contract (and everything hanging off it) is scoped to its insured person.
 */
export async function loadAuthorizedContract(
  pool: Pool,
  userId: number,
  contractUID: string,
  permission: PermissionKey,
): Promise<ContractRow> {
  const contract = await getRow(pool, contractsTable, contractUID);
  if (!contract) throw notFound('Contract');
  const allowed = await hasPermission(pool, userId, permission, contract.accountUID);
  if (!allowed) throw forbidden();
  return contract;
}
