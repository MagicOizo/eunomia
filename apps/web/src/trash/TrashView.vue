<script setup lang="ts">
import { faRotateLeft, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuSortableTh from '../design-system/components/EuSortableTh.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { describeError } from '../lib/errors';
import { activeLanguage, formatDateTime } from '../lib/format';
import { countedKind, kindName, kindTitle } from '../lib/kind-names';
import { useTableSort } from '../lib/table-sort';
import { type TrashEntryDto, type TrashGroupDto, loadTrash, purgeEntry, restoreEntry } from './api';
import {
  attachedRecord,
  contextText,
  countedAttachedRows,
  namedEntry,
  notRestorableReason,
  partText,
} from './trash-text';

/**
 * The Papierkorb (Slice 39): everything the app has deleted, in one place,
 * grouped by kind. Each row comes back or goes for good — the second only after
 * a confirmation that names what goes with it, because that step cannot be
 * undone.
 *
 * One page rather than a trash per list (the author's decision): a deleted
 * record's own ancestors may be deleted too, so there is no list it reliably
 * belongs to any more.
 */

const { t } = useI18n();

const groups = ref<TrashGroupDto[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
/** Free text over the rendered label, context and kind of every group. */
const filter = ref('');
/** Per-row error, keyed by UID, so a failure stays where it happened. */
const rowErrors = ref<Record<string, string>>({});
const busyUid = ref<string | null>(null);

const purgeTarget = ref<{ group: TrashGroupDto; entry: TrashEntryDto } | null>(null);
const purgeError = ref<string | null>(null);

const total = computed(() => groups.value.reduce((sum, group) => sum + group.entries.length, 0));

/** The groups left by the search, each narrowed to its matching entries. */
const visibleGroups = computed<TrashGroupDto[]>(() => {
  const needle = filter.value.trim().toLocaleLowerCase(activeLanguage());
  if (needle === '') return groups.value;
  return groups.value
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        `${partText(entry.label)} ${contextText(entry.context)} ${kindName(group.kind)}`
          .toLocaleLowerCase(activeLanguage())
          .includes(needle),
      ),
    }))
    .filter((group) => group.entries.length > 0);
});

