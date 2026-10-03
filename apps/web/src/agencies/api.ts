import { apiData, apiFetch } from '../lib/api';

/**
 * A collection agency and its payment details. Since Slice 44 it holds several
 * sets at once, in the order they were recorded, and each invoice names the one
 * it goes to.
 *
 * The field names are the API's and keep the older word (`agencyAccountUID`, and
 * the array is `accounts`); `account` in this codebase is the insured (§2.8).
 */

/** One set of payment details of an agency. */
export interface AgencyPaymentDetailDto {
  agencyAccountUID: string;
  bankAccount: string;
  bic: string | null;
  /** Beneficiary, where the money is addressed to someone else than the agency. */
  recipientName: string | null;
  note: string | null;
}

/** An agency as every read hands it out: with all its details and the first flattened. */
export interface AgencyDto {
  agencyUID: string;
  agencyName: string;
  /** The details recorded first, or null while the agency has none at all. */
  bankAccount: string | null;
  bic: string | null;
  recipientName: string | null;
  accounts: AgencyPaymentDetailDto[];
}

export type AgencyPaymentDetailInput = Pick<
  AgencyPaymentDetailDto,
  'bankAccount' | 'bic' | 'recipientName' | 'note'
>;

export async function getAgency(uid: string): Promise<AgencyDto> {
  return apiData<AgencyDto>(`/agencies/${uid}`);
}

export async function updateAgency(uid: string, agencyName: string): Promise<void> {
  await apiFetch(`/agencies/${uid}`, { method: 'PATCH', body: { agencyName } });
}

/** Creates or updates one set of an agency's payment details; hands back the saved row. */
export async function saveAgencyPaymentDetail(
  agencyUID: string,
  entryUID: string | null,
  body: AgencyPaymentDetailInput,
): Promise<AgencyPaymentDetailDto> {
  const base = `/agencies/${agencyUID}/accounts`;
  return apiData<AgencyPaymentDetailDto>(entryUID ? `${base}/${entryUID}` : base, {
    method: entryUID ? 'PATCH' : 'POST',
    body,
  });
}

export async function deleteAgencyPaymentDetail(
  agencyUID: string,
  entryUID: string,
): Promise<void> {
  await apiFetch(`/agencies/${agencyUID}/accounts/${entryUID}`, { method: 'DELETE' });
}
