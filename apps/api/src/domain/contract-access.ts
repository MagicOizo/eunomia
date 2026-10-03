import type { PermissionKey } from '@eunomia/shared';
import type { Pool } from 'mariadb';

import { forbidden } from '../auth/errors.js';
import { hasPermission } from '../auth/permissions.js';
import { type CrudTable, getRow } from '../crud/repository.js';
import { notFound } from '../lib/api-error.js';

/** The stable policy row (see Notes/eunomia-plan.md, 2.3 "Datenmodell v3"). */
export const contractsTable: CrudTable = {
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
};

export interface ContractRow {
  contractUID: string;
  accountUID: string;
  contractBegin: string;
  contractEnd: string | null;
  [column: string]: unknown;
}

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
  const contract = (await getRow(pool, contractsTable, contractUID)) as ContractRow | null;
  if (!contract) throw notFound('Contract');
  const allowed = await hasPermission(pool, userId, permission, contract.accountUID);
  if (!allowed) throw forbidden();
  return contract;
}
