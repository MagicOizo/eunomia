import { describe, expect, it } from 'vitest';

import type { PlanInvoiceDto, PlanPolicyDto, PlanStrategyDto, ReimbursementPlanDto } from './api';
import {
  bonusView,
  invoiceBadge,
  percentOf,
  policyActionBadge,
  policyVerdict,
  recommendationText,
  strategyLabel,
} from './recommendation';

// The author's example (Notes/eunomia-plan.md, 2.3): PKV X-1 with a 200 €
// deductible and a bonus scale, supplementary Y-1 paying up to 200 € a year.
function policy(overrides: Partial<PlanPolicyDto>): PlanPolicyDto {
  return {
    contractUID: 'x',
    contractNumber: 'X-1',
    companyName: 'PKV',
    contractKind: 'FULL',
    hasTerms: true,
    deductible: 200,
    reimbursementCap: null,
    reimbursementRate: 100,
    bonusStatus: 'at-stake',
    bonusAmount: 300,
    claimFreeStreak: 1,
    pendingClaims: 0,
    tiersInherited: false,
    recommendation: 'spare',
    status: 'spare',
    actualReimbursement: 0,
    expectedReimbursement: 0,
    deductibleUsed: 150,
    eligibleCosts: 150,
    worthUsingAbove: 350,
    ...overrides,
  };
}
const zusatz = (overrides: Partial<PlanPolicyDto> = {}): PlanPolicyDto =>
  policy({
    contractUID: 'y',
    contractNumber: 'Y-1',
    companyName: 'Zusatz',
    contractKind: 'SUPPLEMENTARY',
    deductible: 0,
    reimbursementCap: 200,
    bonusStatus: 'none',
    bonusAmount: 0,
    claimFreeStreak: null,
    recommendation: 'use',
    status: 'submit',
    deductibleUsed: 0,
    worthUsingAbove: null,
    ...overrides,
  });

/** Intl puts a non-breaking space before "€"; compare with plain spaces. */
const plain = (text: string | undefined): string | undefined => text?.replace(/\u00a0/g, ' ');

const byUID = (...policies: PlanPolicyDto[]) => new Map(policies.map((p) => [p.contractUID, p]));

const invoicePlan = (
  action: PlanInvoiceDto['action'],
  x: [PlanInvoiceDto['policies'][number]['action'], number],
  y: [PlanInvoiceDto['policies'][number]['action'], number],
): PlanInvoiceDto => ({
  invoiceUID: 'inv',
  invoiceNumber: 'R-1',
  action,
  policies: [
    { contractUID: 'x', action: x[0], reimbursement: x[1] },
    { contractUID: 'y', action: y[0], reimbursement: y[1] },
  ],
});

describe('invoiceBadge', () => {
  const spared = byUID(policy({}), zusatz());
  const used = byUID(
    policy({ recommendation: 'use', status: 'submit', worthUsingAbove: null }),
    zusatz(),
  );

  it('year 1: submits to y only while x is spared', () => {
    const badge = invoiceBadge(invoicePlan('submit', ['none', 0], ['submit', 150]), spared);
    expect(badge?.label).toBe('Einreichen');
    expect(plain(badge?.tooltip)).toBe('Einreichen bei Y-1 (150,00 €).');
  });

  it('year 2: holds back what y can no longer cover, to spare the bonus at x', () => {
    const badge = invoiceBadge(invoicePlan('hold', ['none', 0], ['none', 0]), spared);
    expect(badge).toMatchObject({ label: 'Zurückhalten', tone: 'done' });
    expect(plain(badge?.tooltip)).toBe('Nicht einreichen – den Bonus bei X-1 schonen.');
  });

  it('year 3: submits to x and the rest to y', () => {
    const badge = invoiceBadge(invoicePlan('submit', ['submit', 800], ['submit', 50]), used);
    expect(badge?.label).toBe('Einreichen');
    expect(plain(badge?.tooltip)).toBe('Einreichen bei X-1 (800,00 €), Rest bei Y-1 (50,00 €).');
  });

  it('names an invoice that only fills the deductible', () => {
    const badge = invoiceBadge(invoicePlan('submit', ['submit', 0], ['submit', 150]), used);
    expect(plain(badge?.tooltip)).toBe(
      'Einreichen bei X-1 (zählt auf die Selbstbeteiligung), Rest bei Y-1 (150,00 €).',
    );
  });

  it('calls it "Rest" once the first policy answered', () => {
    const badge = invoiceBadge(invoicePlan('submit', ['answered', 400], ['submit', 100]), used);
    expect(badge?.label).toBe('Rest');
    expect(plain(badge?.tooltip)).toBe('Rest bei Y-1 (100,00 €).');
  });

  it('asks to withdraw from a spared policy and says where to go instead', () => {
    const badge = invoiceBadge(invoicePlan('withdraw', ['withdraw', 0], ['submit', 150]), spared);
    expect(badge).toMatchObject({ label: 'Zurückziehen', tone: 'open' });
    expect(plain(badge?.tooltip)).toBe(
      'Bei X-1 zurückziehen – dort ist der Bonus mehr wert. Stattdessen bei Y-1 (150,00 €) einreichen.',
    );
  });

  it('waits at y while x may still tip', () => {
    const badge = invoiceBadge(
      invoicePlan('wait', ['none', 0], ['wait', 150]),
      byUID(policy({}), zusatz({ status: 'wait' })),
    );
    expect(badge).toMatchObject({ label: 'Abwarten', tone: 'partial' });
    expect(plain(badge?.tooltip)).toContain('(möglich: 150,00 €)');
  });

  it('marks invoices excluded everywhere', () => {
    const badge = invoiceBadge(
      invoicePlan('not-reimbursable', ['excluded', 0], ['excluded', 0]),
      spared,
    );
    expect(badge?.label).toBe('Nicht erstattbar');
  });

  it('shows nothing when nothing is to be done', () => {
    expect(invoiceBadge(invoicePlan('done', ['answered', 400], ['submitted', 0]), used)).toBeNull();
  });
});

