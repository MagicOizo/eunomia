<script setup lang="ts">
import { WORKFLOW_STATUSES } from '@eunomia/shared';
import {
  faBan,
  faCircleCheck,
  faPaperPlane,
  faPen,
  faTrash,
  faTriangleExclamation,
  faUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, nextTick, ref, watchEffect } from 'vue';

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import type { AgencyPaymentDetailDto } from '../agencies/api';
import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuSortableTh from '../design-system/components/EuSortableTh.vue';
import { germanDate, germanMoney } from '../lib/format';
import { useTableSort } from '../lib/table-sort';
import type { InvoiceDto } from './api';
import PaymentInfoPopover from './PaymentInfoPopover.vue';
import RecommendationBadge from './RecommendationBadge.vue';
import type { ReimbursementGap } from './reimbursement-gap';
import type { InvoiceBadgeView } from './recommendation';
import { STATUS_DISPLAY } from './status';

/**
 * One invoice, with everything its row shows already looked up. The view builds
 * these — it owns the facilities, agencies, the optimizer's plan and the
 * eligibility rules — and the table only renders and sorts them (CR-30).
 */
export interface InvoiceRowView {
  invoice: InvoiceDto;
  /** Null where the invoice names no provider; the cell then shows a dash. */
  facilityName: string | null;
  agencyName: string | null;
  paymentDetails: AgencyPaymentDetailDto[];
  /** The optimizer's advice, where it has any for this invoice. */
  badge: InvoiceBadgeView | null;
  /** The payment traffic light: icon, colour and label in one bundle. */
  payment: { icon: IconDefinition; color: string; label: string };
  /** A shortfall in the reimbursement, with the sentence that explains it. */
  gap: ReimbursementGap | null;
  /** All treatment days, for the column's tooltip (only when there are several). */
  treatmentTitle: string | undefined;
  treatmentLabel: string;
  /** Why the invoice is marked as not covered, for that badge's tooltip. */
  notCoveredTitle: string | undefined;
  canSubmit: boolean;
  /** A document link a browser may follow (SEC-01) — only then is there a button. */
  hasDocument: boolean;
}

const props = defineProps<{
  rows: InvoiceRowView[];
  /** The selected invoices, by UID; the toolbar above the table acts on them. */
  selected: Set<string>;
  /** The invoice an invoice-number search led here, or null. */
  foundUID: string | null;
}>();

const emit = defineEmits<{
  toggle: [invoice: InvoiceDto];
  toggleAll: [];
  detail: [invoice: InvoiceDto];
  submit: [invoices: InvoiceDto[]];
  settle: [invoice: InvoiceDto];
  remove: [uids: string[]];
  document: [invoice: InvoiceDto];
}>();

function rowSortValue(row: InvoiceRowView, key: string): string | number {
  const invoice = row.invoice;
  switch (key) {
    case 'status':
      return WORKFLOW_STATUSES.indexOf(invoice.workflowStatus); // sort by workflow order, not label
    case 'invoiceDate':
      return invoice.invoiceDate;
    case 'treatmentDate':
      return invoice.treatmentDate;
    case 'number':
      return invoice.invoiceNumber;
    case 'facility':
      return row.facilityName ?? '';
    case 'amount':
      return invoice.invoiceAmount;
    case 'reimbursed':
      return invoice.reimbursedTotal;
    default:
      return '';
  }
}
const sort = useTableSort(
  computed(() => props.rows),
  rowSortValue,
);

const allSelected = computed(
  () =>
    props.rows.length > 0 && props.rows.every((row) => props.selected.has(row.invoice.invoiceUID)),
);
const someSelected = computed(() => props.selected.size > 0 && !allSelected.value);

const selectAllEl = ref<HTMLInputElement | null>(null);
watchEffect(() => {
  if (selectAllEl.value) selectAllEl.value.indeterminate = someSelected.value;
});

/** Holds on to the DOM row of the found invoice, so revealFound() can reach it. */
const foundRow = ref<HTMLTableRowElement | null>(null);
function keepFoundRow(uid: string, el: unknown): void {
  if (uid === props.foundUID) foundRow.value = (el as HTMLTableRowElement | null) ?? null;
}

/**
 * Brings the invoice a search found into view and onto the keyboard: the row
 * carries aria-current, so a screen reader names it as the one meant here. The
 * view says when (once its list is loaded), this says how.
 */
