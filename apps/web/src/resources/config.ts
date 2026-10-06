import type { PermissionKey, RecordKind } from '@eunomia/shared';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { Component } from 'vue';

import type { SelectOption } from '../components/resource/EuSelectField.vue';
import { fieldLabel } from '../lib/field-labels';
import { i18n } from '../lib/i18n';
import { kindName } from '../lib/kind-names';
import type { ResourceRow } from '../lib/resource';

/**
 * A label is a function rather than a string: the configs are built once, and a
 * text read when it is shown follows a change of language (Slice 79). Without
 * one, a field or column is named like the API field it shows (`fields.*`, the
 * same names the error sentences use).
 */
export type LabelFn = () => string;

/** One editable field in a resource form. */
export interface FieldConfig {
  key: string;
  /** Overrides the field's name from `fields.*`, e.g. "Entfernung (km)". */
  label?: LabelFn;
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
   * The canonical written form of the value, for a field whose printed shape is
   * not what is stored — the IBAN of an agency (issues.md 0.15.0-1). Applied
   * when the field is left and again on save, so a field that was filled and
   * never left is sent in the same form as one that was.
   */
  normalize?: (value: string) => string;
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
  /** Overrides the field's name from `fields.*`, e.g. "Beitrag aktuell". */
  label?: LabelFn;
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
 * An action in a row that does not change the record: either it leads somewhere
 * else — "show the invoices of this agency" (Slice 45), rendered as a link so
 * it opens in a new tab like any other — or it runs something, like the account
 * export of Scheibe 18, which fetches a document and hands it to the browser.
 *
 * Exactly one of `to` and `run` is given; a link that also ran something would
 * be two things at once.
 */
export interface RowActionConfig {
  icon: IconDefinition;
  /** The accessible name, naming the record it is about. */
  label: (row: ResourceRow) => string;
  /** Where it leads, as a route path. */
  to?: (row: ResourceRow) => string;
  /** What it does. Its failure is shown in the row, like a failed delete. */
  run?: (row: ResourceRow) => Promise<void>;
  /**
   * What its endpoint asks for beyond being allowed to see the row — all of
   * them, for the row's account (`accountKey`). Without them the button stays
   * visible and disabled, as every other action does (CR-26). Absent where the
   * action asks for nothing the list did not already require.
   */
  permissions?: PermissionKey[];
}

export interface ResourceConfig {
  path: string;
  /** What a row is; names it in headings and buttons (lib/kind-names.ts). */
  kind: RecordKind;
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
   * The record's name for the title of the view/edit mask ("Versicherung: AXA").
   * Without it the title is "<Kind> bearbeiten".
   */
  detailName?: (row: ResourceRow) => string;
  /**
   * Opened instead of the generic form when editing an existing row (create
   * keeps the classic form). Receives `open`, `uid` and the resolved lookup
   * `options`; emits `close`, and `changed` whenever the list should reload.
   */
  detailDialog?: Component;
}

/** The label of a field or column: its own, or the name of the API field it shows. */
export function labelOf(item: { key: string; label?: LabelFn }): string {
  return item.label ? item.label() : fieldLabel(item.key);
}

/** "Police anlegen" — article-neutral, so it reads right for every gender. */
export function createTitle(config: ResourceConfig): string {
  return i18n.global.t('resources.create', { kind: kindName(config.kind) });
}
