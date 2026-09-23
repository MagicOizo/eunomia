<script setup lang="ts">
import {
  faChevronLeft,
  faGavel,
  faPen,
  faPlus,
  faTrash,
  faTriangleExclamation,
  faUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, onMounted, reactive, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuCurrencyField from '../design-system/components/EuCurrencyField.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuSortableTh from '../design-system/components/EuSortableTh.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import { BONUS_FORFEIT_RULE_LABEL, type BonusForfeitRule, forfeitsByRule } from '../contracts/api';
import { apiFetch } from '../lib/api';
import { useDebouncedCallback } from '../lib/debounce';
import { euro, germanDate, plural } from '../lib/format';
import { HttpError } from '../lib/http';
import { useTableSort } from '../lib/useTableSort';
import { type BillingListDto, deleteBilling, searchBillings, updateBilling } from './api';
import NewBillingDialog from './NewBillingDialog.vue';

const props = defineProps<{ contractUID: string }>();

const billings = ref<BillingListDto[]>([]);
const heading = ref('');
const accountUID = ref('');
const forfeitRule = ref<BonusForfeitRule>('ON_REIMBURSEMENT');
const newOpen = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);

/** Server-side filters over this contract's billings (see the API's GET /billings). */
const filters = reactive({
  q: '',
  from: '',
  to: '',
  unlinked: false,
  min: null as number | null,
  max: null as number | null,
});
const filtered = computed(
  () =>
    filters.q !== '' ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.unlinked ||
    filters.min !== null ||
    filters.max !== null,
);

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
const editOpen = ref(false);
const deleteOpen = ref(false);
const selected = ref<BillingListDto | null>(null);
const busy = ref(false);
const dialogError = ref<string | null>(null);
const formDate = ref('');
const formNote = ref('');
const editNumber = ref('');
const editDate = ref('');
const editLink = ref('');
const editForfeits = ref(false);

const today = (): string => new Date().toISOString().slice(0, 10);

function isOpenObjection(b: BillingListDto): boolean {
  return b.objectionDate !== null && b.objectionResolvedDate === null;
}

/** The billings matching the current filters; also the reload after a change. */
async function loadBillings(): Promise<void> {
  billings.value = await searchBillings({
    contractUID: props.contractUID,
    q: filters.q.trim() || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    unlinked: filters.unlinked,
    minReimbursement: filters.min ?? undefined,
    maxReimbursement: filters.max ?? undefined,
  });
}

