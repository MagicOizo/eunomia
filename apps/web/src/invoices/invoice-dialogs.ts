import { reactive, ref } from 'vue';

import type { DialogAction } from '../lib/dialog-action';
import type { InvoiceDto } from './api';

/**
 * The invoice workspace's dialogs: which one is open and on what. Eight states
 * and six openers that all do the same three things — remember the target, take
 * back the error the host is still showing, open — which is why they sit here
 * rather than in the view (CR-30).
 *
 * `action` is the host's write group (useDialogAction): the openers clear its
 * error, the dialogs read its busy flag, and closing is the view's own business
 * — it happens where the write succeeds.
 */
export function useInvoiceDialogs(action: DialogAction) {
  /** The create form; the display mask is what an existing invoice opens in. */
  const formOpen = ref(false);
  const editing = ref<InvoiceDto | null>(null);
  const detailOpen = ref(false);
  const submitOpen = ref(false);
  const submitTargets = ref<InvoiceDto[]>([]);
  const billingOpen = ref(false);
  const billingTargets = ref<InvoiceDto[]>([]);
  const settleOpen = ref(false);
  /** The one invoice the mask and the settle dialog act on. */
  const invoice = ref<InvoiceDto | null>(null);
  /** The pending delete; its length is what opens the confirmation. */
  const deleteTargets = ref<string[]>([]);

  function openCreate(): void {
    editing.value = null;
    action.clear();
    formOpen.value = true;
  }

  /** Editing opens the display-mask detail dialog; creating keeps the classic form. */
  function openDetail(target: InvoiceDto): void {
    invoice.value = target;
    action.clear();
    detailOpen.value = true;
  }

  function openSubmit(targets: InvoiceDto[]): void {
    submitTargets.value = targets;
    action.clear();
    submitOpen.value = true;
  }

  function openBilling(targets: InvoiceDto[]): void {
    billingTargets.value = targets;
    action.clear();
    billingOpen.value = true;
  }

  function openSettle(target: InvoiceDto): void {
    invoice.value = target;
    action.clear();
    settleOpen.value = true;
  }

  function openDelete(uids: string[]): void {
    deleteTargets.value = uids;
    action.clear();
  }

  // reactive() for the same reason as useTableSort: the view reads
  // `dialogs.detailOpen` straight in its template.
  return reactive({
    formOpen,
    editing,
    detailOpen,
    submitOpen,
    submitTargets,
    billingOpen,
    billingTargets,
    settleOpen,
    invoice,
    deleteTargets,
    openCreate,
    openDetail,
    openSubmit,
    openBilling,
    openSettle,
    openDelete,
  });
}
