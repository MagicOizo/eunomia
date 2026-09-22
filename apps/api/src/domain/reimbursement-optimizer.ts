/**
 * The reimbursement optimizer: where does submitting pay off for one insured
 * person and treatment year, across all of their policies? (See
 * Notes/eunomia-plan.md, 2.3 "Erstattungs-Optimierer" / Slice 19.) A pure
 * function, so the business rules are unit-tested in isolation; the loader in
 * reimbursement-plan.ts feeds it from the database.
 *
 * The decision per policy is whether to use it this year (submit, accept
 * losing its bonus) or spare it (keep the bonus). Only policies whose bonus
 * is still at stake are a choice; every combination of them is evaluated
 * (2ⁿ, n is 1–3 in practice). A policy whose bonus is already forfeited, or
 * that has no bonus, is always used; one whose bonus was already paid out is
 * always spared.
 *
 * Reality beats the model: a reimbursement already recorded for an invoice at
 * a policy counts with its actual amount in every scenario. Only what is
 * still open is modelled, per scenario:
 *  - Policies are processed in a fixed order, full policies before
 *    supplementary ones (then by contract number), invoices by treatment
 *    date. A supplementary policy therefore only sees what the full policy
 *    left over, which also enforces the "no enrichment" rule (Σ ≤ amount).
 *  - Per policy, the annual deductible and cap are consumed first by the
 *    invoices it already answered, then by the modelled ones in date order.
 *    The deductible an answered invoice consumed is approximated as its
 *    amount minus reimbursement / rate (clamped to what is left).
 *  - A modelled invoice at a used policy first fills the remaining
 *    deductible, then `rate × rest` is reimbursed up to the remaining cap.
 *    Excluded invoices and invoices closed by hand are not modelled.
 * The value of a scenario is all reimbursements plus the bonuses of the
 * spared policies. The best scenario wins; on a tie the one sparing more
 * policies wins (less effort, and the claim-free streak survives).
 *
 * Only the bonus of the year itself is compared: that a forfeited year also
 * resets the streak for later years is left to the caller to point out.
 *
 * On top of the strategy, each policy gets a status for what to do now:
 *  - spare: its bonus is worth more than using it (so far).
 *  - submit: submit now — to a full policy in any case, to a supplementary
 *    one what the policies before it leave over.
 *  - wait: a supplementary policy while the year is still running and a
 *    spared policy before it may still tip into being used; what it would
 *    pay now would then partly be the other policy's share.
 *  - exhausted: a supplementary policy whose cap is reached, with nothing
 *    left to submit there.
 *
 * All arithmetic runs in whole cents; inputs and outputs are euros.
 */

export type PolicyKind = 'FULL' | 'SUPPLEMENTARY';

/**
 * Where a policy's bonus stands this year: `choice` = still at stake,
 * `forfeited` = lost already or none to lose (always used), `paid` = the
 * insurer paid it already (always spared).
 */
export type BonusMode = 'choice' | 'forfeited' | 'paid';

export interface OptimizerPolicy {
  contractUID: string;
  contractNumber: string;
  kind: PolicyKind;
  deductible: number;
  /** Annual reimbursement cap, null for none. */
  reimbursementCap: number | null;
  /** Reimbursement rate in percent. */
  reimbursementRate: number;
  bonusMode: BonusMode;
  /** Bonus at stake (`choice`) or paid (`paid`); ignored for `forfeited`. */
  bonusAmount: number;
}

/** What is recorded for one invoice at one policy; a missing entry means nothing. */
export interface InvoicePolicyState {
  excluded: boolean;
  submitted: boolean;
  /** Sum of the reimbursements recorded, or null while no billing answered it. */
  actualReimbursement: number | null;
}

export interface OptimizerInvoice {
  invoiceUID: string;
  amount: number;
  /** ISO date; orders the invoices when the deductible and cap are consumed. */
  treatmentDate: string;
  /** "Als abgerechnet markiert": nothing further is expected for it. */
  reimbursementClosed: boolean;
  policies: Partial<Record<string, InvoicePolicyState>>;
}