async function revealFound(): Promise<void> {
  await nextTick();
  const row = foundRow.value;
  if (row === null) return;
  // Only the vertical move is wanted: a row wider than the table's scroll
  // container makes both focus() and scrollIntoView() scroll sideways too, and
  // the row then sits flush against the container's edge — exactly where its
  // focus ring gets clipped (the space .eu-scroll-focus-safe reserves).
  const wrap = row.closest('.eu-ws__table-wrap');
  const keepLeft = wrap?.scrollLeft ?? 0;
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: 'center' });
  if (wrap) wrap.scrollLeft = keepLeft;
}

defineExpose({ revealFound });
</script>

<template>
  <div class="eu-ws__table-wrap eu-scroll-focus-safe">
    <table class="eu-ws__table">
      <thead>
        <tr>
          <th>
            <input
              ref="selectAllEl"
              type="checkbox"
              aria-label="Alle auswählen"
              :checked="allSelected"
              @change="emit('toggleAll')"
            />
          </th>
          <EuSortableTh
            label="Status"
            :state="sort.stateOf('status')"
            @sort="sort.toggle('status')"
          />
          <EuSortableTh
            label="Rechnungsdatum"
            :state="sort.stateOf('invoiceDate')"
            @sort="sort.toggle('invoiceDate')"
          />
          <EuSortableTh
            label="Behandlung"
            :state="sort.stateOf('treatmentDate')"
            @sort="sort.toggle('treatmentDate')"
          />
          <EuSortableTh
            label="Nummer"
            :state="sort.stateOf('number')"
            @sort="sort.toggle('number')"
          />
          <EuSortableTh
            label="Leistungserbringer"
            :state="sort.stateOf('facility')"
            @sort="sort.toggle('facility')"
          />
          <EuSortableTh
            label="Betrag"
            align="center"
            :state="sort.stateOf('amount')"
            @sort="sort.toggle('amount')"
          />
          <EuSortableTh
            label="Erstattung"
            align="center"
            :state="sort.stateOf('reimbursed')"
            @sort="sort.toggle('reimbursed')"
          />
          <th class="eu-ws__actions-head">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in sort.sorted"
          :key="row.invoice.invoiceUID"
          :ref="(el) => keepFoundRow(row.invoice.invoiceUID, el)"
          :class="{ 'is-found': row.invoice.invoiceUID === foundUID }"
          :aria-current="row.invoice.invoiceUID === foundUID ? 'true' : undefined"
          :tabindex="row.invoice.invoiceUID === foundUID ? -1 : undefined"
        >
          <td>
            <input
              type="checkbox"
              :aria-label="`Rechnung ${row.invoice.invoiceNumber} auswählen`"
              :checked="selected.has(row.invoice.invoiceUID)"
              @change="emit('toggle', row.invoice)"
            />
          </td>
          <td>
            <div class="eu-ws__badges">
              <EuBadge
                :tone="STATUS_DISPLAY[row.invoice.workflowStatus].tone"
                :icon="STATUS_DISPLAY[row.invoice.workflowStatus].icon"
              >
                {{ STATUS_DISPLAY[row.invoice.workflowStatus].label }}
              </EuBadge>
              <span
                v-if="row.invoice.hasOpenObjection"
                class="eu-ws__objection"
                role="img"
                aria-label="Im Widerspruch"
                title="Im Widerspruch"
              >
                <FontAwesomeIcon :icon="faTriangleExclamation" aria-hidden="true" />
              </span>
              <EuBadge
                v-if="row.invoice.notCovered"
                tone="neutral"
                :icon="faBan"
                :title="row.notCoveredTitle"
              >
                Nicht gedeckt
              </EuBadge>
              <RecommendationBadge v-if="row.badge" :badge="row.badge" />
            </div>
          </td>
          <td>{{ germanDate(row.invoice.invoiceDate) }}</td>
          <td :title="row.treatmentTitle">{{ row.treatmentLabel }}</td>
          <td>{{ row.invoice.invoiceNumber }}</td>
          <td class="eu-ws__facility" :title="row.facilityName ?? undefined">
            {{ row.facilityName ?? '–' }}
          </td>
          <td>
            <div class="eu-ws__amount">
              <span>{{ germanMoney(row.invoice.invoiceAmount) }}</span>
              <PaymentInfoPopover
                :invoice="row.invoice"
                :facility-name="row.facilityName"
                :agency-name="row.agencyName"
                :payment-details="row.paymentDetails"
              >
                <template #trigger="{ expanded, panelId }">
                  <button
                    type="button"
                    class="eu-ws__ampel"
                    :style="{ color: row.payment.color }"
                    :aria-label="`${row.payment.label} – Zahlungsinformationen anzeigen`"
                    :title="`${row.payment.label} – Zahlungsinformationen anzeigen`"
                    :aria-expanded="expanded"
                    :aria-controls="panelId"
                  >
                    <FontAwesomeIcon :icon="row.payment.icon" aria-hidden="true" />
                  </button>
                </template>
              </PaymentInfoPopover>
            </div>
          </td>
          <!-- A tariff excess or a deductible that ate into the reimbursement
               should catch the eye (issues.md 0.12.0-6). The colour never
               says it alone: the same sentence is the cell's tooltip and is
               read out before the figure. -->
          <td
            class="eu-ws__num"
            :class="`is-${row.gap?.tone ?? 'covered'}`"
            :title="row.gap?.label"
          >
            <span v-if="row.gap" class="eu-visually-hidden">{{ row.gap.label }}:</span>
            {{ germanMoney(row.invoice.reimbursedTotal) }}
          </td>
          <td class="eu-ws__actions">
            <EuButton
              v-if="row.hasDocument"
              variant="secondary"
              icon-only
              :icon="faUpRightFromSquare"
              aria-label="Dokument öffnen"
              title="Hinterlegtes Dokument öffnen"
              @click="emit('document', row.invoice)"
            />
            <EuButton
              v-if="row.canSubmit && row.invoice.workflowStatus === 'offen'"
              variant="secondary"
              icon-only
              :icon="faPaperPlane"
              aria-label="Einreichen"
              title="Rechnung bei der Versicherung einreichen"
              @click="emit('submit', [row.invoice])"
            />
            <EuButton
              v-if="row.invoice.workflowStatus !== 'offen' && row.invoice.transferDate === null"
              variant="secondary"
              icon-only
              :icon="faCircleCheck"
              aria-label="Als bezahlt markieren"
              title="Rechnung als bezahlt markieren"
              @click="emit('settle', row.invoice)"
            />
            <EuButton
              variant="secondary"
              icon-only
              :icon="faPen"
              aria-label="Details"
              title="Rechnungsdetails öffnen – bearbeiten, einreichen, abrechnen"
              @click="emit('detail', row.invoice)"
            />
            <EuButton
              variant="secondary"
              icon-only
              :icon="faTrash"
              aria-label="Löschen"
              title="Rechnung löschen"
              @click="emit('remove', [row.invoice.invoiceUID])"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.eu-ws__table-wrap {
  overflow-x: auto;
}

