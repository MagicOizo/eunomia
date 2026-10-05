import type { Pool } from 'mariadb';

import { daysFromToday, seedId, seedRow, seedYear } from './helpers.js';

/**
 * The family case: a parent's full policy and a child insured under the same
 * contract with its own member policy.
 *
 * It exists to pin down what the data model does with one insurer letter that
 * settles both policies at once. A ServiceBilling hangs off exactly one
 * policy — so that single letter becomes TWO ServiceBillings rows, same
 * number, same date, one per policy. The UNIQUE from Slice 37 is on
 * (contractUID, billingNumber) and parent and child hold different
 * `Contracts` rows, so the shared number is allowed here and only a repeat
 * *within* one policy is not. It is also the right shape, because deductible,
 * cap and bonus are per policy, so the amounts have to be tracked per policy
 * anyway.
 *
 * What the seeded state shows:
 * - both submissions are independent (different dates, different contracts),
 * - the parent's half is already booked,
 * - the child's half is still unbooked, so the second, separate assignment run
 *   can be clicked through in the app (and the "unverknüpft" filter has a hit).
 *
 * The child's bonus scale is the insurer's rule in monthly premiums (Slice
 * 76), with a premium adjustment in July of the running year, so the detail
 * dialog shows a factor forecast over a pro-rata average.
 *
 * Seed indices live at 14–16, clear of the main seed (0–13) and the example
 * years (20–25), and inside the range `seedId` allows.
 */

const ids = {
  accountChild: seedId('account', 14),
  contractChild: seedId('contract', 14),
  premiumChild: seedId('premium', 14),
  premiumChildAdjusted: seedId('premium', 15),
  termsChild: seedId('contractTerms', 14),
  submissionParent: seedId('submission', 14),
  submissionChild: seedId('submission', 15),
  invoiceParent: seedId('invoice', 14),
  invoiceChildFirst: seedId('invoice', 15),
  invoiceChildSecond: seedId('invoice', 16),
  billingParent: seedId('serviceBilling', 14),
  billingChild: seedId('serviceBilling', 15),
  allocationParent: seedId('allocation', 14),
};

/** What this scenario borrows from the main seed instead of duplicating it. */
export interface FamilyPolicyRefs {
  /** The parent holding the family contract (the child's Hauptversicherter). */
  leadAccountUID: string;
  /** The parent's full policy — the letter settles this one and the child's. */
  parentContractUID: string;
  /** The insurer of that policy; the child's member policy is with the same one. */
  companyUID: string;
  facilityDoctorUID: string;
  facilityRadiologyUID: string;
}

/** The one letter that settles both policies, as its number reads on paper. */
const LETTER_NUMBER = `LA-${seedYear(0)}-777`;
const LETTER_DATE = daysFromToday(-30);

