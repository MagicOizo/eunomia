import { type Ref, ref } from 'vue';

import { type AgencyAccountDto, type AgencyAccountInput, saveAgencyAccount } from '../agencies/api';
import { accountHint, accountLabel, defaultAccount } from '../agencies/accounts';
import type { PickerOption } from '../design-system/components/EuEntityPicker.vue';
import { describeError } from '../lib/errors';

/**
 * Picking the bank account an invoice goes to, shared by the create form
 * (InvoiceFormDialog) and the display mask (InvoiceDetailDialog): a collection
 * agency holds several accounts, so both masks offer them and both let an
 * unknown one be added on the spot (Slice 44).
 *
 * The accounts come from the parent, which loads every agency with them; an
 * account added here goes into a local copy as well, so it can be picked
 * without waiting for that reload.
 */
export function useAgencyAccountPicker(byAgency: Ref<Record<string, AgencyAccountDto[]>>) {
  /** The parent's map plus what was added here; refreshed with the parent's. */
  const local = ref<Record<string, AgencyAccountDto[]>>({ ...byAgency.value });

  const dialogOpen = ref(false);
  const busy = ref(false);
  const error = ref<string | null>(null);
  /** The agency the added account belongs to; empty while nothing is being added. */
  const forAgency = ref('');

  /** Takes the parent's map over — a reload knows more than this copy does. */
  function refresh(map: Record<string, AgencyAccountDto[]>): void {
    local.value = { ...map };
  }

  /** Adds accounts of one agency that the parent does not know about yet. */
  function remember(agencyUID: string, accounts: AgencyAccountDto[]): void {
    local.value = { ...local.value, [agencyUID]: accounts };
  }

  const accountsOf = (agencyUID: string): AgencyAccountDto[] => local.value[agencyUID] ?? [];

  /** The picker's options: the IBAN identifies, beneficiary and note tell apart. */
  const optionsOf = (agencyUID: string): PickerOption[] =>
    accountsOf(agencyUID).map((account) => ({
      value: account.agencyAccountUID,
      label: accountLabel(account),
      hint: accountHint(account),
    }));

  /** What to preselect when an agency is picked: its first account, if any. */
  const suggestionFor = (agencyUID: string): string =>
    defaultAccount(accountsOf(agencyUID))?.agencyAccountUID ?? '';

  function start(agencyUID: string): void {
    forAgency.value = agencyUID;
    error.value = null;
    dialogOpen.value = true;
  }

  /**
   * Saves the new account and hands its UID back, so the caller can select it.
   * Null on failure — the dialog then stays open with the reason.
   */
  async function submit(payload: AgencyAccountInput): Promise<string | null> {
    const agencyUID = forAgency.value;
    if (agencyUID === '') return null;
    busy.value = true;
    error.value = null;
    try {
      const saved = await saveAgencyAccount(agencyUID, null, payload);
      remember(agencyUID, [...accountsOf(agencyUID), saved]);
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
    accountsOf,
    optionsOf,
    suggestionFor,
    refresh,
    remember,
    start,
    submit,
  };
}
