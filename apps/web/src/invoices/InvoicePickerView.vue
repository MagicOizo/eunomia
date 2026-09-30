<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { paymentDetailLabel } from '../agencies/payment-details';
import type { AgencyDto } from '../agencies/api';
import EuSelectField from '../components/resource/EuSelectField.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import EuBadge from '../design-system/components/EuBadge.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { useDebouncedCallback } from '../lib/debounce';
import { describeError } from '../lib/errors';
import { euro, germanDate } from '../lib/format';
import { listResource } from '../lib/resource';
import { type InvoiceDto, searchInvoices } from './api';
import {
  EMPTY_FILTER,
  type InvoiceFilter,
  type ReferenceKey,
  STATUS_FILTERS,
  asStatus,
  filterFromQuery,
  hitTarget,
  isActive,
  queryFromFilter,
  rememberFilter,
  rememberedFilter,
} from './invoice-search';
import { STATUS_DISPLAY } from './status';
import { treatmentDaysLabel } from './treatment-days';

/**
 * The way into the invoices: either straight to an insured person, or through
 * the search — by invoice number (issues.md 6) and, since Slice 45, by the
 * agency an invoice is billed through, one of its payment details or the provider
 * it came from (issues.md 0.12.0-5). Every search fills the same result list,
 * so a further filter is one more entry in `references` below.
 *
 * The filter comes from the URL, which is what the filter buttons of the master
 * data lists point at, and goes back into it on every change — so a hit can be
 * followed and the way back lands on the same list again.
 */

interface AccountDto {
  accountUID: string;
  firstname: string;
  surname: string | null;
  birthDate: string;
}

interface FacilityDto {
  facilityUID: string;
  facilityName: string;
}

const props = defineProps<{
  q?: string;
  agency?: string;
  account?: string;
  facility?: string;
  status?: string;
}>();

/** Enough to look through; beyond that the answer is a narrower filter. */
const RESULT_LIMIT = 50;

const router = useRouter();

const accounts = ref<AccountDto[]>([]);
const agencies = ref<AgencyDto[]>([]);
const facilities = ref<FacilityDto[]>([]);
const loading = ref(true);

const filter = reactive<InvoiceFilter>({ ...EMPTY_FILTER });
const results = ref<InvoiceDto[]>([]);
const searching = ref(false);
const searchError = ref<string | null>(null);

const searchActive = computed(() => isActive(filter));
const truncated = computed(() => results.value.length === RESULT_LIMIT);

const personName = computed<Map<string, string>>(
  () =>
    new Map(
      accounts.value.map((a) => [a.accountUID, [a.firstname, a.surname].filter(Boolean).join(' ')]),
    ),
);
const agencyName = computed<Map<string, string>>(
  () => new Map(agencies.value.map((a) => [a.agencyUID, a.agencyName])),
);
const facilityName = computed<Map<string, string>>(
  () => new Map(facilities.value.map((f) => [f.facilityUID, f.facilityName])),
);
/** The payment details of every agency, so a hit can name the IBAN it goes to. */
const ibanByPaymentDetail = computed<Map<string, string>>(
  () =>
    new Map(
      agencies.value.flatMap((agency) =>
        agency.accounts.map(
          (entry) => [entry.agencyAccountUID, paymentDetailLabel(entry)] as const,
        ),
      ),
    ),
);

const agencyOptions = computed<SelectOption[]>(() =>
  agencies.value.map((a) => ({ value: a.agencyUID, label: a.agencyName })),
);
const facilityOptions = computed<SelectOption[]>(() =>
  facilities.value.map((f) => ({ value: f.facilityUID, label: f.facilityName })),
);
/** The details of the chosen agency; without one there is nothing to choose from. */
const paymentDetailOptions = computed<SelectOption[]>(() => {
  const chosen = agencies.value.find((a) => a.agencyUID === filter.agencyUID);
  return (chosen?.accounts ?? []).map((entry) => ({
    value: entry.agencyAccountUID,
    label: entry.recipientName
      ? `${paymentDetailLabel(entry)} · ${entry.recipientName}`
      : paymentDetailLabel(entry),
  }));
});

