import { type Ref, ref, watch } from 'vue';

/**
 * State of the "Verwirkt den Bonus" toggle shown when a reimbursement is
 * recorded: it follows `preset` (derived from the policy's rule and the
 * amounts entered) until the user flips it, then keeps the user's choice.
 */
export function usePresetToggle(preset: () => boolean): {
  value: Ref<boolean>;
  set: (next: boolean) => void;
  reset: () => void;
} {
  const value = ref(preset());
  const touched = ref(false);
  watch(preset, (next) => {
    if (!touched.value) value.value = next;
  });
  return {
    value,
    set: (next) => {
      touched.value = true;
      value.value = next;
    },
    reset: () => {
      touched.value = false;
      value.value = preset();
    },
  };
}
