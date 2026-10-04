<script setup lang="ts">
import type { PermissionKey } from '@eunomia/shared';
import { faEye, faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, ref, watch } from 'vue';

import EuButton from '../../design-system/components/EuButton.vue';
import EuDialog from '../../design-system/components/EuDialog.vue';
import EuSortableTh from '../../design-system/components/EuSortableTh.vue';
import EuTextField from '../../design-system/components/EuTextField.vue';
import { useDialogAction } from '../../lib/dialog-action';
import { NO_PERMISSION } from '../../lib/error-messages';
import { describeError } from '../../lib/errors';
import { useTableSort } from '../../lib/table-sort';
import {
  type ResourceRow,
  createResource,
  deleteResource,
  listResource,
  updateResource,
} from '../../lib/resource';
import type { ColumnConfig, ResourceConfig, RowActionConfig } from '../../resources/config';
import { useAuthStore } from '../../stores/auth';
import type { SelectOption } from './EuSelectField.vue';
import ResourceDetailDialog from './ResourceDetailDialog.vue';
import ResourceFormDialog from './ResourceFormDialog.vue';

const props = defineProps<{ config: ResourceConfig }>();

const auth = useAuthStore();

interface LookupData {
  options: SelectOption[];
  byId: Map<string, string>;
}

const rows = ref<ResourceRow[]>([]);
/** Free text over the rendered cells of the list (see visibleRows). */
const filter = ref('');
const lookups = ref<Record<string, LookupData>>({});
const loading = ref(false);
const loadError = ref<string | null>(null);

// Creating uses the classic form, viewing/editing the display mask
// (dialog-design.md) — two dialogs, one submit path.
const createOpen = ref(false);
const maskOpen = ref(false);
const editing = ref<ResourceRow | null>(null);
const form = useDialogAction(reload);

/** UID of the row open in the resource's own detail dialog (see ResourceConfig.detailDialog). */
const detailUid = ref<string | null>(null);

const confirmTarget = ref<ResourceRow | null>(null);
const removal = useDialogAction(reload);

/**
 * The row action currently running, by its label, and what it said if it
 * failed. A row action that does something (the account export) is the one
 * place in this view where a failure belongs to no dialog.
 */
const busyAction = ref<string | null>(null);
const actionError = ref<string | null>(null);

async function runRowAction(action: RowActionConfig, row: ResourceRow): Promise<void> {
  if (!action.run) return;
  actionError.value = null;
  busyAction.value = action.label(row);
  try {
    await action.run(row);
  } catch (error) {
    actionError.value = describeError(error);
  } finally {
    busyAction.value = null;
  }
}

// Article-neutral so it reads correctly for every gender ("Police anlegen")
// instead of a wrong "Neue Police".
const createTitle = computed(() => `${props.config.singular} anlegen`);
// The mask names the record it shows, like the invoice and policy masks do.
const maskTitle = computed(() =>
  editing.value
    ? (props.config.detailTitle?.(editing.value) ?? `${props.config.singular} bearbeiten`)
    : '',
);
const optionsForForm = computed<Record<string, SelectOption[]>>(() =>
  Object.fromEntries(Object.entries(lookups.value).map(([name, data]) => [name, data.options])),
);

/**
 * May this user write this row? The grant is asked for the row's account
 * (`accountKey`) — or globally, where the resource has no account at all
 * (companies, facilities, agencies).
 */
function mayManage(row: ResourceRow): boolean {
  const account = props.config.accountKey ? String(row[props.config.accountKey]) : undefined;
  return auth.can(props.config.managePermission, account);
}

/**
 * Creating needs the permission for some account — or globally, where a new
 * record has no account to scope it to (a new insured person; see the API's
 * POST /accounts).
 */
const mayCreate = computed(() =>
  props.config.createNeedsGlobal
    ? auth.can(props.config.managePermission)
    : auth.canAny(props.config.managePermission),
);

/**
 * The create form's select options. An account picker declared with `scopedBy`
 * offers only the accounts this user may write, so the form cannot be filled
 * for a person the API would then refuse (CR-26). The display mask keeps the
 * full map: there the account is a readonly row, and it has to be able to name
 * the person it shows.
 */
const optionsForCreate = computed<Record<string, SelectOption[]>>(() => {
  const scoped = new Map<string, PermissionKey>();
  for (const field of props.config.fields) {
    if (field.scopedBy && field.optionsFrom) scoped.set(field.optionsFrom, field.scopedBy);
  }
  if (scoped.size === 0) return optionsForForm.value;
  return Object.fromEntries(
    Object.entries(optionsForForm.value).map(([name, options]) => {
      const permission = scoped.get(name);
      return [
        name,
        permission === undefined
          ? options
          : options.filter((option) => auth.can(permission, option.value)),
      ];
    }),
  );
});

/** The open mask is read-only unless the row may be written (the author's decision, CR-26). */
const maskReadonly = computed(() => editing.value !== null && !mayManage(editing.value));

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

watch(
  () => props.config.path,
  async () => {
    // A filter belongs to the list it was typed for; a reload after creating
    // or deleting a row deliberately keeps it.
    filter.value = '';
    await reload();
  },
  { immediate: true },
);