/** The reference filters as one list — a further one is one more entry here. */
const references = computed(() => [
  {
    key: 'agencyUID' as const,
    label: 'Abrechnungsdienstleister',
    options: agencyOptions.value,
    disabled: false,
  },
  {
    key: 'agencyAccountUID' as const,
    label: 'Kontoverbindung',
    options: paymentDetailOptions.value,
    disabled: filter.agencyUID === '',
  },
  {
    key: 'facilityUID' as const,
    label: 'Leistungserbringer',
    options: facilityOptions.value,
    disabled: false,
  },
]);

const statusOptions = computed<SelectOption[]>(() =>
  STATUS_FILTERS.map((status) => ({
    value: status,
    label: status === 'nicht-erledigt' ? 'Nicht erledigt' : STATUS_DISPLAY[status].label,
  })),
);

/**
 * A reference chosen in the filter row. Choosing another agency drops the payment
 * details with it — the old ones belong to the old agency. A filter that arrives
 * whole, from the URL or from the last search, keeps both: there the details were
 * meant for exactly that agency.
 */
function setReference(key: ReferenceKey, value: string): void {
  filter[key] = value;
  if (key === 'agencyUID') filter.agencyAccountUID = '';
}

/** The status select hands back a plain string; only a known one is a filter. */
function setStatus(value: string): void {
  filter.status = asStatus(value);
}

/** The IBAN an invoice goes to, while it names one that is still known. */
function ibanOf(invoice: InvoiceDto): string | undefined {
  return invoice.agencyAccountUID
    ? ibanByPaymentDetail.value.get(invoice.agencyAccountUID)
    : undefined;
}

/** Provider, agency and payment details of a hit — what the filters ask about. */
function referenceLine(invoice: InvoiceDto): string {
  return [
    invoice.facilityUID ? facilityName.value.get(invoice.facilityUID) : undefined,
    invoice.agencyUID ? agencyName.value.get(invoice.agencyUID) : undefined,
    ibanOf(invoice),
  ]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' · ');
}

async function runSearch(): Promise<void> {
  if (!searchActive.value) {
    results.value = [];
    searching.value = false;
    return;
  }
  searchError.value = null;
  try {
    results.value = await searchInvoices({ ...filter }, RESULT_LIMIT);
  } catch (error) {
    results.value = [];
    searchError.value = describeError(error);
  } finally {
    searching.value = false;
  }
}

const scheduleSearch = useDebouncedCallback(() => void runSearch());

/** Applies a filter without letting the watcher fire for each single field. */
function applyFilter(next: InvoiceFilter): void {
  Object.assign(filter, next);
}

watch(
  () => [props.q, props.agency, props.account, props.facility, props.status] as const,
  () => {
    applyFilter(
      filterFromQuery({
        q: props.q,
        agency: props.agency,
        account: props.account,
        facility: props.facility,
        status: props.status,
      }),
    );
  },
);

watch(filter, () => {
  rememberFilter(filter);
  // The URL says what is filtered, so the search survives a reload and a hit
  // can be followed and come back. `replace`: filtering is not a step back.
  void router?.replace({ query: queryFromFilter(filter) });
  // The spinner starts with the keystroke, the request only after the pause.
  searching.value = searchActive.value;
  scheduleSearch();
});

