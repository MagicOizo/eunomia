<script setup lang="ts">
import { faCommentDots, faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import type { DetailValue } from '../design-system/components/EuDetailField.vue';
import EuDetailField from '../design-system/components/EuDetailField.vue';
import EuDetailMask from '../design-system/components/EuDetailMask.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuIconLabel from '../design-system/components/EuIconLabel.vue';
import { useDialogAction } from '../lib/dialog-action';
import { NO_PERMISSION } from '../lib/error-messages';
import { describeError } from '../lib/errors';
import { paymentDetailLabel } from './payment-details';
import {
  type AgencyPaymentDetailDto,
  type AgencyPaymentDetailInput,
  type AgencyDto,
  deleteAgencyPaymentDetail,
  getAgency,
  saveAgencyPaymentDetail,
  updateAgency,
} from './api';
import { useAuthStore } from '../stores/auth';
import PaymentDetailFormDialog from './PaymentDetailFormDialog.vue';

/**
 * View/edit a collection agency as a display mask (see dialog-design.md), plus
 * its payment details: an agency holds several side by side, and every invoice
 * names the one it goes to (Slice 44). Opened by ResourceView via
 * ResourceConfig.detailDialog; creating an agency stays the classic form, which
 * records its first set.
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

const auth = useAuthStore();
/**
 * Whether agencies may be written. Instance-wide: an agency belongs to no
 * insured person, so the grant has to be global (Notes/eunomia-plan.md, 2.4).
 */
const mayManage = computed(() => auth.can('MANAGE_AGENCIES'));
/** Why the actions are disabled, or nothing when they are not. */
const noPermission = computed(() => (mayManage.value ? undefined : NO_PERMISSION));

const agency = ref<AgencyDto | null>(null);
const loadError = ref<string | null>(null);
const values = reactive<Record<string, DetailValue>>({});
const saved = reactive<Record<string, DetailValue>>({});
/** The mask's own Save, the payment details and their delete, each on its own. */
const mask = useDialogAction(afterChange);
const entry = useDialogAction(afterChange);
const removal = useDialogAction(afterChange);

/** What every write here does once it went through: reread and tell the list. */
async function afterChange(): Promise<void> {
  await load();
  emit('changed');
}

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
    mask.clear();
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
  const current = agency.value;
  if (!current) return;
  mask.clear();
  if (!str(values.agencyName)) {
    mask.error = 'Bitte einen Namen angeben.';
    return;
  }
  await mask.run(() => updateAgency(current.agencyUID, str(values.agencyName)));
}

// --- Payment details --------------------------------------------------------

const detailDialog = reactive({ open: false, entry: null as AgencyPaymentDetailDto | null });
const pendingDelete = ref<{ uid: string; label: string } | null>(null);

function openPaymentDetail(forEntry: AgencyPaymentDetailDto | null): void {
  entry.clear();
  detailDialog.entry = forEntry;
  detailDialog.open = true;
}

async function saveEntry(payload: AgencyPaymentDetailInput): Promise<void> {
  const current = agency.value;
  if (!current) return;
  await entry.run(
    () =>
      saveAgencyPaymentDetail(
        current.agencyUID,
        detailDialog.entry?.agencyAccountUID ?? null,
        payload,
      ),
    () => (detailDialog.open = false),
  );
}

async function confirmDelete(): Promise<void> {
  const current = agency.value;
  const pending = pendingDelete.value;
  if (!current || !pending) return;
  await removal.run(
    () => deleteAgencyPaymentDetail(current.agencyUID, pending.uid),
    () => (pendingDelete.value = null),
  );
}

/** All of them, in the order the API hands them out: as they were recorded. */
const paymentDetails = computed(() => agency.value?.accounts ?? []);
</script>

<template>
  <EuDialog :open="open" :title="title" wide @close="emit('close')">
    <p v-if="loadError" class="eu-agency__error" role="alert">{{ loadError }}</p>
    <template v-if="agency">
      <EuDetailMask :readonly="!mayManage">
        <EuDetailField
          v-model="values.agencyName"
          :saved-value="saved.agencyName"
          label="Name"
          type="text"
          required
        />
      </EuDetailMask>
      <p v-if="mask.error" class="eu-agency__error" role="alert">{{ mask.error }}</p>

      <section class="eu-agency__block" aria-labelledby="eu-agency-payment-details">
        <div class="eu-agency__block-head">
          <h3 id="eu-agency-payment-details">Kontoverbindungen</h3>
          <EuButton
            variant="secondary"
            :icon="faPlus"
            :disabled="!mayManage"
            :title="noPermission"
            @click="openPaymentDetail(null)"
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
              <tr v-for="detail in paymentDetails" :key="detail.agencyAccountUID">
                <!-- The BIC belongs to the IBAN and is rarely looked at on its
                     own; under it, neither of the two has to break mid-token to
                     fit the dialog. -->
                <td class="eu-agency__iban">
                  {{ paymentDetailLabel(detail) }}
                  <span v-if="detail.bic" class="eu-agency__bic">{{ detail.bic }}</span>
                </td>
                <td>{{ detail.recipientName ?? '–' }}</td>
                <td class="eu-agency__note">
                  <EuIconLabel v-if="detail.note" :icon="faCommentDots" :label="detail.note" />
                  <template v-else>–</template>
                </td>
                <td class="eu-agency__actions">
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faPen"
                    :aria-label="`Kontoverbindung ${paymentDetailLabel(detail)} bearbeiten`"
                    :disabled="!mayManage"
                    :title="noPermission"
                    @click="openPaymentDetail(detail)"
                  />
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faTrash"
                    :aria-label="`Kontoverbindung ${paymentDetailLabel(detail)} löschen`"
                    :disabled="!mayManage"
                    :title="noPermission"
                    @click="
                      pendingDelete = {
                        uid: detail.agencyAccountUID,
                        label: `die Kontoverbindung ${paymentDetailLabel(detail)}`,
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
      <EuButton v-if="mayManage" :disabled="mask.busy || !agency" @click="saveMask">{{
        mask.busy ? 'Speichern…' : 'Speichern'
      }}</EuButton>
    </template>
  </EuDialog>

  <PaymentDetailFormDialog
    :open="detailDialog.open"
    :entry="detailDialog.entry"
    :submitting="entry.busy"
    :error="entry.error"
    @close="detailDialog.open = false"
    @submit="saveEntry"
  />
  <EuDialog
    :open="pendingDelete !== null"
    title="Kontoverbindung löschen"
    @close="pendingDelete = null"
  >
    <p>Soll {{ pendingDelete?.label }} wirklich gelöscht werden?</p>
    <p v-if="removal.error" class="eu-agency__error" role="alert">{{ removal.error }}</p>
    <template #footer>
      <EuButton variant="secondary" @click="pendingDelete = null">Abbrechen</EuButton>
      <EuButton :disabled="removal.busy" @click="confirmDelete">Löschen</EuButton>
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
.eu-agency__table .eu-agency__iban {
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
