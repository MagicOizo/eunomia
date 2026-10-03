import type { InjectionKey, Ref } from 'vue';

/**
 * Whether the surrounding display mask shows its rows without offering to
 * change them — set once on `EuDetailMask`, read by every row inside it
 * (`EuDetailField`, `EuDetailDays`).
 *
 * Provided rather than passed per row because read-only is a property of the
 * mask, not of the field: a user who may read a record but not write it
 * (CR-26) sees *all* of it as text, and saying so fifteen times in a row would
 * be fifteen chances to forget one. A row outside a mask reads `false`.
 */
export const detailMaskReadonly: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol('eu-detail-mask-readonly');
