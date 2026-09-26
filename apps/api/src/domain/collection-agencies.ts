import { Router } from 'express';
import type { Pool } from 'mariadb';
import { z } from 'zod';

import { createRequireAuth, createRequirePermission } from '../auth/middleware.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AppConfig } from '../config/env.js';
import { sendData } from '../crud/envelope.js';
import { pathParam } from '../crud/params.js';
import {
  type CrudTable,
  type Row,
  getRow,
  insertRow,
  listRows,
  softDeleteRow,
  updateRow,
} from '../crud/repository.js';
import { withTransaction } from '../db/transaction.js';
import { notFound } from '../lib/api-error.js';
import {
  ACCOUNT_COLUMNS,
  type AgencyAccount,
  type AgencyAccountWithValidity,
  accountInForce,
  bicField,
  ibanField,
  insertAccount,
  listAccountsWithValidity,
  recipientNameField,
  withValidity,
} from './agency-accounts.js';

/**
 * Collection agencies (Inkasso). Not the generic master-data router any more:
 * since Slice 38 the bank account is a history of its own
 * (`AgencyBankAccounts`, see domain/agency-accounts.ts), so an agency is read
 * with its accounts and created together with its first one.
 *
 * Every read also carries the account in force today, flattened as
 * `bankAccount`, `bic` and `recipientName` — that is what a list of agencies is
 * looked at for, and it keeps the lists and pickers of the UI working on plain
 * fields.
 */

const table: CrudTable = {
  table: 'CollectionAgencies',
  uidColumn: 'agencyUID',
  statusColumn: 'agencyStatus',
  entity: 'agency',
  columns: ['agencyName'],
};

const nameField = z.string().trim().min(1).max(100);

/**
 * Creating an agency carries its first bank account — an agency without one
 * could not be paid. It is stored undated ("applies from the beginning"), so
 * nothing has to be invented about when it started; a later change is what
 * gets a date.
 */
const createSchema = z.object({
  agencyName: nameField,
  bankAccount: ibanField,
  bic: bicField.nullish(),
  recipientName: recipientNameField.nullish(),
});

/** Only the agency's own field: accounts are changed through /:uid/accounts. */
const updateSchema = z.object({ agencyName: nameField }).partial();

/** The agency row plus its accounts and, flattened, the one in force today. */
function withAccounts(agency: Row, accounts: AgencyAccountWithValidity[]): Row {
  const inForce = accountInForce(accounts);
  return {
    ...agency,
    bankAccount: inForce?.bankAccount ?? null,
    bic: inForce?.bic ?? null,
    recipientName: inForce?.recipientName ?? null,
    accounts,
  };
}

/** CRUD router for collection agencies (Inkasso). */
export function createCollectionAgenciesRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireManage = createRequirePermission(pool, PERMISSIONS.MANAGE_AGENCIES);

  router.get('/', requireAuth, async (_req, res) => {
    const agencies = await listRows(pool, table);
    // One query for all accounts instead of one per agency: the set is small,
    // and the list is the page's own query.
    const accounts = await pool.query<Array<AgencyAccount & { agencyUID: string }>>(
      `SELECT agencyUID, ${ACCOUNT_COLUMNS} FROM AgencyBankAccounts
        WHERE agencyAccountStatus <> -1
        ORDER BY validFrom`,
    );
    const byAgency = new Map<string, AgencyAccount[]>();
    for (const { agencyUID, ...account } of accounts) {
      byAgency.set(agencyUID, [...(byAgency.get(agencyUID) ?? []), account]);
    }
    sendData(
      res,
      agencies.map((agency) =>
        withAccounts(agency, withValidity(byAgency.get(String(agency.agencyUID)) ?? [])),
      ),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const uid = pathParam(req, 'uid');
    const agency = await getRow(pool, table, uid);
    if (!agency) throw notFound('Collection agency');
    sendData(res, withAccounts(agency, await listAccountsWithValidity(pool, uid)));
  });

  router.post('/', requireAuth, requireManage, async (req, res) => {
    const { agencyName, ...account } = createSchema.parse(req.body);
    const created = await withTransaction(pool, async (conn) => {
      const agency = await insertRow(conn, table, { agencyName });
      await insertAccount(conn, String(agency.agencyUID), account);
      return agency;
    });
    sendData(
      res,
      withAccounts(created, await listAccountsWithValidity(pool, String(created.agencyUID))),
      201,
    );
  });

  router.patch('/:uid', requireAuth, requireManage, async (req, res) => {
    const uid = pathParam(req, 'uid');
    const data = updateSchema.parse(req.body);
    const updated = await updateRow(pool, table, uid, data);
    if (!updated) throw notFound('Collection agency');
    sendData(res, withAccounts(updated, await listAccountsWithValidity(pool, uid)));
  });

  router.delete('/:uid', requireAuth, requireManage, async (req, res) => {
    const deleted = await softDeleteRow(pool, table, pathParam(req, 'uid'));
    if (!deleted) throw notFound('Collection agency');
    res.status(204).end();
  });

  return router;
}
