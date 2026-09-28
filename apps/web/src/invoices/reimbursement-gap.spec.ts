import { describe, expect, it } from 'vitest';

import type { InvoiceDto } from './api';
import { reimbursementGap } from './reimbursement-gap';

const invoice = (
  workflowStatus: InvoiceDto['workflowStatus'],
  remainingAmount: number,
): Pick<InvoiceDto, 'workflowStatus' | 'remainingAmount'> => ({ workflowStatus, remainingAmount });

// `euro()` separates the amount from the sign with a non-breaking space; the
// sentences below pin it, because they are read out exactly as they stand.
describe('reimbursementGap', () => {
  it('marks a closed case that fell short as the insured person’s own share', () => {
    expect(reimbursementGap(invoice('abgerechnet', 142.5))).toEqual({
      tone: 'short',
      label: 'Nicht vollständig erstattet – Eigenanteil 142,50\u00a0€',
    });
    expect(reimbursementGap(invoice('erledigt', 60))?.tone).toBe('short');
  });

  it('keeps a running case apart: a further policy can still answer', () => {
    expect(reimbursementGap(invoice('teilabgerechnet', 100))).toEqual({
      tone: 'pending',
      label: 'Noch nicht vollständig erstattet – offen 100,00\u00a0€',
    });
  });

  it('says nothing where nothing has been answered yet', () => {
    expect(reimbursementGap(invoice('offen', 500))).toBeNull();
    expect(reimbursementGap(invoice('eingereicht', 500))).toBeNull();
  });

  it('says nothing once the invoice is covered in full', () => {
    expect(reimbursementGap(invoice('erledigt', 0))).toBeNull();
    expect(reimbursementGap(invoice('abgerechnet', 0))).toBeNull();
    // Cents, not floats: 0.1 + 0.2 must not leave a gap of its own.
    expect(reimbursementGap(invoice('abgerechnet', 0.001))).toBeNull();
  });
});
