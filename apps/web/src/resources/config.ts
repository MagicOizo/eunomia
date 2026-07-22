import type { ResourceRow } from '../lib/resource';

/** One editable field in a resource form. */
export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'date' | 'select';
  required?: boolean;
  /** Not editable once the record exists (rendered read-only in edit mode). */
  immutable?: boolean;
  /** Number input granularity, e.g. '0.01' for money. */
  step?: string;
  /** For `select`: the name of a lookup declared on the resource (see LookupConfig). */
  optionsFrom?: string;
}

/** One column in a resource list. */
export interface ColumnConfig {
  key: string;
  label: string;
  /** Resolve the cell via a lookup (UID → human label) instead of showing the raw value. */
  lookup?: string;
  /** Custom cell formatting (money, units, …). */
  format?: (value: unknown, row: ResourceRow) => string;
}

/** A related resource loaded to resolve foreign-key UIDs to labels and select options. */
export interface LookupConfig {
  path: string;
  idKey: string;
  label: (row: ResourceRow) => string;
}

export interface ResourceConfig {
  path: string;
  /** Singular/plural German labels for headings and buttons. */
  singular: string;
  plural: string;
  /** The row's public id field, used for edit/delete and as the row key. */
  idKey: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  lookups?: Record<string, LookupConfig>;
}