const scheduleFilter = useDebouncedCallback(() => void loadBillings());
watch(filters, scheduleFilter);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const contract = await apiFetch<{
      data: { contractNumber: string; accountUID: string; bonusForfeitRule: BonusForfeitRule };
    }>(`/contracts/${props.contractUID}`);
    const account = await apiFetch<{ data: { firstname: string; surname: string | null } }>(
      `/accounts/${contract.data.accountUID}`,
    );
    const person = [account.data.firstname, account.data.surname].filter(Boolean).join(' ');
    heading.value = `${contract.data.contractNumber} · ${person}`;
    accountUID.value = contract.data.accountUID;
    forfeitRule.value = contract.data.bonusForfeitRule;
    await loadBillings();
  } catch (err) {
    loadError.value =
      err instanceof HttpError ? err.message : 'Abrechnungen konnten nicht geladen werden.';
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

/** Runs a mutating action, closing its dialog and reloading the list on success. */
async function run(action: () => Promise<unknown>, close: () => void): Promise<void> {
  busy.value = true;
  dialogError.value = null;
  try {
    await action();
    close();
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
  void run(
    () =>
      updateBilling(billing.billingUID, {
        objectionDate: formDate.value,
        objectionResolvedDate: null,
        objectionNote: formNote.value.trim() ? formNote.value.trim() : null,
      }),
    () => (objectionOpen.value = false),
  );
}

function resolveObjection(): void {
  const billing = selected.value;
  if (!billing) return;
  void run(
    () => updateBilling(billing.billingUID, { objectionResolvedDate: today() }),
    () => (objectionOpen.value = false),
  );
}

function openEdit(b: BillingListDto): void {
  selected.value = b;
  dialogError.value = null;
  editNumber.value = b.billingNumber;
  editDate.value = b.billingDate;
  editLink.value = b.documentLink ?? '';
  editForfeits.value = b.forfeitsBonus ?? forfeitsByRule(forfeitRule.value, b.reimbursedTotal);
  editOpen.value = true;
}

function saveEdit(): void {
  const billing = selected.value;
  if (!billing) return;
  if (!editNumber.value.trim() || !editDate.value) {
    dialogError.value = 'Bitte Abrechnungsnummer und -datum angeben.';
    return;
  }
  void run(
    () =>
      updateBilling(billing.billingUID, {
        billingNumber: editNumber.value.trim(),
        billingDate: editDate.value,
        documentLink: editLink.value.trim() ? editLink.value.trim() : null,
        forfeitsBonus: editForfeits.value,
      }),
    () => (editOpen.value = false),
  );
}

function openDelete(b: BillingListDto): void {
  selected.value = b;
  dialogError.value = null;
  deleteOpen.value = true;
}

function confirmDelete(): void {
  const billing = selected.value;
  if (!billing) return;
  void run(
    () => deleteBilling(billing.billingUID),
    () => (deleteOpen.value = false),
  );
}
</script>

<template>
  <section>
    <div class="eu-billings__head">
      <div class="eu-billings__heading">
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
      <EuButton v-if="!loading && !loadError" :icon="faPlus" @click="newOpen = true">Neu</EuButton>
    </div>

    <p v-if="loading" class="eu-billings__hint">Wird geladen…</p>
    <p v-else-if="loadError" class="eu-billings__error" role="alert">{{ loadError }}</p>

    <template v-else>
      <div class="eu-billings__filters">
        <EuTextField v-model="filters.q" label="Abrechnungs- oder Rechnungsnummer" />
        <EuTextField v-model="filters.from" label="Abrechnung ab" type="date" />
        <EuTextField v-model="filters.to" label="Abrechnung bis" type="date" />
        <EuCurrencyField v-model="filters.min" label="Erstattung ab" />
        <EuCurrencyField v-model="filters.max" label="Erstattung bis" />
        <EuToggle v-model="filters.unlinked" label="Nur unverknüpfte" />
      </div>

      <p v-if="billings.length === 0 && filtered" class="eu-billings__hint" role="status">
        Keine Leistungsabrechnung passt zu diesen Filtern.
      </p>
      <p v-else-if="billings.length === 0" class="eu-billings__hint">
        Für diesen Vertrag gibt es noch keine Leistungsabrechnungen. Sie entstehen im
        Rechnungs-Workflow über „Abrechnung zuordnen".
      </p>

      <div v-else class="eu-billings__table-wrap">
        <table class="eu-billings__table">
          <thead>
            <tr>
              <EuSortableTh
                label="Nummer"
                :state="sort.stateOf('number')"
                @sort="sort.toggle('number')"
              />
              <EuSortableTh
                label="Datum"
                :state="sort.stateOf('date')"
                @sort="sort.toggle('date')"
              />
              <EuSortableTh
                label="Erstattung"
                align="center"
                :state="sort.stateOf('reimbursed')"
                @sort="sort.toggle('reimbursed')"
              />
              <EuSortableTh
                label="Rechnungen"
                :state="sort.stateOf('invoices')"
                @sort="sort.toggle('invoices')"
              />
              <EuSortableTh
                label="Widerspruch"
                :state="sort.stateOf('objection')"
                @sort="sort.toggle('objection')"
              />
              <th class="eu-billings__actions-head">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in sort.sorted" :key="b.billingUID">
              <td>{{ b.billingNumber }}</td>
              <td>{{ germanDate(b.billingDate) }}</td>
              <td class="eu-billings__num">{{ euro(b.reimbursedTotal) }}</td>
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
                <EuButton
                  variant="secondary"
                  icon-only
                  :icon="faPen"
                  aria-label="Bearbeiten"
                  title="Abrechnung bearbeiten"
                  @click="openEdit(b)"
                />
                <EuButton
                  variant="secondary"
                  icon-only
                  :icon="faTrash"
                  aria-label="Löschen"
                  title="Abrechnung löschen"
                  @click="openDelete(b)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

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
        <EuButton
          v-else-if="selected && !selected.objectionDate"
          :disabled="busy"
          @click="fileObjection"
        >
          Widerspruch einlegen
        </EuButton>
      </template>
    </EuDialog>

    <EuDialog :open="editOpen" title="Abrechnung bearbeiten" @close="editOpen = false">
      <form class="eu-form" @submit.prevent="saveEdit">
        <EuTextField v-model="editNumber" label="Abrechnungsnummer" />
        <EuTextField v-model="editDate" label="Abrechnungsdatum" type="date" />
        <EuTextField v-model="editLink" label="Dokument-Link (optional)" />
        <div>
          <EuToggle v-model="editForfeits" label="Diese Abrechnung verwirkt den Bonus" />
          <p class="eu-billings__hint">
            Regel der Police: Bonus verfällt {{ BONUS_FORFEIT_RULE_LABEL[forfeitRule] }}.
          </p>
        </div>
        <p v-if="dialogError" class="eu-billings__error" role="alert">{{ dialogError }}</p>
      </form>
      <template #footer>
        <EuButton variant="secondary" @click="editOpen = false">Abbrechen</EuButton>
        <EuButton :disabled="busy" @click="saveEdit">{{
          busy ? 'Speichern…' : 'Speichern'
        }}</EuButton>
      </template>
    </EuDialog>

    <NewBillingDialog
      :open="newOpen"
      :contract-u-i-d="contractUID"
      :account-u-i-d="accountUID"
      :bonus-forfeit-rule="forfeitRule"
      @close="newOpen = false"
      @created="load"
    />

    <EuDialog :open="deleteOpen" title="Abrechnung löschen" @close="deleteOpen = false">
      <div v-if="selected" class="eu-form">
        <p>
          Leistungsabrechnung <strong>{{ selected.billingNumber }}</strong> wirklich löschen?
        </p>
        <p v-if="selected.invoiceCount > 0" class="eu-billings__warn">
          {{
            plural(
              selected.invoiceCount,
              'zugeordnete Rechnung verliert',
              'zugeordnete Rechnungen verlieren',
            )
          }}
          dadurch ihre Erstattung und gehen zurück auf „eingereicht".
        </p>
        <p v-if="dialogError" class="eu-billings__error" role="alert">{{ dialogError }}</p>
      </div>
      <template #footer>
        <EuButton variant="secondary" @click="deleteOpen = false">Abbrechen</EuButton>
        <EuButton :disabled="busy" @click="confirmDelete">{{
          busy ? 'Löschen…' : 'Löschen'
        }}</EuButton>
      </template>
    </EuDialog>
  </section>
</template>

<style scoped>
.eu-billings__hint {
  margin: 0.35rem 0 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.85rem;
}

.eu-billings__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 0 1rem;
}

.eu-billings__heading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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

.eu-billings__warn {
  margin: 0;
  color: var(--eu-color-status-submitted-fg);
  font-size: 0.9rem;
}

.eu-billings__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
}

.eu-billings__filters > * {
  flex: 1 1 10rem;
  min-width: 0;
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

/* Shrink the actions column to its content so the data columns get the rest.
   Prefixed with the table class to outweigh the base `.eu-billings__table td`. */
.eu-billings__table .eu-billings__actions-head,
.eu-billings__table .eu-billings__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.eu-billings__actions button + button {
  margin-left: 0.35rem;
}

.eu-billings__table .eu-billings__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
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
