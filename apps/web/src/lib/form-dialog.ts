import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

/**
 * What every form dialog of the project gets from its host: whether it is
 * shown, whether the host's action is running, and the host's error — the one
 * the API answered with, translated (see errors.ts). The dialogs declare this
 * trio by intersecting it into their own props, so the contract has one place
 * to change when it does (CR-29).
 */
export interface FormDialogProps {
  open: boolean;
  submitting: boolean;
  error: string | null;
}

/** What a dialog needs beside its own fields to run the shared form. */
export interface FormDialog {
  /** The dialog's own complaint — what the fields themselves can tell. */
  localError: Ref<string | null>;
  /** What the dialog shows: the host's error wins, its own stands in. */
  shownError: ComputedRef<string | null>;
  /** States the dialog's own complaint; `return fail('…')` reads as a guard. */
  fail: (message: string) => void;
  /** Takes the complaint back, for a change that answers it. */
  clear: () => void;
}

/**
 * The form every dialog follows: an own error beside the host's, and fields
 * that start over each time the dialog opens — never while it closes, where a
 * reset would empty the fields in front of the user as the dialog fades.
 *
 * `reset` fills the fields from the props; it runs on open and, where `key` is
 * given, whenever that value changes while open (the invoice mask is seeded per
 * opened invoice, not per open). The dialogs stay mounted between opens — their
 * parents toggle `open` rather than `v-if` (see EuDialog) — which is why the
 * seeding hangs on this watcher and not on a lifecycle hook.
 */
export function useFormDialog(
  props: FormDialogProps,
  reset?: () => void | Promise<void>,
  key?: () => unknown,
): FormDialog {
  const localError = ref<string | null>(null);

  watch(
    [() => props.open, () => key?.()],
    ([open]) => {
      if (!open) return;
      localError.value = null;
      void reset?.();
    },
    { immediate: true },
  );

  return {
    localError,
    shownError: computed(() => props.error ?? localError.value),
    fail: (message: string) => {
      localError.value = message;
    },
    clear: () => {
      localError.value = null;
    },
  };
}
