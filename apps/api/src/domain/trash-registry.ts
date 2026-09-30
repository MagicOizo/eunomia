import { type CrudTable, type Queryable, type Row } from '../crud/repository.js';
import { conflict } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { germanDate, germanMoney } from '../lib/german.js';
import { ENTITY_PREFIX, type EntityName } from '../lib/ids.js';
import { paymentDetailsTable } from './agency-payment-details.js';
import { allocationsTable } from './allocations.js';
import { agenciesTable } from './collection-agencies.js';
import { contractsTable } from './contract-access.js';
import { assertValidityFree, premiumSpec, termsSpec } from './contract-history.js';
import { accountsTable } from './accounts.js';
import { facilitiesTable } from './facilities.js';
import { companiesTable } from './insurance-companies.js';
import { invoicesTable } from './invoices.js';
import { assertBillingNumberFree, billingsTable } from './service-billings.js';
import { submissionsTable } from './submissions.js';

/**
 * What the Papierkorb knows about each kind of record (see
 * Notes/eunomia-plan.md, Slice 39): its German name, how one of its rows reads
 * to a human, and what has to hold before it may come back.
 *
 * The user administration is deliberately absent — a user is deactivated or
 * removed in its own mask, and migration 013 gives `Users` no `deletedAt`.
 */

/** A record as the trash presents it. */
export interface TrashEntry {
  uid: string;
  /** What the record is called, e.g. an invoice number or a person's name. */
  label: string;
  /** Where it belongs, e.g. "Anna Muster, 120,00 €, 04.03.2026" — may be empty. */
  context: string;
  /** Local time `YYYY-MM-DDTHH:MM:SS`, or null for a row deleted before Slice 39. */
  deletedAt: string | null;
}

export interface TrashEntity {
  /** Stable key for the API payload and the grouping in the UI. */
  key: string;
  /** Entity name from lib/ids.ts — its prefix identifies a UID's kind. */
  entity: EntityName;
  table: CrudTable;
  singular: string;
  plural: string;
  /** Alias the `listSql` gives the entity's own table, so callers can narrow it. */
  alias: string;
  /**
   * SELECT over the DELETED rows, ending on the status condition. It yields
   * `uid`, `deletedAt` and whatever `describe` reads; the joins to ancestors
   * are LEFT and carry NO status filter, because an ancestor may be deleted too.
   */
  listSql: string;
  describe: (row: Row) => { label: string; context: string };
  /** Set when the kind cannot be restored at all; the sentence says why. */
  restoreNote?: string;
  /**
   * Throws when bringing this row back would produce a state the masks forbid
   * (a second premium for one day, a billing number used twice, …). Runs before
   * anything is written, inside the restore's transaction.
   */
  assertRestorable?: (db: Queryable, row: Row) => Promise<void>;
}

/**
 * Two readings of the same column: `deletedAt` as local time without a zone
 * suffix — what the web's `germanDateTime` reads — and `batch`, the exact
 * microsecond that identifies one deletion batch (see `deletionTimestamp`).
 */
const DELETED_AT = (alias: string): string =>
  `DATE_FORMAT(${alias}.deletedAt, '%Y-%m-%dT%H:%i:%s') AS deletedAt,
                     ${BATCH_OF(alias)} AS batch`;

/** The batch expression on its own, for matching a child against its parent's. */
export const BATCH_OF = (alias: string): string =>
  `DATE_FORMAT(${alias}.deletedAt, '%Y-%m-%d %H:%i:%s.%f')`;

const text = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

/** "Anna Muster" from a joined Accounts row. */
const personName = (row: Row, prefix = ''): string =>
  [text(row[`${prefix}firstname`]), text(row[`${prefix}surname`])].filter(Boolean).join(' ');

/** Joins the parts of a context line, leaving out what is missing. */
const context = (...parts: Array<string | null | undefined>): string =>
  parts.filter((part) => part !== null && part !== undefined && part !== '').join(', ');

const policy = (row: Row): string => {
  const number = text(row.contractNumber);
  return number === '' ? '' : `Police ${number}`;
};

/**
 * No enrichment, checked for a single reimbursement about to come back: all
 * active reimbursements of the invoice, over every policy, plus this one must
 * stay within the invoice amount. The same rule as booking one
 * (see allocations.ts), only from the other direction.
 */
async function assertReimbursementFits(db: Queryable, row: Row): Promise<void> {
  const [sums] = await db.query<
    Array<{ invoiceNumber: string; invoiceAmount: number; allocated: number }>
  >(
    `SELECT i.invoiceNumber, i.invoiceAmount,
            COALESCE((SELECT SUM(a.reimbursement) FROM Allocations a
                       WHERE a.invoiceUID = i.invoiceUID AND a.allocationStatus <> -1), 0) AS allocated
       FROM Invoices i WHERE i.invoiceUID = ?`,
    [row.invoiceUID],
  );
  if (!sums) return;
  const cents = (value: number): number => Math.round(Number(value) * 100);
  if (cents(sums.allocated) + cents(row.reimbursement as number) > cents(sums.invoiceAmount)) {
    throw conflict('The reimbursements would exceed the invoice amount', {
      code: ERROR_CODES.REIMBURSEMENT_EXCEEDS_INVOICE,
      details: { invoices: [sums.invoiceNumber] },
    });
  }
}

