/**
 * The enum values of a policy, as the database stores them and the API hands
 * them out. The API validates against them, the web labels them in German
 * (contracts/api.ts) — neither side may invent a sixth value on its own.
 */

/** Full cover or a supplementary policy on top of one (migration 006). */
export const CONTRACT_KINDS = ['FULL', 'SUPPLEMENTARY'] as const;

export type ContractKind = (typeof CONTRACT_KINDS)[number];

/**
 * When a claim forfeits the year's no-claims bonus: with the submission itself,
 * or only once the insurer actually reimburses something.
 */
export const BONUS_FORFEIT_RULES = ['ON_SUBMISSION', 'ON_REIMBURSEMENT'] as const;

export type BonusForfeitRule = (typeof BONUS_FORFEIT_RULES)[number];
