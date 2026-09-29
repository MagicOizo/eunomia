import { iban } from '../lib/format';

import type { AgencyAccountDto } from './api';

/**
 * The bank accounts of a collection agency: several at once, in the order they
 * were recorded (see Notes/eunomia-plan.md, Slice 44).
 *
 * Until then they were a history and a rule said which one applied. Production
 * said otherwise — an agency names three accounts on one bill and only the
 * second of them on the next — so the invoice names its account itself. What
 * is left here is how to suggest one and how to write one down.
 */

/**
 * The account to suggest for an agency: the one recorded first, which is what
 * an agency listing several is normally paid on. Only a suggestion — what
 * counts is what the invoice names. The twin of `defaultAccount` in
 * apps/api/src/domain/agency-accounts.ts.
 */
export function defaultAccount<T>(accounts: T[]): T | null {
  return accounts[0] ?? null;
}

/** The account with the given UID, or null — for an invoice naming one. */
export function accountByUID<T extends { agencyAccountUID: string }>(
  accounts: T[],
  uid: string | null,
): T | null {
  if (uid === null) return null;
  return accounts.find((account) => account.agencyAccountUID === uid) ?? null;
}

/**
 * The account of an invoice: the one it names, and while it names none (an
 * invoice from before Slice 44, or one entered elsewhere) the agency's first.
 */
export function accountForInvoice<T extends { agencyAccountUID: string }>(
  accounts: T[],
  uid: string | null,
): T | null {
  return accountByUID(accounts, uid) ?? defaultAccount(accounts);
}

/**
 * What identifies an account in a picker or a list: its IBAN, grouped in fours
 * so it reads as one and breaks where it may. What is stored and sent stays
 * compact — this is the printed form.
 */
export function accountLabel(account: Pick<AgencyAccountDto, 'bankAccount'>): string {
  return iban(account.bankAccount);
}

/**
 * The secondary line of an account in a picker — what tells two IBANs of the
 * same agency apart: who the money is addressed to, and what the note says.
 */
export function accountHint(
  account: Pick<AgencyAccountDto, 'recipientName' | 'note'>,
): string | undefined {
  const parts = [account.recipientName, account.note].filter(
    (part): part is string => part !== null && part !== '',
  );
  return parts.length === 0 ? undefined : parts.join(' · ');
}
