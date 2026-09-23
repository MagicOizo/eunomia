<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { useDebouncedCallback } from '../lib/debounce';
import { describeError } from '../lib/errors';
import { euro, germanDate, plural } from '../lib/format';
import { type BillingListDto, searchBillings } from './api';

/**
 * "Leistungsabrechnung auswählen": finds the billing to book a reimbursement
 * from. Scoped to one submission, because only that submission's billings may
 * reimburse its invoices — the filters narrow it down from there. The search
 * runs server-side so it stays usable once a policy has years of billings.
 */
const props = defineProps<{
  open: boolean;
  submissionUID: string;
  /** The policy the submission belongs to, shown as fixed context. */
  policyLabel: string;
  /** Prefills the free text with whatever was typed into the picker. */
  initialQuery?: string;
}>();

const emit = defineEmits<{ close: []; select: [billing: BillingListDto] }>();

/** Enough to choose from; more than that is a case for narrower filters. */
const RESULT_LIMIT = 50;

const filters = reactive({
  q: '',
  from: '',
  to: '',
  unlinked: false,
  min: null as number | null,
  max: null as number | null,
});
const results = ref<BillingListDto[]>([]);
const chosen = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const truncated = computed(() => results.value.length === RESULT_LIMIT);

async function search(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    results.value = await searchBillings({
      submissionUID: props.submissionUID,
      q: filters.q.trim() || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      unlinked: filters.unlinked,
      minReimbursement: filters.min ?? undefined,
      maxReimbursement: filters.max ?? undefined,
      limit: RESULT_LIMIT,
    });
    if (!results.value.some((b) => b.billingUID === chosen.value)) chosen.value = null;
  } catch (err) {
    error.value = describeError(err);
    results.value = [];
  } finally {
    loading.value = false;
  }
}

const scheduleSearch = useDebouncedCallback(() => void search());
watch(filters, scheduleSearch);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    filters.q = props.initialQuery ?? '';
    filters.from = '';
    filters.to = '';
    filters.unlinked = false;
    filters.min = null;
    filters.max = null;
    chosen.value = null;
    results.value = [];
    void search();
  },
  { immediate: true },
);

function confirm(): void {
  const billing = results.value.find((b) => b.billingUID === chosen.value);
  if (billing) emit('select', billing);
}
</script>

<template>
  <EuDialog :open="open" title="Leistungsabrechnung auswählen" @close="emit('close')">
    <div class="eu-form">
      <p class="eu-form__note">Police: {{ policyLabel }}</p>

      <EuTextField v-model="filters.q" label="Abrechnungs- oder Rechnungsnummer" />
      <div class="eu-bsearch__row">
        <EuTextField v-model="filters.from" label="Abrechnung ab" type="date" />
        <EuTextField v-model="filters.to" label="Abrechnung bis" type="date" />
      </div>
      <div class="eu-bsearch__row">
        <EuCurrencyField v-model="filters.min" label="Erstattung ab" />
        <EuCurrencyField v-model="filters.max" label="Erstattung bis" />
      </div>
      <EuToggle v-model="filters.unlinked" label="Nur unverknüpfte Abrechnungen" />

      <h3 class="eu-bsearch__heading">Suchergebnis</h3>
      <p v-if="loading" class="eu-form__note" role="status">Wird gesucht…</p>
      <p v-else-if="results.length === 0" class="eu-form__note" role="status">
        Keine Leistungsabrechnung passt zu diesen Filtern.
      </p>
      <ul v-else class="eu-bsearch__results eu-scroll-focus-safe">
        <li v-for="billing in results" :key="billing.billingUID">
          <button
            type="button"
            class="eu-bsearch__hit"
            :class="{ 'is-chosen': chosen === billing.billingUID }"
            :aria-pressed="chosen === billing.billingUID"
            @click="chosen = billing.billingUID"
            @dblclick="confirm"
          >
            <span class="eu-bsearch__number">{{ billing.billingNumber }}</span>
            <span class="eu-bsearch__date">{{ germanDate(billing.billingDate) }}</span>
            <span class="eu-bsearch__amount">{{ euro(billing.reimbursedTotal) }}</span>
            <span class="eu-bsearch__invoices">
              {{ billing.invoiceNumbers ?? 'noch keiner Rechnung zugeordnet' }}
            </span>
          </button>
        </li>
      </ul>
      <p v-if="truncated" class="eu-form__hint">
        Es werden die ersten
        {{ plural(RESULT_LIMIT, 'Abrechnung', 'Abrechnungen') }} gezeigt — bitte enger filtern.
      </p>
      <p v-if="error" class="eu-form__error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Schließen</EuButton>
      <EuButton :disabled="chosen === null" @click="confirm">Auswählen</EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eu-form__note {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-form__hint {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.85rem;
}

.eu-form__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}

.eu-bsearch__row {
  display: flex;
  gap: 0.75rem;
}

.eu-bsearch__row > * {
  flex: 1;
  min-width: 0;
}

.eu-bsearch__heading {
  margin: 0;
  font-family: var(--eu-font-heading);
  font-size: 1rem;
}

/* Scrolls once the hits outgrow it, which would cut the focus ring off the
   result buttons flush with its edges — `eu-scroll-focus-safe` reserves the
   room and owns this list's margin/padding (including the browser's default
   list indent), so don't set either here: scoped rules would override it. */
.eu-bsearch__results {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 16rem;
  overflow-y: auto;
}

.eu-bsearch__hit {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(6rem, auto) auto 1fr;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.375rem;
  background-color: var(--eu-color-surface-bg);
  font: inherit;
  font-family: var(--eu-font-data);
  color: var(--eu-color-text);
  text-align: left;
  cursor: pointer;
}

.eu-bsearch__hit:hover {
  border-color: var(--eu-color-accent);
}

.eu-bsearch__hit.is-chosen {
  border-color: var(--eu-color-accent);
  background-color: color-mix(in srgb, var(--eu-color-accent) 12%, transparent);
}

.eu-bsearch__number {
  font-weight: 600;
}

.eu-bsearch__amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.eu-bsearch__invoices {
  grid-column: 1 / -1;
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
}
</style>