describe('bonusView', () => {
  it('is safe while the bonus is spared and nothing is pending', () => {
    expect(bonusView(policy({})).label).toBe('Sicher');
    expect(plain(bonusView(policy({})).detail)).toBe('300,00 € erwartet');
  });

  it('is at risk when the recommendation uses the policy or a submission is pending', () => {
    expect(bonusView(policy({ recommendation: 'use' })).label).toBe('In Gefahr');
    expect(bonusView(policy({ pendingClaims: 2 })).detail).toContain('2 Einreichung(en)');
  });

  it('flags a bonus scale that was not updated for the year', () => {
    expect(bonusView(policy({ tiersInherited: true })).detail).toContain(
      'Staffel nicht aktualisiert',
    );
  });

  it('distinguishes forfeited, received and none', () => {
    expect(bonusView(policy({ bonusStatus: 'forfeited', bonusAmount: 0 })).label).toBe('Verwirkt');
    expect(plain(bonusView(policy({ bonusStatus: 'paid', bonusAmount: 450 })).detail)).toBe(
      '450,00 € laut Versicherung',
    );
    expect(bonusView(zusatz()).label).toBe('Kein Bonus');
  });
});

describe('policyActionBadge', () => {
  it('names the action for the policy card', () => {
    expect(policyActionBadge('submit')?.label).toBe('Einreichen');
    expect(policyActionBadge('wait')?.label).toBe('Abwarten');
    expect(policyActionBadge('withdraw')?.label).toBe('Zurückziehen');
  });

  it('stays silent where nothing is to be done', () => {
    // Already answered, already submitted, excluded or simply not involved:
    // the card's own status badge says it, an advice badge would only repeat.
    expect(policyActionBadge('answered')).toBeNull();
    expect(policyActionBadge('submitted')).toBeNull();
    expect(policyActionBadge('excluded')).toBeNull();
    expect(policyActionBadge('none')).toBeNull();
  });
});

describe('strategies and texts', () => {
  const x = policy({});
  const y = zusatz();
  const plan: ReimbursementPlanDto = {
    accountUID: 'a',
    year: 2025,
    invoiceTotal: 150,
    advantage: 300,
    strategies: [],
    policies: [x, y],
    invoices: [],
  };

  it('labels a strategy by what it does with each policy', () => {
    const strategy: PlanStrategyDto = {
      usedContractUIDs: ['y'],
      sparedContractUIDs: ['x'],
      reimbursements: { x: 0, y: 150 },
      bonusTotal: 300,
      total: 450,
    };
    expect(strategyLabel(strategy, [x, y])).toBe('X-1 schonen, Y-1 nutzen');
  });

  it('groups the recommendation by policy status', () => {
    expect(recommendationText(plan)).toBe('Y-1 einreichen, X-1 schonen');
  });

  it('explains when sparing stops paying off', () => {
    expect(plain(policyVerdict(x, plan))).toContain('mehr als 350,00 € weitere Kosten');
  });

  it('clamps progress shares', () => {
    expect(percentOf(150, 200)).toBe(75);
    expect(percentOf(300, 200)).toBe(100);
    expect(percentOf(10, 0)).toBe(0);
  });
});
