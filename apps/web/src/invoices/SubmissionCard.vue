<script setup lang="ts">
import {
  faArrowRotateLeft,
  faGavel,
  faPen,
  faPlus,
  faTrash,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import { noPermission } from '../lib/error-messages';
import { formatDate, formatMoney } from '../lib/format';
import type { InvoiceAllocationDto, InvoiceSubmissionDto, PlanInvoicePolicyAction } from './api';
import { policyActionBadge } from './recommendation';
import { SUBMISSION_STATUS_DISPLAY } from './status';

/**
 * One policy the invoice was submitted to: its status, the billings that
 * reimbursed it and the actions that belong to this policy alone. The parent
 * dialog runs the actions and reloads.
 */
const props = defineProps<{
  submission: InvoiceSubmissionDto;
  /** The optimizer's advice for the invoice at this policy, if any. */
  planAction: PlanInvoicePolicyAction | null;
  /** No further reimbursement is expected: the invoice is marked as billed. */
  closed: boolean;
  busy: boolean;
  /** Whether this person's invoices may be written (MANAGE_INVOICES, CR-26). */
  canManage: boolean;
}>();

const emit = defineEmits<{
  bill: [submission: InvoiceSubmissionDto];
  objection: [submission: InvoiceSubmissionDto];
  withdraw: [submission: InvoiceSubmissionDto];
  editAllocation: [allocation: InvoiceAllocationDto];
  removeAllocation: [allocation: InvoiceAllocationDto];
}>();

const { t } = useI18n();

const policy = computed(
  () => `${props.submission.contractNumber} · ${props.submission.companyName}`,
);
const statusDisplay = computed(() => SUBMISSION_STATUS_DISPLAY[props.submission.status]);
const advice = computed(() => (props.planAction ? policyActionBadge(props.planAction) : null));
</script>

<template>
  <article class="eu-card">
    <header class="eu-card__head">
      <h4>
        {{ policy }}
        <span class="eu-card__sub">{{
          t('invoices.submission.submittedOn', { date: formatDate(submission.submittedDate) })
        }}</span>
      </h4>
      <div class="eu-card__badges">
        <EuBadge :tone="statusDisplay.tone" :icon="statusDisplay.icon">
          {{ statusDisplay.label }}
        </EuBadge>
        <EuBadge v-if="advice" compact :tone="advice.tone" :icon="advice.icon">
          {{ advice.label }}
        </EuBadge>
      </div>
    </header>

    <p v-if="submission.allocations.length === 0" class="eu-card__hint">
      {{ t('invoices.submission.noBilling') }}
    </p>
    <ul v-else class="eu-card__list">
      <li v-for="allocation in submission.allocations" :key="allocation.allocationUID">
        <span class="eu-card__billing">
          {{ allocation.billingNumber }}
          <span class="eu-card__sub">
            {{ formatDate(allocation.billingDate)
            }}<template v-if="allocation.receiptNumber">
              ·
              {{ t('invoices.submission.receipt', { number: allocation.receiptNumber }) }}</template
            >
          </span>
        </span>
        <span
          v-if="allocation.objectionOpen"
          class="eu-card__objection"
          role="img"
          :aria-label="t('invoices.submission.inObjection')"
          :title="t('invoices.submission.inObjection')"
        >
          <FontAwesomeIcon :icon="faTriangleExclamation" aria-hidden="true" />
        </span>
        <span class="eu-card__amount">{{ formatMoney(allocation.reimbursement) }}</span>
        <EuButton
          variant="secondary"
          icon-only
          :icon="faPen"
          :aria-label="
            t('invoices.submission.editAllocation', { number: allocation.billingNumber })
          "
          :title="
            canManage
              ? t('invoices.submission.editAllocationHint', { number: allocation.billingNumber })
              : noPermission()
          "
          :disabled="busy || !canManage"
          @click="emit('editAllocation', allocation)"
        />
        <EuButton
          variant="secondary"
          icon-only
          :icon="faTrash"
          :aria-label="
            t('invoices.submission.removeAllocation', { number: allocation.billingNumber })
          "
          :title="
            canManage
              ? t('invoices.submission.removeAllocation', { number: allocation.billingNumber })
              : noPermission()
          "
          :disabled="busy || !canManage"
          @click="emit('removeAllocation', allocation)"
        />
      </li>
    </ul>

    <footer class="eu-card__foot">
      <span class="eu-card__total">
        <span class="eu-card__sub">{{ t('invoices.submission.reimbursed') }}</span>
        {{ formatMoney(submission.reimbursed) }}
      </span>
      <div class="eu-card__actions">
        <EuButton
          v-if="!closed"
          variant="secondary"
          icon-only
          :icon="faPlus"
          :aria-label="t('invoices.submission.bill', { number: submission.contractNumber })"
          :title="
            canManage
              ? t('invoices.submission.billHint', { number: submission.contractNumber })
              : noPermission()
          "
          :disabled="busy || !canManage"
          @click="emit('bill', submission)"
        />
        <EuButton
          v-if="submission.allocations.length > 0"
          variant="secondary"
          icon-only
          :icon="faGavel"
          :aria-label="t('invoices.submission.objection', { number: submission.contractNumber })"
          :title="
            canManage
              ? t('invoices.submission.objectionHint', { number: submission.contractNumber })
              : noPermission()
          "
          :disabled="busy || !canManage"
          @click="emit('objection', submission)"
        />
        <EuButton
          v-if="submission.billingCount === 0"
          variant="secondary"
          icon-only
          :icon="faArrowRotateLeft"
          :aria-label="t('invoices.submission.withdraw', { number: submission.contractNumber })"
          :title="
            canManage
              ? t('invoices.submission.withdraw', { number: submission.contractNumber })
              : noPermission()
          "
          :disabled="busy || !canManage"
          @click="emit('withdraw', submission)"
        />
      </div>
    </footer>
  </article>
</template>

<style scoped>
.eu-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.6rem;
  font-family: var(--eu-font-data);
}

.eu-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.eu-card__head h4 {
  margin: 0;
  font-family: var(--eu-font-heading);
  font-size: 1rem;
}

.eu-card__sub {
  display: block;
  font-family: var(--eu-font-data);
  font-size: 0.8rem;
  font-weight: normal;
  color: var(--eu-color-text-muted);
}

.eu-card__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.eu-card__hint {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-size: 0.9rem;
}

.eu-card__list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.eu-card__list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.eu-card__billing {
  flex: 1;
  min-width: 0;
}

/* Amber warning symbol; its label lives in the title and accessible name, so
   the objection does not rely on colour alone (WCAG 1.4.1). */
.eu-card__objection {
  color: var(--eu-color-status-submitted-fg);
  cursor: help;
}

.eu-card__amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.eu-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.6rem;
}

.eu-card__total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.eu-card__actions {
  display: flex;
  gap: 0.35rem;
}
</style>
