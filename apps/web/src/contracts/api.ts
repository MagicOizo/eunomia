import type { BonusForfeitRule, ContractKind } from '@eunomia/shared';

import { apiData, apiFetch } from '../lib/api';

/** The two enums are the API's, labelled here (see @eunomia/shared). */
export type { BonusForfeitRule, ContractKind };

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
  /** The full monthly premium (information only); null when only the relevant one is known. */
  monthlyPremium: number | null;
  /** The part of the premium a factor tier multiplies; at least one of the two is set. */
  bonusRelevantPremium: number | null;
  note: string | null;
}

/**
 * One step of a bonus scale: from this many claim-free years on, a bonus of
 * either an amount in € or a factor in monthly bonus-relevant premiums.
 */
export interface BonusTierDto {
  claimFreeYears: number;
  bonusAmount: number | null;
  bonusFactor: number | null;
}

/** Terms (Konditionen) valid from a year; `validToYear` is derived by the API. */
export interface TermsDto {
  termsUID: string;
  validFromYear: number;
  validToYear: number | null;
  deductible: number;
  reimbursementCap: number | null;
  reimbursementRate: number;
  bonusTiers: BonusTierDto[];
}

/** One year of the computed bonus timeline (see api domain/bonus-timeline.ts). */
export interface BonusYearDto {
  year: number;
  forfeited: boolean;
  forfeitSource: 'override' | 'claims' | null;
  /** Claims without a reimbursement yet that would forfeit the bonus once one arrives. */
  pendingClaims: number;
  claimFreeStreak: number;
  /** 0 if forfeited, null while no terms exist for the year. */
  expectedBonus: number | null;
  hasBonusScale: boolean;
  termsFromYear: number | null;
  /** The reached amount was taken over from an earlier year ("nicht aktualisiert"). */
  tiersInherited: boolean;
  /** Factor of the reached tier, null for an amount tier. */
  bonusFactor: number | null;
  /** The year's average bonus-relevant monthly premium; null if a month lacks one. */
  relevantPremiumAverage: number | null;
  /** The reached tier is a factor, but a running month has no bonus-relevant premium. */
  premiumMissing: boolean;
  actualBonus: number | null;
  bonusForfeitedOverride: boolean | null;
  note: string | null;
  inProgress: boolean;
}

/** What the author records for a year: the paid bonus, a forfeit override, a note. */
export interface ContractYearInput {
  actualBonus: number | null;
  bonusForfeited: boolean | null;
  note: string | null;
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
  years: BonusYearDto[];
}

export type PremiumInput = Pick<
  PremiumDto,
  'validFrom' | 'monthlyPremium' | 'bonusRelevantPremium' | 'note'
>;
export type TermsInput = Pick<
  TermsDto,
  'validFromYear' | 'deductible' | 'reimbursementCap' | 'reimbursementRate' | 'bonusTiers'
>;

export async function getContract(uid: string): Promise<ContractDetailDto> {
  return apiData<ContractDetailDto>(`/contracts/${uid}`);
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

/** Stores the year record; an all-empty record removes it again. */
export async function saveContractYear(
  contractUID: string,
  year: number,
  body: ContractYearInput,
): Promise<void> {
  await apiFetch(`/contracts/${contractUID}/years/${year}`, { method: 'PUT', body });
}

/**
 * Whether a billing forfeits the bonus by the policy's rule alone — the preset
 * of the "Verwirkt den Bonus" toggle when a reimbursement is recorded.
 */
export function forfeitsByRule(rule: BonusForfeitRule, reimbursement: number): boolean {
  return rule === 'ON_SUBMISSION' || Math.round(reimbursement * 100) > 0;
}
