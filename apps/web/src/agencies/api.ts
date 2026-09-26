import { apiFetch } from '../lib/api';

/**
 * A collection agency and its bank accounts. The account is a history since
 * Slice 38: an agency that changes its account stays one entry, and an invoice
 * names the account its money went to.
 */

/** One bank account; `validTo` is derived by the API from the entry that follows. */
export interface AgencyAccountDto {
  agencyAccountUID: string;
  /** null = applies from the beginning (see accounts.ts). */
  validFrom: string | null;
  validTo: string | null;
  bankAccount: string;
  bic: string | null;
  /** Beneficiary, where the money is addressed to someone else than the agency. */
  recipientName: string | null;
  note: string | null;
}

/** An agency as every read hands it out: with its history and today's account flattened. */
export interface AgencyDto {
  agencyUID: string;
  agencyName: string;
  /** The account in force today, or null while the agency has none at all. */
  bankAccount: string | null;
  bic: string | null;
  recipientName: string | null;
  accounts: AgencyAccountDto[];
}

export type AgencyAccountInput = Pick<
  AgencyAccountDto,
  'validFrom' | 'bankAccount' | 'bic' | 'recipientName' | 'note'
>;

const unwrap = <T>(res: { data: T }): T => res.data;

export async function getAgency(uid: string): Promise<AgencyDto> {
  return unwrap(await apiFetch<{ data: AgencyDto }>(`/agencies/${uid}`));
}

export async function updateAgency(uid: string, agencyName: string): Promise<void> {
  await apiFetch(`/agencies/${uid}`, { method: 'PATCH', body: { agencyName } });
}

/** Creates or updates one bank account of an agency. */
export async function saveAgencyAccount(
  agencyUID: string,
  entryUID: string | null,
  body: AgencyAccountInput,
): Promise<void> {
  const base = `/agencies/${agencyUID}/accounts`;
  await apiFetch(entryUID ? `${base}/${entryUID}` : base, {
    method: entryUID ? 'PATCH' : 'POST',
    body,
  });
}

export async function deleteAgencyAccount(agencyUID: string, entryUID: string): Promise<void> {
  await apiFetch(`/agencies/${agencyUID}/accounts/${entryUID}`, { method: 'DELETE' });
}