async function reload(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    groups.value = await loadTrash();
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

/** What a final delete takes along, counted per kind: "3 Erstattungen, 1 Versicherungsjahr". */
function attachedCounts(entry: TrashEntryDto): string[] {
  const records = new Map<string, number>();
  for (const child of entry.attached) records.set(child.kind, (records.get(child.kind) ?? 0) + 1);
  return [
    ...[...records].map(([kind, count]) => countedKind(kind, count)),
    ...entry.attachedRows.map((row) => countedAttachedRows(row.kind, row.count)),
  ];
}

/** "samt 3 Erstattungen, 1 Versicherungsjahr" — the line under a row. */
function attachedSummary(entry: TrashEntryDto): string {
  const parts = attachedCounts(entry);
  return parts.length === 0 ? '' : t('trash.attachedSummary', { list: parts.join(', ') });
}

/** Every record named, for the confirmation: "Erstattung 50,00 €, 1 Versicherungsjahr". */
function attachedList(entry: TrashEntryDto): string {
  const parts = [
    ...entry.attached.map((child) => attachedRecord(child.kind, child.label)),
    ...entry.attachedRows.map((row) => countedAttachedRows(row.kind, row.count)),
  ];
  return parts.join(', ');
}

/**
 * What a restore covers. Not the same as what a final delete takes along: it
 * brings back only what was deleted in the same moment, so the tooltip says the
 * number rather than letting the "samt …" line next to it be read as a promise.
 */
function restoreTitle(group: TrashGroupDto, entry: TrashEntryDto): string {
  const kind = kindName(group.kind);
  return entry.restoresWith === 0
    ? t('trash.restore', { kind })
    : t('trash.restoreWith', { kind, n: entry.restoresWith }, entry.restoresWith);
}

async function onRestore(entry: TrashEntryDto): Promise<void> {
  busyUid.value = entry.uid;
  rowErrors.value = { ...rowErrors.value, [entry.uid]: '' };
  try {
    await restoreEntry(entry.uid);
    await reload();
  } catch (error) {
    rowErrors.value = { ...rowErrors.value, [entry.uid]: describeError(error) };
  } finally {
    busyUid.value = null;
  }
}

async function confirmPurge(): Promise<void> {
  const target = purgeTarget.value;
  if (!target) return;
  purgeError.value = null;
  busyUid.value = target.entry.uid;
  try {
    await purgeEntry(target.entry.uid);
    purgeTarget.value = null;
    await reload();
  } catch (error) {
    purgeError.value = describeError(error);
  } finally {
    busyUid.value = null;
  }
}

/**
 * One sort for the whole page, not one per group: every group shows the same
 * three columns, so "by deletion time" means the same everywhere. The rows are
 * sorted as one flat list and split back into their groups for rendering, which
 * keeps `useTableSort`'s cycle and its German comparator.
 */
interface Located {
  group: TrashGroupDto;
  entry: TrashEntryDto;
}

const flat = computed<Located[]>(() =>
  visibleGroups.value.flatMap((group) => group.entries.map((entry) => ({ group, entry }))),
);

const sort = useTableSort(flat, (row, key) => {
  if (key === 'label') return partText(row.entry.label);
  if (key === 'context') return contextText(row.entry.context);
  return row.entry.deletedAt;
});

// `useTableSort` hands back a reactive object, so `sorted` is already unwrapped.
const entriesOf = (group: TrashGroupDto): TrashEntryDto[] =>
  sort.sorted.filter((row: Located) => row.group.kind === group.kind).map((row) => row.entry);
</script>

<template>
  <section>
    <p class="eu-trash__lead">{{ t('trash.lead') }}</p>

    <div class="eu-trash__head">
      <EuTextField
        v-if="!loading && !loadError && total > 0"
        v-model="filter"
        class="eu-trash__search"
        :label="t('common.search')"
      />
    </div>

    <p v-if="loading" class="eu-trash__hint">{{ t('common.loading') }}</p>
    <p v-else-if="loadError" class="eu-trash__error" role="alert">{{ loadError }}</p>
    <p v-else-if="total === 0" class="eu-trash__hint">{{ t('trash.empty') }}</p>
    <p v-else-if="visibleGroups.length === 0" class="eu-trash__hint" role="status">
      {{ t('common.noMatch') }}
    </p>

    <EuCollapsibleSection
      v-for="group in visibleGroups"
      :key="group.kind"
      :title="t('trash.groupTitle', { kind: kindTitle(group.kind, 2), n: group.entries.length })"
    >
      <div class="eu-trash__table-wrap">
        <table class="eu-trash__table">
          <thead>
            <tr>
              <EuSortableTh
                :label="kindTitle(group.kind)"
                :state="sort.stateOf('label')"
                @sort="sort.toggle('label')"
              />
              <EuSortableTh
                :label="t('trash.columns.context')"
                :state="sort.stateOf('context')"
                @sort="sort.toggle('context')"
              />
              <EuSortableTh
                :label="t('trash.columns.deletedAt')"
                :state="sort.stateOf('deletedAt')"
                @sort="sort.toggle('deletedAt')"
              />
              <th class="eu-trash__actions-head">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="entry in entriesOf(group)" :key="entry.uid">
              <tr>
                <td class="eu-trash__wrap">{{ partText(entry.label) || '–' }}</td>
                <td class="eu-trash__wrap">
                  {{ contextText(entry.context) || '–' }}
                  <span v-if="attachedSummary(entry)" class="eu-trash__attached">
                    {{ attachedSummary(entry) }}
                  </span>
                  <!-- Why there is no restore button, next to what the record
                       says — not in the actions column, where it would push the
                       remaining button over the edge of the scroll container. -->
                  <span v-if="!entry.restorable" class="eu-trash__attached">
                    {{ notRestorableReason(group.kind) }}
                  </span>
                </td>
                <td>
                  {{ entry.deletedAt ? formatDateTime(entry.deletedAt) : t('trash.unknownMoment') }}
                </td>
                <td class="eu-trash__actions">
                  <EuButton
                    v-if="entry.restorable"
                    variant="secondary"
                    icon-only
                    :icon="faRotateLeft"
                    :disabled="busyUid === entry.uid"
                    :aria-label="t('trash.restore', { kind: kindName(group.kind) })"
                    :title="restoreTitle(group, entry)"
                    @click="onRestore(entry)"
                  />
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faTrash"
                    :disabled="busyUid === entry.uid"
                    :aria-label="t('trash.purge', { kind: kindName(group.kind) })"
                    :title="t('trash.purge', { kind: kindName(group.kind) })"
                    @click="
                      purgeTarget = { group, entry };
                      purgeError = null;
                    "
                  />
                </td>
              </tr>
              <tr v-if="rowErrors[entry.uid]">
                <td colspan="4" class="eu-trash__error" role="alert">{{ rowErrors[entry.uid] }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </EuCollapsibleSection>

    <EuDialog
      :open="purgeTarget !== null"
      :title="t('trash.purgeDialog.title')"
      @close="purgeTarget = null"
    >
      <p v-if="purgeTarget">
        {{
          t('trash.purgeDialog.question', {
            entry: namedEntry(purgeTarget.group.kind, purgeTarget.entry.label),
          })
        }}
      </p>
      <p v-if="purgeTarget && attachedList(purgeTarget.entry)">
        {{ t('trash.purgeDialog.alsoDeleted', { list: attachedList(purgeTarget.entry) }) }}
      </p>
      <p v-if="purgeError" class="eu-trash__error" role="alert">{{ purgeError }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="purgeTarget = null">
          {{ t('common.cancel') }}
        </EuButton>
        <EuButton :disabled="busyUid !== null" @click="confirmPurge">
          {{ t('trash.purgeDialog.confirm') }}
        </EuButton>
      </template>
    </EuDialog>
  </section>
</template>

<style scoped>
.eu-trash__lead {
  max-width: 60ch;
  color: var(--eu-color-text-muted);
}

.eu-trash__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
}

.eu-trash__search {
  flex: 1 1 12rem;
  max-width: 20rem;
}

.eu-trash__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-trash__error {
  color: var(--eu-color-error-fg);
  font-family: var(--eu-font-data);
}

/* The focus ring of the action buttons must not be cut off by the scroll
   container, so the wrapper keeps a little room around its content. */
.eu-trash__table-wrap {
  overflow-x: auto;
  padding: 0.25rem;
  margin: -0.25rem;
}

.eu-trash__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}

.eu-trash__table th,
.eu-trash__table td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

.eu-trash__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.eu-trash__table .eu-trash__wrap {
  white-space: normal;
}

.eu-trash__table .eu-trash__actions-head,
.eu-trash__table .eu-trash__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.eu-trash__actions > * + * {
  margin-left: 0.4rem;
}

.eu-trash__attached {
  display: block;
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
}
</style>
