import { euro, germanDate } from '../lib/format';
import type { ResourceRow } from '../lib/resource';
import type { ResourceConfig } from './config';

/** A person's display name from an account row. */
function personName(row: ResourceRow): string {
  return [row.firstname, row.surname].filter(Boolean).join(' ');
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
};

const contracts: ResourceConfig = {
  path: '/contracts',
  singular: 'Police',
  plural: 'Policen',
  idKey: 'contractUID',
  columns: [
    { key: 'contractNumber', label: 'Vertragsnummer' },
    { key: 'accountUID', label: 'Versicherter', lookup: 'accounts' },
    { key: 'companyUID', label: 'Versicherung', lookup: 'companies' },
    { key: 'deductible', label: 'Selbstbeteiligung', format: euro, align: 'right' },
    { key: 'bonus', label: 'Bonus', format: euro, align: 'right' },
  ],
  fields: [
    { key: 'contractNumber', label: 'Vertragsnummer', type: 'text', required: true },
    { key: 'accountUID', label: 'Versicherter', type: 'select', required: true, immutable: true, optionsFrom: 'accounts' },
    { key: 'companyUID', label: 'Versicherung', type: 'select', required: true, optionsFrom: 'companies' },
    { key: 'contractBegin', label: 'Vertragsbeginn', type: 'date', required: true },
    { key: 'contractEnd', label: 'Vertragsende', type: 'date' },
    { key: 'deductible', label: 'Selbstbeteiligung (€)', type: 'number', step: '0.01' },
    { key: 'reimbursementCap', label: 'Erstattungsobergrenze (€)', type: 'number', step: '0.01' },
    { key: 'monthlyRate', label: 'Monatsbeitrag (€)', type: 'number', step: '0.01' },
    { key: 'bonus', label: 'Bonus (€)', type: 'number', step: '0.01' },
  ],
  lookups: {
    accounts: { path: '/accounts', idKey: 'accountUID', label: personName },
    companies: { path: '/companies', idKey: 'companyUID', label: (row) => String(row.companyName ?? '') },
  },
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
};

const agencies: ResourceConfig = {
  path: '/agencies',
  singular: 'Abrechnungsdienstleister',
  plural: 'Abrechnungsdienstleister',
  idKey: 'agencyUID',
  columns: [
    { key: 'agencyName', label: 'Name' },
    { key: 'bankAccount', label: 'IBAN' },
  ],
  fields: [
    { key: 'agencyName', label: 'Name', type: 'text', required: true },
    { key: 'bankAccount', label: 'IBAN', type: 'text', required: true },
  ],
};

/** Resource configs keyed by their route path. */
export const resourceConfigs: Record<string, ResourceConfig> = {
  '/accounts': accounts,
  '/companies': companies,
  '/contracts': contracts,
  '/facilities': facilities,
  '/agencies': agencies,
};
