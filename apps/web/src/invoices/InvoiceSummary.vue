<script setup lang="ts">
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { computed } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import { euro, plural } from '../lib/format';
import type { InvoiceDto, PlanPolicyDto, ReimbursementPlanDto } from './api';
import {
  POLICY_STATUS_BADGE,
  bonusView,
  percentOf,
  policyVerdict,
  recommendationText,
  strategyLabel,
} from './recommendation';
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

const kindLabel = (policy: PlanPolicyDto): string =>
  policy.contractKind === 'FULL' ? 'Vollversicherung' : 'Zusatzversicherung';

const recommendation = computed(() => {
  const plan = props.plan;
  const best = plan?.strategies[0];
  if (!plan || !best || plan.policies.length === 0) return null;
  return { text: recommendationText(plan), total: best.total, advantage: plan.advantage };
});

/** Every evaluated strategy, best first, with its gap to the recommended one. */
const comparison = computed(() => {
  const plan = props.plan;
  const best = plan?.strategies[0];
  if (!plan || !best || plan.strategies.length < 2) return [];
  return plan.strategies.map((strategy, index) => ({
    key: strategy.usedContractUIDs.join() || '-',
    recommended: index === 0,
    label: strategyLabel(strategy, plan.policies),
    reimbursements: Object.values(strategy.reimbursements).reduce((sum, v) => sum + v, 0),
    bonuses: strategy.bonusTotal,
    total: strategy.total,
    gap: strategy.total - best.total,
  }));
});

/** Cap bar: the part already reimbursed and the part the plan still expects. */
function capShares(policy: PlanPolicyDto): { actual: number; expected: number } {
  const cap = policy.reimbursementCap ?? 0;
  const actual = percentOf(policy.actualReimbursement, cap);
  return { actual, expected: percentOf(policy.expectedReimbursement, cap) - actual };
}
</script>

<template>
  <section class="eu-summary" aria-labelledby="eu-summary-title">
    <h3 id="eu-summary-title">Zusammenfassung</h3>

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

    <div v-if="plan && plan.policies.length > 0" class="eu-summary__cards">
      <article
        v-for="policy in plan.policies"
        :key="policy.contractUID"
        class="eu-summary__card"
        :aria-labelledby="`eu-policy-${policy.contractUID}`"
      >
        <header class="eu-summary__card-head">
          <h4 :id="`eu-policy-${policy.contractUID}`">
            {{ policy.contractNumber }}
            <span class="eu-summary__sub">{{ policy.companyName }} · {{ kindLabel(policy) }}</span>
          </h4>
          <EuBadge
            :tone="POLICY_STATUS_BADGE[policy.status].tone"
            :icon="POLICY_STATUS_BADGE[policy.status].icon"
          >
            {{ POLICY_STATUS_BADGE[policy.status].label }}
          </EuBadge>
        </header>

        <div class="eu-summary__metric">
          <div class="eu-summary__metric-head">
            <span class="eu-summary__label">Selbstbeteiligung</span>
            <span v-if="!policy.hasTerms">keine Konditionen</span>
            <span v-else-if="policy.deductible === 0">keine</span>
            <span v-else>{{ euro(policy.deductibleUsed) }} von {{ euro(policy.deductible) }}</span>
          </div>
          <div v-if="policy.hasTerms && policy.deductible > 0" class="eu-bar" aria-hidden="true">
            <span
              class="eu-bar__fill"
              :style="{ width: `${percentOf(policy.deductibleUsed, policy.deductible)}%` }"
            />
          </div>
        </div>

        <div v-if="policy.reimbursementCap !== null" class="eu-summary__metric">
          <div class="eu-summary__metric-head">
            <span class="eu-summary__label">Obergrenze</span>
            <span>
              {{ euro(policy.expectedReimbursement) }} von {{ euro(policy.reimbursementCap) }}
            </span>
          </div>
          <div class="eu-bar" aria-hidden="true">
            <span class="eu-bar__fill" :style="{ width: `${capShares(policy).actual}%` }" />
            <span
              class="eu-bar__fill eu-bar__fill--expected"
              :style="{ width: `${capShares(policy).expected}%` }"
            />
          </div>
        </div>

        <div class="eu-summary__metric">
          <div class="eu-summary__metric-head">
            <span class="eu-summary__label">Bonus</span>
            <EuBadge compact :tone="bonusView(policy).tone" :icon="bonusView(policy).icon">
              {{ bonusView(policy).label }}
            </EuBadge>
          </div>
          <p class="eu-summary__detail">
            {{ bonusView(policy).detail
            }}<template v-if="policy.claimFreeStreak !== null"
              >; Serie:
              {{
                plural(policy.claimFreeStreak, 'leistungsfreies Jahr', 'leistungsfreie Jahre')
              }}</template
            >
          </p>
        </div>

        <dl class="eu-summary__grid">
          <div>
            <dt>Bereits erstattet</dt>
            <dd>{{ euro(policy.actualReimbursement) }}</dd>
          </div>
          <div>
            <dt>Erstattung laut Empfehlung</dt>
            <dd>{{ euro(policy.expectedReimbursement) }}</dd>
          </div>
          <div v-if="policy.reimbursementRate !== 100">
            <dt>Erstattungssatz</dt>
            <dd>{{ policy.reimbursementRate }} %</dd>
          </div>
        </dl>

        <p class="eu-summary__verdict" :class="`tone-${POLICY_STATUS_BADGE[policy.status].tone}`">
          {{ policyVerdict(policy, plan) }}
        </p>
      </article>
    </div>

    <details v-if="comparison.length > 0" class="eu-summary__compare" open>
      <summary>Vergleich der Alternativen</summary>
      <div class="eu-summary__table-wrap">
        <table class="eu-summary__table">
          <thead>
            <tr>
              <th scope="col">Variante</th>
              <th scope="col" class="num">Erstattungen</th>
              <th scope="col" class="num">Boni</th>
              <th scope="col" class="num">Gesamt</th>
              <th scope="col" class="num">Differenz</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in comparison"
              :key="row.key"
              :class="{ 'is-recommended': row.recommended }"
            >
              <th scope="row">
                {{ row.label }}
                <EuBadge v-if="row.recommended" compact tone="done" :icon="faStar">
                  Empfohlen
                </EuBadge>
              </th>
              <td class="num">{{ euro(row.reimbursements) }}</td>
              <td class="num">{{ euro(row.bonuses) }}</td>
              <td class="num">{{ euro(row.total) }}</td>
              <td class="num">{{ row.recommended ? '–' : euro(row.gap) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
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

.eu-summary__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: 1rem;
  margin-top: 1.25rem;
}

.eu-summary__card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.6rem;
}

