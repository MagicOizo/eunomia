<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useDebouncedCallback } from '../lib/debounce';
import { describeError } from '../lib/errors';
import { euro, germanDate } from '../lib/format';
import { listResource } from '../lib/resource';
import { type InvoiceDto, searchInvoicesByNumber } from './api';
import { STATUS_DISPLAY } from './status';

interface AccountDto {
  accountUID: string;
  firstname: string;
  surname: string | null;
  birthDate: string;
}

const accounts = ref<AccountDto[]>([]);
const loading = ref(true);

/**
 * The invoice-number search (issues.md 6): the way back to an invoice when
 * neither the insured person nor the treatment year is known any more. Below
 * two characters nothing is searched — a single digit would match half the
 * archive.
 */
const MIN_QUERY_LENGTH = 2;
const query = ref('');
const results = ref<InvoiceDto[]>([]);
const searching = ref(false);
const searchError = ref<string | null>(null);
const term = computed(() => query.value.trim());
const searchActive = computed(() => term.value.length >= MIN_QUERY_LENGTH);

const personName = computed<Map<string, string>>(
  () =>
    new Map(
      accounts.value.map((a) => [a.accountUID, [a.firstname, a.surname].filter(Boolean).join(' ')]),
    ),
);

/** The workspace the hit lives in, opened on its year and with the row marked. */
function hitTarget(invoice: InvoiceDto): string {
  const year = invoice.treatmentDate.slice(0, 4);
  return `/invoices/${invoice.accountUID}?year=${year}&invoice=${invoice.invoiceUID}`;
}

async function runSearch(): Promise<void> {
  if (!searchActive.value) {
    results.value = [];
    searching.value = false;
    return;
  }
  searchError.value = null;
  try {
    results.value = await searchInvoicesByNumber(term.value);
  } catch (error) {
    results.value = [];
    searchError.value = describeError(error);
  } finally {
    searching.value = false;
  }
}

const scheduleSearch = useDebouncedCallback(() => void runSearch());
watch(query, () => {
  // The spinner starts with the keystroke, the request only after the pause.
  searching.value = searchActive.value;
  scheduleSearch();
});

onMounted(async () => {
  try {
    accounts.value = await listResource<AccountDto>('/accounts');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <!-- A plain text field, like the filter bar of the billings list: the
         native search input brings a clear button no other field here has. -->
    <EuTextField v-model="query" class="eu-picker__search" label="Rechnungsnummer suchen" />

    <template v-if="searchActive">
      <p v-if="searching" class="eu-picker__hint">Wird gesucht…</p>
      <p v-else-if="searchError" class="eu-picker__error" role="alert">{{ searchError }}</p>
      <p v-else-if="results.length === 0" class="eu-picker__hint" role="status">
        Keine Rechnung mit dieser Nummer.
      </p>

      <ul v-else class="eu-picker__results">
        <li v-for="invoice in results" :key="invoice.invoiceUID">
          <RouterLink class="eu-picker__result" :to="hitTarget(invoice)">
            <span class="eu-picker__number">{{ invoice.invoiceNumber }}</span>
            <span class="eu-picker__person">{{
              personName.get(invoice.accountUID) ?? 'Unbekannt'
            }}</span>
            <span class="eu-picker__meta">
              Behandlung {{ germanDate(invoice.treatmentDate) }} · {{ euro(invoice.invoiceAmount) }}
            </span>
            <EuBadge
              :tone="STATUS_DISPLAY[invoice.workflowStatus].tone"
              :icon="STATUS_DISPLAY[invoice.workflowStatus].icon"
              compact
            >
              {{ STATUS_DISPLAY[invoice.workflowStatus].label }}
            </EuBadge>
          </RouterLink>
        </li>
      </ul>
    </template>

    <template v-else>
      <p class="eu-picker__lead">Für welchen Versicherten möchtest du die Rechnungen ansehen?</p>

      <p v-if="loading" class="eu-picker__hint">Wird geladen…</p>
      <p v-else-if="accounts.length === 0" class="eu-picker__hint">
        Noch keine Versicherten erfasst.
      </p>

      <ul v-else class="eu-picker__grid">
        <li v-for="account in accounts" :key="account.accountUID">
          <RouterLink class="eu-picker__tile" :to="`/invoices/${account.accountUID}`">
            <span class="eu-picker__name">{{ account.firstname }} {{ account.surname }}</span>
            <span class="eu-picker__birth">{{ germanDate(account.birthDate) }}</span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.eu-picker__search {
  max-width: 24rem;
  margin-bottom: 1.5rem;
}

.eu-picker__lead {
  margin: 0 0 1.5rem;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-picker__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-picker__error {
  color: var(--eu-color-error-fg);
  font-family: var(--eu-font-data);
}

.eu-picker__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 1rem;
}

.eu-picker__tile {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.25rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.75rem;
  text-decoration: none;
  color: var(--eu-color-text);
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.eu-picker__tile:hover {
  border-color: var(--eu-color-accent);
  transform: translateY(-2px);
}

.eu-picker__name {
  font-family: var(--eu-font-heading);
  font-size: 1.1rem;
}

.eu-picker__birth {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}

.eu-picker__results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* One hit: number and person lead, the rest follows and wraps at 390 px. */
.eu-picker__result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.75rem;
  text-decoration: none;
  color: var(--eu-color-text);
  font-family: var(--eu-font-data);
  transition: border-color 0.15s ease;
}

.eu-picker__result:hover {
  border-color: var(--eu-color-accent);
}

.eu-picker__number {
  font-family: var(--eu-font-heading);
}

.eu-picker__person {
  margin-right: auto;
}

.eu-picker__meta {
  color: var(--eu-color-text-muted);
  font-size: 0.9rem;
}
</style>
