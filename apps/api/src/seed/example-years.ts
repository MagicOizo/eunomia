import type { Pool } from 'mariadb';

import { seedDate, seedId, seedRow, seedYear } from './helpers.js';

/**
 * The author's three example years (Notes/eunomia-plan.md, 2.3) as real data,
 * so the reimbursement optimizer can be checked in the running app and not
 * only in its unit tests. One insured person, Clara, with the two policies of
 * the example: PKV X (200 € deductible, bonus scale 300/450/600) and the
 * supplementary policy Y (no deductible, 200 € a year).
 *
 * | year | costs  | spare X, use Y only | X + rest at Y | expected advice |
 * |------|--------|---------------------|---------------|-----------------|
 * | -2   |  150 € | 150 + 300 = 450 €   | 0 + 150       | only Y          |
 * | -1   |  640 € | 200 + 450 = 650 €   | 440 + 200     | only Y          |
 * | now  | 1000 € | 200 + bonus         | 800 + 200     | X, rest at Y    |
 *
 * Nothing is submitted here: the years are left open on purpose, so the
 * workspace shows the optimizer's recommendation rather than recorded reality.
 */

const ids = {
  account: seedId('account', 20),
  companyFull: seedId('company', 20),
  companySupplementary: seedId('company', 21),
  contractFull: seedId('contract', 20),
  contractSupplementary: seedId('contract', 21),
  facility: seedId('facility', 20),
};

/** Invoices per example year: the costs of the table, split into a few bills. */
const invoices: Array<[yearOffset: number, index: number, amount: number, label: string]> = [
  [-2, 20, 90.0, 'Hausarzt'],
  [-2, 21, 60.0, 'Laborleistung'],
  [-1, 22, 400.0, 'Zahnbehandlung'],
  [-1, 23, 240.0, 'Physiotherapie'],
  [0, 24, 700.0, 'Operation ambulant'],
  [0, 25, 300.0, 'Nachbehandlung'],
];

/** Inserts Clara and her two policies with the three example years of invoices. */
export async function seedExampleYears(pool: Pool): Promise<void> {
  await seedRow(pool, 'Accounts', {
    accountUID: ids.account,
    surname: 'Beispiel',
    firstname: 'Clara',
    birthDate: '1978-08-08',
  });

  await seedRow(pool, 'InsuranceCompanies', {
    companyUID: ids.companyFull,
    companyName: 'Beispiel PKV X',
    addressCity: 'Musterstadt',
  });
  await seedRow(pool, 'InsuranceCompanies', {
    companyUID: ids.companySupplementary,
    companyName: 'Beispiel Zusatz Y',
    addressCity: 'Musterstadt',
  });

  // PKV X: 200 € deductible, bonus only forfeited by an actual reimbursement.
  // Counting starts with the first example year, so the streak walks up the
  // scale exactly as in the table: 300 €, then 450 € from the second year on.
  await seedRow(pool, 'Contracts', {
    contractUID: ids.contractFull,
    contractNumber: 'X-1',
    companyUID: ids.companyFull,
    accountUID: ids.account,
    contractKind: 'FULL',
    contractBegin: '2018-01-01',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    claimFreeYearsAtStart: 0,
    claimFreeCountingFromYear: seedYear(-2),
  });
  await seedRow(pool, 'ContractPremiums', {
    premiumUID: seedId('premium', 20),
    contractUID: ids.contractFull,
    validFrom: '2018-01-01',
    monthlyPremium: 520.0,
    note: null,
  });
  await seedRow(pool, 'ContractTerms', {
    termsUID: seedId('contractTerms', 20),
    contractUID: ids.contractFull,
    validFromYear: 2018,
    deductible: 200.0,
    reimbursementCap: null,
  });
  const tiers: Array<[claimFreeYears: number, bonusAmount: number]> = [
    [1, 300],
    [2, 450],
    [4, 600],
  ];
  for (const [claimFreeYears, bonusAmount] of tiers) {
    await seedRow(pool, 'ContractBonusTiers', {
      termsUID: seedId('contractTerms', 20),
      claimFreeYears,
      bonusAmount,
    });
  }

  // Supplementary Y: no deductible, no bonus, 200 € a year.
  await seedRow(pool, 'Contracts', {
    contractUID: ids.contractSupplementary,
    contractNumber: 'Y-1',
    companyUID: ids.companySupplementary,
    accountUID: ids.account,
    contractKind: 'SUPPLEMENTARY',
    contractBegin: '2018-01-01',
  });
  await seedRow(pool, 'ContractPremiums', {
    premiumUID: seedId('premium', 21),
    contractUID: ids.contractSupplementary,
    validFrom: '2018-01-01',
    monthlyPremium: 19.9,
    note: null,
  });
  await seedRow(pool, 'ContractTerms', {
    termsUID: seedId('contractTerms', 21),
    contractUID: ids.contractSupplementary,
    validFromYear: 2018,
    deductible: 0,
    reimbursementCap: 200.0,
  });

  await seedRow(pool, 'Facilities', {
    facilityUID: ids.facility,
    facilityName: 'Praxisklinik Beispiel',
    distanceKm: 8,
  });

  for (const [yearOffset, index, amount, label] of invoices) {
    await seedRow(pool, 'Invoices', {
      invoiceUID: seedId('invoice', index),
      invoiceNumber: `X-${seedYear(yearOffset)}-${index}`,
      invoiceDate: seedDate(yearOffset, '03-10'),
      treatmentDate: seedDate(yearOffset, '03-05'),
      accountUID: ids.account,
      facilityUID: ids.facility,
      invoiceAmount: amount,
      transferSubject: label,
    });
  }
}