.eu-summary__card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.eu-summary__card-head h4 {
  margin: 0;
  font-family: var(--eu-font-heading);
}

.eu-summary__sub {
  display: block;
  font-family: var(--eu-font-data);
  font-size: 0.8rem;
  font-weight: normal;
  color: var(--eu-color-text-muted);
}

.eu-summary__metric-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 1rem;
  font-weight: 600;
}

.eu-summary__label,
.eu-summary__grid dt {
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  font-weight: normal;
}

.eu-summary__detail {
  margin: 0.3rem 0 0;
  font-size: 0.875rem;
}

/* Progress bar; purely visual — the values are always spelled out next to it. */
.eu-bar {
  display: flex;
  height: 0.5rem;
  margin-top: 0.35rem;
  overflow: hidden;
  border-radius: 999px;
  background-color: var(--eu-color-border);
}

.eu-bar__fill {
  background-color: var(--eu-color-accent);
}

.eu-bar__fill--expected {
  background-image: repeating-linear-gradient(
    -45deg,
    var(--eu-color-accent) 0 0.25rem,
    transparent 0.25rem 0.5rem
  );
  background-color: transparent;
}

.eu-summary__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.5rem 1.5rem;
  margin: 0;
}

.eu-summary__grid dd {
  margin: 0;
  font-weight: 600;
}

.eu-summary__verdict {
  margin: auto 0 0;
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

.eu-summary__compare {
  margin-top: 1.25rem;
}

.eu-summary__compare summary {
  cursor: pointer;
  font-family: var(--eu-font-heading);
}

.eu-summary__table-wrap {
  overflow-x: auto;
  margin-top: 0.6rem;
}

.eu-summary__table {
  width: 100%;
  border-collapse: collapse;
}

.eu-summary__table th,
.eu-summary__table td {
  padding: 0.45rem 0.7rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

.eu-summary__table thead th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.eu-summary__table tbody th {
  font-weight: normal;
}

.eu-summary__table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.eu-summary__table tr.is-recommended {
  font-weight: 600;
}
</style>
