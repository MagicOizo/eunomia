import type { Pool } from 'mariadb';

import { type Row, placeholders } from '../crud/repository.js';
import { groupBy } from '../lib/group.js';

/**
 * Everything the instance has stored about one insured person, as one document
 * (Sicherheits-Review, SEC-15: Art. 15/20 DSGVO). Until now there was no way
 * to answer "what do you have about me" other than reading it off the screens
 * one by one.
 *
 * Three decisions shape what comes out, and each is a rule rather than a
 * detail (see Notes/eunomia-plan.md §2.11):
 *
 *  - **Deleted rows are in it**, with their status and `deletedAt`. An account
 *    of what is stored that leaves out part of what is stored would not be one.
 *  - **Values as stored**, not as the interface shows them: an ISO date, a
 *    number — this is a data set, not a view. Whoever reads it should be able
 *    to compare it with the database.
 *  - **No data about other people.** A payment reminder appears as its stage
 *    and its day, never as its recipient; the access grants to this person's
 *    record (`UserAccountRoles`) are about users and stay out; `leadAccountUID`
 *    stays a UID, so the export of one person does not drag a family with it.
 *
 * The queries are grouped by level, never asked per row (the habit of CR-16/17):
 * one query per table, however many policies or invoices there are.
 */

/** A row of a branch, as stored, minus the internal numeric key. */
export type ExportRow = Row;

export interface AccountExport {
  /** When the document was produced, as an ISO instant. */
  exportedAt: string;
  account: ExportRow;
  contracts: ExportRow[];
  invoices: ExportRow[];
  /**
   * Reimbursements whose billing is not in this document. Structurally
   * impossible today — booking requires the invoice to be submitted on the very
   * policy the billing belongs to — but if one ever existed, it would belong to
   * this person and must not fall out of the document silently.
   */
  unattachedAllocations: ExportRow[];
}

/**
 * Drops the auto-increment key of a row (`invoiceID`, `contractID`, …) and
 * keeps everything else. The internal key is not data about the person, it is
 * how the database happens to count; `…UID` is kept, which is why the rule asks
 * for an `ID` that is not a `UID`.
 */
