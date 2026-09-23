import type { Pool } from 'mariadb';

import { loadDatabaseConfig } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';
import { createPool, waitForDatabase } from '../db/pool.js';
import { hashPassword } from '../lib/password.js';
import { seedExampleYears } from './example-years.js';
import { seedFamilyPolicy } from './family-policy.js';
import { daysFromToday, seedDate, seedId, seedRow, seedYear } from './helpers.js';
import { clearData } from './reset.js';

/**
 * Anonymized development seed data, covering the normal cases and the edge
 * cases worth clicking through: every workflow status, both payment traffic
 * lights, an objection, a correction, a policy whose bonus scale was not
 * updated, and an insured person without any policy. The author's three
 * example years live in `example-years.ts`, the parent/child policy case in
 * `family-policy.ts`.
 *
 * Every row uses a deterministic public ID (see `helpers.ts`), so a repeat run
 * changes nothing. `--reset` empties the database first — the way to get rid
 * of whatever accumulated while testing. Development only: `main()` refuses to
 * run against NODE_ENV=production.
 *
 * Treatment years are relative to today (`seedYear`), so the current year
 * always carries data.
 */

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
  submissionSupplementary: seedId('submission', 1),
  submissionCurrent: seedId('submission', 2),
  invoiceOpen: seedId('invoice', 0),
  invoiceSubmitted: seedId('invoice', 1),
  invoiceBilled: seedId('invoice', 2),
  invoiceDone: seedId('invoice', 3),
  invoiceBenOpen: seedId('invoice', 4),
  invoiceClosed: seedId('invoice', 5),
  invoiceOverdue: seedId('invoice', 6),
  invoiceDueSoon: seedId('invoice', 7),
  invoiceCash: seedId('invoice', 8),
  invoiceObjection: seedId('invoice', 9),
  invoiceCorrected: seedId('invoice', 10),
  billing: seedId('serviceBilling', 0),
  billingSupplementary: seedId('serviceBilling', 1),
  billingObjection: seedId('serviceBilling', 2),
  billingCorrection: seedId('serviceBilling', 3),
  allocationBilled: seedId('allocation', 0),
  allocationDone: seedId('allocation', 1),
  allocationDoneSupplementary: seedId('allocation', 2),
  allocationClosed: seedId('allocation', 3),
  allocationObjection: seedId('allocation', 4),
  allocationFirst: seedId('allocation', 5),
  allocationCorrection: seedId('allocation', 6),
};

/** Anna and her son Ben; Ben has no policy of his own (an edge case in the UI). */
async function seedPeople(pool: Pool): Promise<void> {
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
}

/**
 * Anna's policies: a full PKV with an intra-year premium adjustment and a
 * deductible change, plus a supplementary policy — the case that used to force
 * duplicate contracts (see Notes/eunomia-plan.md, 1.3.7).
 */
