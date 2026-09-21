import { apiFetch } from '../lib/api';

export type ContractKind = 'FULL' | 'SUPPLEMENTARY';
export type BonusForfeitRule = 'ON_SUBMISSION' | 'ON_REIMBURSEMENT';

export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  FULL: 'Vollversicherung',
  SUPPLEMENTARY: 'Zusatzversicherung',
};

/** Compact form for table columns. */
export const CONTRACT_KIND_SHORT_LABEL: Record<ContractKind, string> = {
  FULL: 'Voll',
  SUPPLEMENTARY: 'Zusatz',
};

export const BONUS_FORFEIT_RULE_LABEL: Record<BonusForfeitRule, string> = {
  ON_SUBMISSION: 'schon durch Einreichen',
  ON_REIMBURSEMENT: 'erst durch Erstattung',
};

/** A premium (Beitragsstand); `validTo` is derived by the API from the next entry. */
export interface PremiumDto {
  premiumUID: string;
  validFrom: string;
  validTo: string | null;
  monthlyPremium: number;
  note: string | null;
}

/** Terms (Konditionen) valid from a year; `validToYear` is derived by the API. */
export interface TermsDto {
  termsUID: string;
  validFromYear: number;
  validToYear: number | null;
  deductible: number;
  reimbursementCap: number | null;
  reimbursementRate: number;
}

export interface ContractDetailDto {
  contractUID: string;
  contractNumber: string;
  companyUID: string;
  accountUID: string;
  contractKind: ContractKind;
  contractBegin: string;
  contractEnd: string | null;
  bonusForfeitRule: BonusForfeitRule;
  claimFreeYearsAtStart: number;
  claimFreeCountingFromYear: number | null;
  premiums: PremiumDto[];
  terms: TermsDto[];
}

export type PremiumInput = Pick<PremiumDto, 'validFrom' | 'monthlyPremium' | 'note'>;
export type TermsInput = Pick<
  TermsDto,
  'validFromYear' | 'deductible' | 'reimbursementCap' | 'reimbursementRate'
>;

const unwrap = <T>(res: { data: T }): T => res.data;

export async function getContract(uid: string): Promise<ContractDetailDto> {
  return unwrap(await apiFetch<{ data: ContractDetailDto }>(`/contracts/${uid}`));
}

export async function updateContract(uid: string, body: Record<string, unknown>): Promise<void> {
  await apiFetch(`/contracts/${uid}`, { method: 'PATCH', body });
}

/** Creates or updates an entry of a contract's premium or terms history. */
export async function saveHistoryEntry(
  contractUID: string,
  segment: 'premiums' | 'terms',
  entryUID: string | null,
  body: PremiumInput | TermsInput,
): Promise<void> {
  const base = `/contracts/${contractUID}/${segment}`;
  await apiFetch(entryUID ? `${base}/${entryUID}` : base, {
    method: entryUID ? 'PATCH' : 'POST',
    body,
  });
}

export async function deleteHistoryEntry(
  contractUID: string,
  segment: 'premiums' | 'terms',
  entryUID: string,
): Promise<void> {
  await apiFetch(`/contracts/${contractUID}/${segment}/${entryUID}`, { method: 'DELETE' });
}
