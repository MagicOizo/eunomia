import { faFilter } from '@fortawesome/free-solid-svg-icons';

import AgencyDetailDialog from '../agencies/AgencyDetailDialog.vue';
import {
  BONUS_FORFEIT_RULE_LABEL,
  CONTRACT_KIND_LABEL,
  CONTRACT_KIND_SHORT_LABEL,
  type ContractKind,
} from '../contracts/api';
import ContractDetailDialog from '../contracts/ContractDetailDialog.vue';
import { germanDate, germanMoney } from '../lib/format';
import type { ResourceRow } from '../lib/resource';
import type { ResourceConfig } from './config';

/** A person's display name from an account row. */
function personName(row: ResourceRow): string {
  return [row.firstname, row.surname].filter(Boolean).join(' ');
}

/** Select options from an enum's label map. */
function optionsOf(labels: Record<string, string>): Array<{ value: string; label: string }> {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const accounts: ResourceConfig = {
  path: '/accounts',
  singular: 'Versicherter',
  plural: 'Versicherte',
  idKey: 'accountUID',
  columns: [
    { key: 'firstname', label: 'Vorname' },
    { key: 'surname', label: 'Nachname' },
    { key: 'birthDate', label: 'Geburtsdatum', format: germanDate },
  ],
  fields: [
    { key: 'firstname', label: 'Vorname', type: 'text', required: true },
    { key: 'surname', label: 'Nachname', type: 'text' },
    { key: 'middlename', label: 'Zweiter Vorname', type: 'text' },
    { key: 'birthDate', label: 'Geburtsdatum', type: 'date', required: true },
    { key: 'leadAccountUID', label: 'Hauptversicherter', type: 'select', optionsFrom: 'accounts' },
  ],
  lookups: {
    accounts: { path: '/accounts', idKey: 'accountUID', label: personName },
  },
  detailTitle: (row) => `Versicherter: ${personName(row)}`,
};

const companies: ResourceConfig = {
  path: '/companies',
  singular: 'Versicherung',
  plural: 'Versicherungen',
  idKey: 'companyUID',
  columns: [
    { key: 'companyName', label: 'Name' },
    { key: 'addressCity', label: 'Ort' },
    { key: 'serviceHotline', label: 'Hotline' },
  ],
  fields: [
    { key: 'companyName', label: 'Name', type: 'text', required: true },
    { key: 'addressStreet', label: 'Straße', type: 'text' },
    { key: 'addressPostalCode', label: 'PLZ', type: 'text' },
    { key: 'addressCity', label: 'Ort', type: 'text' },
    { key: 'serviceHotline', label: 'Service-Hotline', type: 'text' },
    { key: 'url', label: 'Website', type: 'text' },
  ],
  detailTitle: (row) => `Versicherung: ${String(row.companyName ?? '')}`,
};

const contracts: ResourceConfig = {
  path: '/contracts',
  singular: 'Police',
  plural: 'Policen',
  idKey: 'contractUID',
  // One row per policy; premiums and yearly terms live in the detail dialog.
  columns: [
    { key: 'contractNumber', label: 'Vertragsnummer' },
    { key: 'accountUID', label: 'Versicherter', lookup: 'accounts' },
    { key: 'companyUID', label: 'Versicherung', lookup: 'companies', wrap: true },
    {
      key: 'contractKind',
      label: 'Art',
      format: (value) => CONTRACT_KIND_SHORT_LABEL[value as ContractKind] ?? '–',
    },
    { key: 'currentMonthlyPremium', label: 'Beitrag aktuell', format: germanMoney, align: 'right' },
    { key: 'currentDeductible', label: 'SB aktuell', format: germanMoney, align: 'right' },
    {
      key: 'contractBegin',
      label: 'Laufzeit',
      format: (value, row) =>
        row.contractEnd
          ? `${germanDate(value)} – ${germanDate(row.contractEnd)}`
          : `seit ${germanDate(value)}`,
    },
  ],
  // Create form only (editing opens ContractDetailDialog). The initial* fields
  // become the first premium and the first yearly terms.
  fields: [
    { key: 'contractNumber', label: 'Vertragsnummer', type: 'text', required: true },
    {
      key: 'accountUID',
      label: 'Versicherter',
      type: 'select',
      required: true,
      immutable: true,
      optionsFrom: 'accounts',
    },
    {
      key: 'companyUID',
      label: 'Versicherung',
      type: 'select',
      required: true,
      optionsFrom: 'companies',
    },
    {
      key: 'contractKind',
      label: 'Art',
      type: 'select',
      required: true,
      options: optionsOf(CONTRACT_KIND_LABEL),
      defaultValue: 'FULL',
    },
    { key: 'contractBegin', label: 'Vertragsbeginn', type: 'date', required: true },
    { key: 'contractEnd', label: 'Vertragsende', type: 'date' },
    { key: 'initialMonthlyPremium', label: 'Monatsbeitrag ab Vertragsbeginn', type: 'currency' },
    { key: 'initialDeductible', label: 'Selbstbeteiligung pro Jahr', type: 'currency' },
    { key: 'initialReimbursementCap', label: 'Erstattungsobergrenze pro Jahr', type: 'currency' },
    {
      key: 'bonusForfeitRule',
      label: 'Bonus verfällt',
      type: 'select',
      required: true,
      options: optionsOf(BONUS_FORFEIT_RULE_LABEL),
      defaultValue: 'ON_REIMBURSEMENT',
    },
  ],
  lookups: {
    accounts: { path: '/accounts', idKey: 'accountUID', label: personName },
    companies: {
      path: '/companies',
      idKey: 'companyUID',
      label: (row) => String(row.companyName ?? ''),
    },
  },
  detailDialog: ContractDetailDialog,
};

const facilities: ResourceConfig = {
  path: '/facilities',
  singular: 'Leistungserbringer',
  plural: 'Leistungserbringer',
  idKey: 'facilityUID',
  columns: [
    { key: 'facilityName', label: 'Name' },
    {
      key: 'distanceKm',
      label: 'Entfernung',
      format: (value) => (value === null || value === undefined ? '–' : `${String(value)} km`),
    },
  ],
  fields: [
    { key: 'facilityName', label: 'Name', type: 'text', required: true },
    { key: 'distanceKm', label: 'Entfernung (km)', type: 'number', step: '1' },
  ],
  rowActions: [
    {
      icon: faFilter,
      label: (row) => `Rechnungen von ${String(row.facilityName ?? '')} anzeigen`,
      to: (row) => `/invoices?facility=${String(row.facilityUID ?? '')}`,
    },
  ],
  detailTitle: (row) => `Leistungserbringer: ${String(row.facilityName ?? '')}`,
};

/**
 * The IBAN column of an agency shows its first payment details — the ones a new
 * invoice is suggested — and says how many others stand beside them (Slice 44). Which
 * an invoice actually goes to is the invoice's own statement.
 */
function paymentDetailCell(value: unknown, row: ResourceRow): string {
  const iban = value === null || value === undefined ? '–' : String(value);
  const count = Array.isArray(row.accounts) ? row.accounts.length : 0;
  return count > 1 ? `${iban} (+${count - 1} weitere)` : iban;
}

const agencies: ResourceConfig = {
  path: '/agencies',
  singular: 'Abrechnungsdienstleister',
  plural: 'Abrechnungsdienstleister',
  idKey: 'agencyUID',
  columns: [
    { key: 'agencyName', label: 'Name' },
    { key: 'bankAccount', label: 'IBAN', format: paymentDetailCell },
    { key: 'recipientName', label: 'Empfänger', wrap: true },
  ],
  fields: [
    { key: 'agencyName', label: 'Name', type: 'text', required: true },
    { key: 'bankAccount', label: 'IBAN', type: 'text', required: true },
    { key: 'bic', label: 'BIC', type: 'text' },
    { key: 'recipientName', label: 'Empfänger (nur wenn abweichend)', type: 'text' },
  ],
  // Which invoices go through this agency (issues.md 0.12.0-5) — the filtered
  // invoice list answers it, so the row links there.
  rowActions: [
    {
      icon: faFilter,
      label: (row) => `Rechnungen über ${String(row.agencyName ?? '')} anzeigen`,
      to: (row) => `/invoices?agency=${String(row.agencyUID ?? '')}`,
    },
  ],
  detailTitle: (row) => `Abrechnungsdienstleister: ${String(row.agencyName ?? '')}`,
  detailDialog: AgencyDetailDialog,
};

/** Resource configs keyed by their route path. */
export const resourceConfigs: Record<string, ResourceConfig> = {
  '/accounts': accounts,
  '/companies': companies,
  '/contracts': contracts,
  '/facilities': facilities,
  '/agencies': agencies,
};
