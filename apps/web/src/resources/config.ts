import type { PermissionKey } from '@eunomia/shared';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { Component } from 'vue';

import type { SelectOption } from '../components/resource/EuSelectField.vue';
import type { ResourceRow } from '../lib/resource';

/** One editable field in a resource form. */
export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'currency' | 'date' | 'select';
  required?: boolean;
  /** Not editable once the record exists (rendered read-only in edit mode). */
  immutable?: boolean;
  /** Number input granularity, e.g. '0.01' for money. */
  step?: string;
  /** For `select`: the name of a lookup declared on the resource (see LookupConfig). */
  optionsFrom?: string;
  /** For `select`: a fixed option list instead of a lookup (e.g. an enum). */
  options?: SelectOption[];
  /** Initial value in create mode. */
  defaultValue?: string;
  /**
   * For a `select` over accounts: offer only the accounts the user may
   * exercise this permission on. The policy form asks it, so a new policy
   * cannot be started for an insured person whose record the user may read but
   * not write — the 403 would come only after filling the form (CR-26).
   */
  scopedBy?: PermissionKey;
}

/** One column in a resource list. */
export interface ColumnConfig {
  key: string;
  label: string;
  /** Resolve the cell via a lookup (UID → human label) instead of showing the raw value. */
  lookup?: string;
  /** Custom cell formatting (money, units, …). */
  format?: (value: unknown, row: ResourceRow) => string;
  /** Right-align the column (numbers/money), with tabular figures. */
  align?: 'left' | 'right';
  /** Allow line breaks (long names); cells default to a single line. */
  wrap?: boolean;
}

/** A related resource loaded to resolve foreign-key UIDs to labels and select options. */
export interface LookupConfig {
  path: string;
  idKey: string;
  label: (row: ResourceRow) => string;
}

/**
 * An action in a row that leads somewhere else instead of changing the record
 * — e.g. "show the invoices of this agency" (Slice 45). It is rendered as a
 * link, so it opens in a new tab like any other.
 */
export interface RowActionConfig {
  icon: IconDefinition;
  /** The accessible name, naming the record it is about. */
  label: (row: ResourceRow) => string;
  /** Where it leads, as a route path. */
  to: (row: ResourceRow) => string;
}

export interface ResourceConfig {
  path: string;
  /** Singular/plural German labels for headings and buttons. */
  singular: string;
  plural: string;
  /** The row's public id field, used for edit/delete and as the row key. */
  idKey: string;
  /** The permission creating, editing and deleting a row requires (CR-26). */
  managePermission: PermissionKey;
  /**
   * The row field holding the account the permission is about — `accountUID`
   * for policies, the `idKey` itself for the insured persons. Absent for the
   * instance-wide master data (companies, facilities, agencies), which have no
   * account at all (see Notes/eunomia-plan.md, 2.4).
   */
  accountKey?: string;
  /**
   * Creating needs the permission GLOBALLY, not merely for some account. True
   * for the insured persons: a new one has no account to scope the check to, so
   * the API's POST /accounts asks for the global grant.
   */
  createNeedsGlobal?: boolean;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  /** Shown in the actions cell, before editing and deleting. */
  rowActions?: RowActionConfig[];
  lookups?: Record<string, LookupConfig>;
  /**
   * Title of the view/edit mask, naming the record ("Versicherung: AXA").
   * Falls back to "<Singular> bearbeiten".
   */
  detailTitle?: (row: ResourceRow) => string;
  /**
   * Opened instead of the generic form when editing an existing row (create
   * keeps the classic form). Receives `open`, `uid` and the resolved lookup
   * `options`; emits `close`, and `changed` whenever the list should reload.
   */
  detailDialog?: Component;
}