export interface OptimizerInput {
  policies: OptimizerPolicy[];
  invoices: OptimizerInvoice[];
  /** True while further costs can still come for the year (running or future year). */
  yearInProgress: boolean;
}

export interface StrategyResult {
  usedContractUIDs: string[];
  sparedContractUIDs: string[];
  /** Actual plus modelled reimbursement per policy. */
  reimbursements: Record<string, number>;
  bonusTotal: number;
  /** Reimbursements plus bonuses. */
  total: number;
}

/**
 * Per invoice and policy: `answered` = reimbursement recorded; `submitted` =
 * recommended and already there; `submit` = recommended, not yet submitted;
 * `wait` = would be submitted, but the policy is to wait (see `PolicyStatus`);
 * `withdraw` = lies at a spared policy without an answer; `none` = not
 * recommended.
 */
export type InvoicePolicyAction =
  'excluded' | 'answered' | 'submitted' | 'submit' | 'wait' | 'withdraw' | 'none';

/** The overall advice for one invoice, derived from its per-policy actions. */
export type InvoiceAction = 'submit' | 'withdraw' | 'wait' | 'hold' | 'done' | 'not-reimbursable';

/** What to do with a policy now; see the module comment. */
export type PolicyStatus = 'spare' | 'submit' | 'wait' | 'exhausted';

export interface InvoicePlan {
  invoiceUID: string;
  action: InvoiceAction;
  /** In processing order (full before supplementary): "bei x, Rest bei y". */
  policies: Array<{
    contractUID: string;
    action: InvoicePolicyAction;
    /** Actual reimbursement if answered, else the modelled one in the recommended strategy. */
    reimbursement: number;
  }>;
}

export interface PolicyPlan {
  contractUID: string;
  bonusMode: BonusMode;
  bonusAmount: number;
  recommendation: 'use' | 'spare';
  status: PolicyStatus;
  /** Sum of the reimbursements already recorded. */
  actualReimbursement: number;
  /** Actual plus modelled reimbursement in the recommended strategy. */
  expectedReimbursement: number;
  /**
   * Deductible the year's costs fill at this policy: in the recommended
   * strategy if it is used there, else as if it were used on top of it — so a
   * spared policy shows how close its costs already come.
   */
  deductibleUsed: number;
  /** Invoice amounts not excluded at this policy. */
  eligibleCosts: number;
  /**
   * Only for a spared `choice` policy: further invoice costs above which
   * using it beats sparing it, or null when it never does (e.g. its cap
   * stays below the bonus). Undefined for every other policy.
   */
  worthUsingAbove?: number | null;
}

export interface OptimizerResult {
  invoiceTotal: number;
  /** Best first. */
  strategies: StrategyResult[];
  /** How much the recommended strategy beats the next best by; null if there is only one. */
  advantage: number | null;
  policies: PolicyPlan[];
  invoices: InvoicePlan[];
}

const toCents = (euros: number): number => Math.round(euros * 100);
const toEuros = (cents: number): number => cents / 100;

interface Scenario {
  /** Cents per policy, actual plus modelled. */
  reimbursed: Map<string, number>;
  /** Deductible cents consumed per policy, by answered and modelled invoices. */
  deductibleUsed: Map<string, number>;
  /** Modelled cents per invoice and policy, for the used policies it contributes to. */
  modelled: Map<string, Map<string, number>>;
  bonusCents: number;
  totalCents: number;
}

/** Full before supplementary, then by contract number. */
function processingOrder(policies: OptimizerPolicy[]): OptimizerPolicy[] {
  return [...policies].sort(
    (a, b) =>
      Number(a.kind === 'SUPPLEMENTARY') - Number(b.kind === 'SUPPLEMENTARY') ||
      a.contractNumber.localeCompare(b.contractNumber),
  );
}

function byTreatmentDate(invoices: OptimizerInvoice[]): OptimizerInvoice[] {
  return [...invoices].sort(
    (a, b) =>
      a.treatmentDate.localeCompare(b.treatmentDate) || a.invoiceUID.localeCompare(b.invoiceUID),
  );
}

