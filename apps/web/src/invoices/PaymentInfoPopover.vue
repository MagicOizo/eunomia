<script setup lang="ts">
import {
  faCalendarCheck,
  faCalendarDay,
  faCircleCheck,
  faCircleXmark,
  faEuroSign,
  faHashtag,
  faHouseMedical,
  faMoneyCheckDollar,
  faReceipt,
  faSackDollar,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed } from 'vue';

import EuPopover from '../design-system/components/EuPopover.vue';
import { euro, germanDate } from '../lib/format';
import type { InvoiceDto } from './api';
import { PAYMENT_COLOR_VAR, calcPaymentState } from './payment';

const props = defineProps<{
  invoice: InvoiceDto;
  facilityName: string | null;
  agencyName: string | null;
  bankAccount: string | null;
}>();

const dueColor = computed(() => `var(${PAYMENT_COLOR_VAR[calcPaymentState(props.invoice)]})`);
</script>

<template>
  <EuPopover title="Zahlungsinformationen">
    <template #trigger>
      <slot name="trigger" />
    </template>

    <!-- Icon + value only, like the reference: the label lives in the icon's
         title (hover tooltip + accessible name), keeping the bubble compact. -->
    <dl class="eu-pay-grid">
      <template v-if="facilityName">
        <dt><FontAwesomeIcon :icon="faHouseMedical" fixed-width title="Leistungserbringer" /></dt>
        <dd>{{ facilityName }}</dd>
      </template>

      <template v-if="invoice.transferUntilDate">
        <dt><FontAwesomeIcon :icon="faCalendarDay" fixed-width title="Zahlungsziel" :style="{ color: dueColor }" /></dt>
        <dd>{{ germanDate(invoice.transferUntilDate) }}</dd>
      </template>

      <template v-if="invoice.transferDate">
        <dt><FontAwesomeIcon :icon="faCalendarCheck" fixed-width title="Überweisungsdatum" /></dt>
        <dd>{{ germanDate(invoice.transferDate) }}</dd>
      </template>

      <dt><FontAwesomeIcon :icon="faEuroSign" fixed-width title="Rechnungssumme" /></dt>
      <dd>{{ euro(invoice.invoiceAmount) }}</dd>

      <template v-if="invoice.documentLink">
        <dt><FontAwesomeIcon :icon="faReceipt" fixed-width title="Dokument" /></dt>
        <dd><a :href="invoice.documentLink" target="_blank" rel="noopener">Dokument öffnen</a></dd>
      </template>

      <template v-if="agencyName">
        <dt><FontAwesomeIcon :icon="faSackDollar" fixed-width title="Inkasso / Empfänger" /></dt>
        <dd>{{ agencyName }}</dd>
      </template>

      <template v-if="bankAccount">
        <dt><FontAwesomeIcon :icon="faMoneyCheckDollar" fixed-width title="IBAN" /></dt>
        <dd class="eu-pay-grid__mono">{{ bankAccount }}</dd>
      </template>

      <template v-if="invoice.transferSubject">
        <dt><FontAwesomeIcon :icon="faHashtag" fixed-width title="Verwendungszweck" /></dt>
        <dd>{{ invoice.transferSubject }}</dd>
      </template>

      <dt>
        <FontAwesomeIcon
          :icon="invoice.directPayment === 1 ? faCircleCheck : faCircleXmark"
          :class="invoice.directPayment === 1 ? 'eu-pay-grid__yes' : 'eu-pay-grid__no'"
          fixed-width
          title="Barzahlung"
        />
      </dt>
      <dd>{{ invoice.directPayment === 1 ? 'Ja' : 'Nein' }}</dd>
    </dl>
  </EuPopover>
</template>

<style scoped>
.eu-pay-grid {
  display: grid;
  /* Icon column sized to content; minmax(0, 1fr) lets the value column shrink
     below its content and wrap, instead of forcing the popover to overflow
     horizontally (the default `1fr` == `minmax(auto, 1fr)` keeps a min-content
     floor). */
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.75rem;
  row-gap: 0.5rem;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.eu-pay-grid dt {
  color: var(--eu-color-text-muted);
}

.eu-pay-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.eu-pay-grid__mono {
  font-family: var(--eu-font-data);
}

.eu-pay-grid__yes {
  color: var(--eu-color-status-done-fg);
}

.eu-pay-grid__no {
  color: var(--eu-color-status-open-fg);
}
</style>
