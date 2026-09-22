<script setup lang="ts">
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBan,
  faHourglassHalf,
  faPaperPlane,
  faPiggyBank,
} from '@fortawesome/free-solid-svg-icons';
import { computed } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import { euro } from '../lib/format';
import type { InvoiceDto, PlanPolicyDto, ReimbursementPlanDto } from './api';
import { STATUS_DISPLAY, STATUS_ORDER } from './status';

const props = defineProps<{
  invoices: InvoiceDto[];
  /** The reimbursement optimizer's plan for the account and the active year. */
  plan: ReimbursementPlanDto | null;
}>();

const totalSpend = computed(() =>
  props.invoices.reduce((sum, inv) => sum + Number(inv.invoiceAmount), 0),
);

const distribution = computed(() =>
  STATUS_ORDER.map((status) => ({
    status,
    display: STATUS_DISPLAY[status],
    count: props.invoices.filter((inv) => inv.workflowStatus === status).length,
  })),
);

const label = (policy: PlanPolicyDto): string =>
  `${policy.contractNumber} · ${policy.companyName} (${
    policy.contractKind === 'FULL' ? 'Vollversicherung' : 'Zusatzversicherung'
  })`;

function bonusText(policy: PlanPolicyDto): string {
  switch (policy.bonusStatus) {
    case 'at-stake':
      return policy.tiersInherited
        ? `${euro(policy.bonusAmount)} erwartet (Staffel nicht aktualisiert)`
        : `${euro(policy.bonusAmount)} erwartet`;
    case 'paid':
      return `${euro(policy.bonusAmount)} erhalten`;
    case 'forfeited':
      return 'verwirkt';
    default:
      return 'kein Bonus';
  }
}

const STATUS_BADGE: Record<
  PlanPolicyDto['status'],
  { label: string; icon: IconDefinition; tone: 'done' | 'billed' | 'partial' | 'neutral' }
> = {
  spare: { label: 'Schonen', icon: faPiggyBank, tone: 'done' },
  submit: { label: 'Einreichen', icon: faPaperPlane, tone: 'billed' },
  wait: { label: 'Abwarten', icon: faHourglassHalf, tone: 'partial' },
  exhausted: { label: 'Erschöpft', icon: faBan, tone: 'neutral' },
};

/** Contract numbers of the spared policies that may still tip into being used. */
const mayTip = computed(() =>
  (props.plan?.policies ?? [])
    .filter((p) => p.status === 'spare' && p.worthUsingAbove !== null)
    .map((p) => p.contractNumber)
    .join(', '),
);

function verdict(policy: PlanPolicyDto): string {
  switch (policy.status) {
    case 'spare': {
      if (policy.bonusStatus === 'paid')
        return 'Bonus bereits erhalten – hier nicht mehr einreichen.';
      const above =
        policy.worthUsingAbove === null
          ? 'Das bleibt auch bei höheren Kosten so, weil die Obergrenze unter dem Bonus liegt.'
          : `Einreichen lohnt sich erst, wenn mehr als ${euro(policy.worthUsingAbove)} weitere Kosten dazukommen.`;
      return `Der Bonus ist mehr wert als die mögliche Erstattung. ${above}`;
    }
    case 'wait':
      return `Hier ließen sich ${euro(policy.expectedReimbursement)} erstatten. Kommen aber noch Kosten dazu, lohnt sich ${mayTip.value} – dann erstattet diese Police nur den Rest. Deshalb erst einreichen, wenn das Jahr absehbar ist.`;
    case 'exhausted':
      return `Die Obergrenze von ${euro(policy.reimbursementCap)} ist erreicht – keine weiteren Rechnungen hier einreichen.`;
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
        : ` Dafür endet die Serie von ${policy.claimFreeStreak} leistungsfreien Jahren.`;
    return `Die Erstattung übersteigt den Bonus – alle Rechnungen hier einreichen.${streak}`;
  }
  if (policy.bonusStatus === 'forfeited') {
    return 'Der Bonus ist in diesem Jahr bereits verwirkt – alle Rechnungen hier einreichen.';
  }
  return 'Hier ist kein Bonus im Spiel – alle Rechnungen hier einreichen.';
}