/** Evaluates one strategy; `invoices` must be in treatment-date order. */
function runScenario(
  policies: OptimizerPolicy[],
  invoices: OptimizerInvoice[],
  used: Set<string>,
): Scenario {
  const open = new Map<string, number>();
  for (const invoice of invoices) {
    let cents = toCents(invoice.amount);
    for (const state of Object.values(invoice.policies)) {
      if (state?.actualReimbursement != null) cents -= toCents(state.actualReimbursement);
    }
    open.set(invoice.invoiceUID, Math.max(cents, 0));
  }

  const reimbursed = new Map<string, number>();
  const deductibleUsed = new Map<string, number>();
  const modelled = new Map<string, Map<string, number>>();
  let bonusCents = 0;

  for (const policy of policies) {
    const rate = policy.reimbursementRate / 100;
    let deductibleLeft = toCents(policy.deductible);
    let capLeft = policy.reimbursementCap === null ? Infinity : toCents(policy.reimbursementCap);
    let policyCents = 0;

    for (const invoice of invoices) {
      const actual = invoice.policies[policy.contractUID]?.actualReimbursement;
      if (actual == null) continue;
      const actualCents = toCents(actual);
      policyCents += actualCents;
      capLeft -= actualCents;
      const coveredBase = rate > 0 ? Math.round(actualCents / rate) : 0;
      const consumed = toCents(invoice.amount) - coveredBase;
      deductibleLeft -= Math.min(Math.max(consumed, 0), deductibleLeft);
    }

    if (used.has(policy.contractUID)) {
      const perInvoice = new Map<string, number>();
      for (const invoice of invoices) {
        const state = invoice.policies[policy.contractUID];
        if (state?.excluded || state?.actualReimbursement != null) continue;
        if (invoice.reimbursementClosed) continue;
        const base = open.get(invoice.invoiceUID) ?? 0;
        if (base <= 0) continue;
        const toDeductible = Math.min(deductibleLeft, base);
        deductibleLeft -= toDeductible;
        const cents = Math.max(Math.min(Math.round((base - toDeductible) * rate), capLeft), 0);
        capLeft -= cents;
        // An invoice that only fills the deductible still counts: it must be submitted.
        if (toDeductible > 0 || cents > 0) {
          perInvoice.set(invoice.invoiceUID, cents);
          open.set(invoice.invoiceUID, base - cents);
          policyCents += cents;
        }
      }
      modelled.set(policy.contractUID, perInvoice);
    } else if (policy.bonusMode !== 'forfeited') {
      bonusCents += toCents(policy.bonusAmount);
    }
    reimbursed.set(policy.contractUID, policyCents);
    deductibleUsed.set(policy.contractUID, toCents(policy.deductible) - deductibleLeft);
  }

  let totalCents = bonusCents;
  for (const cents of reimbursed.values()) totalCents += cents;
  return { reimbursed, deductibleUsed, modelled, bonusCents, totalCents };
}

/** Every allowed set of used policies: forfeited ones always, choices in all combinations. */
function candidateStrategies(policies: OptimizerPolicy[]): Array<Set<string>> {
  const fixed = policies.filter((p) => p.bonusMode === 'forfeited').map((p) => p.contractUID);
  const choices = policies.filter((p) => p.bonusMode === 'choice').map((p) => p.contractUID);
  const strategies: Array<Set<string>> = [];
  for (let mask = 0; mask < 2 ** choices.length; mask += 1) {
    strategies.push(new Set([...fixed, ...choices.filter((_, bit) => mask & (2 ** bit))]));
  }
  return strategies;
}

/** Best value (cents) over the candidate strategies that satisfy `accept`. */
function bestTotal(
  policies: OptimizerPolicy[],
  invoices: OptimizerInvoice[],
  accept: (used: Set<string>) => boolean,
): number {
  let best = -Infinity;
  for (const used of candidateStrategies(policies)) {
    if (!accept(used)) continue;
    best = Math.max(best, runScenario(policies, invoices, used).totalCents);
  }
  return best;
}

