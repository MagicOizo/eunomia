import { type AllocationEntry, createAllocations, updateBilling } from './api';

/** What BillingDialog hands over: the billing and what it reimbursed per invoice. */
export interface BillingAllocationPayload {
  billingUID: string;
  entries: AllocationEntry[];
  /** Only set when it differs from what the billing stores. */
  forfeitsBonus?: boolean;
}

/**
 * Books a billing's reimbursements. The amounts go first, in one transaction,
 * and a changed bonus-forfeit flag is written only afterwards — so a rejected
 * booking leaves the billing exactly as it was.
 */
export async function saveBillingAllocations(payload: BillingAllocationPayload): Promise<void> {
  await createAllocations(payload.billingUID, payload.entries);
  if (payload.forfeitsBonus !== undefined) {
    await updateBilling(payload.billingUID, { forfeitsBonus: payload.forfeitsBonus });
  }
}