onMounted(async () => {
  const fromUrl = filterFromQuery({
    q: props.q,
    agency: props.agency,
    account: props.account,
    facility: props.facility,
    status: props.status,
  });
  // A bare /invoices — the menu entry and the workspace's back arrow — picks up
  // the search that was running before.
  applyFilter(isActive(fromUrl) ? fromUrl : rememberedFilter());
  try {
    const [accountRows, agencyRows, facilityRows] = await Promise.all([
      listResource<AccountDto>('/accounts'),
      listResource<AgencyDto>('/agencies'),
      listResource<FacilityDto>('/facilities'),
    ]);
    accounts.value = accountRows;
    agencies.value = agencyRows;
    facilities.value = facilityRows;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <div class="eu-picker__filters">
      <!-- A plain text field, like the filter bar of the billings list: the
           native search input brings a clear button no other field here has. -->
      <EuTextField v-model="filter.q" class="eu-picker__search" label="Rechnungsnummer suchen" />
      <EuSelectField
        v-for="reference in references"
        :key="reference.key"
        :model-value="filter[reference.key]"
        :label="reference.label"
        :options="reference.options"
        :disabled="reference.disabled"
        empty-label="– alle –"
        @update:model-value="setReference(reference.key, $event)"
      />
      <EuSelectField
        :model-value="filter.status"
        label="Status"
        :options="statusOptions"
        empty-label="– alle –"
        @update:model-value="setStatus"
      />
    </div>

    <template v-if="searchActive">
      <p v-if="searching" class="eu-picker__hint">Wird gesucht…</p>
      <p v-else-if="searchError" class="eu-picker__error" role="alert">{{ searchError }}</p>
      <p v-else-if="results.length === 0" class="eu-picker__hint" role="status">
        Keine Rechnung passt zu dieser Suche.
      </p>

      <ul v-else class="eu-picker__results">
        <li v-for="invoice in results" :key="invoice.invoiceUID">
          <RouterLink class="eu-picker__result" :to="hitTarget(invoice)">
            <span class="eu-picker__number">{{ invoice.invoiceNumber }}</span>
            <span class="eu-picker__person">{{
              personName.get(invoice.accountUID) ?? 'Unbekannt'
            }}</span>
            <EuBadge
              :tone="STATUS_DISPLAY[invoice.workflowStatus].tone"
              :icon="STATUS_DISPLAY[invoice.workflowStatus].icon"
              compact
            >
              {{ STATUS_DISPLAY[invoice.workflowStatus].label }}
            </EuBadge>
            <span class="eu-picker__meta">
              Rechnung vom {{ germanDate(invoice.invoiceDate) }} · Behandlung
              {{ treatmentDaysLabel(invoice.treatmentDates) }} ·
              {{ euro(invoice.invoiceAmount) }}
            </span>
            <span v-if="referenceLine(invoice)" class="eu-picker__refs">{{
              referenceLine(invoice)
            }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-if="truncated" class="eu-picker__hint" role="status">
        Es werden die ersten {{ RESULT_LIMIT }} Rechnungen gezeigt. Bitte enger filtern.
      </p>
    </template>

    <template v-else>
      <p class="eu-picker__lead">Für welchen Versicherten möchtest du die Rechnungen ansehen?</p>

      <p v-if="loading" class="eu-picker__hint">Wird geladen…</p>
      <p v-else-if="accounts.length === 0" class="eu-picker__hint">
        Noch keine Versicherten erfasst.
      </p>

      <ul v-else class="eu-picker__grid">
        <li v-for="person in accounts" :key="person.accountUID">
          <RouterLink class="eu-picker__tile" :to="`/invoices/${person.accountUID}`">
            <span class="eu-picker__name">{{ person.firstname }} {{ person.surname }}</span>
            <span class="eu-picker__birth">{{ germanDate(person.birthDate) }}</span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
/* The filter row wraps at narrow widths; every field keeps a readable width. */
.eu-picker__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1rem;
  margin-bottom: 1.5rem;
}

/* The selects keep their width; only the text field takes the room that is
   left, so a filter alone on the second line does not stretch across it. */
.eu-picker__filters > * {
  flex: 0 1 14rem;
  min-width: 0;
}

.eu-picker__search {
  flex: 1 1 18rem;
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

/* One hit: number, person and status lead; what the filters ask about follows
   on its own lines, so a row stays readable however much it carries. */
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

.eu-picker__meta,
.eu-picker__refs {
  flex-basis: 100%;
  color: var(--eu-color-text-muted);
  font-size: 0.9rem;
}
</style>
