import type { DashboardDto } from './api';

/**
 * A household of two for the start page's tests: Anna with unpaid and
 * submitted invoices and one policy whose bonus is at stake, Ben with nothing
 * open and no policy. Two treatment years, the older one with a paid bonus.
 */
export function dashboardFixture(): DashboardDto {
  return {
    since: '2024-02-01',
    totals: {
      invoiceCount: 5,
      invoiceAmount: 1500,
      reimbursed: 900,
      selfBorne: 600,
      bonusPaid: 240,
      accountCount: 2,
      contractCount: 1,
    },
    years: [
      {
        year: 2025,
        invoiceCount: 3,
        invoiceAmount: 1000,
        reimbursed: 800,
        selfBorne: 200,
        bonusPaid: 240,
      },
      {
        year: 2026,
        invoiceCount: 2,
        invoiceAmount: 500,
        reimbursed: 100,
        selfBorne: 400,
        bonusPaid: 0,
      },
    ],
    accounts: [
      {
        accountUID: 'aANNA0000001',
        firstname: 'Anna',
        surname: 'Muster',
        payment: { unpaidCount: 2, unpaidAmount: 320.5, dueCount: 1, overdueCount: 1 },
        workflow: { offen: 1, eingereicht: 1, teilabgerechnet: 0 },
        year: 2026,
        policies: [
          {
            contractUID: 'cPKV00000001',
            contractNumber: 'PKV-1',
            companyName: 'Muster Versicherung',
            contractKind: 'FULL',
            hasTerms: true,
            deductible: 500,
            deductibleUsed: 200,
            deductibleLeft: 300,
            bonusStatus: 'at-stake',
            bonusAmount: 240,
            pendingClaims: 0,
            tiersInherited: false,
            recommendation: 'spare',
            status: 'spare',
          },
        ],
      },
      {
        accountUID: 'aBEN00000001',
        firstname: 'Ben',
        surname: null,
        payment: { unpaidCount: 0, unpaidAmount: 0, dueCount: 0, overdueCount: 0 },
        workflow: { offen: 0, eingereicht: 0, teilabgerechnet: 0 },
        year: 2026,
        policies: [],
      },
    ],
  };
}
