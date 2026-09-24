<script setup lang="ts">
import {
  faCalendarCheck,
  faCalendarDay,
  faCoins,
  faEuroSign,
  faHashtag,
  faHouseMedical,
  faMoneyCheckDollar,
  faReceipt,
  faSackDollar,
} from '@fortawesome/free-solid-svg-icons';
import { computed } from 'vue';

import EuIconLabel from '../design-system/components/EuIconLabel.vue';
import EuPopover from '../design-system/components/EuPopover.vue';
import { euro, germanDate } from '../lib/format';
import type { InvoiceDto } from './api';
import { PAYMENT_COLOR_VAR, calcPaymentState } from './payment';
import PaymentQrPopover from './PaymentQrPopover.vue';

const props = defineProps<{
  invoice: InvoiceDto;
  facilityName: string | null;
  agencyName: string | null;
  bankAccount: string | null;
}>();

const dueColor = computed(() => `var(${PAYMENT_COLOR_VAR[calcPaymentState(props.invoice)]})`);

// Nothing left to transfer, nothing to scan: a paid or cash-settled invoice
// gets no GiroCode. Reuses the traffic light's rule rather than repeating it.
const showQr = computed(
  () =>
    props.bankAccount !== null &&
    props.agencyName !== null &&
    calcPaymentState(props.invoice) !== 'paid',
);
</script>

<template>
  <EuPopover title="Zahlungsinformationen">
    <!-- Forwarded so the caller's own trigger button can carry the popover's
         open state (EuPopover hands it to the slot). -->
    <template #trigger="triggerProps">
      <slot name="trigger" v-bind="triggerProps" />
    </template>

    <!-- Icon + value only, like the reference: the label lives in the icon's
         tooltip (and, for screen readers, in its hidden text), which keeps the
         bubble compact. -->
    <dl class="eu-pay-grid">
      <template v-if="facilityName">
        <dt><EuIconLabel :icon="faHouseMedical" label="Leistungserbringer" /></dt>
        <dd>{{ facilityName }}</dd>
      </template>

      <template v-if="invoice.transferUntilDate">
        <dt><EuIconLabel :icon="faCalendarDay" label="Zahlungsziel" :color="dueColor" /></dt>
        <dd>{{ germanDate(invoice.transferUntilDate) }}</dd>
      </template>

      <template v-if="invoice.transferDate">
        <dt><EuIconLabel :icon="faCalendarCheck" label="Überweisungsdatum" /></dt>
        <dd>{{ germanDate(invoice.transferDate) }}</dd>
      </template>

      <dt><EuIconLabel :icon="faEuroSign" label="Rechnungssumme" /></dt>
      <dd>{{ euro(invoice.invoiceAmount) }}</dd>

      <template v-if="invoice.documentLink">
        <dt><EuIconLabel :icon="faReceipt" label="Dokument" /></dt>
        <dd><a :href="invoice.documentLink" target="_blank" rel="noopener">Dokument öffnen</a></dd>
      </template>

      <template v-if="agencyName">
        <dt><EuIconLabel :icon="faSackDollar" label="Abrechnungsdienstleister / Empfänger" /></dt>
        <dd>{{ agencyName }}</dd>
      </template>

      <template v-if="bankAccount">
        <dt><EuIconLabel :icon="faMoneyCheckDollar" label="IBAN" /></dt>
        <!-- The GiroCode belongs to the IBAN, so it hangs off that row instead
             of claiming one of its own (which would also mean a label column
             entry for something that is not a value). -->
        <dd class="eu-pay-grid__mono eu-pay-grid__iban">
          <span>{{ bankAccount }}</span>
          <PaymentQrPopover
            v-if="showQr"
            :recipient="agencyName ?? ''"
            :iban="bankAccount"
            :amount="invoice.invoiceAmount"
            :subject="invoice.transferSubject"
          />
        </dd>
      </template>

      <template v-if="invoice.transferSubject">
        <dt><EuIconLabel :icon="faHashtag" label="Verwendungszweck" /></dt>
        <dd>{{ invoice.transferSubject }}</dd>
      </template>

      <dt><EuIconLabel :icon="faCoins" label="Barzahlung" /></dt>
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

/* IBAN and its GiroCode button share the value cell; the IBAN keeps the wrap
   the grid gives every other value, the button never shrinks. */
.eu-pay-grid__iban {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.eu-pay-grid__iban > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