export async function seedFamilyPolicy(pool: Pool, refs: FamilyPolicyRefs): Promise<void> {
  await seedRow(pool, 'Accounts', {
    accountUID: ids.accountChild,
    surname: 'Muster',
    firstname: 'Mia',
    birthDate: '2018-06-14',
    leadAccountUID: refs.leadAccountUID,
  });

  // The child's own policy under the family contract: same insurer and base
  // number with a member suffix, but its own deductible, premium and bonus —
  // which is exactly why it cannot share the parent's contract row.
  await seedRow(pool, 'Contracts', {
    contractUID: ids.contractChild,
    contractNumber: 'PKV-2020-0001/02',
    companyUID: refs.companyUID,
    accountUID: ids.accountChild,
    contractKind: 'FULL',
    contractBegin: '2020-01-01',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    claimFreeYearsAtStart: 0,
    claimFreeCountingFromYear: 2020,
  });
  await seedRow(pool, 'ContractPremiums', {
    premiumUID: ids.premiumChild,
    contractUID: ids.contractChild,
    validFrom: '2020-01-01',
    monthlyPremium: 120.0,
    bonusRelevantPremium: 100.0,
    note: 'Kindertarif',
  });
  await seedRow(pool, 'ContractPremiums', {
    premiumUID: ids.premiumChildAdjusted,
    contractUID: ids.contractChild,
    validFrom: `${seedYear(0)}-07-01`,
    monthlyPremium: 132.0,
    bonusRelevantPremium: 110.0,
    note: 'Beitragsanpassung',
  });
  await seedRow(pool, 'ContractTerms', {
    termsUID: ids.termsChild,
    contractUID: ids.contractChild,
    validFromYear: 2020,
    deductible: 150.0,
    reimbursementCap: 3000.0,
  });
  const tiers: Array<[claimFreeYears: number, bonusFactor: number]> = [
    [1, 1],
    [2, 1.5],
    [4, 2],
  ];
  for (const [claimFreeYears, bonusFactor] of tiers) {
    await seedRow(pool, 'ContractBonusTiers', {
      termsUID: ids.termsChild,
      claimFreeYears,
      bonusFactor,
    });
  }

  // One treatment period, invoices for both people.
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceParent,
    invoiceNumber: `R-${seedYear(0)}-120`,
    invoiceDate: daysFromToday(-78),
    treatmentDate: daysFromToday(-80),
    accountUID: refs.leadAccountUID,
    facilityUID: refs.facilityDoctorUID,
    invoiceAmount: 240.0,
  });
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceChildFirst,
    invoiceNumber: `R-${seedYear(0)}-130`,
    invoiceDate: daysFromToday(-77),
    treatmentDate: daysFromToday(-79),
    accountUID: ids.accountChild,
    facilityUID: refs.facilityDoctorUID,
    invoiceAmount: 180.0,
  });
  await seedRow(pool, 'Invoices', {
    invoiceUID: ids.invoiceChildSecond,
    invoiceNumber: `R-${seedYear(0)}-131`,
    invoiceDate: daysFromToday(-75),
    treatmentDate: daysFromToday(-77),
    accountUID: ids.accountChild,
    facilityUID: refs.facilityRadiologyUID,
    invoiceAmount: 95.0,
  });

  // Submitted separately, a week apart: nothing ties the two submissions
  // together, and an invoice only ever joins its own holder's policy.
  await seedRow(pool, 'Submissions', {
    submissionUID: ids.submissionParent,
    contractUID: refs.parentContractUID,
    submittedDate: daysFromToday(-70),
  });
  await seedRow(pool, 'Submissions', {
    submissionUID: ids.submissionChild,
    contractUID: ids.contractChild,
    submittedDate: daysFromToday(-63),
  });
  const links: Array<[submissionUID: string, invoiceUID: string, contractUID: string]> = [
    [ids.submissionParent, ids.invoiceParent, refs.parentContractUID],
    [ids.submissionChild, ids.invoiceChildFirst, ids.contractChild],
    [ids.submissionChild, ids.invoiceChildSecond, ids.contractChild],
  ];
  for (const [submissionUID, invoiceUID, contractUID] of links) {
    await seedRow(pool, 'SubmissionInvoices', { submissionUID, invoiceUID, contractUID });
  }

  // The same letter, once per policy. Same number and date on purpose — the
  // search finds both, and each row carries its own policy's bonus verdict.
  await seedRow(pool, 'ServiceBillings', {
    billingUID: ids.billingParent,
    contractUID: refs.parentContractUID,
    billingDate: LETTER_DATE,
    billingNumber: LETTER_NUMBER,
    forfeitsBonus: 1,
  });
  await seedRow(pool, 'ServiceBillings', {
    billingUID: ids.billingChild,
    contractUID: ids.contractChild,
    billingDate: LETTER_DATE,
    billingNumber: LETTER_NUMBER,
    forfeitsBonus: null,
  });

  // Only the parent's half is booked; the child's two invoices wait for their
  // own assignment run against the child's copy of the letter.
  await seedRow(pool, 'Allocations', {
    allocationUID: ids.allocationParent,
    invoiceUID: ids.invoiceParent,
    billingUID: ids.billingParent,
    receiptNumber: 'BELEG-120',
    reimbursement: 140.0,
  });
}
