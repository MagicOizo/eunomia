import { mount } from '@vue/test-utils';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import type { PlanPolicyDto, ReimbursementPlanDto } from './api';
import InvoiceSummary from './InvoiceSummary.vue';

const base: Omit<PlanPolicyDto, 'contractUID' | 'contractNumber' | 'contractKind'> = {
  companyName: 'Versicherung',
  hasTerms: true,
  deductible: 0,
  reimbursementCap: null,
  reimbursementRate: 100,
  bonusStatus: 'none',
  bonusAmount: 0,
  claimFreeStreak: null,
  pendingClaims: 0,
  tiersInherited: false,
  recommendation: 'use',
  status: 'submit',
  actualReimbursement: 0,
  expectedReimbursement: 0,
  deductibleUsed: 0,
  eligibleCosts: 1000,
  worthUsingAbove: null,
};

// The author's example year 3 (Notes/eunomia-plan.md, 2.3): 1000 € of costs,
// PKV X-1 is used (800 €), supplementary Y-1 takes the rest (200 €).
const plan: ReimbursementPlanDto = {
  accountUID: 'a',
  year: 2025,
  invoiceTotal: 1000,
  advantage: 200,
  strategies: [
    {
      usedContractUIDs: ['x', 'y'],
      sparedContractUIDs: [],
      reimbursements: { x: 800, y: 200 },
      bonusTotal: 0,
      total: 1000,
    },
    {
      usedContractUIDs: ['y'],
      sparedContractUIDs: ['x'],
      reimbursements: { x: 0, y: 200 },
      bonusTotal: 600,
      total: 800,
    },
  ],
  policies: [
    {
      ...base,
      contractUID: 'x',
      contractNumber: 'X-1',
      contractKind: 'FULL',
      deductible: 200,
      bonusStatus: 'at-stake',
      bonusAmount: 600,
      claimFreeStreak: 4,
      expectedReimbursement: 800,
      deductibleUsed: 200,
    },
    {
      ...base,
      contractUID: 'y',
      contractNumber: 'Y-1',
      contractKind: 'SUPPLEMENTARY',
      reimbursementCap: 200,
      actualReimbursement: 50,
      expectedReimbursement: 200,
    },
  ],
  invoices: [],
};

describe('InvoiceSummary', () => {
  it('shows the recommendation and the comparison of the alternatives', () => {
    const wrapper = mount(InvoiceSummary, { props: { invoices: [], plan } });
    const text = wrapper.text().replace(/\u00a0/g, ' ');
    expect(text).toContain('X-1, Y-1 einreichen');
    expect(text).toContain('200,00 € mehr als die nächstbeste Variante');
    expect(text).toContain('200,00 € von 200,00 €');
    expect(text).toContain('In Gefahr');
    const rows = wrapper.findAll('tbody tr').map((row) => row.text().replace(/\u00a0/g, ' '));
    expect(rows[0]).toContain('X-1 nutzen, Y-1 nutzen');
    expect(rows[0]).toContain('Empfohlen');
    expect(rows[1]).toContain('X-1 schonen, Y-1 nutzen');
    expect(rows[1]).toContain('-200,00 €');
    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = mount(InvoiceSummary, {
      props: { invoices: [], plan },
      attachTo: document.body,
    });
    const results = await axe.run(wrapper.element, {
      // jsdom cannot render colors; contrast is covered analytically (design-system/CONTRAST.md).
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
    wrapper.unmount();
  });
});
