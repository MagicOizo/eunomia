import { describe, expect, it } from 'vitest';

import type { InvoiceDto, InvoiceSubmissionDto } from './api';
import {
  commonSubmissions,
  commonSubmittableContracts,
  contractsCoveringPeriod,
  submittableContracts,
  treatmentPeriod,
  unbilledSubmissions,
} from './eligibility';

const contracts = [
  { value: 'pX', label: 'PKV x' },
  { value: 'pY', label: 'Zusatz y' },
  { value: 'pZ', label: 'Zusatz z' },
];

function submission(
  contractUID: string,
  status: 'eingereicht' | 'abgerechnet',
): InvoiceSubmissionDto {
  return {
    submissionUID: `e-${contractUID}`,
    contractUID,
    contractNumber: contractUID,
    companyName: 'AG',
    bonusForfeitRule: 'ON_REIMBURSEMENT',
    submittedDate: '2024-06-01',
    billingCount: status === 'abgerechnet' ? 1 : 0,
    reimbursed: 0,
    status,
    allocations: [],
  };
}

function invoice(
  overrides: Partial<
    Pick<InvoiceDto, 'workflowStatus' | 'reimbursementClosed' | 'submissions' | 'exclusions'>
  >,
) {
  return {
    workflowStatus: 'offen' as const,
    reimbursementClosed: false,
    submissions: [],
    exclusions: [],
    ...overrides,
  };
}

const values = (list: Array<{ value: string }>) => list.map((c) => c.value);

describe('submittableContracts', () => {
  it('offers every policy for an open invoice', () => {
    expect(values(submittableContracts(invoice({}), contracts))).toEqual(['pX', 'pY', 'pZ']);
  });

  it('drops policies the invoice already went to and excluded ones', () => {
    const inv = invoice({
      workflowStatus: 'teilabgerechnet',
      submissions: [submission('pX', 'abgerechnet')],
      exclusions: [{ contractUID: 'pZ', contractNumber: 'pZ', companyName: 'AG', note: null }],
    });
    expect(values(submittableContracts(inv, contracts))).toEqual(['pY']);
  });

  it('offers nothing once the invoice is billed or closed by hand', () => {
    expect(submittableContracts(invoice({ workflowStatus: 'abgerechnet' }), contracts)).toEqual([]);
    expect(
      submittableContracts(
        invoice({ workflowStatus: 'eingereicht', reimbursementClosed: true }),
        contracts,
      ),
    ).toEqual([]);
  });
});

describe('commonSubmittableContracts', () => {
  it('intersects the choices of all selected invoices', () => {
    const a = invoice({
      workflowStatus: 'eingereicht',
      submissions: [submission('pX', 'eingereicht')],
    });
    const b = invoice({
      exclusions: [{ contractUID: 'pY', contractNumber: 'pY', companyName: 'AG', note: null }],
    });
    expect(values(commonSubmittableContracts([a, b], contracts))).toEqual(['pZ']);
  });
});

describe('commonSubmissions', () => {
  const atX = submission('pX', 'eingereicht');
  const atY = submission('pY', 'eingereicht');

  it('keeps the submissions all invoices are part of', () => {
    const a = invoice({ workflowStatus: 'eingereicht', submissions: [atX, atY] });
    const b = invoice({ workflowStatus: 'eingereicht', submissions: [atY] });
    expect(commonSubmissions([a, b]).map((s) => s.submissionUID)).toEqual([atY.submissionUID]);
  });

  it('offers nothing for invoices without a shared submission', () => {
    const a = invoice({ workflowStatus: 'eingereicht', submissions: [atX] });
    const b = invoice({ workflowStatus: 'eingereicht', submissions: [atY] });
    expect(commonSubmissions([a, b])).toEqual([]);
  });

  it('offers nothing when an invoice is closed by hand, or none is selected', () => {
    const open = invoice({ workflowStatus: 'eingereicht', submissions: [atX] });
    const closed = invoice({
      workflowStatus: 'eingereicht',
      reimbursementClosed: true,
      submissions: [atX],
    });
    expect(commonSubmissions([open, closed])).toEqual([]);
    expect(commonSubmissions([])).toEqual([]);
  });
});

describe('unbilledSubmissions', () => {
  it('keeps the submissions still waiting for a reimbursement', () => {
    const inv = { submissions: [submission('pX', 'abgerechnet'), submission('pY', 'eingereicht')] };
    expect(unbilledSubmissions(inv).map((s) => s.contractUID)).toEqual(['pY']);
  });
});

describe('treatmentPeriod', () => {
  const treated = (treatmentDate: string) => ({ treatmentDate });

  it('is the one date for a single invoice', () => {
    expect(treatmentPeriod([treated('2024-03-12')])).toEqual({
      from: '2024-03-12',
      to: '2024-03-12',
    });
  });

  it('spans the earliest and the latest treatment of a selection', () => {
    const span = treatmentPeriod([
      treated('2024-06-30'),
      treated('2023-02-01'),
      treated('2024-01-05'),
    ]);
    expect(span).toEqual({ from: '2023-02-01', to: '2024-06-30' });
  });

  it('is null without invoices', () => {
    expect(treatmentPeriod([])).toBeNull();
  });
});

describe('contractsCoveringPeriod', () => {
  const policies = [
    { value: 'past', label: 'beendet', contractBegin: '2018-01-01', contractEnd: '2023-12-31' },
    { value: 'now', label: 'laufend', contractBegin: '2024-01-01', contractEnd: null },
    { value: 'all', label: 'durchgehend', contractBegin: '2015-01-01', contractEnd: null },
  ];
  const covering = (from: string, to = from) =>
    contractsCoveringPeriod(policies, { from, to }).map((c) => c.value);

  it('drops policies that had ended and those that had not started', () => {
    expect(covering('2023-06-01')).toEqual(['past', 'all']);
    expect(covering('2025-06-01')).toEqual(['now', 'all']);
  });

  it('counts the last day of a policy as covered', () => {
    expect(covering('2023-12-31')).toEqual(['past', 'all']);
    expect(covering('2024-01-01')).toEqual(['now', 'all']);
  });

  it('needs the whole span, not an overlap of it', () => {
    expect(covering('2023-11-01', '2024-02-01')).toEqual(['all']);
  });

  it('rules nothing out without a treatment period', () => {
    expect(contractsCoveringPeriod(policies, null)).toEqual(policies);
  });
});
