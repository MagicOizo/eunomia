import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBan,
  faCircleCheck,
  faCircleXmark,
  faHourglassHalf,
  faMinus,
  faPaperPlane,
  faPiggyBank,
  faRotateLeft,
  faShieldHalved,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';

import { formatMoney } from '../lib/format';
import { i18n } from '../lib/i18n';
import type {
  PlanInvoiceDto,
  PlanInvoicePolicyAction,
  PlanPolicyDto,
  PlanStrategyDto,
  ReimbursementPlanDto,
} from './api';

/**
 * Display texts for the reimbursement optimizer's plan (see the API's
 * reimbursement-optimizer.ts): the recommendation badge per invoice, the
 * policy cards and the comparison of strategies in the invoice summary.
 *
 * Every advice is a whole sentence of the catalogue with the policies and
 * amounts as parameters; an optional second sentence is a message of its own,
 * appended with a space. Contract numbers are joined with a comma in every
 * language: they are identifiers, not running text.
 */

const { t } = i18n.global;

export type BadgeTone = 'open' | 'submitted' | 'partial' | 'billed' | 'done' | 'neutral';

export interface BadgeView {
  tone: BadgeTone;
  icon: IconDefinition;
  label: string;
}

export interface InvoiceBadgeView extends BadgeView {
  /** The full advice, shown as tooltip. */
  tooltip: string;
}

type PlanEntry = PlanInvoiceDto['policies'][number];

const numberOf = (policies: Map<string, PlanPolicyDto>, uid: string): string =>
  policies.get(uid)?.contractNumber ?? '?';

const joinNumbers = (policies: Map<string, PlanPolicyDto>, entries: PlanEntry[]): string =>
  entries.map((entry) => numberOf(policies, entry.contractUID)).join(', ');

const sentences = (...parts: Array<string | null>): string =>
  parts.filter((part): part is string => part !== null).join(' ');

/** "bei X-1 (800,00 €)", or a hint when the invoice only fills the deductible there. */
function submitPhrase(policies: Map<string, PlanPolicyDto>, entry: PlanEntry): string {
  const number = numberOf(policies, entry.contractUID);
  return entry.reimbursement > 0
    ? t('invoices.advice.at', { number, amount: formatMoney(entry.reimbursement) })
    : t('invoices.advice.atDeductible', { number });
}

/**
 * The compact recommendation badge for an invoice row, or null when nothing
 * is to be done (already where it belongs).
 */
export function invoiceBadge(
  plan: PlanInvoiceDto,
  policies: Map<string, PlanPolicyDto>,
): InvoiceBadgeView | null {
  const withAction = (action: PlanEntry['action']): PlanEntry[] =>
    plan.policies.filter((entry) => entry.action === action);
  const toSubmit = withAction('submit');
  const toWait = withAction('wait');
  const waitHint =
    toWait.length > 0
      ? t('invoices.advice.waitHint', { numbers: joinNumbers(policies, toWait) })
      : null;

  switch (plan.action) {
    case 'withdraw': {
      const instead =
        toSubmit.length > 0
          ? t('invoices.advice.instead', {
              targets: toSubmit.map((entry) => submitPhrase(policies, entry)).join(', '),
            })
          : null;
      return {
        tone: 'open',
        icon: faRotateLeft,
        label: t('invoices.actions.withdraw'),
        tooltip: sentences(
          t('invoices.advice.withdraw', { numbers: joinNumbers(policies, withAction('withdraw')) }),
          instead,
        ),
      };
    }
    case 'submit': {
      const firstSubmit = plan.policies.findIndex((entry) => entry.action === 'submit');
      const isRest = plan.policies
        .slice(0, firstSubmit)
        .some((entry) => entry.action === 'answered' || entry.action === 'submitted');
      const [first, ...rest] = toSubmit.map((entry) => submitPhrase(policies, entry));
      const targets = [
        first,
        ...rest.map((target) => t('invoices.advice.restAt', { target })),
      ].join(', ');
      return {
        tone: 'billed',
        icon: faPaperPlane,
        label: isRest ? t('invoices.actions.rest') : t('invoices.actions.submit'),
        tooltip: sentences(
          isRest
            ? t('invoices.advice.rest', { targets })
            : t('invoices.advice.submit', { targets }),
          waitHint,
        ),
      };
    }
    case 'wait': {
      const possible = toWait.reduce((sum, entry) => sum + entry.reimbursement, 0);
      return {
        tone: 'partial',
        icon: faHourglassHalf,
        label: t('invoices.actions.wait'),
        tooltip: t('invoices.advice.wait', {
          numbers: joinNumbers(policies, toWait),
          amount: formatMoney(possible),
        }),
      };
    }
    case 'hold': {
      const spared = [...policies.values()].filter(
        (policy) => policy.status === 'spare' && policy.bonusStatus === 'at-stake',
      );
      return {
        tone: 'done',
        icon: faPiggyBank,
        label: t('invoices.actions.hold'),
        tooltip:
          spared.length > 0
            ? t('invoices.advice.holdSpare', {
                numbers: spared.map((p) => p.contractNumber).join(', '),
              })
            : t('invoices.advice.holdNothing'),
      };
    }
    case 'not-reimbursable':
      return {
        tone: 'neutral',
        icon: faBan,
        label: t('invoices.actions.notReimbursable'),
        tooltip: t('invoices.advice.notReimbursable'),
      };
    default:
      return null;
  }
}