async function seedContracts(pool: Pool): Promise<void> {
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
    [1, seedDate(-2, '01-01'), 405.0, `Beitragsanpassung ${seedYear(-2)}`],
    [2, seedDate(-2, '07-01'), 420.0, 'Unterjährige Anpassung Zahntarif'],
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

  // Conditions per insurance year: the older terms carry the original scale,
  // the current year a raised one; next year inherits it ("nicht aktualisiert").
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
    validFromYear: seedYear(0),
    deductible: 400.0,
    reimbursementCap: 5000.0,
  });
  const tiers: Array<[termsIndex: number, claimFreeYears: number, bonusAmount: number]> = [
    [0, 1, 300],
    [0, 2, 450],
    [0, 4, 600],
    [1, 1, 320],
    [1, 2, 480],
    [1, 4, 640],
  ];
  for (const [termsIndex, claimFreeYears, bonusAmount] of tiers) {
    await seedRow(pool, 'ContractBonusTiers', {
      termsUID: seedId('contractTerms', termsIndex),
      claimFreeYears,
      bonusAmount,
    });
  }

  // The insurer's letters: what was actually paid back, and one year the
  // author booked as forfeited by hand although nothing was reimbursed.
  await seedRow(pool, 'ContractYears', {
    contractUID: ids.contractAnna,
    year: seedYear(-4),
    actualBonus: 600,
    bonusForfeited: null,
    note: null,
  });
  await seedRow(pool, 'ContractYears', {
    contractUID: ids.contractAnna,
    year: seedYear(-3),
    actualBonus: 585.5,
    bonusForfeited: null,
    note: `Schreiben vom 12.06.${seedYear(-2)}`,
  });
  await seedRow(pool, 'ContractYears', {
    contractUID: ids.contractAnna,
    year: seedYear(-2),
    actualBonus: null,
    bonusForfeited: 1,
    note: 'Kulanzfall, Bonus laut Versicherung verwirkt',
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
}

/** Anna's and Ben's invoices, one per workflow state plus the payment cases. */
async function seedInvoices(pool: Pool): Promise<void> {
  // Open: never submitted. Treated a year earlier, so Anna has two year tabs.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceOpen,
    invoiceNumber: 'R-2024-100',
    invoiceDate: seedDate(-1, '02-20'),
    treatmentDate: seedDate(-1, '11-20'),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 85.0,
  });
  // Submitted, not yet billed: has a submission but no allocation.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceSubmitted,
    invoiceNumber: 'R-2024-101',
    invoiceDate: seedDate(-1, '03-01'),
    treatmentDate: seedDate(-1, '02-10'),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityRadiology,
    invoiceAmount: 120.0,
  });
  // Partially billed: 150 of 200 € from the full policy, the remainder is
  // submitted to the supplementary policy and not billed there yet — the
  // two-card case of the invoice detail.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceBilled,
    invoiceNumber: 'R-2024-102',
    invoiceDate: seedDate(-1, '03-02'),
    treatmentDate: seedDate(-1, '02-11'),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 200.0,
  });
  // Done: fully reimbursed over both policies (45 + 15 €) and paid.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceDone,
    invoiceNumber: 'R-2024-103',
    invoiceDate: seedDate(-1, '03-03'),
    treatmentDate: seedDate(-1, '02-12'),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityRadiology,
    invoiceAmount: 60.0,
    transferDate: seedDate(-1, '04-10'),
  });
  // Billed by hand: the full policy reimbursed nothing (deductible), and the
  // author closed it as billed; not paid yet.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceClosed,
    invoiceNumber: 'R-2024-104',
    invoiceDate: seedDate(-1, '03-04'),
    treatmentDate: seedDate(-1, '02-13'),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 90.0,
    reimbursementClosed: 1,
  });
  // Ben's single open invoice — an insured person without a policy of his own.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceBenOpen,
    invoiceNumber: 'R-2024-200',
    invoiceDate: seedDate(-1, '05-05'),
    treatmentDate: seedDate(-1, '04-20'),
    accountUID: ids.accountBen,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 45.0,
  });

  // --- the current year: the payment traffic light and the special cases ---

  // Overdue: due two weeks ago, billed through the collection agency.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceOverdue,
    invoiceNumber: `R-${seedYear(0)}-110`,
    invoiceDate: daysFromToday(-30),
    treatmentDate: daysFromToday(-35),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 320.0,
    transferUntilDate: daysFromToday(-14),
    transferSubject: 'Rechnung 110 / Kundennr. 4711',
    agencyUID: ids.agency,
  });
  // Due in a few days: the amber light.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceDueSoon,
    invoiceNumber: `R-${seedYear(0)}-111`,
    invoiceDate: daysFromToday(-10),
    treatmentDate: daysFromToday(-12),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityRadiology,
    invoiceAmount: 180.0,
    transferUntilDate: daysFromToday(5),
    transferSubject: 'Rechnung 111 / Kundennr. 4711',
    agencyUID: ids.agency,
  });
  // Paid in cash at the practice: no transfer data at all.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceCash,
    invoiceNumber: `R-${seedYear(0)}-112`,
    invoiceDate: daysFromToday(-20),
    treatmentDate: daysFromToday(-20),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 40.0,
    directPayment: 1,
    transferDate: daysFromToday(-20),
  });
  // Reimbursed too little; the billing behind it is under objection.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceObjection,
    invoiceNumber: `R-${seedYear(0)}-113`,
    invoiceDate: daysFromToday(-60),
    treatmentDate: daysFromToday(-65),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityRadiology,
    invoiceAmount: 500.0,
  });
  // Reimbursed in two goes at the same policy: a first billing and a later
  // correction — two entries on one card.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceCorrected,
    invoiceNumber: `R-${seedYear(0)}-114`,
    invoiceDate: daysFromToday(-55),
    treatmentDate: daysFromToday(-60),
    accountUID: ids.accountAnna,
    facilityUID: ids.facilityDoctor,
    invoiceAmount: 260.0,
  });

  // The open invoice is a hospital stay the outpatient supplementary policy
  // does not cover.
  await seedRow(pool, 'InvoiceExclusions', {
    invoiceUID: ids.invoiceOpen,
    contractUID: ids.contractAnnaSupplementary,
    note: 'Stationäre Leistung',
  });
}

