<script setup lang="ts">
import { euro, germanDate } from '../lib/format';
import type { InvoiceDto } from './api';

/**
 * The invoices a bulk action is about, at a glance: number, provider, date and
 * amount. Dialogs that act on a selection would otherwise only state a count,
 * leaving the person to trust that they ticked the right rows.
 */
defineProps<{
  invoices: InvoiceDto[];
  /** facilityUID → name; an invoice without a provider shows a dash. */
  facilityNames: Record<string, string>;
}>();
</script>

<template>
  <table class="eu-brief">
    <thead>
      <tr>
        <th scope="col">Nummer</th>
        <th scope="col">Leistungserbringer</th>
        <th scope="col">Datum</th>
        <th scope="col" class="eu-brief__num">Betrag</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="invoice in invoices" :key="invoice.invoiceUID">
        <td class="eu-brief__number">{{ invoice.invoiceNumber }}</td>
        <td>{{ (invoice.facilityUID && facilityNames[invoice.facilityUID]) || '–' }}</td>
        <td>{{ germanDate(invoice.invoiceDate) }}</td>
        <td class="eu-brief__num">{{ euro(invoice.invoiceAmount) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.eu-brief {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}

.eu-brief th,
.eu-brief td {
  padding: 0.3rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
}

.eu-brief th {
  color: var(--eu-color-text-muted);
  font-weight: 600;
  white-space: nowrap;
}

.eu-brief tbody tr:last-child td {
  border-bottom: none;
}

.eu-brief__number {
  font-weight: 600;
}

/* Amounts line up under each other, as everywhere else (Slice 11). */
.eu-brief__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