/**
 * The order is the order of the page: the master data a household edits by
 * hand first, the workflow records after it.
 */
export const TRASH_ENTITIES: TrashEntity[] = [
  {
    key: 'account',
    entity: 'account',
    table: accountsTable,
    singular: 'Versicherter',
    plural: 'Versicherte',
    alias: 'a',
    listSql: `SELECT a.accountUID AS uid, ${DELETED_AT('a')},
                     a.firstname, a.surname, a.birthDate
                FROM Accounts a
               WHERE a.accountStatus = -1`,
    describe: (row) => ({
      label: personName(row),
      context: context(`geboren ${germanDate(text(row.birthDate))}`),
    }),
  },
  {
    key: 'company',
    entity: 'company',
    table: companiesTable,
    singular: 'Versicherung',
    plural: 'Versicherungen',
    alias: 'v',
    listSql: `SELECT v.companyUID AS uid, ${DELETED_AT('v')},
                     v.companyName, v.addressCity
                FROM InsuranceCompanies v
               WHERE v.companyStatus = -1`,
    describe: (row) => ({ label: text(row.companyName), context: text(row.addressCity) }),
  },
  {
    key: 'contract',
    entity: 'contract',
    table: contractsTable,
    singular: 'Police',
    plural: 'Policen',
    alias: 'c',
    listSql: `SELECT c.contractUID AS uid, ${DELETED_AT('c')},
                     c.contractNumber, a.firstname, a.surname, v.companyName
                FROM Contracts c
                LEFT JOIN Accounts a ON a.accountUID = c.accountUID
                LEFT JOIN InsuranceCompanies v ON v.companyUID = c.companyUID
               WHERE c.contractStatus = -1`,
    describe: (row) => ({
      label: text(row.contractNumber),
      context: context(personName(row), text(row.companyName)),
    }),
  },
  {
    key: 'premium',
    entity: 'premium',
    table: premiumSpec.table,
    singular: 'Beitragsstand',
    plural: 'Beitragsstände',
    alias: 'b',
    listSql: `SELECT b.premiumUID AS uid, ${DELETED_AT('b')},
                     b.validFrom, b.monthlyPremium, b.contractUID, c.contractNumber
                FROM ContractPremiums b
                LEFT JOIN Contracts c ON c.contractUID = b.contractUID
               WHERE b.premiumStatus = -1`,
    describe: (row) => ({
      label: `ab ${germanDate(text(row.validFrom))}`,
      context: context(policy(row), germanMoney(Number(row.monthlyPremium)) + ' im Monat'),
    }),
    assertRestorable: (db, row) =>
      assertValidityFree(db, premiumSpec, String(row.contractUID), String(row.validFrom), null),
  },
  {
    key: 'contractTerms',
    entity: 'contractTerms',
    table: termsSpec.table,
    singular: 'Konditionen',
    plural: 'Konditionen',
    alias: 'k',
    listSql: `SELECT k.termsUID AS uid, ${DELETED_AT('k')},
                     k.validFromYear, k.contractUID, c.contractNumber
                FROM ContractTerms k
                LEFT JOIN Contracts c ON c.contractUID = k.contractUID
               WHERE k.termsStatus = -1`,
    describe: (row) => ({
      label: `ab Jahr ${text(row.validFromYear)}`,
      context: context(policy(row)),
    }),
    assertRestorable: (db, row) =>
      assertValidityFree(db, termsSpec, String(row.contractUID), Number(row.validFromYear), null),
  },
  {
    key: 'facility',
    entity: 'facility',
    table: facilitiesTable,
    singular: 'Leistungserbringer',
    plural: 'Leistungserbringer',
    alias: 'f',
    listSql: `SELECT f.facilityUID AS uid, ${DELETED_AT('f')}, f.facilityName, f.distanceKm
                FROM Facilities f
               WHERE f.facilityStatus = -1`,
    describe: (row) => ({
      label: text(row.facilityName),
      context: row.distanceKm === null ? '' : `${text(row.distanceKm)} km`,
    }),
  },
  {
    key: 'agency',
    entity: 'agency',
    table: agenciesTable,
    singular: 'Abrechnungsdienstleister',
    plural: 'Abrechnungsdienstleister',
    alias: 'g',
    listSql: `SELECT g.agencyUID AS uid, ${DELETED_AT('g')}, g.agencyName
                FROM CollectionAgencies g
               WHERE g.agencyStatus = -1`,
    describe: (row) => ({ label: text(row.agencyName), context: '' }),
  },
  {
    key: 'agencyAccount',
    entity: 'agencyAccount',
    table: paymentDetailsTable,
    singular: 'Kontoverbindung',
    plural: 'Kontoverbindungen',
    alias: 'ga',
    listSql: `SELECT ga.agencyAccountUID AS uid, ${DELETED_AT('ga')},
                     ga.bankAccount, ga.recipientName, ga.note, g.agencyName
                FROM AgencyBankAccounts ga
                LEFT JOIN CollectionAgencies g ON g.agencyUID = ga.agencyUID
               WHERE ga.agencyAccountStatus = -1`,
    // No assertRestorable: since Slice 44 an agency may hold any number of
    // accounts side by side, so there is no rule a returning one could break.
    describe: (row) => ({
      label: text(row.bankAccount),
      context: context(text(row.agencyName), text(row.recipientName), text(row.note)),
    }),
  },
  {
    key: 'submission',
    entity: 'submission',
    table: submissionsTable,
    singular: 'Einreichung',
    plural: 'Einreichungen',
    alias: 'e',
    listSql: `SELECT e.submissionUID AS uid, ${DELETED_AT('e')},
                     e.submittedDate, c.contractNumber
                FROM Submissions e
                LEFT JOIN Contracts c ON c.contractUID = e.contractUID
               WHERE e.submissionStatus = -1`,
    describe: (row) => ({
      label: `vom ${germanDate(text(row.submittedDate))}`,
      context: context(policy(row)),
    }),
    // A submission only ever goes when its last invoice is withdrawn, so what
    // lies here is an empty shell: bringing it back would restore a submission
    // no view can show. It stays visible so the database can be tidied up.
    restoreNote: 'Eine Einreichung ohne Rechnungen kann nicht wiederhergestellt werden.',
  },
  {
    key: 'invoice',
    entity: 'invoice',
    table: invoicesTable,
    singular: 'Rechnung',
    plural: 'Rechnungen',
    alias: 'i',
    listSql: `SELECT i.invoiceUID AS uid, ${DELETED_AT('i')},
                     i.invoiceNumber, i.invoiceDate, i.invoiceAmount, a.firstname, a.surname
                FROM Invoices i
                LEFT JOIN Accounts a ON a.accountUID = i.accountUID
               WHERE i.invoiceStatus = -1`,
    describe: (row) => ({
      label: text(row.invoiceNumber),
      context: context(
        personName(row),
        germanMoney(Number(row.invoiceAmount)),
        germanDate(text(row.invoiceDate)),
      ),
    }),
  },
  {
    key: 'serviceBilling',
    entity: 'serviceBilling',
    table: billingsTable,
    singular: 'Leistungsabrechnung',
    plural: 'Leistungsabrechnungen',
    alias: 's',
    listSql: `SELECT s.billingUID AS uid, ${DELETED_AT('s')},
                     s.billingNumber, s.billingDate, s.contractUID, c.contractNumber
                FROM ServiceBillings s
                LEFT JOIN Contracts c ON c.contractUID = s.contractUID
               WHERE s.billingStatus = -1`,
    describe: (row) => ({
      label: text(row.billingNumber),
      context: context(policy(row), `vom ${germanDate(text(row.billingDate))}`),
    }),
    // The row being restored is deleted and therefore not its own rival, so no
    // `exceptUID` is needed here.
    assertRestorable: (db, row) =>
      assertBillingNumberFree(db, String(row.contractUID), text(row.billingNumber)),
  },
  {
    key: 'allocation',
    entity: 'allocation',
    table: allocationsTable,
    singular: 'Erstattung',
    plural: 'Erstattungen',
    alias: 'l',
    listSql: `SELECT l.allocationUID AS uid, ${DELETED_AT('l')},
                     l.reimbursement, l.invoiceUID, i.invoiceNumber, s.billingNumber
                FROM Allocations l
                LEFT JOIN Invoices i ON i.invoiceUID = l.invoiceUID
                LEFT JOIN ServiceBillings s ON s.billingUID = l.billingUID
               WHERE l.allocationStatus = -1`,
    describe: (row) => ({
      label: germanMoney(Number(row.reimbursement)),
      context: context(
        row.invoiceNumber === null ? '' : `Rechnung ${text(row.invoiceNumber)}`,
        row.billingNumber === null ? '' : `Abrechnung ${text(row.billingNumber)}`,
      ),
    }),
    assertRestorable: assertReimbursementFits,
  },
];

const byTable = new Map(TRASH_ENTITIES.map((entity) => [entity.table.table, entity]));
const byPrefix = new Map<string, TrashEntity>(
  TRASH_ENTITIES.map((entity) => [ENTITY_PREFIX[entity.entity] as string, entity]),
);

/** The entity a table belongs to, or undefined for a link table the trash ignores. */
export function entityOfTable(table: string): TrashEntity | undefined {
  return byTable.get(table);
}

/**
 * The entity a public ID belongs to, read from its one-character prefix (see
 * lib/ids.ts) — so the trash needs no entity name in its URLs.
 */
export function entityOfUid(uid: string): TrashEntity | undefined {
  return byPrefix.get(uid.slice(0, 1));
}
