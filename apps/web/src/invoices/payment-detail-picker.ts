import { type Ref, ref } from 'vue';

import {
  type AgencyPaymentDetailDto,
  type AgencyPaymentDetailInput,
  saveAgencyPaymentDetail,
} from '../agencies/api';
import {
  defaultPaymentDetail,
  paymentDetailHint,
  paymentDetailLabel,
} from '../agencies/payment-details';
import type { PickerOption } from '../design-system/components/EuEntityPicker.vue';
import { describeError } from '../lib/errors';

/**
 * Picking the payment details an invoice goes to, shared by the create form
 * (InvoiceFormDialog) and the display mask (InvoiceDetailDialog): a collection
 * agency holds several sets, so both masks offer them and both let an unknown
 * one be added on the spot (Slice 44).
 *
 * They come from the parent, which loads every agency with them; a set added
 * here goes into a local copy as well, so it can be picked without waiting for
 * that reload.
 */
export function usePaymentDetailPicker(byAgency: Ref<Record<string, AgencyPaymentDetailDto[]>>) {
  /** The parent's map plus what was added here; refreshed with the parent's. */
  const local = ref<Record<string, AgencyPaymentDetailDto[]>>({ ...byAgency.value });

  const dialogOpen = ref(false);
  const busy = ref(false);
  const error = ref<string | null>(null);
  /** The agency the added details belong to; empty while nothing is being added. */
  const forAgency = ref('');

  /** Takes the parent's map over — a reload knows more than this copy does. */
  function refresh(map: Record<string, AgencyPaymentDetailDto[]>): void {
    local.value = { ...map };
  }

  /** Adds payment details of one agency that the parent does not know about yet. */
  function remember(agencyUID: string, details: AgencyPaymentDetailDto[]): void {
    local.value = { ...local.value, [agencyUID]: details };
  }

  const paymentDetailsOf = (agencyUID: string): AgencyPaymentDetailDto[] =>
    local.value[agencyUID] ?? [];

  /** The picker's options: the IBAN identifies, beneficiary and note tell apart. */
  const optionsOf = (agencyUID: string): PickerOption[] =>
    paymentDetailsOf(agencyUID).map((detail) => ({
      value: detail.agencyAccountUID,
      label: paymentDetailLabel(detail),
      hint: paymentDetailHint(detail),
    }));

  /** What to preselect when an agency is picked: its first set, if any. */
  const suggestionFor = (agencyUID: string): string =>
    defaultPaymentDetail(paymentDetailsOf(agencyUID))?.agencyAccountUID ?? '';

  function start(agencyUID: string): void {
    forAgency.value = agencyUID;
    error.value = null;
    dialogOpen.value = true;
  }

  /**
   * Saves the new details and hands their UID back, so the caller can select
   * them. Null on failure — the dialog then stays open with the reason.
   */
  async function submit(payload: AgencyPaymentDetailInput): Promise<string | null> {
    const agencyUID = forAgency.value;
    if (agencyUID === '') return null;
    busy.value = true;
    error.value = null;
    try {
      const saved = await saveAgencyPaymentDetail(agencyUID, null, payload);
      remember(agencyUID, [...paymentDetailsOf(agencyUID), saved]);
      dialogOpen.value = false;
      return saved.agencyAccountUID;
    } catch (err) {
      error.value = describeError(err);
      return null;
    } finally {
      busy.value = false;
    }
  }

  return {
    dialogOpen,
    busy,
    error,
    paymentDetailsOf,
    optionsOf,
    suggestionFor,
    refresh,
    remember,
    start,
    submit,
  };
}