function strip(row: Row): ExportRow {
  const out: ExportRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (/ID$/.test(key) && !/UID$/.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Every row of `table` whose `column` is one of `uids`, as stored. */
async function rowsFor(
  pool: Pool,
  table: string,
  column: string,
  uids: string[],
): Promise<ExportRow[]> {
  if (uids.length === 0) return [];
  const rows = await pool.query<Row[]>(
    `SELECT * FROM ${table} WHERE ${column} IN (${placeholders(uids)}) ORDER BY ${column}`,
    uids,
  );
  return rows.map(strip);
}

/** Groups rows by the UID they hang on, for nesting them under their owner. */
function under(rows: ExportRow[], column: string): Map<string, ExportRow[]> {
  return groupBy(rows, (row) => String(row[column]));
}

/**
 * Builds the document. Returns null when there is no such insured person — the
 * route turns that into its 404, as every other account route does.
 */
export async function exportAccount(pool: Pool, accountUID: string): Promise<AccountExport | null> {
  const accounts = await pool.query<Row[]>('SELECT * FROM Accounts WHERE accountUID = ?', [
    accountUID,
  ]);
  const account = accounts[0];
  if (account === undefined) return null;

  const contracts = await rowsFor(pool, 'Contracts', 'accountUID', [accountUID]);
  const contractUIDs = contracts.map((row) => String(row.contractUID));
  const invoices = await rowsFor(pool, 'Invoices', 'accountUID', [accountUID]);
  const invoiceUIDs = invoices.map((row) => String(row.invoiceUID));

  const premiums = under(
    await rowsFor(pool, 'ContractPremiums', 'contractUID', contractUIDs),
    'contractUID',
  );
  const terms = await rowsFor(pool, 'ContractTerms', 'contractUID', contractUIDs);
  const tiers = under(
    await rowsFor(
      pool,
      'ContractBonusTiers',
      'termsUID',
      terms.map((row) => String(row.termsUID)),
    ),
    'termsUID',
  );
  const years = under(
    await rowsFor(pool, 'ContractYears', 'contractUID', contractUIDs),
    'contractUID',
  );
  const submissions = await rowsFor(pool, 'Submissions', 'contractUID', contractUIDs);
  const submittedInvoices = under(
    await rowsFor(
      pool,
      'SubmissionInvoices',
      'submissionUID',
      submissions.map((row) => String(row.submissionUID)),
    ),
    'submissionUID',
  );
  const billings = await rowsFor(pool, 'ServiceBillings', 'contractUID', contractUIDs);
  const billingUIDs = billings.map((row) => String(row.billingUID));

  /*
   * Asked from both ends — by billing and by invoice — so a reimbursement
   * cannot be missed through whichever side it hangs on. What matches a billing
   * of this person is nested under it; the rest is listed on its own.
   */
  const allocationSides = [
    ...(billingUIDs.length > 0 ? [`billingUID IN (${placeholders(billingUIDs)})`] : []),
    ...(invoiceUIDs.length > 0 ? [`invoiceUID IN (${placeholders(invoiceUIDs)})`] : []),
  ];
  const allocations =
    allocationSides.length === 0
      ? []
      : (
          await pool.query<Row[]>(
            `SELECT * FROM Allocations
              WHERE ${allocationSides.join(' OR ')}
              ORDER BY billingUID, allocationUID`,
            [...billingUIDs, ...invoiceUIDs],
          )
        ).map(strip);
  const allocationsByBilling = under(allocations, 'billingUID');

  const treatmentDays = under(
    await rowsFor(pool, 'InvoiceTreatmentDays', 'invoiceUID', invoiceUIDs),
    'invoiceUID',
  );
  const exclusions = under(
    await rowsFor(pool, 'InvoiceExclusions', 'invoiceUID', invoiceUIDs),
    'invoiceUID',
  );
  // Columns by name, not `SELECT *`: `userID` says WHO was reminded, which is
  // another person's datum and has no place in this document (rule 3 above).
  const reminders =
    invoiceUIDs.length === 0
      ? new Map<string, ExportRow[]>()
      : under(
          await pool.query<Row[]>(
            `SELECT invoiceUID, stage, sentOn FROM InvoiceReminders
              WHERE invoiceUID IN (${placeholders(invoiceUIDs)})
              ORDER BY invoiceUID, sentOn`,
            invoiceUIDs,
          ),
          'invoiceUID',
        );

  const submissionsOf = under(submissions, 'contractUID');
  const billingsOf = under(billings, 'contractUID');

  return {
    exportedAt: new Date().toISOString(),
    account: strip(account),
    contracts: contracts.map((contract) => {
      const uid = String(contract.contractUID);
      return {
        ...contract,
        premiums: premiums.get(uid) ?? [],
        terms: terms
          .filter((row) => row.contractUID === uid)
          .map((row) => ({ ...row, bonusTiers: tiers.get(String(row.termsUID)) ?? [] })),
        years: years.get(uid) ?? [],
        submissions: (submissionsOf.get(uid) ?? []).map((row) => ({
          ...row,
          invoices: submittedInvoices.get(String(row.submissionUID)) ?? [],
        })),
        billings: (billingsOf.get(uid) ?? []).map((row) => ({
          ...row,
          allocations: allocationsByBilling.get(String(row.billingUID)) ?? [],
        })),
      };
    }),
    invoices: invoices.map((invoice) => {
      const uid = String(invoice.invoiceUID);
      return {
        ...invoice,
        treatmentDays: treatmentDays.get(uid) ?? [],
        exclusions: exclusions.get(uid) ?? [],
        reminders: reminders.get(uid) ?? [],
      };
    }),
    unattachedAllocations: allocations.filter(
      (row) => !billingUIDs.includes(String(row.billingUID)),
    ),
  };
}