/**
 * Further invoice costs (a hypothetical invoice reimbursable everywhere, dated
 * after all others) at which using `policy` catches up with sparing it, the
 * other choices being optimised freely on either side. Scans in 10 € steps up
 * to a bound past which a gain can no longer appear, then bisects to the cent.
 */
function worthUsingAbove(
  policies: OptimizerPolicy[],
  invoices: OptimizerInvoice[],
  policy: OptimizerPolicy,
): number | null {
  if (policy.reimbursementRate <= 0) return null;
  const withExtra = (cents: number): OptimizerInvoice[] => [
    ...invoices,
    {
      invoiceUID: '￿',
      amount: toEuros(cents),
      treatmentDate: '9999-12-31',
      reimbursementClosed: false,
      policies: {},
    },
  ];
  const gain = (cents: number): number => {
    const extended = withExtra(cents);
    return (
      bestTotal(policies, extended, (used) => used.has(policy.contractUID)) -
      bestTotal(policies, extended, (used) => !used.has(policy.contractUID))
    );
  };

  let othersCaps = 0;
  for (const other of policies) {
    if (other !== policy && other.reimbursementCap !== null) {
      othersCaps += toCents(other.reimbursementCap);
    }
  }
  const bound =
    toCents(policy.deductible) +
    Math.ceil(((toCents(policy.bonusAmount) + othersCaps) * 100) / policy.reimbursementRate) +
    10000;

  const step = 1000;
  let below = 0;
  if (gain(0) >= 0) return 0;
  for (let cents = step; cents <= bound + step; cents += step) {
    if (gain(cents) >= 0) {
      let above = cents;
      while (above - below > 1) {
        const middle = Math.floor((below + above) / 2);
        if (gain(middle) >= 0) above = middle;
        else below = middle;
      }
      return toEuros(above);
    }
    below = cents;
  }
  return null;
}

function invoiceAction(actions: InvoicePolicyAction[]): InvoiceAction {
  if (actions.includes('withdraw')) return 'withdraw';
  if (actions.includes('submit')) return 'submit';
  if (actions.includes('wait')) return 'wait';
  if (actions.length > 0 && actions.every((action) => action === 'excluded')) {
    return 'not-reimbursable';
  }
  if (actions.includes('answered') || actions.includes('submitted')) return 'done';
  return 'hold';
}