/**
 * The optimizer's advice for this invoice at one policy, for the cards of the
 * invoice detail. `answered`, `submitted` and `excluded` describe what already
 * happened and carry no advice, so they have no badge.
 */
export function policyActionBadge(action: PlanInvoicePolicyAction): BadgeView | null {
  switch (action) {
    case 'submit':
      return { tone: 'billed', icon: faPaperPlane, label: t('invoices.actions.submit') };
    case 'wait':
      return { tone: 'partial', icon: faHourglassHalf, label: t('invoices.actions.wait') };
    case 'withdraw':
      return { tone: 'open', icon: faRotateLeft, label: t('invoices.actions.withdraw') };
    default:
      return null;
  }
}

/** What to do with a policy now (the optimizer's `status`); labels are getters over the catalogue. */
export const POLICY_STATUS_BADGE: Record<PlanPolicyDto['status'], BadgeView> = {
  spare: {
    icon: faPiggyBank,
    tone: 'done',
    get label() {
      return t('invoices.actions.spare');
    },
  },
  submit: {
    icon: faPaperPlane,
    tone: 'billed',
    get label() {
      return t('invoices.actions.submit');
    },
  },
  wait: {
    icon: faHourglassHalf,
    tone: 'partial',
    get label() {
      return t('invoices.actions.wait');
    },
  },
  exhausted: {
    icon: faBan,
    tone: 'neutral',
    get label() {
      return t('invoices.actions.exhausted');
    },
  },
};

export interface BonusView extends BadgeView {
  detail: string;
}

/**
 * Where a policy's bonus stands: safe (at stake, spared and nothing pending),
 * at risk (the recommendation uses the policy, or a submission there is still
 * unanswered), forfeited, received, or none at all.
 */
export function bonusView(
  policy: Pick<
    PlanPolicyDto,
    'bonusStatus' | 'bonusAmount' | 'recommendation' | 'pendingClaims' | 'tiersInherited'
  >,
): BonusView {
  switch (policy.bonusStatus) {
    case 'at-stake': {
      const amount = formatMoney(policy.bonusAmount);
      const expected = policy.tiersInherited
        ? t('invoices.bonus.expectedInherited', { amount })
        : t('invoices.bonus.expected', { amount });
      if (policy.recommendation === 'use') {
        return {
          tone: 'submitted',
          icon: faTriangleExclamation,
          label: t('invoices.bonus.atRisk'),
          detail: t('invoices.bonus.lostBySubmitting', { expected }),
        };
      }
      if (policy.pendingClaims > 0) {
        return {
          tone: 'submitted',
          icon: faTriangleExclamation,
          label: t('invoices.bonus.atRisk'),
          detail: t(
            'invoices.bonus.pending',
            { expected, n: policy.pendingClaims },
            policy.pendingClaims,
          ),
        };
      }
      return {
        tone: 'done',
        icon: faShieldHalved,
        label: t('invoices.bonus.safe'),
        detail: expected,
      };
    }
    case 'paid':
      return {
        tone: 'done',
        icon: faCircleCheck,
        label: t('invoices.bonus.received'),
        detail: t('invoices.bonus.receivedDetail', { amount: formatMoney(policy.bonusAmount) }),
      };
    case 'forfeited':
      return {
        tone: 'open',
        icon: faCircleXmark,
        label: t('invoices.bonus.forfeited'),
        detail: t('invoices.bonus.forfeitedDetail'),
      };
    default:
      return {
        tone: 'neutral',
        icon: faMinus,
        label: t('invoices.bonus.none'),
        detail: t('invoices.bonus.noneDetail'),
      };
  }
}

