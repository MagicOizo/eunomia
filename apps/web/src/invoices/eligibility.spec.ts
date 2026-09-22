import { describe, expect, it } from 'vitest';

import type { InvoiceDto, InvoiceSubmissionDto } from './api';
import {
  commonSubmittableContracts,
  submittableContracts,
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

describe('unbilledSubmissions', () => {
  it('keeps the submissions still waiting for a reimbursement', () => {
    const inv = { submissions: [submission('pX', 'abgerechnet'), submission('pY', 'eingereicht')] };
    expect(unbilledSubmissions(inv).map((s) => s.contractUID)).toEqual(['pY']);
  });
});
