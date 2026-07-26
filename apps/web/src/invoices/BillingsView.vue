<script setup lang="ts">
import {
  faChevronLeft,
  faGavel,
  faTriangleExclamation,
  faUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, onMounted, ref } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuSortableTh from '../design-system/components/EuSortableTh.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { apiFetch } from '../lib/api';
import { euro, germanDate } from '../lib/format';
import { HttpError } from '../lib/http';
import { useTableSort } from '../lib/useTableSort';
import { type BillingListDto, listContractBillings, updateBilling } from './api';

const props = defineProps<{ contractUID: string }>();

const billings = ref<BillingListDto[]>([]);
const heading = ref('');
const loading = ref(true);
const loadError = ref<string | null>(null);

function billingSortValue(b: BillingListDto, key: string): string | number | null {
  switch (key) {
    case 'number':
      return b.billingNumber;
    case 'date':
      return b.billingDate;
    case 'reimbursed':
      return b.reimbursedTotal;
    case 'invoices':
      return b.invoiceNumbers;
    case 'objection':
      // Open objections first, then resolved, then none.
      return b.objectionDate === null ? 2 : b.objectionResolvedDate === null ? 0 : 1;
    default:
      return '';
  }
}
const sort = useTableSort(billings, billingSortValue);

const objectionOpen = ref(false);
const selected = ref<BillingListDto | null>(null);
const busy = ref(false);
const dialogError = ref<string | null>(null);
const formDate = ref('');
const formNote = ref('');

const today = (): string => new Date().toISOString().slice(0, 10);

function isOpenObjection(b: BillingListDto): boolean {
  return b.objectionDate !== null && b.objectionResolvedDate === null;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const contract = await apiFetch<{ data: { contractNumber: string; accountUID: string } }>(
      `/contracts/${props.contractUID}`,
    );
    const account = await apiFetch<{ data: { firstname: string; surname: string | null } }>(
      `/accounts/${contract.data.accountUID}`,
    );
    const person = [account.data.firstname, account.data.surname].filter(Boolean).join(' ');
    heading.value = `${contract.data.contractNumber} · ${person}`;
    billings.value = await listContractBillings(props.contractUID);
  } catch (err) {
    loadError.value = err instanceof HttpError ? err.message : 'Abrechnungen konnten nicht geladen werden.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openDocument(b: BillingListDto): void {
  if (b.documentLink) window.open(b.documentLink, '_blank', 'noopener');
}

function openObjection(b: BillingListDto): void {
  selected.value = b;
  dialogError.value = null;
  formDate.value = today();
  formNote.value = '';
  objectionOpen.value = true;
}

const selectedOpen = computed(() => (selected.value ? isOpenObjection(selected.value) : false));

async function run(action: () => Promise<unknown>): Promise<void> {
  busy.value = true;
  dialogError.value = null;
  try {
    await action();
    objectionOpen.value = false;
    await load();
  } catch (err) {
    dialogError.value = err instanceof HttpError ? err.message : 'Aktion fehlgeschlagen.';
  } finally {
    busy.value = false;
  }
}

function fileObjection(): void {
  const billing = selected.value;
  if (!billing) return;
  if (!formDate.value) {
    dialogError.value = 'Bitte ein Datum für den Widerspruch angeben.';
    return;
  }
  void run(() =>
    updateBilling(billing.billingUID, {
      objectionDate: formDate.value,
      objectionResolvedDate: null,
      objectionNote: formNote.value.trim() ? formNote.value.trim() : null,
    }),
  );
}

function resolveObjection(): void {
  const billing = selected.value;
  if (!billing) return;
  void run(() => updateBilling(billing.billingUID, { objectionResolvedDate: today() }));
}
</script>

