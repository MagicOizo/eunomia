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
import { bic, formatDate, formatMoney, formatNumber, iban } from '../lib/format';
import { i18n } from '../lib/i18n';
import type { ResourceRow } from '../lib/resource';
import type { ResourceConfig } from './config';

const { t } = i18n.global;

/** A person's display name from an account row. */
function personName(row: ResourceRow): string {
  return [row.firstname, row.surname].filter(Boolean).join(' ');
}

/**
 * Select options from an enum's label map. The map's labels are read when the
 * options are, so the getter-backed maps of contracts/api.ts follow the language.
 */
function optionsOf(labels: Record<string, string>): Array<{ value: string; label: string }> {
  return Object.keys(labels).map((value) => ({
    value,
    get label() {
      return labels[value] ?? value;
    },
  }));
}

const accounts: ResourceConfig = {
  path: '/accounts',
  kind: 'account',
  idKey: 'accountUID',
  managePermission: PERMISSIONS.MANAGE_ACCOUNTS,
  // The row *is* the account, so the grant is checked against its own UID.
  accountKey: 'accountUID',
  createNeedsGlobal: true,
  columns: [{ key: 'firstname' }, { key: 'surname' }, { key: 'birthDate', format: formatDate }],
  fields: [
    { key: 'firstname', type: 'text', required: true },
    { key: 'surname', type: 'text' },
    { key: 'middlename', type: 'text' },
    { key: 'birthDate', type: 'date', required: true },
    { key: 'leadAccountUID', type: 'select', optionsFrom: 'accounts' },
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
      label: (row) => t('resources.accounts.export', { name: personName(row) }),
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
  detailName: personName,
};

const companies: ResourceConfig = {
  path: '/companies',
  kind: 'company',
  idKey: 'companyUID',
  managePermission: PERMISSIONS.MANAGE_COMPANIES,
  columns: [
    { key: 'companyName' },
    { key: 'addressCity' },
    { key: 'serviceHotline', label: () => t('resources.companies.hotline') },
  ],
  fields: [
    { key: 'companyName', type: 'text', required: true },
    { key: 'addressStreet', type: 'text' },
    { key: 'addressPostalCode', type: 'text' },
    { key: 'addressCity', type: 'text' },
    { key: 'serviceHotline', type: 'text' },
    { key: 'url', type: 'text' },
  ],
  detailName: (row) => String(row.companyName ?? ''),
};

const contracts: ResourceConfig = {
  path: '/contracts',
  kind: 'contract',
  idKey: 'contractUID',
  managePermission: PERMISSIONS.MANAGE_CONTRACTS,
  accountKey: 'accountUID',
  // One row per policy; premiums and yearly terms live in the detail dialog.
  columns: [
    { key: 'contractNumber' },
    { key: 'accountUID', lookup: 'accounts' },
    { key: 'companyUID', lookup: 'companies', wrap: true },
    {
      key: 'contractKind',
      format: (value) => CONTRACT_KIND_SHORT_LABEL[value as ContractKind] ?? '–',
    },
    {
      key: 'currentMonthlyPremium',
      label: () => t('resources.contracts.currentPremium'),
      format: formatMoney,
      align: 'right',
    },
    {
      key: 'currentDeductible',
      label: () => t('resources.contracts.currentDeductible'),
      format: formatMoney,
      align: 'right',
    },
    {
      key: 'contractBegin',
      label: () => t('resources.contracts.term'),
      format: (value, row) =>
        row.contractEnd
          ? `${formatDate(value)} – ${formatDate(row.contractEnd)}`
          : t('resources.contracts.since', { date: formatDate(value) }),
    },
  ],
  // Create form only (editing opens ContractDetailDialog). The initial* fields
  // become the first premium and the first yearly terms.
  fields: [
    { key: 'contractNumber', type: 'text', required: true },
    {
      key: 'accountUID',
      type: 'select',
      required: true,
      immutable: true,
      optionsFrom: 'accounts',
      scopedBy: PERMISSIONS.MANAGE_CONTRACTS,
    },
    { key: 'companyUID', type: 'select', required: true, optionsFrom: 'companies' },
    {
      key: 'contractKind',
      type: 'select',
      required: true,
      options: optionsOf(CONTRACT_KIND_LABEL),
      defaultValue: 'FULL',
    },
    { key: 'contractBegin', type: 'date', required: true },
    { key: 'contractEnd', type: 'date' },
    {
      key: 'initialMonthlyPremium',
      label: () => t('resources.contracts.initialMonthlyPremium'),
      type: 'currency',
    },
    {
      key: 'initialBonusRelevantPremium',
      label: () => t('resources.contracts.initialBonusRelevantPremium'),
      type: 'currency',
    },
    {
      key: 'initialDeductible',
      label: () => t('resources.contracts.initialDeductible'),
      type: 'currency',
    },
    {
      key: 'initialReimbursementCap',
      label: () => t('resources.contracts.initialReimbursementCap'),
      type: 'currency',
    },
    {
      key: 'bonusForfeitRule',
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
  kind: 'facility',
  idKey: 'facilityUID',
  managePermission: PERMISSIONS.MANAGE_FACILITIES,
  columns: [
    { key: 'facilityName' },
    {
      key: 'distanceKm',
      format: (value) =>
        value === null || value === undefined
          ? '–'
          : t('common.km', { km: formatNumber(Number(value)) }),
    },
  ],
  fields: [
    { key: 'facilityName', type: 'text', required: true },
    {
      key: 'distanceKm',
      label: () => t('resources.facilities.distanceKm'),
      type: 'number',
      step: '1',
    },
  ],
  rowActions: [
    {
      icon: faFilter,
      label: (row) =>
        t('resources.facilities.showInvoices', { name: String(row.facilityName ?? '') }),
      to: (row) => `/invoices?facility=${String(row.facilityUID ?? '')}`,
    },
  ],
  detailName: (row) => String(row.facilityName ?? ''),
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
  return count > 1
    ? t('resources.agencies.moreAccounts', { iban: printed, n: count - 1 })
    : printed;
}

const agencies: ResourceConfig = {
  path: '/agencies',
  kind: 'agency',
  idKey: 'agencyUID',
  managePermission: PERMISSIONS.MANAGE_AGENCIES,
  columns: [
    { key: 'agencyName' },
    { key: 'bankAccount', format: paymentDetailCell },
    { key: 'recipientName', wrap: true },
  ],
  fields: [
    { key: 'agencyName', type: 'text', required: true },
    // Both are read off a bill in their printed form — the IBAN in groups of
    // four, neither of them necessarily in capitals (issues.md 0.15.0-1).
    { key: 'bankAccount', type: 'text', required: true, normalize: iban },
    { key: 'bic', type: 'text', normalize: bic },
    {
      key: 'recipientName',
      label: () => t('resources.agencies.recipientIfDifferent'),
      type: 'text',
    },
  ],
  // Which invoices go through this agency (issues.md 0.12.0-5) — the filtered
  // invoice list answers it, so the row links there.
  rowActions: [
    {
      icon: faFilter,
      label: (row) => t('resources.agencies.showInvoices', { name: String(row.agencyName ?? '') }),
      to: (row) => `/invoices?agency=${String(row.agencyUID ?? '')}`,
    },
  ],
  detailName: (row) => String(row.agencyName ?? ''),
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
