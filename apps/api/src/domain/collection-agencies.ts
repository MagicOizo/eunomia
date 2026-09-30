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
  PAYMENT_DETAIL_COLUMNS,
  type AgencyPaymentDetail,
  bicField,
  defaultPaymentDetail,
  ibanField,
  insertPaymentDetail,
  listPaymentDetails,
  recipientNameField,
} from './agency-payment-details.js';

/**
 * Collection agencies (Inkasso). Not the generic master-data router any more:
 * the payment details are a table of their own (`AgencyBankAccounts`, see
 * domain/agency-payment-details.ts), and since Slice 44 an agency holds several
 * sets of them at once — so an agency is read with all of them and created
 * together with its first.
 *
 * Every read also carries that first set, flattened as `bankAccount`, `bic` and
 * `recipientName`: it is the one an invoice is suggested, and it keeps the lists
 * and pickers of the UI working on plain fields.
 */

export const agenciesTable: CrudTable = {
  table: 'CollectionAgencies',
  uidColumn: 'agencyUID',
  statusColumn: 'agencyStatus',
  entity: 'agency',
  columns: ['agencyName'],
};

const nameField = z.string().trim().min(1).max(100);

/**
 * Creating an agency carries its first payment details — an agency without them
 * could not be paid, and being the first they are what every invoice of that
 * agency is suggested. Further ones are added through /:uid/accounts.
 */
const createSchema = z.object({
  agencyName: nameField,
  bankAccount: ibanField,
  bic: bicField.nullish(),
  recipientName: recipientNameField.nullish(),
});

/** Only the agency's own field: payment details change through /:uid/accounts. */
const updateSchema = z.object({ agencyName: nameField }).partial();

/**
 * The agency row plus its payment details and, flattened, the first of them. The
 * field stays `accounts`: it is what the web reads (see §2.8 on the vocabulary).
 */
function withPaymentDetails(agency: Row, details: AgencyPaymentDetail[]): Row {
  const first = defaultPaymentDetail(details);
  return {
    ...agency,
    bankAccount: first?.bankAccount ?? null,
    bic: first?.bic ?? null,
    recipientName: first?.recipientName ?? null,
    accounts: details,
  };
}

/** CRUD router for collection agencies (Inkasso). */
export function createCollectionAgenciesRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool, config);
  const requireManage = createRequirePermission(pool, PERMISSIONS.MANAGE_AGENCIES);

  router.get('/', requireAuth, async (_req, res) => {
    const agencies = await listRows(pool, agenciesTable);
    // One query for all payment details instead of one per agency: the set is
    // small, and the list is the page's own query.
    const details = await pool.query<Array<AgencyPaymentDetail & { agencyUID: string }>>(
      `SELECT agencyUID, ${PAYMENT_DETAIL_COLUMNS} FROM AgencyBankAccounts
        WHERE agencyAccountStatus <> -1
        ORDER BY agencyAccountID`,
    );
    const byAgency = new Map<string, AgencyPaymentDetail[]>();
    for (const { agencyUID, ...detail } of details) {
      byAgency.set(agencyUID, [...(byAgency.get(agencyUID) ?? []), detail]);
    }
    sendData(
      res,
      agencies.map((agency) =>
        withPaymentDetails(agency, byAgency.get(String(agency.agencyUID)) ?? []),
      ),
    );
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const uid = pathParam(req, 'uid');
    const agency = await getRow(pool, agenciesTable, uid);
    if (!agency) throw notFound('Collection agency');
    sendData(res, withPaymentDetails(agency, await listPaymentDetails(pool, uid)));
  });

  router.post('/', requireAuth, requireManage, async (req, res) => {
    const { agencyName, ...detail } = createSchema.parse(req.body);
    const created = await withTransaction(pool, async (conn) => {
      const agency = await insertRow(conn, agenciesTable, { agencyName });
      await insertPaymentDetail(conn, String(agency.agencyUID), detail);
      return agency;
    });
    sendData(
      res,
      withPaymentDetails(created, await listPaymentDetails(pool, String(created.agencyUID))),
      201,
    );
  });

  router.patch('/:uid', requireAuth, requireManage, async (req, res) => {
    const uid = pathParam(req, 'uid');
    const data = updateSchema.parse(req.body);
    const updated = await updateRow(pool, agenciesTable, uid, data);
    if (!updated) throw notFound('Collection agency');
    sendData(res, withPaymentDetails(updated, await listPaymentDetails(pool, uid)));
  });

  router.delete('/:uid', requireAuth, requireManage, async (req, res) => {
    const deleted = await softDeleteRow(pool, agenciesTable, pathParam(req, 'uid'));
    if (!deleted) throw notFound('Collection agency');
    res.status(204).end();
  });

  return router;
}
