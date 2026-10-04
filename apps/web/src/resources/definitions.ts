import { PERMISSIONS } from '@eunomia/shared';
import { faDownload, faFilter } from '@fortawesome/free-solid-svg-icons';

import AgencyDetailDialog from '../agencies/AgencyDetailDialog.vue';
import {
  BONUS_FORFEIT_RULE_LABEL,
  CONTRACT_KIND_LABEL,
  CONTRACT_KIND_SHORT_LABEL,
  type ContractKind,
} from '../contracts/api';
import ContractDetailDialog from '../contracts/ContractDetailDialog.vue';
import { apiData } from '../lib/api';
import { downloadJson, isoToday } from '../lib/download';
import { bic, germanDate, germanMoney, iban } from '../lib/format';
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
  managePermission: PERMISSIONS.MANAGE_ACCOUNTS,
  // The row *is* the account, so the grant is checked against its own UID.
  accountKey: 'accountUID',
  createNeedsGlobal: true,
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
  /**
   * Everything the instance has stored about this person, as a file (SEC-15,
   * Art. 15/20 DSGVO). All three read permissions, not just the one the list
   * itself needs: the document carries the invoices and the billings too, and
   * the endpoint asks for the same three since the decision on B-3
   * (2026-10-04). Without them the button stays here, disabled.
   */
  rowActions: [
    {
      icon: faDownload,
      label: (row) => `Daten von ${personName(row)} exportieren`,
      permissions: [
        PERMISSIONS.VIEW_ACCOUNTS,
        PERMISSIONS.VIEW_INVOICES,
        PERMISSIONS.VIEW_CONTRACTS,
      ],
      run: async (row) => {
        const uid = String(row.accountUID);
        downloadJson(
          `eunomia-export-${uid}-${isoToday()}.json`,
          await apiData<unknown>(`/accounts/${uid}/export`),
        );
      },
    },
  ],
  detailTitle: (row) => `Versicherter: ${personName(row)}`,
};

const companies: ResourceConfig = {
  path: '/companies',
  singular: 'Versicherung',
  plural: 'Versicherungen',
  idKey: 'companyUID',
  managePermission: PERMISSIONS.MANAGE_COMPANIES,
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
  managePermission: PERMISSIONS.MANAGE_CONTRACTS,
  accountKey: 'accountUID',
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
      scopedBy: PERMISSIONS.MANAGE_CONTRACTS,
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
  managePermission: PERMISSIONS.MANAGE_FACILITIES,
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
 *
 * Grouped in fours, like the detail dialog, the picker and now the input field:
 * this column was the one place that printed the stored number raw.
 */
function paymentDetailCell(value: unknown, row: ResourceRow): string {
  const printed = value === null || value === undefined ? '–' : iban(String(value));
  const count = Array.isArray(row.accounts) ? row.accounts.length : 0;
  return count > 1 ? `${printed} (+${count - 1} weitere)` : printed;
}

const agencies: ResourceConfig = {
  path: '/agencies',
  singular: 'Abrechnungsdienstleister',
  plural: 'Abrechnungsdienstleister',
  idKey: 'agencyUID',
  managePermission: PERMISSIONS.MANAGE_AGENCIES,
  columns: [
    { key: 'agencyName', label: 'Name' },
    { key: 'bankAccount', label: 'IBAN', format: paymentDetailCell },
    { key: 'recipientName', label: 'Empfänger', wrap: true },
  ],
  fields: [
    { key: 'agencyName', label: 'Name', type: 'text', required: true },
    // Both are read off a bill in their printed form — the IBAN in groups of
    // four, neither of them necessarily in capitals (issues.md 0.15.0-1).
    { key: 'bankAccount', label: 'IBAN', type: 'text', required: true, normalize: iban },
    { key: 'bic', label: 'BIC', type: 'text', normalize: bic },
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
