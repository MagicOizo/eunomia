<script setup lang="ts">
import { faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, ref, watch } from 'vue';

import EuButton from '../../design-system/components/EuButton.vue';
import EuDialog from '../../design-system/components/EuDialog.vue';
import EuSortableTh from '../../design-system/components/EuSortableTh.vue';
import { HttpError } from '../../lib/http';
import { useTableSort } from '../../lib/useTableSort';
import {
  type ResourceRow,
  createResource,
  deleteResource,
  listResource,
  updateResource,
} from '../../lib/resource';
import type { ColumnConfig, ResourceConfig } from '../../resources/config';
import type { SelectOption } from './EuSelectField.vue';
import ResourceFormDialog from './ResourceFormDialog.vue';

const props = defineProps<{ config: ResourceConfig }>();

interface LookupData {
  options: SelectOption[];
  byId: Map<string, string>;
}

const rows = ref<ResourceRow[]>([]);
const lookups = ref<Record<string, LookupData>>({});
const loading = ref(false);
const loadError = ref<string | null>(null);

const dialogOpen = ref(false);
const editing = ref<ResourceRow | null>(null);
const submitting = ref(false);
const formError = ref<string | null>(null);

const confirmTarget = ref<ResourceRow | null>(null);
const deleteError = ref<string | null>(null);

// Article-neutral so it reads correctly for every gender ("Police anlegen",
// "Versicherung bearbeiten", …) instead of a wrong "Neuer Police".
const dialogTitle = computed(
  () => `${props.config.singular} ${editing.value ? 'bearbeiten' : 'anlegen'}`,
);
const optionsForForm = computed<Record<string, SelectOption[]>>(() =>
  Object.fromEntries(Object.entries(lookups.value).map(([name, data]) => [name, data.options])),
);

/** Turns any thrown error into a readable German message. */
function describeError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      const messages = (error.details as Array<{ message?: string }>)
        .map((issue) => issue.message)
        .filter(Boolean);
      if (messages.length > 0) return messages.join('; ');
    }
    if (error.status === 403) return 'Dazu fehlt dir die Berechtigung.';
    return error.message;
  }
  return 'Unerwarteter Fehler.';
}

async function loadLookups(): Promise<void> {
  const entries = Object.entries(props.config.lookups ?? {});
  const loaded = await Promise.all(
    entries.map(async ([name, lookup]) => {
      const items = await listResource(lookup.path);
      const options = items.map((item) => ({
        value: String(item[lookup.idKey]),
        label: lookup.label(item),
      }));
      const byId = new Map(options.map((option) => [option.value, option.label]));
      return [name, { options, byId }] as const;
    }),
  );
  lookups.value = Object.fromEntries(loaded);
}

async function reload(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    await loadLookups();
    rows.value = await listResource(props.config.path);
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
}

watch(() => props.config.path, reload, { immediate: true });

function cell(row: ResourceRow, column: ColumnConfig): string {
  const raw = row[column.key];
  if (column.lookup) {
    return lookups.value[column.lookup]?.byId.get(String(raw)) ?? (raw === null ? '–' : String(raw));
  }
  if (column.format) return column.format(raw, row);
  return raw === null || raw === undefined || raw === '' ? '–' : String(raw);
}

// Sort lookup columns by their resolved name; everything else by the raw value
// (ISO dates and numbers then sort correctly, not by their display text).
function sortValue(row: ResourceRow, key: string): string | number | null | undefined {
  const column = props.config.columns.find((c) => c.key === key);
  if (column?.lookup) return cell(row, column);
  const raw = row[key];
  return typeof raw === 'number' || typeof raw === 'string' || raw == null ? raw : String(raw);
}

const sort = useTableSort(rows, sortValue);

function openCreate(): void {
  editing.value = null;
  formError.value = null;
  dialogOpen.value = true;
}

function openEdit(row: ResourceRow): void {
  editing.value = row;
  formError.value = null;
  dialogOpen.value = true;
}

async function onSubmit(payload: Record<string, unknown>): Promise<void> {
  submitting.value = true;
  formError.value = null;
  try {
    if (editing.value) {
      await updateResource(props.config.path, String(editing.value[props.config.idKey]), payload);
    } else {
      await createResource(props.config.path, payload);
    }
    dialogOpen.value = false;
    await reload();
  } catch (error) {
    formError.value = describeError(error);
  } finally {
    submitting.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!confirmTarget.value) return;
  deleteError.value = null;
  try {
    await deleteResource(props.config.path, String(confirmTarget.value[props.config.idKey]));
    confirmTarget.value = null;
    await reload();
  } catch (error) {
    deleteError.value = describeError(error);
  }
}
</script>

<template>
  <section>
    <div class="eu-resource__head">
      <EuButton :icon="faPlus" @click="openCreate">Neu</EuButton>
    </div>

    <p v-if="loading" class="eu-resource__hint">Wird geladen…</p>
    <p v-else-if="loadError" class="eu-resource__error" role="alert">{{ loadError }}</p>
    <p v-else-if="rows.length === 0" class="eu-resource__hint">
      Noch keine {{ config.plural }} erfasst.
    </p>

    <div v-else class="eu-resource__table-wrap">
      <table class="eu-resource__table">
        <thead>
          <tr>
            <EuSortableTh
              v-for="column in config.columns"
              :key="column.key"
              :label="column.label"
              :align="column.align === 'right' ? 'center' : column.align"
              :state="sort.stateOf(column.key)"
              @sort="sort.toggle(column.key)"
            />
            <th class="eu-resource__actions-head">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sort.sorted" :key="String(row[config.idKey])">
            <td
              v-for="column in config.columns"
              :key="column.key"
              :class="{ 'eu-resource__num': column.align === 'right' }"
            >
              {{ cell(row, column) }}
            </td>
            <td class="eu-resource__actions">
              <EuButton
                variant="secondary"
                icon-only
                :icon="faPen"
                :aria-label="`${config.singular} bearbeiten`"
                @click="openEdit(row)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faTrash"
                :aria-label="`${config.singular} löschen`"
                @click="confirmTarget = row"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ResourceFormDialog
      :open="dialogOpen"
      :title="dialogTitle"
      :fields="config.fields"
      :options="optionsForForm"
      :editing="editing"
      :submitting="submitting"
      :error="formError"
      @close="dialogOpen = false"
      @submit="onSubmit"
    />

    <EuDialog
      :open="confirmTarget !== null"
      :title="`${config.singular} löschen`"
      @close="confirmTarget = null"
    >
      <p>Diesen Eintrag wirklich löschen?</p>
      <p v-if="deleteError" class="eu-resource__error" role="alert">{{ deleteError }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="confirmTarget = null">Abbrechen</EuButton>
        <EuButton @click="confirmDelete">Löschen</EuButton>
      </template>
    </EuDialog>
  </section>
</template>

<style scoped>
.eu-resource__head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
}

.eu-resource__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-resource__error {
  color: var(--eu-color-error-fg);
  font-family: var(--eu-font-data);
}

.eu-resource__table-wrap {
  overflow-x: auto;
}

.eu-resource__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}

.eu-resource__table th,
.eu-resource__table td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

.eu-resource__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Shrink the actions column to its content so the data columns get the rest.
   Prefixed with the table class to outweigh the base `.eu-resource__table td`. */
.eu-resource__table .eu-resource__actions-head,
.eu-resource__table .eu-resource__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.eu-resource__actions button + button {
  margin-left: 0.4rem;
}

.eu-resource__table .eu-resource__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
