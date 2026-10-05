/**
 * Claim-free years and the expected bonus of one policy, year by year (see
 * Notes/eunomia-plan.md, 2.3 "Datenmodell v3" / Slice 18). Claim-free years
 * are counted, never maintained by hand: a pure function over the policy's
 * claims, its yearly terms with their bonus scale and the optional per-year
 * overrides, so the rules are unit-tested in isolation.
 *
 * Rules:
 *  - A claim is an invoice (by treatment year) submitted to this policy. Each
 *    reimbursement allocated to it from a billing is evaluated on its own:
 *    the billing's explicit `forfeitsBonus` wins; without one the policy's
 *    rule decides — ON_SUBMISSION forfeits in any case, ON_REIMBURSEMENT only
 *    for a reimbursement > 0 (a 0 € answer keeps the bonus).
 *  - A claim without any reimbursement yet is pending. Under ON_SUBMISSION the
 *    submission alone already forfeits; under ON_REIMBURSEMENT nothing is lost
 *    yet, the year is only at risk (`pendingClaims`).
 *  - A year's manual override (ContractYears.bonusForfeited) beats the claims.
 *  - The streak starts at `claimFreeYearsAtStart` before the counting year;
 *    every claim-free year adds one, a forfeited year resets it to 0. The
 *    streak of a year includes that year: the first claim-free year earns
 *    the "1 year" tier.
 *  - The expected bonus of a claim-free year is the highest tier the streak
 *    reaches, taken from the terms in force that year (the top tier applies
 *    to every longer streak).
 *  - A tier holds either an amount in € or a factor in monthly premiums
 *    (Slice 76). A factor applies to the year's average bonus-relevant
 *    premium: the months the policy runs in that year, each with the premium
 *    in force on its first running day, so an adjustment mid-year counts pro
 *    rata. If any running month has no bonus-relevant premium, there is no
 *    forecast (`premiumMissing`) rather than a guess.
 *  - An amount from terms that started in an earlier year is an inherited
 *    forecast ("nicht aktualisiert"), since insurers announce new amounts each
 *    year. A factor is the insurer's standing rule and is never outdated.
 */

import type { BonusForfeitRule } from '@eunomia/shared';

export interface BonusClaim {
  /** Treatment year of the invoice. */
  year: number;
  /** Reimbursement allocated from one billing, or null while none is recorded yet. */
  reimbursement: number | null;
  /** The billing's explicit choice; null follows the policy's rule. */
  forfeitsBonus: boolean | null;
}

/** Exactly one of `bonusAmount` and `bonusFactor` is set. */
export interface BonusTier {
  claimFreeYears: number;
  bonusAmount: number | null;
  /** Bonus in monthly bonus-relevant premiums. */
  bonusFactor: number | null;
}

export interface BonusTerms {
  validFromYear: number;
  bonusTiers: BonusTier[];
}

/** A ContractPremiums row, as far as the bonus is concerned. */
export interface BonusPremium {
  /** ISO date the premium applies from. */
  validFrom: string;
  bonusRelevantPremium: number | null;
}

/** A ContractYears row: what the author recorded for one year. */
export interface BonusYearRecord {
  year: number;
  /** Bonus actually paid according to the insurer's letter. */
  actualBonus: number | null;
  /** Manual override; null leaves the decision to the claims. */
  bonusForfeited: boolean | null;
  note: string | null;
}

export interface BonusTimelineInput {
  rule: BonusForfeitRule;
  claimFreeYearsAtStart: number;
  /** First year that is counted (the policy's begin year unless set otherwise). */
  countingFromYear: number;
  /** Last year to evaluate: the current year, or the contract end year if earlier. */
  lastYear: number;
  /** The running calendar year; its result is a forecast. */
  currentYear: number;
  claims: BonusClaim[];
  yearRecords: BonusYearRecord[];
  terms: BonusTerms[];
  /** The policy's premium history, in any order. */
  premiums: BonusPremium[];
  /** ISO dates of the policy's term; they bound the months a year's average covers. */
  contractBegin: string;
  contractEnd: string | null;
}

export interface BonusYear {
  year: number;
  forfeited: boolean;
  /** Why the year is forfeited: the manual override or the claims; null if it is not. */
  forfeitSource: 'override' | 'claims' | null;
  /** Claims still waiting for a reimbursement that would forfeit the bonus if one arrives. */
  pendingClaims: number;
  /** Claim-free years in a row at the end of this year (0 if forfeited). */
  claimFreeStreak: number;
  /** Bonus earned for this year per the scale; 0 if forfeited, null if no terms exist. */
  expectedBonus: number | null;
  /** False when the terms in force define no scale (e.g. a supplementary policy). */
  hasBonusScale: boolean;
  /** Year the terms in force were recorded for, or null if none exist. */
  termsFromYear: number | null;
  /** True when the reached tier is an amount taken over from an earlier year's terms. */
  tiersInherited: boolean;
  /** Factor of the reached tier, or null when it is an amount (or none is reached). */
  bonusFactor: number | null;
  /** The year's average bonus-relevant monthly premium; null if a running month lacks one. */
  relevantPremiumAverage: number | null;
  /** The reached tier is a factor, but the average it needs is unknown. */
  premiumMissing: boolean;
  actualBonus: number | null;
  bonusForfeitedOverride: boolean | null;
  note: string | null;
  /** True for the running year: the outcome can still change. */
  inProgress: boolean;
}

