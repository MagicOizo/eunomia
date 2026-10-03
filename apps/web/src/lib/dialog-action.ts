import { reactive, ref } from 'vue';

import { describeError } from './errors';

/**
 * The host's half of the dialog contract (CR-29): a busy flag and an error
 * beside the action that writes, closes the dialog and reloads what it changed.
 * `after` is that reload — it runs on success, once the dialog is closed.
 *
 * A host holds one of these per group of actions, so the form, the delete
 * confirmation and each history block keep their own busy flag and their own
 * error instead of sharing one pair and having to say which it meant.
 *
 * Not every try/catch of the project belongs here: the loaders keep their own
 * `loading`/`loadError` pair, `ObjectionDialog` counts busy per row rather than
 * per dialog, `InvoiceDetailDialog.runBlock` writes into one of several error
 * sinks without closing anything, and `ProfileView` neither closes nor reloads.
 */
export function useDialogAction(after?: () => void | Promise<void>) {
  const busy = ref(false);
  const error = ref<string | null>(null);

  /**
   * Runs one mutating action and says whether it went through. `close` runs on
   * success only and before `after`, so the dialog is gone while the list
   * behind it reloads; `conflictMessage` says a 409 in the caller's own terms
   * (see describeError).
   */
  async function run(
    action: () => Promise<unknown>,
    close?: () => void,
    conflictMessage?: string,
  ): Promise<boolean> {
    busy.value = true;
    error.value = null;
    try {
      await action();
      close?.();
      await after?.();
      return true;
    } catch (caught) {
      error.value = describeError(caught, conflictMessage);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Takes the last error back, for an opener that starts the dialog over. */
  function clear(): void {
    error.value = null;
  }

  // reactive() for the same reason as useTableSort: a host reads `form.busy`
  // and `form.error` straight in its template, which a plain object of refs
  // would hand over unwrapped.
  return reactive({ busy, error, run, clear });
}

/** One group of a host's dialog actions, as useDialogAction hands it over. */
export type DialogAction = ReturnType<typeof useDialogAction>;
