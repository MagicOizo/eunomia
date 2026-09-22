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
 *    to every longer streak). Terms that started in an earlier year are an
 *    inherited forecast ("nicht aktualisiert"), since the insurer usually
 *    announces new amounts each year.
 */

export type BonusForfeitRule = 'ON_SUBMISSION' | 'ON_REIMBURSEMENT';

export interface BonusClaim {
  /** Treatment year of the invoice. */
  year: number;
  /** Reimbursement allocated from one billing, or null while none is recorded yet. */
  reimbursement: number | null;
  /** The billing's explicit choice; null follows the policy's rule. */
  forfeitsBonus: boolean | null;
}

export interface BonusTier {
  claimFreeYears: number;
  bonusAmount: number;
}

export interface BonusTerms {
  validFromYear: number;
  bonusTiers: BonusTier[];
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
  /** True when the terms (and scale) were taken over from an earlier year. */
  tiersInherited: boolean;
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

/** The terms in force for a year: the latest entry that started at or before it. */
function termsInForce(terms: BonusTerms[], year: number): BonusTerms | null {
  let found: BonusTerms | null = null;
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

/** The bonus of the highest tier the streak reaches, 0 below the lowest tier. */
function tierBonus(tiers: BonusTier[], streak: number): number {
  let best: BonusTier | null = null;
  for (const tier of tiers) {
    if (
      tier.claimFreeYears <= streak &&
      (best === null || tier.claimFreeYears > best.claimFreeYears)
    ) {
      best = tier;
    }
  }
  return best?.bonusAmount ?? 0;
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
    let expectedBonus: number | null = null;
    if (terms !== null) expectedBonus = forfeited ? 0 : tierBonus(terms.bonusTiers, streak);

    years.push({
      year,
      forfeited,
      forfeitSource,
      pendingClaims: forfeited ? 0 : pendingClaims,
      claimFreeStreak: streak,
      expectedBonus,
      hasBonusScale,
      termsFromYear: terms?.validFromYear ?? null,
      tiersInherited: terms !== null && terms.validFromYear < year,
      actualBonus: record?.actualBonus ?? null,
      bonusForfeitedOverride: override,
      note: record?.note ?? null,
      inProgress: year === input.currentYear,
    });
  }
  return years;
}