<template>
  <section>
    <div class="eu-billings__head">
      <RouterLink
        to="/billings"
        class="eu-billings__back"
        title="Zurück zur Vertragsauswahl"
        aria-label="Zurück zur Vertragsauswahl"
      >
        <FontAwesomeIcon :icon="faChevronLeft" aria-hidden="true" />
      </RouterLink>
      <h2 class="eu-billings__title">{{ heading }}</h2>
    </div>

    <p v-if="loading" class="eu-billings__hint">Wird geladen…</p>
    <p v-else-if="loadError" class="eu-billings__error" role="alert">{{ loadError }}</p>
    <p v-else-if="billings.length === 0" class="eu-billings__hint">
      Für diesen Vertrag gibt es noch keine Leistungsabrechnungen. Sie entstehen im
      Rechnungs-Workflow über „Abrechnung zuordnen".
    </p>

    <div v-else class="eu-billings__table-wrap">
      <table class="eu-billings__table">
        <thead>
          <tr>
            <EuSortableTh label="Nummer" :state="sort.stateOf('number')" @sort="sort.toggle('number')" />
            <EuSortableTh label="Datum" :state="sort.stateOf('date')" @sort="sort.toggle('date')" />
            <EuSortableTh label="Erstattung" :state="sort.stateOf('reimbursed')" @sort="sort.toggle('reimbursed')" />
            <EuSortableTh label="Rechnungen" :state="sort.stateOf('invoices')" @sort="sort.toggle('invoices')" />
            <EuSortableTh label="Widerspruch" :state="sort.stateOf('objection')" @sort="sort.toggle('objection')" />
            <th class="eu-billings__actions-head">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in sort.sorted" :key="b.billingUID">
            <td>{{ b.billingNumber }}</td>
            <td>{{ germanDate(b.billingDate) }}</td>
            <td>{{ euro(b.reimbursedTotal) }}</td>
            <td>{{ b.invoiceNumbers ?? '–' }}</td>
            <td>
              <span
                v-if="isOpenObjection(b)"
                class="eu-billings__objection"
                role="img"
                :aria-label="`Im Widerspruch offen seit ${germanDate(b.objectionDate)}`"
                :title="`Im Widerspruch offen seit ${germanDate(b.objectionDate)}`"
              >
                <FontAwesomeIcon :icon="faTriangleExclamation" aria-hidden="true" />
              </span>
              <span v-else-if="b.objectionDate" class="eu-billings__resolved">
                aufgelöst am {{ germanDate(b.objectionResolvedDate) }}
              </span>
              <span v-else class="eu-billings__muted">–</span>
            </td>
            <td class="eu-billings__actions">
              <EuButton
                v-if="b.documentLink"
                variant="secondary"
                icon-only
                :icon="faUpRightFromSquare"
                aria-label="Dokument öffnen"
                title="Hinterlegtes Dokument öffnen"
                @click="openDocument(b)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faGavel"
                aria-label="Widerspruch"
                title="Widerspruch einlegen oder auflösen"
                @click="openObjection(b)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <EuDialog :open="objectionOpen" title="Widerspruch" @close="objectionOpen = false">
      <div v-if="selected" class="eu-form">
        <p class="eu-form__note">
          Leistungsabrechnung {{ selected.billingNumber }} ({{ germanDate(selected.billingDate) }})
        </p>

        <template v-if="selectedOpen">
          <p class="eu-billings__state">
            Widerspruch offen seit {{ germanDate(selected.objectionDate) }}
          </p>
          <p v-if="selected.objectionNote" class="eu-form__note">{{ selected.objectionNote }}</p>
        </template>

        <template v-else-if="selected.objectionDate">
          <p class="eu-billings__resolved">
            Widerspruch aufgelöst am {{ germanDate(selected.objectionResolvedDate) }}
          </p>
          <p v-if="selected.objectionNote" class="eu-form__note">{{ selected.objectionNote }}</p>
        </template>

        <template v-else>
          <EuTextField v-model="formDate" label="Datum" type="date" />
          <EuTextField v-model="formNote" label="Notiz (optional)" />
        </template>

        <p v-if="dialogError" class="eu-billings__error" role="alert">{{ dialogError }}</p>
      </div>

      <template #footer>
        <EuButton variant="secondary" @click="objectionOpen = false">Schließen</EuButton>
        <EuButton v-if="selectedOpen" :disabled="busy" @click="resolveObjection">
          Als aufgelöst markieren
        </EuButton>
        <EuButton v-else-if="selected && !selected.objectionDate" :disabled="busy" @click="fileObjection">
          Widerspruch einlegen
        </EuButton>
      </template>
    </EuDialog>
  </section>
</template>

<style scoped>
.eu-billings__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 1rem;
}

.eu-billings__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  color: var(--eu-color-text-muted);
  text-decoration: none;
}
.eu-billings__back:hover {
  background-color: var(--eu-color-border);
  color: var(--eu-color-text);
}

.eu-billings__title {
  margin: 0;
  font-size: 1.4rem;
}

.eu-billings__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-billings__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}

.eu-billings__table-wrap {
  overflow-x: auto;
}

.eu-billings__table {
  width: 100%;
  border-collapse: collapse;
}

.eu-billings__table th,
.eu-billings__table td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

.eu-billings__actions-head {
  text-align: right;
}

.eu-billings__actions {
  display: flex;
  gap: 0.35rem;
  justify-content: flex-end;
}

.eu-billings__objection {
  color: var(--eu-color-status-submitted-fg);
  cursor: help;
}

.eu-billings__resolved {
  color: var(--eu-color-status-done-fg);
  font-size: 0.9rem;
}

.eu-billings__muted {
  color: var(--eu-color-text-muted);
}

.eu-billings__state {
  margin: 0;
  font-weight: 600;
  color: var(--eu-color-status-submitted-fg);
}

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
</style>