/** Whether one claim forfeits the bonus; null when it is pending and does not (yet). */
function claimForfeits(rule: BonusForfeitRule, claim: BonusClaim): boolean | null {
  if (claim.forfeitsBonus !== null) return claim.forfeitsBonus;
  if (rule === 'ON_SUBMISSION') return true;
  if (claim.reimbursement === null) return null;
  return Math.round(claim.reimbursement * 100) > 0;
}

/**
 * The terms in force for a year: the latest entry that started at or before it.
 * Generic over the row, because the reimbursement plan asks the same question
 * of the whole terms row — deductible, cap and rate — that it used to ask the
 * database once per policy (CR-16).
 */
export function termsInForce<T extends { validFromYear: number }>(
  terms: readonly T[],
  year: number,
): T | null {
  let found: T | null = null;
  for (const entry of terms) {
    if (
      entry.validFromYear <= year &&
      (found === null || entry.validFromYear > found.validFromYear)
    ) {
      found = entry;
    }
  }
  return found;
}

/** The highest tier the streak reaches, null below the lowest tier. */
function reachedTier(tiers: BonusTier[], streak: number): BonusTier | null {
  let best: BonusTier | null = null;
  for (const tier of tiers) {
    if (
      tier.claimFreeYears <= streak &&
      (best === null || tier.claimFreeYears > best.claimFreeYears)
    ) {
      best = tier;
    }
  }
  return best;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');
const roundCents = (value: number): number => Math.round(value * 100) / 100;

/**
 * The average bonus-relevant monthly premium over the months the policy runs
 * in `year`, or null if one of them has none (or the policy does not run).
 * Each month takes the premium in force on its first running day — the 1st,
 * or the contract begin in the first month.
 */
export function averageRelevantPremium(
  premiums: readonly BonusPremium[],
  contractBegin: string,
  contractEnd: string | null,
  year: number,
): number | null {
  let sum = 0;
  let months = 0;
  for (let month = 1; month <= 12; month += 1) {
    const monthStart = `${year}-${pad2(month)}-01`;
    // Day 31 compares as the month's last day for every month in ISO order.
    const monthEnd = `${year}-${pad2(month)}-31`;
    if (monthEnd < contractBegin || (contractEnd !== null && monthStart > contractEnd)) continue;
    const firstDay = monthStart < contractBegin ? contractBegin : monthStart;
    let inForce: BonusPremium | null = null;
    for (const premium of premiums) {
      if (
        premium.validFrom <= firstDay &&
        (inForce === null || premium.validFrom > inForce.validFrom)
      ) {
        inForce = premium;
      }
    }
    if (inForce?.bonusRelevantPremium == null) return null;
    sum += inForce.bonusRelevantPremium;
    months += 1;
  }
  return months === 0 ? null : sum / months;
}

/** Evaluates every year from the counting year up to `lastYear`, oldest first. */
export function computeBonusTimeline(input: BonusTimelineInput): BonusYear[] {
  const records = new Map(input.yearRecords.map((record) => [record.year, record]));
  const years: BonusYear[] = [];
  let streak = input.claimFreeYearsAtStart;

  for (let year = input.countingFromYear; year <= input.lastYear; year += 1) {
    let claimsForfeit = false;
    let pendingClaims = 0;
    for (const claim of input.claims) {
      if (claim.year !== year) continue;
      const forfeits = claimForfeits(input.rule, claim);
      if (forfeits === true) claimsForfeit = true;
      else if (forfeits === null) pendingClaims += 1;
    }

    const record = records.get(year);
    const override = record?.bonusForfeited ?? null;
    const forfeited = override ?? claimsForfeit;
    const forfeitSource = !forfeited ? null : override !== null ? 'override' : 'claims';
    streak = forfeited ? 0 : streak + 1;

    const terms = termsInForce(input.terms, year);
    const hasBonusScale = (terms?.bonusTiers.length ?? 0) > 0;
    const tier = terms === null ? null : reachedTier(terms.bonusTiers, streak);
    const average = averageRelevantPremium(
      input.premiums,
      input.contractBegin,
      input.contractEnd,
      year,
    );
    const bonusFactor = tier?.bonusFactor ?? null;
    const premiumMissing = bonusFactor !== null && average === null;
    let expectedBonus: number | null = null;
    if (terms !== null) {
      if (forfeited || tier === null) expectedBonus = 0;
      else if (bonusFactor !== null)
        expectedBonus = average === null ? null : roundCents(bonusFactor * average);
      else expectedBonus = tier.bonusAmount ?? 0;
    }

    years.push({
      year,
      forfeited,
      forfeitSource,
      pendingClaims: forfeited ? 0 : pendingClaims,
      claimFreeStreak: streak,
      expectedBonus,
      hasBonusScale,
      termsFromYear: terms?.validFromYear ?? null,
      tiersInherited:
        terms !== null && terms.validFromYear < year && tier !== null && bonusFactor === null,
      bonusFactor,
      relevantPremiumAverage: average === null ? null : roundCents(average),
      premiumMissing: premiumMissing && !forfeited,
      actualBonus: record?.actualBonus ?? null,
      bonusForfeitedOverride: override,
      note: record?.note ?? null,
      inProgress: year === input.currentYear,
    });
  }
  return years;
}
