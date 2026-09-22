import { createAllocation, createBilling, updateBilling } from './api';

/** What BillingDialog hands over: either a new billing or an existing one. */
export interface BillingAllocationPayload {
  submissionUID: string;
  billingUID?: string;
  newBilling?: { billingDate: string; billingNumber: string };
  reimbursement: number;
  receiptNumber?: string;
  /** For a new billing always set; for an existing one only when it changes. */
  forfeitsBonus?: boolean;
}

/**
 * Books a reimbursement for an invoice: creates the service billing first if
 * it is a new one, then the allocation. A changed bonus-forfeit flag on an
 * existing billing is written only after the allocation went through, so a
 * rejected reimbursement leaves the billing untouched.
 */
export async function saveBillingAllocation(
  invoiceUID: string,
  payload: BillingAllocationPayload,
): Promise<void> {
  let billingUID = payload.billingUID;
  if (payload.newBilling) {
    const billing = await createBilling({
      submissionUID: payload.submissionUID,
      ...payload.newBilling,
      ...(payload.forfeitsBonus !== undefined ? { forfeitsBonus: payload.forfeitsBonus } : {}),
    });
    billingUID = billing.billingUID;
  }
  await createAllocation({
    billingUID: billingUID!,
    invoiceUID,
    reimbursement: payload.reimbursement,
    ...(payload.receiptNumber ? { receiptNumber: payload.receiptNumber } : {}),
  });
  if (payload.billingUID && payload.forfeitsBonus !== undefined) {
    await updateBilling(payload.billingUID, { forfeitsBonus: payload.forfeitsBonus });
  }
}
