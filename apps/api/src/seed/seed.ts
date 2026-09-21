import type { Pool } from 'mariadb';

import { loadDatabaseConfig } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';
import { createPool, waitForDatabase } from '../db/pool.js';
import { ENTITY_PREFIX, ID_ALPHABET, type EntityName } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';

/**
 * Anonymized development seed data. Every row uses a DETERMINISTIC public ID
 * (prefix + "SEED" + an index) so re-running the seed touches the same rows
 * and never duplicates them — inserts are `ON DUPLICATE KEY UPDATE` no-ops on
 * the UID unique key. Intended for local development only; it refuses to run
 * against NODE_ENV=production.
 */

/** Builds a stable, valid public ID for a seed row from its entity and index. */
function seedId(entity: EntityName, index: number): string {
  // charAt returns a plain string (never undefined); indices stay well within
  // the alphabet, so the body is always 7 valid characters.
  const body = ID_ALPHABET.charAt(index % ID_ALPHABET.length).repeat(7);
  return `${ENTITY_PREFIX[entity]}SEED${body}`;
}

/** Inserts a row if its UID is not already present; a repeat run is a no-op. */
async function seedRow(
  pool: Pool,
  table: string,
  row: Record<string, string | number | null>,
): Promise<void> {
  const columns = Object.keys(row);
  const [firstColumn] = columns;
  if (firstColumn === undefined) {
    throw new Error(`seedRow called with no columns for table ${table}`);
  }
  const placeholders = columns.map(() => '?').join(', ');
  await pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${firstColumn} = ${firstColumn}`,
    Object.values(row),
  );
}

/** Public IDs referenced across several rows, named for readability below. */
const ids = {
  accountAnna: seedId('account', 0),
  accountBen: seedId('account', 1),
  company: seedId('company', 0),
  companySupplementary: seedId('company', 1),
  contractAnna: seedId('contract', 0),
  contractAnnaSupplementary: seedId('contract', 1),
  facilityDoctor: seedId('facility', 0),
  facilityRadiology: seedId('facility', 1),
  agency: seedId('agency', 0),
  submission: seedId('submission', 0),
  invoiceOpen: seedId('invoice', 0),
  invoiceSubmitted: seedId('invoice', 1),
  invoiceBilled: seedId('invoice', 2),
  invoiceDone: seedId('invoice', 3),
  invoiceBenOpen: seedId('invoice', 4),
  billing: seedId('serviceBilling', 0),
  allocationBilled: seedId('allocation', 0),
  allocationDone: seedId('allocation', 1),
};

/** Inserts the full seed dataset (invoices spanning every lifecycle state). */
export async function seedDatabase(pool: Pool): Promise<void> {
  await seedRow(pool, 'Accounts', {
    accountUID: ids.accountAnna,
    surname: 'Muster',
    firstname: 'Anna',
    birthDate: '1985-04-12',
  });
  await seedRow(pool, 'Accounts', {
    accountUID: ids.accountBen,
    surname: 'Muster',
    firstname: 'Ben',
    birthDate: '2014-09-30',
    leadAccountUID: ids.accountAnna,
  });

  await seedRow(pool, 'InsuranceCompanies', {
    companyUID: ids.company,
    companyName: 'Beispiel Krankenversicherung AG',
    addressCity: 'Musterstadt',
  });

  await seedRow(pool, 'InsuranceCompanies', {
    companyUID: ids.companySupplementary,
    companyName: 'Beispiel Zusatzversicherung AG',
    addressCity: 'Musterstadt',
  });

  // Anna's full PKV: one stable policy with an intra-year premium adjustment
  // (2024-07) and a deductible change from 2025 — the case that used to force
  // duplicate contracts (see Notes/eunomia-plan.md, 1.3.7).
  await seedRow(pool, 'Contracts', {
    contractUID: ids.contractAnna,
    contractNumber: 'PKV-2020-0001',
    companyUID: ids.company,
    accountUID: ids.accountAnna,
    contractKind: 'FULL',
    contractBegin: '2020-01-01',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    claimFreeYearsAtStart: 2,
    claimFreeCountingFromYear: 2020,
  });
  const premiums: Array<
    [index: number, validFrom: string, monthlyPremium: number, note: string | null]
  > = [
    [0, '2020-01-01', 380.0, null],
    [1, '2024-01-01', 405.0, 'Beitragsanpassung 2024'],
    [2, '2024-07-01', 420.0, 'Unterjährige Anpassung Zahntarif'],
  ];
  for (const [index, validFrom, monthlyPremium, note] of premiums) {
    await seedRow(pool, 'ContractPremiums', {
      premiumUID: seedId('premium', index),
      contractUID: ids.contractAnna,
      validFrom,
      monthlyPremium,
      note,
    });
  }
  await seedRow(pool, 'ContractTerms', {
    termsUID: seedId('contractTerms', 0),
    contractUID: ids.contractAnna,
    validFromYear: 2020,
    deductible: 300.0,
    reimbursementCap: 5000.0,
  });
  await seedRow(pool, 'ContractTerms', {
    termsUID: seedId('contractTerms', 1),
    contractUID: ids.contractAnna,
    validFromYear: 2025,
    deductible: 400.0,
    reimbursementCap: 5000.0,
  });

  // Anna's supplementary policy: no deductible, reimburses up to 200 € a year.
  await seedRow(pool, 'Contracts', {
    contractUID: ids.contractAnnaSupplementary,
    contractNumber: 'ZV-2022-0042',
    companyUID: ids.companySupplementary,
    accountUID: ids.accountAnna,
    contractKind: 'SUPPLEMENTARY',
    contractBegin: '2022-01-01',
  });
  await seedRow(pool, 'ContractPremiums', {
    premiumUID: seedId('premium', 3),
    contractUID: ids.contractAnnaSupplementary,
    validFrom: '2022-01-01',
    monthlyPremium: 24.9,
    note: null,
  });
  await seedRow(pool, 'ContractTerms', {
    termsUID: seedId('contractTerms', 2),
    contractUID: ids.contractAnnaSupplementary,
    validFromYear: 2022,
    deductible: 0,
    reimbursementCap: 200.0,
  });

  await seedRow(pool, 'Facilities', {
    facilityUID: ids.facilityDoctor,
    facilityName: 'Hausarztpraxis Dr. Beispiel',
    distanceKm: 3,
  });
  await seedRow(pool, 'Facilities', {
    facilityUID: ids.facilityRadiology,
    facilityName: 'Radiologie Musterstadt',
    distanceKm: 12,
  });

  await seedRow(pool, 'CollectionAgencies', {
    agencyUID: ids.agency,
    agencyName: 'Beispiel Inkasso GmbH',
    bankAccount: 'DE02120300000000202051',
  });

  await seedRow(pool, 'Submissions', {
    submissionUID: ids.submission,
    contractUID: ids.contractAnna,
    submittedDate: '2024-03-15',
  });

  // Open: never submitted. Treated in 2023, so Anna also has a 2023 year tab.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceOpen,
    invoiceNumber: 'R-2024-100',
    invoiceDate: '2024-02-20',
    treatmentDate: '2023-11-20',
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 85.0,
  });
  // Submitted, not yet billed: has a submission but no allocation.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceSubmitted,
    invoiceNumber: 'R-2024-101',
    invoiceDate: '2024-03-01',
    treatmentDate: '2024-02-10',
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityRadiology,
    submissionUID: ids.submission,
    invoiceAmount: 120.0,
  });
  // Billed: submission + allocation, not yet paid out (no transferDate).
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceBilled,
    invoiceNumber: 'R-2024-102',
    invoiceDate: '2024-03-02',
    treatmentDate: '2024-02-11',
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    submissionUID: ids.submission,
    invoiceAmount: 200.0,
  });
  // Done: billed and paid out (transferDate set).
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceDone,
    invoiceNumber: 'R-2024-103',
    invoiceDate: '2024-03-03',
    treatmentDate: '2024-02-12',
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityRadiology,
    submissionUID: ids.submission,
    invoiceAmount: 60.0,
    transferDate: '2024-04-10',
  });
  // Ben's single open invoice.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceBenOpen,
    invoiceNumber: 'R-2024-200',
    invoiceDate: '2024-05-05',
    treatmentDate: '2024-04-20',
    accountUID: ids.accountBen,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 45.0,
  });

  await seedRow(pool, 'ServiceBillings', {
    billingUID: ids.billing,
    submissionUID: ids.submission,
    billingDate: '2024-04-01',
    billingNumber: 'LA-2024-500',
  });

  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationBilled,
    invoiceUID: ids.invoiceBilled,
    billingUID: ids.billing,
    receiptNumber: 'BELEG-102',
    reimbursement: 150.0,
  });
  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationDone,
    invoiceUID: ids.invoiceDone,
    billingUID: ids.billing,
    receiptNumber: 'BELEG-103',
    reimbursement: 45.0,
  });
}

/**
 * Ensures a development admin exists so the app is immediately usable after
 * `npm run dev:up` — no manual setup call needed. Idempotent: a repeat run
 * neither duplicates the user nor the role grant. Credentials come from
 * DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD (with obvious dev defaults). Dev only:
 * `main()` below refuses to run against NODE_ENV=production.
 */
async function seedDevAdmin(pool: Pool): Promise<void> {
  const email = process.env.DEV_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.DEV_ADMIN_PASSWORD ?? 'eunomia';

  const existing = await pool.query<Array<{ userID: number }>>(
    'SELECT userID FROM Users WHERE email = ? LIMIT 1',
    [email],
  );
  let userId = existing[0]?.userID;
  if (userId === undefined) {
    const result = (await pool.query(
      'INSERT INTO Users (email, firstname, surname, passwordHash) VALUES (?, ?, ?, ?)',
      [email, 'Dev', 'Admin', await hashPassword(password)],
    )) as { insertId: number };
    userId = result.insertId;
  }

  await pool.query(
    `INSERT IGNORE INTO UserRoles (userID, roleID)
     SELECT ?, roleID FROM Roles WHERE roleName = 'Admin'`,
    [userId],
  );
  console.log(`Dev admin ready: ${email} / ${password}`);
}

/** Standalone entry point for `npm run seed`. */
async function main(): Promise<void> {
  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    throw new Error('Refusing to run the development seed against NODE_ENV=production.');
  }

  const pool = createPool(loadDatabaseConfig());
  try {
    await waitForDatabase(pool);
    await runMigrations(pool);
    await seedDatabase(pool);
    await seedDevAdmin(pool);
    console.log('Seed data applied.');
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]))
) {
  main().catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  });
}
