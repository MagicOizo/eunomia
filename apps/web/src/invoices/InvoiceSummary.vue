<script setup lang="ts">
import { computed } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import { euro } from '../lib/format';
import type { InvoiceDto, ReimbursementAnalysisDto } from './api';
import { STATUS_DISPLAY, STATUS_ORDER } from './status';

const props = defineProps<{
  invoices: InvoiceDto[];
  /** One entry per contract of the account, for the active year. */
  contractAnalyses: Array<{ label: string; analysis: ReimbursementAnalysisDto }>;
}>();

const totalSpend = computed(() => props.invoices.reduce((sum, inv) => sum + Number(inv.invoiceAmount), 0));

const distribution = computed(() =>
  STATUS_ORDER.map((status) => ({
    status,
    display: STATUS_DISPLAY[status],
    count: props.invoices.filter((inv) => inv.workflowStatus === status).length,
  })),
);
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

    <div v-for="item in contractAnalyses" :key="item.analysis.contractUID" class="eu-summary__contract">
      <h4>{{ item.label }}</h4>
      <dl class="eu-summary__grid">
        <div><dt>Selbstbeteiligung</dt><dd>{{ euro(item.analysis.deductible) }}</dd></div>
        <div><dt>Bonus</dt><dd>{{ euro(item.analysis.bonus) }}</dd></div>
        <div><dt>Obergrenze</dt><dd>{{ euro(item.analysis.reimbursementCap) }}</dd></div>
        <div><dt>Rechnungssumme (Jahr)</dt><dd>{{ euro(item.analysis.invoiceTotal) }}</dd></div>
        <div><dt>Bereits erstattet</dt><dd>{{ euro(item.analysis.alreadyReimbursed) }}</dd></div>
        <div><dt>Mögliche Erstattung</dt><dd>{{ euro(item.analysis.analysis.reimbursement) }}</dd></div>
      </dl>
      <p class="eu-summary__verdict" :class="item.analysis.analysis.worthSubmitting ? 'is-worth' : 'not-worth'">
        <template v-if="item.analysis.analysis.worthSubmitting">
          ✓ Einreichen lohnt sich – die Erstattung übersteigt den Bonus.
        </template>
        <template v-else-if="item.analysis.analysis.shortfallToBreakEven !== null">
          Noch nicht lohnend: erst ab {{ euro(item.analysis.analysis.shortfallToBreakEven) }} mehr
          Rechnungssumme übersteigt die Erstattung den Bonus.
        </template>
        <template v-else>
          Einreichen lohnt sich hier nicht – die Obergrenze bleibt unter dem Bonus.
        </template>
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

.eu-summary__contract {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--eu-color-border);
}

.eu-summary__contract h4 {
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

.eu-summary__verdict.is-worth {
  background-color: var(--eu-color-status-done-bg);
  color: var(--eu-color-status-done-fg);
}

.eu-summary__verdict.not-worth {
  background-color: var(--eu-color-status-submitted-bg);
  color: var(--eu-color-status-submitted-fg);
}
</style>