/** "X-1 schonen, Y-1 nutzen", in the plan's policy order. */
export function strategyLabel(strategy: PlanStrategyDto, policies: PlanPolicyDto[]): string {
  return policies
    .map((policy) =>
      strategy.usedContractUIDs.includes(policy.contractUID)
        ? t('invoices.strategy.use', { number: policy.contractNumber })
        : t('invoices.strategy.spare', { number: policy.contractNumber }),
    )
    .join(', ');
}

/** Contract numbers of the spared policies that may still tip into being used. */
function mayTip(plan: ReimbursementPlanDto): string {
  return plan.policies
    .filter((p) => p.status === 'spare' && p.worthUsingAbove !== null)
    .map((p) => p.contractNumber)
    .join(', ');
}

/** The explanation below a policy card. */
export function policyVerdict(policy: PlanPolicyDto, plan: ReimbursementPlanDto): string {
  switch (policy.status) {
    case 'spare': {
      if (policy.bonusStatus === 'paid') return t('invoices.verdict.sparePaid');
      return sentences(
        t('invoices.verdict.spare'),
        policy.worthUsingAbove === null
          ? t('invoices.verdict.spareAlways')
          : t('invoices.verdict.spareAbove', { amount: formatMoney(policy.worthUsingAbove) }),
      );
    }
    case 'wait':
      return t('invoices.verdict.wait', {
        amount: formatMoney(policy.expectedReimbursement),
        numbers: mayTip(plan),
      });
    case 'exhausted':
      return t('invoices.verdict.exhausted', { amount: formatMoney(policy.reimbursementCap) });
    default:
      break;
  }
  if (policy.contractKind === 'SUPPLEMENTARY') {
    return t('invoices.verdict.supplementary');
  }
  if (policy.bonusStatus === 'at-stake') {
    return sentences(
      t('invoices.verdict.atStake'),
      policy.claimFreeStreak === null
        ? null
        : t('invoices.verdict.streakEnds', policy.claimFreeStreak),
    );
  }
  if (policy.bonusStatus === 'forfeited') {
    return t('invoices.verdict.forfeited');
  }
  return t('invoices.verdict.noBonus');
}

/** One phrase per kind of advice; a policy count picks the form ("ist"/"sind erschöpft"). */
const RECOMMENDATION_PHRASES: Array<
  [PlanPolicyDto['status'], (numbers: string, count: number) => string]
> = [
  ['submit', (numbers) => t('invoices.recommendation.submit', { numbers })],
  ['wait', (numbers) => t('invoices.recommendation.wait', { numbers })],
  ['spare', (numbers) => t('invoices.recommendation.spare', { numbers })],
  ['exhausted', (numbers, count) => t('invoices.recommendation.exhausted', { numbers }, count)],
];

/** "X-1 schonen, Y-1 einreichen", grouped by what to do with each policy. */
export function recommendationText(plan: ReimbursementPlanDto): string {
  return RECOMMENDATION_PHRASES.map(([status, phrase]) => {
    const policies = plan.policies.filter((p) => p.status === status);
    if (policies.length === 0) return '';
    return phrase(policies.map((p) => p.contractNumber).join(', '), policies.length);
  })
    .filter(Boolean)
    .join(', ');
}

/** Share of `part` in `whole` in percent, clamped to 0–100 (0 when there is no whole). */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(Math.max((part / whole) * 100, 0), 100);
}