.eu-ws__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}

.eu-ws__table th,
.eu-ws__table td {
  padding: 0.55rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

/* Nine columns of nowrap data did not fit the card at 1440px and pushed the
   actions header out of sight. The headers are the widest part of three of
   those columns, so they — and only they — may break. */
.eu-ws__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: normal;
  hyphens: auto;
}

.eu-ws__table .eu-ws__facility {
  max-width: 13rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Shrink the actions column to its content so the data columns get the rest.
   Prefixed with the table class to outweigh the base `.eu-ws__table td` rule. */
.eu-ws__table .eu-ws__actions-head,
.eu-ws__table .eu-ws__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.eu-ws__actions button + button {
  margin-left: 0.35rem;
}

.eu-ws__amount {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
}

/* The row an invoice-number search led to: a tinted row with an accent bar,
   both from the accent token, so light and dark need no separate rule. */
.eu-ws__table tbody tr.is-found > td {
  background-color: color-mix(in srgb, var(--eu-color-accent) 12%, transparent);
}

.eu-ws__table tbody tr.is-found > td:first-child {
  box-shadow: inset 3px 0 0 0 var(--eu-color-accent);
}

.eu-ws__table .eu-ws__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Closed and still short: what is left is the insured person's own share. */
.eu-ws__table .eu-ws__num.is-short {
  color: var(--eu-color-error-fg);
}

/* Short, but a further policy can still answer. */
.eu-ws__table .eu-ws__num.is-pending {
  color: var(--eu-color-warning-fg);
}

.eu-ws__badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

/* Objection marker: amber warning symbol; the label lives in its title
   tooltip (and accessible name), so it stays compact next to the status. */
.eu-ws__objection {
  color: var(--eu-color-status-submitted-fg);
  font-size: 1rem;
  cursor: help;
}

/* Combined payment-status light + info trigger. Colour is bound inline from the
   payment state; shape (the icon) and the title carry the state without relying
   on colour alone (WCAG 1.4.1). */
.eu-ws__ampel {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  border-radius: 0.25rem;
}

.eu-ws__ampel:focus-visible {
  outline: 2px solid var(--eu-color-focus-ring);
  outline-offset: 1px;
}
</style>
