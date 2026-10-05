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

import { germanMoney, plural } from '../lib/format';
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
 */

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

/** "bei X-1 (800,00 €)", or a hint when the invoice only fills the deductible there. */
function submitPhrase(policies: Map<string, PlanPolicyDto>, entry: PlanEntry): string {
  const amount =
    entry.reimbursement > 0 ? germanMoney(entry.reimbursement) : 'zählt auf die Selbstbeteiligung';
  return `bei ${numberOf(policies, entry.contractUID)} (${amount})`;
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
      ? ` Bei ${joinNumbers(policies, toWait)} erst einreichen, wenn das Jahr absehbar ist.`
      : '';

  switch (plan.action) {
    case 'withdraw': {
      const instead =
        toSubmit.length > 0
          ? ` Stattdessen ${toSubmit.map((entry) => submitPhrase(policies, entry)).join(', ')} einreichen.`
          : '';
      return {
        tone: 'open',
        icon: faRotateLeft,
        label: 'Zurückziehen',
        tooltip: `Bei ${joinNumbers(policies, withAction('withdraw'))} zurückziehen – dort ist der Bonus mehr wert.${instead}`,
      };
    }
    case 'submit': {
      const firstSubmit = plan.policies.findIndex((entry) => entry.action === 'submit');
      const isRest = plan.policies
        .slice(0, firstSubmit)
        .some((entry) => entry.action === 'answered' || entry.action === 'submitted');
      const [first, ...rest] = toSubmit.map((entry) => submitPhrase(policies, entry));
      const restText = rest.length > 0 ? `, Rest ${rest.join(', Rest ')}` : '';
      return {
        tone: 'billed',
        icon: faPaperPlane,
        label: isRest ? 'Rest' : 'Einreichen',
        tooltip: `${isRest ? 'Rest' : 'Einreichen'} ${first}${restText}.${waitHint}`,
      };
    }
    case 'wait': {
      const possible = toWait.reduce((sum, entry) => sum + entry.reimbursement, 0);
      return {
        tone: 'partial',
        icon: faHourglassHalf,
        label: 'Abwarten',
        tooltip: `Bei ${joinNumbers(policies, toWait)} erst einreichen, wenn das Jahr absehbar ist (möglich: ${germanMoney(possible)}).`,
      };
    }
    case 'hold': {
      const spared = [...policies.values()].filter(
        (policy) => policy.status === 'spare' && policy.bonusStatus === 'at-stake',
      );
      return {
        tone: 'done',
        icon: faPiggyBank,
        label: 'Zurückhalten',
        tooltip:
          spared.length > 0
            ? `Nicht einreichen – den Bonus bei ${spared.map((p) => p.contractNumber).join(', ')} schonen.`
            : 'Nicht einreichen – bei keiner Police ist dafür noch eine Erstattung zu erwarten.',
      };
    }
    case 'not-reimbursable':
      return {
        tone: 'neutral',
        icon: faBan,
        label: 'Nicht erstattbar',
        tooltip: 'Bei keiner Police erstattungsfähig.',
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
      return { tone: 'billed', icon: faPaperPlane, label: 'Einreichen' };
    case 'wait':
      return { tone: 'partial', icon: faHourglassHalf, label: 'Abwarten' };
    case 'withdraw':
      return { tone: 'open', icon: faRotateLeft, label: 'Zurückziehen' };
    default:
      return null;
  }
}

/** What to do with a policy now (the optimizer's `status`). */
export const POLICY_STATUS_BADGE: Record<PlanPolicyDto['status'], BadgeView> = {
  spare: { label: 'Schonen', icon: faPiggyBank, tone: 'done' },
  submit: { label: 'Einreichen', icon: faPaperPlane, tone: 'billed' },
  wait: { label: 'Abwarten', icon: faHourglassHalf, tone: 'partial' },
  exhausted: { label: 'Erschöpft', icon: faBan, tone: 'neutral' },
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
  const inherited = policy.tiersInherited ? ' (Staffel nicht aktualisiert)' : '';
  switch (policy.bonusStatus) {
    case 'at-stake': {
      if (policy.recommendation === 'use') {
        return {
          tone: 'submitted',
          icon: faTriangleExclamation,
          label: 'In Gefahr',
          detail: `${germanMoney(policy.bonusAmount)} erwartet${inherited} – geht mit der Einreichung verloren`,
        };
      }
      if (policy.pendingClaims > 0) {
        return {
          tone: 'submitted',
          icon: faTriangleExclamation,
          label: 'In Gefahr',
          detail: `${germanMoney(policy.bonusAmount)} erwartet${inherited} – ${plural(policy.pendingClaims, 'Einreichung', 'Einreichungen')} noch ohne Abrechnung`,
        };
      }
      return {
        tone: 'done',
        icon: faShieldHalved,
        label: 'Sicher',
        detail: `${germanMoney(policy.bonusAmount)} erwartet${inherited}`,
      };
    }
    case 'paid':
      return {
        tone: 'done',
        icon: faCircleCheck,
        label: 'Erhalten',
        detail: `${germanMoney(policy.bonusAmount)} laut Versicherung`,
      };
    case 'forfeited':
      return {
        tone: 'open',
        icon: faCircleXmark,
        label: 'Verwirkt',
        detail: 'in diesem Jahr kein Bonus mehr',
      };
    default:
      return { tone: 'neutral', icon: faMinus, label: 'Kein Bonus', detail: 'keine Staffel' };
  }
}

/** "X-1 schonen, Y-1 nutzen", in the plan's policy order. */
export function strategyLabel(strategy: PlanStrategyDto, policies: PlanPolicyDto[]): string {
  return policies
    .map(
      (policy) =>
        `${policy.contractNumber} ${
          strategy.usedContractUIDs.includes(policy.contractUID) ? 'nutzen' : 'schonen'
        }`,
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
      if (policy.bonusStatus === 'paid')
        return 'Bonus bereits erhalten – hier nicht mehr einreichen.';
      const above =
        policy.worthUsingAbove === null
          ? 'Das bleibt auch bei höheren Kosten so, weil die Obergrenze unter dem Bonus liegt.'
          : `Einreichen lohnt sich erst, wenn mehr als ${germanMoney(policy.worthUsingAbove)} weitere Kosten dazukommen.`;
      return `Der Bonus ist mehr wert als die mögliche Erstattung. ${above}`;
    }
    case 'wait':
      return `Hier ließen sich ${germanMoney(policy.expectedReimbursement)} erstatten. Kommen aber noch Kosten dazu, lohnt sich ${mayTip(plan)} – dann erstattet diese Police nur den Rest. Deshalb erst einreichen, wenn das Jahr absehbar ist.`;
    case 'exhausted':
      return `Die Obergrenze von ${germanMoney(policy.reimbursementCap)} ist erreicht – keine weiteren Rechnungen hier einreichen.`;
    default:
      break;
  }
  if (policy.contractKind === 'SUPPLEMENTARY') {
    return 'Rechnungen hier einreichen, soweit die Vollversicherung sie nicht erstattet.';
  }
  if (policy.bonusStatus === 'at-stake') {
    const streak =
      policy.claimFreeStreak === null
        ? ''
        : ` Dafür endet die Serie von ${plural(policy.claimFreeStreak, 'leistungsfreien Jahr', 'leistungsfreien Jahren')}.`;
    return `Die Erstattung übersteigt den Bonus – alle Rechnungen hier einreichen.${streak}`;
  }
  if (policy.bonusStatus === 'forfeited') {
    return 'Der Bonus ist in diesem Jahr bereits verwirkt – alle Rechnungen hier einreichen.';
  }
  return 'Hier ist kein Bonus im Spiel – alle Rechnungen hier einreichen.';
}

/** "X-1 schonen, Y-1 einreichen", grouped by what to do with each policy. */
export function recommendationText(plan: ReimbursementPlanDto): string {
  const phrases: Array<[PlanPolicyDto['status'], string]> = [
    ['submit', 'einreichen'],
    ['wait', 'abwarten'],
    ['spare', 'schonen'],
    ['exhausted', 'ist erschöpft'],
  ];
  return phrases
    .map(([status, verb]) => {
      const numbers = plan.policies
        .filter((p) => p.status === status)
        .map((p) => p.contractNumber)
        .join(', ');
      return numbers ? `${numbers} ${verb}` : '';
    })
    .filter(Boolean)
    .join(', ');
}

/** Share of `part` in `whole` in percent, clamped to 0–100 (0 when there is no whole). */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(Math.max((part / whole) * 100, 0), 100);
}
