<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { useDebouncedCallback } from '../lib/debounce';
import { describeError } from '../lib/errors';
import { germanDate, germanMoney } from '../lib/format';
import { listResource } from '../lib/resource';
import { type BillingListDto, searchBillings } from './api';
import {
  type BillingFilter,
  EMPTY_BILLING_FILTER,
  apiQueryFromFilter,
  filterFromQuery,
  hitTarget,
  isActive,
  queryFromFilter,
  rememberFilter,
  rememberedFilter,
} from './billing-search';

/**
 * The way into the billings: either straight to a policy, or through the search
 * across every policy (issues.md 0.15.0-5) — by free text and by "nothing
 * booked on it yet". Built like the invoice search: the filter lives in the
 * URL, a hit leads to its policy with the row marked, and the way back lands on
 * the same list again.
 */

interface ContractRow {
  contractUID: string;
  contractNumber: string;
  companyName: string;
  accountUID: string;
}
interface AccountRow {
  accountUID: string;
  firstname: string;
  surname: string | null;
}

const props = defineProps<{ q?: string; unlinked?: string }>();

/** Enough to look through; beyond that the answer is a narrower filter. */
const RESULT_LIMIT = 50;

const router = useRouter();

const contracts = ref<ContractRow[]>([]);
const personByAccount = ref<Map<string, string>>(new Map());
const loading = ref(true);

const filter = reactive<BillingFilter>({ ...EMPTY_BILLING_FILTER });
const results = ref<BillingListDto[]>([]);
const searching = ref(false);
const searchError = ref<string | null>(null);

const searchActive = computed(() => isActive(filter));
const truncated = computed(() => results.value.length === RESULT_LIMIT);

const tiles = computed(() =>
  contracts.value.map((c) => ({
    contractUID: c.contractUID,
    contractNumber: c.contractNumber,
    companyName: c.companyName,
    person: personByAccount.value.get(c.accountUID) ?? '',
  })),
);

async function runSearch(): Promise<void> {
  if (!searchActive.value) {
    results.value = [];
    searching.value = false;
    return;
  }
  searchError.value = null;
  try {
    results.value = await searchBillings({ ...apiQueryFromFilter(filter), limit: RESULT_LIMIT });
  } catch (error) {
    results.value = [];
    searchError.value = describeError(error);
  } finally {
    searching.value = false;
  }
}

const scheduleSearch = useDebouncedCallback(() => void runSearch());

watch(
  () => [props.q, props.unlinked] as const,
  () => Object.assign(filter, filterFromQuery({ q: props.q, unlinked: props.unlinked })),
);

watch(filter, () => {
  rememberFilter(filter);
  // `replace`: filtering is not a step back.
  void router?.replace({ query: queryFromFilter(filter) });
  searching.value = searchActive.value;
  scheduleSearch();
});

onMounted(async () => {
  const fromUrl = filterFromQuery({ q: props.q, unlinked: props.unlinked });
  // A bare /billings — the menu entry and the policy page's back arrow — picks
  // up the search that was running before.
  Object.assign(filter, isActive(fromUrl) ? fromUrl : rememberedFilter());
  try {
    const [contractRows, accountRows] = await Promise.all([
      listResource<ContractRow>('/contracts'),
      listResource<AccountRow>('/accounts'),
    ]);
    personByAccount.value = new Map(
      accountRows.map((a) => [a.accountUID, [a.firstname, a.surname].filter(Boolean).join(' ')]),
    );
    contracts.value = contractRows;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <div class="eu-picker__filters">
      <EuTextField
        v-model="filter.q"
        class="eu-picker__search"
        label="Abrechnungs-, Rechnungs-, Policennummer oder Person"
      />
      <EuToggle v-model="filter.unlinked" class="eu-picker__toggle" label="Nur ohne Zuordnung" />
    </div>

    <template v-if="searchActive">
      <p v-if="searching" class="eu-picker__hint">Wird gesucht…</p>
      <p v-else-if="searchError" class="eu-picker__error" role="alert">{{ searchError }}</p>
      <p v-else-if="results.length === 0" class="eu-picker__hint" role="status">
        Keine Leistungsabrechnung passt zu dieser Suche.
      </p>

      <ul v-else class="eu-picker__results">
        <li v-for="billing in results" :key="billing.billingUID">
          <RouterLink class="eu-picker__result" :to="hitTarget(billing)">
            <span class="eu-picker__number">{{ billing.billingNumber }}</span>
            <span class="eu-picker__person">{{ billing.personName }}</span>
            <span class="eu-picker__amount">{{ germanMoney(billing.reimbursedTotal) }}</span>
            <span class="eu-picker__meta">
              Abrechnung vom {{ germanDate(billing.billingDate) }} · Police
              {{ billing.contractNumber }}
            </span>
            <span class="eu-picker__refs">{{
              billing.invoiceNumbers ?? 'noch keiner Rechnung zugeordnet'
            }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="truncated" class="eu-picker__hint" role="status">
        Es werden die ersten {{ RESULT_LIMIT }} Leistungsabrechnungen gezeigt. Bitte enger filtern.
      </p>
    </template>

    <template v-else>
      <p class="eu-picker__lead">
        Für welchen Vertrag möchtest du die Leistungsabrechnungen ansehen?
      </p>

      <p v-if="loading" class="eu-picker__hint">Wird geladen…</p>
      <p v-else-if="tiles.length === 0" class="eu-picker__hint">Noch keine Verträge erfasst.</p>

      <ul v-else class="eu-picker__grid">
        <li v-for="tile in tiles" :key="tile.contractUID">
          <RouterLink class="eu-picker__tile" :to="`/billings/${tile.contractUID}`">
            <span class="eu-picker__name">{{ tile.contractNumber }}</span>
            <span class="eu-picker__sub">{{ tile.companyName }} · {{ tile.person }}</span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
/* The filter row wraps at narrow widths; the text field takes what is left. */
.eu-picker__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1rem;
  margin-bottom: 1.5rem;
}

.eu-picker__search {
  flex: 1 1 21rem;
  min-width: 0;
}

.eu-picker__toggle {
  flex: 0 0 auto;
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

.eu-picker__sub {
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

/* One hit: number, person and amount lead; date, policy and the invoices it
   answers follow on their own lines, as on the invoice search. */
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

.eu-picker__amount {
  font-variant-numeric: tabular-nums;
}

.eu-picker__meta,
.eu-picker__refs {
  flex-basis: 100%;
  color: var(--eu-color-text-muted);
  font-size: 0.9rem;
}
</style>