/** The submissions, service billings and reimbursements behind those invoices. */
async function seedWorkflow(pool: Pool): Promise<void> {
  await seedRow(pool, 'Submissions', {
    submissionUID: ids.submission,
    contractUID: ids.contractAnna,
    submittedDate: seedDate(-1, '03-15'),
  });
  await seedRow(pool, 'Submissions', {
    submissionUID: ids.submissionSupplementary,
    contractUID: ids.contractAnnaSupplementary,
    submittedDate: seedDate(-1, '04-20'),
  });
  await seedRow(pool, 'Submissions', {
    submissionUID: ids.submissionCurrent,
    contractUID: ids.contractAnna,
    submittedDate: daysFromToday(-45),
  });

  const links: Array<[submissionUID: string, invoiceUID: string, contractUID: string]> = [
    [ids.submission, ids.invoiceSubmitted, ids.contractAnna],
    [ids.submission, ids.invoiceBilled, ids.contractAnna],
    [ids.submission, ids.invoiceDone, ids.contractAnna],
    [ids.submission, ids.invoiceClosed, ids.contractAnna],
    [ids.submissionSupplementary, ids.invoiceBilled, ids.contractAnnaSupplementary],
    [ids.submissionSupplementary, ids.invoiceDone, ids.contractAnnaSupplementary],
    [ids.submissionCurrent, ids.invoiceObjection, ids.contractAnna],
    [ids.submissionCurrent, ids.invoiceCorrected, ids.contractAnna],
  ];
  for (const [submissionUID, invoiceUID, contractUID] of links) {
    await seedRow(pool, 'SubmissionInvoices', { submissionUID, invoiceUID, contractUID });
  }

  await seedRow(pool, 'ServiceBillings', {
    billingUID: ids.billing,
    submissionUID: ids.submission,
    billingDate: seedDate(-1, '04-01'),
    billingNumber: 'LA-2024-500',
    forfeitsBonus: 1,
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
  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationClosed,
    invoiceUID: ids.invoiceClosed,
    billingUID: ids.billing,
    receiptNumber: 'BELEG-104',
    reimbursement: 0,
  });

  await seedRow(pool, 'ServiceBillings', {
    billingUID: ids.billingSupplementary,
    submissionUID: ids.submissionSupplementary,
    billingDate: seedDate(-1, '05-10'),
    billingNumber: 'ZV-LA-2024-17',
  });
  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationDoneSupplementary,
    invoiceUID: ids.invoiceDone,
    billingUID: ids.billingSupplementary,
    reimbursement: 15.0,
  });

  // An objection filed and still unresolved: 120 € of 500 € reimbursed.
  await seedRow(pool, 'ServiceBillings', {
    billingUID: ids.billingObjection,
    submissionUID: ids.submissionCurrent,
    billingDate: daysFromToday(-30),
    billingNumber: `LA-${seedYear(0)}-610`,
    forfeitsBonus: 1,
    objectionDate: daysFromToday(-20),
    objectionNote: 'Ziffer 5000 nicht anerkannt, Widerspruch eingelegt',
  });
  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationObjection,
    invoiceUID: ids.invoiceObjection,
    billingUID: ids.billingObjection,
    receiptNumber: 'BELEG-113',
    reimbursement: 120.0,
  });

  // The correction case: 100 € first, another 60 € from a later billing.
  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationFirst,
    invoiceUID: ids.invoiceCorrected,
    billingUID: ids.billingObjection,
    receiptNumber: 'BELEG-114',
    reimbursement: 100.0,
  });
  await seedRow(pool, 'ServiceBillings', {
    billingUID: ids.billingCorrection,
    submissionUID: ids.submissionCurrent,
    billingDate: daysFromToday(-5),
    billingNumber: `LA-${seedYear(0)}-611`,
    forfeitsBonus: 0,
  });
  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationCorrection,
    invoiceUID: ids.invoiceCorrected,
    billingUID: ids.billingCorrection,
    receiptNumber: 'BELEG-114-K',
    reimbursement: 60.0,
  });
}

/** Inserts the full seed dataset. */
export async function seedDatabase(pool: Pool): Promise<void> {
  await seedPeople(pool);
  await seedContracts(pool);
  await seedInvoices(pool);
  await seedWorkflow(pool);
  await seedFamilyPolicy(pool, {
    leadAccountUID: ids.accountAnna,
    parentContractUID: ids.contractAnna,
    companyUID: ids.company,
    facilityDoctorUID: ids.facilityDoctor,
    facilityRadiologyUID: ids.facilityRadiology,
  });
  await seedExampleYears(pool);
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

/** Standalone entry point for `npm run seed` (and `npm run seed:reset`). */
async function main(): Promise<void> {
  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    throw new Error('Refusing to run the development seed against NODE_ENV=production.');
  }
  const reset = process.argv.includes('--reset');

  const config = loadDatabaseConfig();
  const pool = createPool(config);
  try {
    await waitForDatabase(pool);
    await runMigrations(pool);
    if (reset) {
      console.log(`Clearing all data in ${config.database}…`);
      await clearData(pool);
    }
    await seedDatabase(pool);
    await seedDevAdmin(pool);
    console.log(reset ? 'Database reset and seed data applied.' : 'Seed data applied.');
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
