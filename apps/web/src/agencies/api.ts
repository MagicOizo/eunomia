import { apiFetch } from '../lib/api';

/**
 * A collection agency and its bank accounts. Since Slice 44 it holds several at
 * once, in the order they were recorded, and each invoice names the one it goes
 * to.
 */

/** One bank account of an agency. */
export interface AgencyAccountDto {
  agencyAccountUID: string;
  bankAccount: string;
  bic: string | null;
  /** Beneficiary, where the money is addressed to someone else than the agency. */
  recipientName: string | null;
  note: string | null;
}

/** An agency as every read hands it out: with all its accounts and the first flattened. */
export interface AgencyDto {
  agencyUID: string;
  agencyName: string;
  /** The account recorded first, or null while the agency has none at all. */
  bankAccount: string | null;
  bic: string | null;
  recipientName: string | null;
  accounts: AgencyAccountDto[];
}

export type AgencyAccountInput = Pick<
  AgencyAccountDto,
  'bankAccount' | 'bic' | 'recipientName' | 'note'
>;

const unwrap = <T>(res: { data: T }): T => res.data;

export async function getAgency(uid: string): Promise<AgencyDto> {
  return unwrap(await apiFetch<{ data: AgencyDto }>(`/agencies/${uid}`));
}

export async function updateAgency(uid: string, agencyName: string): Promise<void> {
  await apiFetch(`/agencies/${uid}`, { method: 'PATCH', body: { agencyName } });
}

/** Creates or updates one bank account of an agency; hands back the saved row. */
export async function saveAgencyAccount(
  agencyUID: string,
  entryUID: string | null,
  body: AgencyAccountInput,
): Promise<AgencyAccountDto> {
  const base = `/agencies/${agencyUID}/accounts`;
  return unwrap(
    await apiFetch<{ data: AgencyAccountDto }>(entryUID ? `${base}/${entryUID}` : base, {
      method: entryUID ? 'PATCH' : 'POST',
      body,
    }),
  );
}

export async function deleteAgencyAccount(agencyUID: string, entryUID: string): Promise<void> {
  await apiFetch(`/agencies/${agencyUID}/accounts/${entryUID}`, { method: 'DELETE' });
}
