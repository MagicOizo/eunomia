import type { InvoiceDto } from './api';
import type { WorkflowStatus } from './status';

/**
 * The filter of the invoice search (Slice 45, issues.md 0.12.0-5): what is
 * asked for, how it reads in the URL, and what was asked last.
 *
 * The page used to know one question — "which invoice carries this number?".
 * Since the agencies hold several bank accounts (Slice 44), the questions
 * "which invoices use this agency / this account of it / this provider?" are
 * just as real, and they all want the same answer list. So there is one filter
 * with one result list, and a further reference filter is one more field here.
 *
 * Kept out of the view so the URL mapping and "is anything asked at all?" can
 * be read and tested on their own.
 */

/** The reference filters: a key of the filter and its parameter in the URL. */
export const REFERENCE_KEYS = ['agencyUID', 'agencyAccountUID', 'facilityUID'] as const;

export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

/** The status the list may be narrowed to; '' is "every status". */
export type StatusFilter = '' | 'nicht-erledigt' | WorkflowStatus;

export interface InvoiceFilter {
  /** Substring of the invoice number; below MIN_QUERY_LENGTH it asks nothing. */
  q: string;
  agencyUID: string;
  /** One bank account of that agency; only meaningful with an agency. */
  agencyAccountUID: string;
  facilityUID: string;
  status: StatusFilter;
}

export const EMPTY_FILTER: InvoiceFilter = {
  q: '',
  agencyUID: '',
  agencyAccountUID: '',
  facilityUID: '',
  status: '',
};

/**
 * Below two characters nothing is searched by number — a single digit would
 * match half the archive (Slice 36).
 */
export const MIN_QUERY_LENGTH = 2;

/** Whether the filter asks anything, i.e. whether a result list is shown at all. */
export function isActive(filter: InvoiceFilter): boolean {
  return (
    filter.q.trim().length >= MIN_QUERY_LENGTH ||
    REFERENCE_KEYS.some((key) => filter[key] !== '') ||
    filter.status !== ''
  );
}

/** The statuses the list may be narrowed to, in the order the picker offers them. */
export const STATUS_FILTERS: Array<Exclude<StatusFilter, ''>> = [
  'nicht-erledigt',
  'offen',
  'eingereicht',
  'teilabgerechnet',
  'abgerechnet',
  'erledigt',
];

/**
 * Every field of the filter with the name it carries in the two places it is
 * written down: the address bar, where it stays short and readable, and the
 * API, whose parameters name the columns they filter (`account` is a bank
 * account here, `accountUID` is the insured person there — the two vocabularies
 * do not mix). A further filter is one more line.
 */
const FIELDS = [
  { field: 'q', url: 'q', api: 'q' },
  { field: 'agencyUID', url: 'agency', api: 'agencyUID' },
  { field: 'agencyAccountUID', url: 'account', api: 'agencyAccountUID' },
  { field: 'facilityUID', url: 'facility', api: 'facilityUID' },
  { field: 'status', url: 'status', api: 'status' },
] as const satisfies ReadonlyArray<{ field: keyof InvoiceFilter; url: string; api: string }>;

/** Only what is set, under the names that side uses. */
function query(filter: InvoiceFilter, side: 'url' | 'api'): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of FIELDS) {
    const value = filter[entry.field].trim();
    if (value !== '') result[entry[side]] = value;
  }
  return result;
}

/** One query value as a plain string; a repeated parameter yields an array. */
function one(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : '';
}

/** A status from the URL, or none — an unknown one is not passed on to the API. */
export function asStatus(value: string): StatusFilter {
  return (STATUS_FILTERS as string[]).includes(value) ? (value as StatusFilter) : '';
}

/**
 * The filter a URL asks for. The parameters are short enough to read in the
 * address bar; anything unreadable falls back to "not set".
 */
export function filterFromQuery(query: Record<string, unknown>): InvoiceFilter {
  const filter: InvoiceFilter = {
    q: one(query.q),
    agencyUID: one(query.agency),
    agencyAccountUID: one(query.account),
    facilityUID: one(query.facility),
    status: asStatus(one(query.status)),
  };
  // An account without its agency would filter on something the mask cannot
  // show; the agency is what the list is about.
  if (filter.agencyUID === '') filter.agencyAccountUID = '';
  return filter;
}

/** The URL query for a filter: only what is set, so a bare page stays a bare URL. */
export function queryFromFilter(filter: InvoiceFilter): Record<string, string> {
  return query(filter, 'url');
}

/** The same filter as the API reads it (see FIELDS: the names differ). */
export function apiQueryFromFilter(filter: InvoiceFilter): Record<string, string> {
  return query(filter, 'api');
}

/**
 * The filter last asked for, for the way back: the workspace's back arrow and
 * the menu both lead to a bare `/invoices`, and arriving at an empty page after
 * following a hit would throw the search away. Module state on purpose — it
 * belongs to the session, not to the browser (the app stores nothing there).
 */
let remembered: InvoiceFilter = { ...EMPTY_FILTER };

export function rememberFilter(filter: InvoiceFilter): void {
  remembered = { ...filter };
}

export function rememberedFilter(): InvoiceFilter {
  return { ...remembered };
}

/** The workspace a hit lives in, opened on its year and with the row marked. */
export function hitTarget(
  invoice: Pick<InvoiceDto, 'invoiceUID' | 'accountUID' | 'treatmentDate'>,
): string {
  const year = invoice.treatmentDate.slice(0, 4);
  return `/invoices/${invoice.accountUID}?year=${year}&invoice=${invoice.invoiceUID}`;
}