const recommendation = computed(() => {
  const plan = props.plan;
  const best = plan?.strategies[0];
  if (!plan || !best || plan.policies.length === 0) return null;
  const phrases: Array<[PlanPolicyDto['status'], string]> = [
    ['submit', 'einreichen'],
    ['wait', 'abwarten'],
    ['spare', 'schonen'],
    ['exhausted', 'ist erschöpft'],
  ];
  const parts = phrases
    .map(([status, verb]) => {
      const numbers = plan.policies
        .filter((p) => p.status === status)
        .map((p) => p.contractNumber)
        .join(', ');
      return numbers ? `${numbers} ${verb}` : '';
    })
    .filter(Boolean);
  return {
    text: parts.join(', '),
    total: best.total,
    advantage: plan.advantage,
  };
});
</script>

<template>
  <section class="eu-summary" aria-label="Zusammenfassung">
    <h3>Zusammenfassung</h3>

    <div class="eu-summary__row">
      <EuBadge
        v-for="entry in distribution"
        :key="entry.status"
        :tone="entry.display.tone"
        :icon="entry.display.icon"
      >
        {{ entry.display.label }}: {{ entry.count }}
      </EuBadge>
      <span class="eu-summary__spend">Gesamtausgaben: {{ euro(totalSpend) }}</span>
    </div>

    <p v-if="recommendation" class="eu-summary__recommendation">
      <strong>Empfehlung:</strong> {{ recommendation.text }} – Erstattungen und Boni zusammen
      {{ euro(recommendation.total)
      }}<template v-if="recommendation.advantage !== null && recommendation.advantage > 0"
        >, {{ euro(recommendation.advantage) }} mehr als die nächstbeste Variante</template
      >.
    </p>

    <div
      v-for="policy in plan?.policies ?? []"
      :key="policy.contractUID"
      class="eu-summary__contract"
    >
      <h4>
        {{ label(policy) }}
        <EuBadge :tone="STATUS_BADGE[policy.status].tone" :icon="STATUS_BADGE[policy.status].icon">
          {{ STATUS_BADGE[policy.status].label }}
        </EuBadge>
      </h4>
      <dl class="eu-summary__grid">
        <div>
          <dt>Selbstbeteiligung</dt>
          <dd>{{ policy.hasTerms ? euro(policy.deductible) : 'keine Konditionen' }}</dd>
        </div>
        <div>
          <dt>Obergrenze</dt>
          <dd>{{ policy.reimbursementCap === null ? 'keine' : euro(policy.reimbursementCap) }}</dd>
        </div>
        <div>
          <dt>Bonus</dt>
          <dd>{{ bonusText(policy) }}</dd>
        </div>
        <div>
          <dt>Bereits erstattet</dt>
          <dd>{{ euro(policy.actualReimbursement) }}</dd>
        </div>
        <div>
          <dt>Erstattung laut Empfehlung</dt>
          <dd>{{ euro(policy.expectedReimbursement) }}</dd>
        </div>
      </dl>
      <p class="eu-summary__verdict" :class="`tone-${STATUS_BADGE[policy.status].tone}`">
        {{ verdict(policy) }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.eu-summary {
  margin-top: 1.5rem;
  padding: 1.25rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.75rem;
  font-family: var(--eu-font-data);
}

.eu-summary h3 {
  margin: 0 0 1rem;
  font-family: var(--eu-font-heading);
}

.eu-summary__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.eu-summary__spend {
  margin-left: auto;
  font-weight: 600;
}

.eu-summary__recommendation {
  margin: 1rem 0 0;
}

.eu-summary__contract {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--eu-color-border);
}

.eu-summary__contract h4 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.6rem;
  font-family: var(--eu-font-heading);
}

.eu-summary__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.5rem 1.5rem;
  margin: 0;
}

.eu-summary__grid dt {
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
}

.eu-summary__grid dd {
  margin: 0;
  font-weight: 600;
}

.eu-summary__verdict {
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
}

.eu-summary__verdict.tone-done {
  background-color: var(--eu-color-status-done-bg);
  color: var(--eu-color-status-done-fg);
}

.eu-summary__verdict.tone-billed {
  background-color: var(--eu-color-status-billed-bg);
  color: var(--eu-color-status-billed-fg);
}

.eu-summary__verdict.tone-partial {
  background-color: var(--eu-color-status-partial-bg);
  color: var(--eu-color-status-partial-fg);
}

.eu-summary__verdict.tone-neutral {
  border: 1px solid var(--eu-color-border);
  color: var(--eu-color-text-muted);
}
</style>
