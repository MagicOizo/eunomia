import { ref } from 'vue';

import type { PickerOption } from '../design-system/components/EuEntityPicker.vue';
import { describeError } from '../lib/errors';
import { HttpError } from '../lib/http';
import { i18n } from '../lib/i18n';
import { type ResourceRow, createResource } from '../lib/resource';
import type { ResourceConfig } from '../resources/config';
import { resourceConfigs } from '../resources/definitions';

/**
 * Ad-hoc create of the two entities an invoice points at, shared by the create
 * form (InvoiceFormDialog) and the display mask (InvoiceDetailDialog): the
 * picker's "‹typed name› hinzufügen" opens the resource's own create form as a
 * sub-dialog, and the saved row is selected right away. New insured persons are
 * deliberately not creatable this way (dialog-design.md).
 */
export type CreateKind = 'facility' | 'agency';

export const CREATE_KINDS: Record<CreateKind, { path: string; config: ResourceConfig }> = {
  facility: { path: '/facilities', config: resourceConfigs['/facilities'] },
  agency: { path: '/agencies', config: resourceConfigs['/agencies'] },
};

/**
 * State and handlers for the sub-dialog. `onCreated` receives the saved row as
 * a picker option, so the caller only has to put it into its own list and
 * field, and the row itself — a new agency carries its first bank account, and
 * that account is what the invoice is then suggested (Slice 44).
 */
export function useEntityCreate(
  onCreated: (kind: CreateKind, option: PickerOption, row: ResourceRow) => void,
) {
  const open = ref(false);
  const kind = ref<CreateKind>('facility');
  const prefill = ref<Record<string, string>>({});
  const busy = ref(false);
  const error = ref<string | null>(null);

  /** Opens the create form for `forKind`, seeded with what was typed into the picker. */
  function start(forKind: CreateKind, query: string): void {
    kind.value = forKind;
    // The first column is the entity's name — the field the typed text belongs in.
    prefill.value = { [CREATE_KINDS[forKind].config.columns[0].key]: query };
    error.value = null;
    open.value = true;
  }

  async function submit(payload: Record<string, unknown>): Promise<void> {
    const target = CREATE_KINDS[kind.value];
    busy.value = true;
    error.value = null;
    try {
      const row = await createResource(target.path, payload);
      onCreated(
        kind.value,
        {
          value: String(row[target.config.idKey]),
          label: String(row[target.config.columns[0].key]),
        },
        row,
      );
      open.value = false;
    } catch (err) {
      error.value =
        err instanceof HttpError ? describeError(err) : i18n.global.t('invoices.createFailed');
    } finally {
      busy.value = false;
    }
  }

  return { open, kind, prefill, busy, error, start, submit };
}