/** Runs the optimizer for one insured person and treatment year. */
export function optimizeReimbursement(input: OptimizerInput): OptimizerResult {
  const policies = processingOrder(input.policies);
  const invoices = byTreatmentDate(input.invoices);

  const evaluated = candidateStrategies(policies).map((used) => ({
    used,
    scenario: runScenario(policies, invoices, used),
  }));
  evaluated.sort(
    (a, b) => b.scenario.totalCents - a.scenario.totalCents || a.used.size - b.used.size,
  );
  const [best, runnerUp] = evaluated;
  if (!best) throw new Error('No strategy evaluated');

  const strategies: StrategyResult[] = evaluated.map(({ used, scenario }) => ({
    usedContractUIDs: policies.filter((p) => used.has(p.contractUID)).map((p) => p.contractUID),
    sparedContractUIDs: policies.filter((p) => !used.has(p.contractUID)).map((p) => p.contractUID),
    reimbursements: Object.fromEntries(
      [...scenario.reimbursed].map(([uid, cents]) => [uid, toEuros(cents)]),
    ),
    bonusTotal: toEuros(scenario.bonusCents),
    total: toEuros(scenario.totalCents),
  }));

  const thresholds = new Map<string, number | null>();
  for (const policy of policies) {
    if (!best.used.has(policy.contractUID) && policy.bonusMode === 'choice') {
      thresholds.set(policy.contractUID, worthUsingAbove(policies, invoices, policy));
    }
  }

  /** Whether a spared policy processed before `index` may still tip into being used. */
  const earlierMayTip = (index: number): boolean =>
    policies
      .slice(0, index)
      .some((earlier) => (thresholds.get(earlier.contractUID) ?? null) !== null);

  const statuses = new Map<string, PolicyStatus>();
  policies.forEach((policy, index) => {
    let status: PolicyStatus = 'submit';
    if (!best.used.has(policy.contractUID)) {
      status = 'spare';
    } else if (policy.kind === 'SUPPLEMENTARY') {
      const modelled = best.scenario.modelled.get(policy.contractUID) ?? new Map();
      const leftToSubmit = invoices.some(
        (invoice) =>
          modelled.has(invoice.invoiceUID) && !invoice.policies[policy.contractUID]?.submitted,
      );
      const capReached =
        policy.reimbursementCap !== null &&
        (best.scenario.reimbursed.get(policy.contractUID) ?? 0) >= toCents(policy.reimbursementCap);
      if (capReached && !leftToSubmit) status = 'exhausted';
      else if (input.yearInProgress && earlierMayTip(index)) status = 'wait';
    }
    statuses.set(policy.contractUID, status);
  });

  const policyPlans: PolicyPlan[] = policies.map((policy) => {
    let actualCents = 0;
    let eligibleCents = 0;
    for (const invoice of invoices) {
      const state = invoice.policies[policy.contractUID];
      if (state?.actualReimbursement != null) actualCents += toCents(state.actualReimbursement);
      if (!state?.excluded) eligibleCents += toCents(invoice.amount);
    }
    const deductibleScenario = best.used.has(policy.contractUID)
      ? best.scenario
      : runScenario(policies, invoices, new Set([...best.used, policy.contractUID]));
    const plan: PolicyPlan = {
      contractUID: policy.contractUID,
      bonusMode: policy.bonusMode,
      bonusAmount: policy.bonusMode === 'forfeited' ? 0 : policy.bonusAmount,
      recommendation: best.used.has(policy.contractUID) ? 'use' : 'spare',
      status: statuses.get(policy.contractUID) ?? 'submit',
      actualReimbursement: toEuros(actualCents),
      expectedReimbursement: toEuros(best.scenario.reimbursed.get(policy.contractUID) ?? 0),
      deductibleUsed: toEuros(deductibleScenario.deductibleUsed.get(policy.contractUID) ?? 0),
      eligibleCosts: toEuros(eligibleCents),
    };
    if (thresholds.has(policy.contractUID)) {
      plan.worthUsingAbove = thresholds.get(policy.contractUID) ?? null;
    }
    return plan;
  });

  const invoicePlans: InvoicePlan[] = invoices.map((invoice) => {
    const perPolicy = policies.map((policy) => {
      const state = invoice.policies[policy.contractUID];
      const modelled = best.scenario.modelled.get(policy.contractUID)?.get(invoice.invoiceUID);
      let action: InvoicePolicyAction = 'none';
      let reimbursement = 0;
      if (state?.actualReimbursement != null) {
        action = 'answered';
        reimbursement = state.actualReimbursement;
      } else if (state?.excluded) {
        action = 'excluded';
      } else if (modelled !== undefined) {
        if (state?.submitted) action = 'submitted';
        else action = statuses.get(policy.contractUID) === 'wait' ? 'wait' : 'submit';
        reimbursement = toEuros(modelled);
      } else if (state?.submitted) {
        action = best.used.has(policy.contractUID) ? 'submitted' : 'withdraw';
      }
      return { contractUID: policy.contractUID, action, reimbursement };
    });
    return {
      invoiceUID: invoice.invoiceUID,
      action: invoiceAction(perPolicy.map((entry) => entry.action)),
      policies: perPolicy,
    };
  });

  let invoiceTotalCents = 0;
  for (const invoice of invoices) invoiceTotalCents += toCents(invoice.amount);

  return {
    invoiceTotal: toEuros(invoiceTotalCents),
    strategies,
    advantage: runnerUp ? toEuros(best.scenario.totalCents - runnerUp.scenario.totalCents) : null,
    policies: policyPlans,
    invoices: invoicePlans,
  };
}