function cell(row: ResourceRow, column: ColumnConfig): string {
  const raw = row[column.key];
  if (column.lookup) {
    return (
      lookups.value[column.lookup]?.byId.get(String(raw)) ?? (raw === null ? '–' : String(raw))
    );
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

/**
 * The rows left by the search field. Matched against the *rendered* cells, so
 * a looked-up name ("Versicherter") and a formatted date or amount are found
 * as they stand in the table, not as the raw UID or ISO value behind them.
 */
const visibleRows = computed<ResourceRow[]>(() => {
  const needle = filter.value.trim().toLocaleLowerCase('de');
  if (needle === '') return rows.value;
  return rows.value.filter((row) =>
    props.config.columns.some((column) =>
      cell(row, column).toLocaleLowerCase('de').includes(needle),
    ),
  );
});
// Filter first, sort second: the sort works on what the search left over.
const sort = useTableSort(visibleRows, sortValue);

function openCreate(): void {
  editing.value = null;
  form.clear();
  createOpen.value = true;
}

function openEdit(row: ResourceRow): void {
  if (props.config.detailDialog) {
    detailUid.value = String(row[props.config.idKey]);
    return;
  }
  editing.value = row;
  form.clear();
  maskOpen.value = true;
}

async function onSubmit(payload: Record<string, unknown>): Promise<void> {
  await form.run(
    async () => {
      if (editing.value) {
        await updateResource(props.config.path, String(editing.value[props.config.idKey]), payload);
      } else {
        await createResource(props.config.path, payload);
      }
    },
    () => {
      createOpen.value = false;
      maskOpen.value = false;
    },
  );
}

async function confirmDelete(): Promise<void> {
  const target = confirmTarget.value;
  if (!target) return;
  await removal.run(
    () => deleteResource(props.config.path, String(target[props.config.idKey])),
    () => (confirmTarget.value = null),
  );
}
</script>

<template>
  <section>
    <div class="eu-resource__head">
      <EuTextField
        v-if="!loading && !loadError && rows.length > 0"
        v-model="filter"
        class="eu-resource__search"
        label="Suchen"
      />
      <EuButton
        :icon="faPlus"
        :disabled="!mayCreate"
        :title="mayCreate ? undefined : NO_PERMISSION"
        @click="openCreate"
        >Neu</EuButton
      >
    </div>

    <p v-if="actionError" class="eu-resource__error" role="alert">{{ actionError }}</p>
    <p v-if="loading" class="eu-resource__hint">Wird geladen…</p>
    <p v-else-if="loadError" class="eu-resource__error" role="alert">{{ loadError }}</p>
    <p v-else-if="rows.length === 0" class="eu-resource__hint">
      Noch keine {{ config.plural }} erfasst.
    </p>
    <p v-else-if="visibleRows.length === 0" class="eu-resource__hint" role="status">
      Kein Eintrag passt zu dieser Suche.
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
              :class="{
                'eu-resource__num': column.align === 'right',
                'eu-resource__wrap': column.wrap,
              }"
            >
              {{ cell(row, column) }}
            </td>
            <td class="eu-resource__actions">
              <EuButton
                v-for="action in config.rowActions ?? []"
                :key="action.label(row)"
                variant="secondary"
                icon-only
                :icon="action.icon"
                :aria-label="action.label(row)"
                :title="action.label(row)"
                :to="action.to?.(row)"
                :disabled="busyAction === action.label(row)"
                @click="action.run ? runRowAction(action, row) : undefined"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="mayManage(row) ? faPen : faEye"
                :aria-label="`${config.singular} ${mayManage(row) ? 'bearbeiten' : 'ansehen'}`"
                @click="openEdit(row)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faTrash"
                :aria-label="`${config.singular} löschen`"
                :disabled="!mayManage(row)"
                :title="mayManage(row) ? undefined : NO_PERMISSION"
                @click="confirmTarget = row"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ResourceFormDialog
      :open="createOpen"
      :title="createTitle"
      :fields="config.fields"
      :options="optionsForCreate"
      :submitting="form.busy"
      :error="form.error"
      @close="createOpen = false"
      @submit="onSubmit"
    />

    <ResourceDetailDialog
      :open="maskOpen"
      :title="maskTitle"
      :fields="config.fields"
      :options="optionsForForm"
      :editing="editing"
      :readonly="maskReadonly"
      :submitting="form.busy"
      :error="form.error"
      @close="maskOpen = false"
      @submit="onSubmit"
    />

    <component
      :is="config.detailDialog"
      v-if="config.detailDialog"
      :open="detailUid !== null"
      :uid="detailUid"
      :options="optionsForForm"
      @close="detailUid = null"
      @changed="reload"
    />

    <EuDialog
      :open="confirmTarget !== null"
      :title="`${config.singular} löschen`"
      @close="confirmTarget = null"
    >
      <p>Diesen Eintrag wirklich löschen?</p>
      <p v-if="removal.error" class="eu-resource__error" role="alert">{{ removal.error }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="confirmTarget = null">Abbrechen</EuButton>
        <EuButton :disabled="removal.busy" @click="confirmDelete">Löschen</EuButton>
      </template>
    </EuDialog>
  </section>
</template>

<style scoped>
.eu-resource__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
}

/* Pushes the "Neu" button to the right edge and caps the field, so the search
   does not stretch across a wide table. */
.eu-resource__search {
  margin-right: auto;
  flex: 1 1 12rem;
  max-width: 20rem;
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

.eu-resource__table .eu-resource__wrap {
  white-space: normal;
}

.eu-resource__table .eu-resource__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
