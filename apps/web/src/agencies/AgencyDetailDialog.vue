<script setup lang="ts">
import { faCommentDots, faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import type { DetailValue } from '../design-system/components/EuDetailField.vue';
import EuDetailField from '../design-system/components/EuDetailField.vue';
import EuDetailMask from '../design-system/components/EuDetailMask.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuIconLabel from '../design-system/components/EuIconLabel.vue';
import { describeError } from '../lib/errors';
import {
  type AgencyAccountDto,
  type AgencyAccountInput,
  type AgencyDto,
  deleteAgencyAccount,
  getAgency,
  saveAgencyAccount,
  updateAgency,
} from './api';
import AgencyAccountFormDialog from './AgencyAccountFormDialog.vue';

/**
 * View/edit a collection agency as a display mask (see dialog-design.md), plus
 * its bank accounts: an agency holds several side by side, and every invoice
 * names the one it goes to (Slice 44). Opened by ResourceView via
 * ResourceConfig.detailDialog; creating an agency stays the classic form, which
 * records its first account.
 */
const props = defineProps<{
  open: boolean;
  uid: string | null;
  /**
   * Part of the detailDialog contract (see resources/config.ts). An agency has
   * no lookups to resolve, so this stays empty — it is declared all the same,
   * because a fragment root cannot inherit a stray attribute.
   */
  options?: Record<string, unknown>;
}>();

const emit = defineEmits<{ close: []; changed: [] }>();

const agency = ref<AgencyDto | null>(null);
const loadError = ref<string | null>(null);
const values = reactive<Record<string, DetailValue>>({});
const saved = reactive<Record<string, DetailValue>>({});
const saving = ref(false);
const saveError = ref<string | null>(null);

async function load(): Promise<void> {
  if (!props.uid) return;
  loadError.value = null;
  try {
    const dto = await getAgency(props.uid);
    agency.value = dto;
    Object.assign(values, { agencyName: dto.agencyName });
    Object.assign(saved, { agencyName: dto.agencyName });
  } catch (error) {
    loadError.value = describeError(error);
  }
}

watch(
  () => [props.open, props.uid] as const,
  ([open]) => {
    saveError.value = null;
    if (open) void load();
    else agency.value = null;
  },
  { immediate: true },
);

const title = computed(() =>
  agency.value
    ? `Abrechnungsdienstleister: ${agency.value.agencyName}`
    : 'Abrechnungsdienstleister',
);
const str = (value: DetailValue): string => (typeof value === 'string' ? value.trim() : '');

async function saveMask(): Promise<void> {
  if (!agency.value) return;
  saveError.value = null;
  if (!str(values.agencyName)) {
    saveError.value = 'Bitte einen Namen angeben.';
    return;
  }
  saving.value = true;
  try {
    await updateAgency(agency.value.agencyUID, str(values.agencyName));
    await load();
    emit('changed');
  } catch (error) {
    saveError.value = describeError(error);
  } finally {
    saving.value = false;
  }
}

// --- Bank accounts ----------------------------------------------------------

const accountDialog = reactive({ open: false, entry: null as AgencyAccountDto | null });
const entrySaving = ref(false);
const entryError = ref<string | null>(null);
const pendingDelete = ref<{ uid: string; label: string } | null>(null);
const deleteError = ref<string | null>(null);

function openAccount(entry: AgencyAccountDto | null): void {
  entryError.value = null;
  accountDialog.entry = entry;
  accountDialog.open = true;
}

async function saveEntry(payload: AgencyAccountInput): Promise<void> {
  if (!agency.value) return;
  entrySaving.value = true;
  entryError.value = null;
  try {
    await saveAgencyAccount(
      agency.value.agencyUID,
      accountDialog.entry?.agencyAccountUID ?? null,
      payload,
    );
    accountDialog.open = false;
    await load();
    emit('changed');
  } catch (error) {
    entryError.value = describeError(error);
  } finally {
    entrySaving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!agency.value || !pendingDelete.value) return;
  deleteError.value = null;
  try {
    await deleteAgencyAccount(agency.value.agencyUID, pendingDelete.value.uid);
    pendingDelete.value = null;
    await load();
    emit('changed');
  } catch (error) {
    deleteError.value = describeError(error);
  }
}

/** All of them, in the order the API hands them out: as they were recorded. */
const accounts = computed(() => agency.value?.accounts ?? []);
</script>

<template>
  <EuDialog :open="open" :title="title" wide @close="emit('close')">
    <p v-if="loadError" class="eu-agency__error" role="alert">{{ loadError }}</p>
    <template v-if="agency">
      <EuDetailMask>
        <EuDetailField
          v-model="values.agencyName"
          :saved-value="saved.agencyName"
          label="Name"
          type="text"
          required
        />
      </EuDetailMask>
      <p v-if="saveError" class="eu-agency__error" role="alert">{{ saveError }}</p>

      <section class="eu-agency__block" aria-labelledby="eu-agency-accounts">
        <div class="eu-agency__block-head">
          <h3 id="eu-agency-accounts">Kontoverbindungen</h3>
          <EuButton variant="secondary" :icon="faPlus" @click="openAccount(null)"
            >Kontoverbindung hinzufügen</EuButton
          >
        </div>
        <p v-if="agency.accounts.length === 0" class="eu-agency__hint">
          Noch keine Kontoverbindung erfasst.
        </p>
        <div v-else class="eu-agency__scroll eu-scroll-focus-safe">
          <table class="eu-agency__table">
            <thead>
              <tr>
                <th scope="col">IBAN / BIC</th>
                <th scope="col">Empfänger</th>
                <th scope="col">Notiz</th>
                <th scope="col" class="eu-agency__actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in accounts" :key="account.agencyAccountUID">
                <!-- The BIC belongs to the IBAN and is rarely looked at on its
                     own; under it, neither of the two has to break mid-token to
                     fit the dialog. -->
                <td class="eu-agency__account">
                  {{ account.bankAccount }}
                  <span v-if="account.bic" class="eu-agency__bic">{{ account.bic }}</span>
                </td>
                <td>{{ account.recipientName ?? '–' }}</td>
                <td class="eu-agency__note">
                  <EuIconLabel v-if="account.note" :icon="faCommentDots" :label="account.note" />
                  <template v-else>–</template>
                </td>
                <td class="eu-agency__actions">
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faPen"
                    :aria-label="`Kontoverbindung ${account.bankAccount} bearbeiten`"
                    @click="openAccount(account)"
                  />
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faTrash"
                    :aria-label="`Kontoverbindung ${account.bankAccount} löschen`"
                    @click="
                      pendingDelete = {
                        uid: account.agencyAccountUID,
                        label: `die Kontoverbindung ${account.bankAccount}`,
                      }
                    "
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Schließen</EuButton>
      <EuButton :disabled="saving || !agency" @click="saveMask">{{
        saving ? 'Speichern…' : 'Speichern'
      }}</EuButton>
    </template>
  </EuDialog>

  <AgencyAccountFormDialog
    :open="accountDialog.open"
    :entry="accountDialog.entry"
    :submitting="entrySaving"
    :error="entryError"
    @close="accountDialog.open = false"
    @submit="saveEntry"
  />
  <EuDialog
    :open="pendingDelete !== null"
    title="Kontoverbindung löschen"
    @close="pendingDelete = null"
  >
    <p>Soll {{ pendingDelete?.label }} wirklich gelöscht werden?</p>
    <p v-if="deleteError" class="eu-agency__error" role="alert">{{ deleteError }}</p>
    <template #footer>
      <EuButton variant="secondary" @click="pendingDelete = null">Abbrechen</EuButton>
      <EuButton @click="confirmDelete">Löschen</EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-agency__block {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--eu-color-border);
}

.eu-agency__block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.eu-agency__block-head h3 {
  margin: 0;
  font-family: var(--eu-font-heading);
  font-size: 1.05rem;
}

.eu-agency__hint {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-agency__scroll {
  overflow-x: auto;
}

.eu-agency__error {
  margin: 1rem 0 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}

.eu-agency__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}

.eu-agency__table th,
.eu-agency__table td {
  padding: 0.4rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
}

.eu-agency__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Last resort for a very long IBAN: break it rather than push the action
   buttons behind the dialog's edge. `break-word`, not `anywhere`: the latter
   also shrinks the column to min-content, which wraps the IBAN even when the
   dialog has room for it. */
.eu-agency__table .eu-agency__account {
  overflow-wrap: break-word;
}

.eu-agency__bic {
  display: block;
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
}

.eu-agency__table .eu-agency__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.eu-agency__actions button + button {
  margin-left: 0.4rem;
}

/* A recorded note: the bubble carries it, the text itself is the tooltip (and
   the icon's accessible name), so a long note cannot stretch the table. */
.eu-agency__note {
  color: var(--eu-color-text-muted);
}
</style>
