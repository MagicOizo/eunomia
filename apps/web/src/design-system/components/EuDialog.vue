<script setup lang="ts">
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { nextTick, onMounted, useId, useTemplateRef, watch } from 'vue';

import EuButton from './EuButton.vue';

/**
 * Wraps the native <dialog> element rather than reimplementing modal
 * semantics by hand: showModal()/close() give us focus trapping, Escape-to-
 * close, and top-layer stacking for free, all of which the first attempt's
 * hand-rolled `.modal-dialog` markup had to (and didn't fully) replicate —
 * see Notes/eunomia-plan.md, 2.7.
 */
const props = defineProps<{ open: boolean; title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const dialogRef = useTemplateRef<HTMLDialogElement>('dialog');
const titleId = useId();

/** Mirrors `open` onto the native element — the only place it is opened or closed. */
function sync(): void {
  const dialog = dialogRef.value;
  if (!dialog) return;
  if (props.open && !dialog.open) {
    dialog.showModal();
    // A dialog always begins at the top (issues.md 13). The element stays
    // mounted between opens — parents toggle `open`, they do not v-if — so the
    // body would otherwise keep the offset it was left with. Whether it does is
    // up to the engine: Chromium drops the offset when the closed dialog turns
    // display:none, Gecko restores it, and the focus below is no safety net
    // (it pulls the first field into view, not the label above it, and a body
    // without a form control is never focused at all). Not before showModal():
    // with display:none there is no layout box and the write is ignored.
    const body = dialog.querySelector<HTMLElement>('.eu-dialog__body');
    if (body) body.scrollTop = 0;
    // showModal() focuses the first focusable element, which is the header
    // close button. Move focus to the first form control in the body instead
    // (e.g. the prefilled name field), skipping the close button.
    void nextTick(() => {
      // Again here: the parents fill their form in this same flush, so the
      // body's height — and with it a restored offset — can still change.
      if (body) body.scrollTop = 0;
      dialog
        .querySelector<HTMLElement>(
          '.eu-dialog__body input, .eu-dialog__body select, .eu-dialog__body textarea',
        )
        ?.focus();
    });
  }
  if (!props.open && dialog.open) dialog.close();
}

watch(() => props.open, sync);
// Not `immediate`: that runs before the template ref exists. A dialog mounted
// with open=true — a v-if whose condition and `open` turn true in the same
// tick — would otherwise never show.
onMounted(sync);
</script>

<template>
  <dialog
    ref="dialog"
    class="eu-dialog"
    :class="{ 'is-wide': wide }"
    :aria-labelledby="titleId"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <header class="eu-dialog__header">
      <h2 :id="titleId" class="eu-dialog__title">{{ title }}</h2>
      <EuButton
        class="eu-dialog__close"
        variant="ghost"
        icon-only
        :icon="faXmark"
        aria-label="Schließen"
        @click="emit('close')"
      />
    </header>
    <div class="eu-dialog__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="eu-dialog__footer">
      <slot name="footer" />
    </footer>
  </dialog>
</template>

<style scoped>
.eu-dialog {
  /* An edge and a shadow: in dark mode the surface sits only a shade above the
     dimmed page behind it, and without them the dialog has no outline at all. */
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5em;
  box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 35%);
  padding: 0;
  color: var(--eu-color-text);
  background-color: var(--eu-color-surface-bg);
  /* A floor as well as a ceiling: without it a short form (two fields and two
     buttons) shrinks to its content and looks cramped. Both clamp to the
     viewport so the dialog never grows wider than a phone screen. */
  min-width: min(30rem, calc(100vw - 2rem));
  max-width: min(32rem, calc(100vw - 2rem));
  /* Never taller than the viewport: header and footer stay put, only the body
     scrolls (see __body). Flex column drives that split. */
  max-height: 90vh;
}

/* The display mask sits wider than the create form on purpose (see
   dialog-design.md), so the floor goes up with the ceiling — otherwise a mask
   with few, short fields is indistinguishable in width from the form. */
.eu-dialog.is-wide {
  min-width: min(38rem, calc(100vw - 2rem));
  max-width: min(44rem, calc(100vw - 2rem));
}

/* Only the OPEN dialog is a flex column. Scoping this to [open] keeps the
   scoped-CSS specificity from overriding the UA `dialog:not([open])
   { display: none }`, which would otherwise leave closed dialogs rendered in
   normal flow (below the footer). */
.eu-dialog[open] {
  display: flex;
  flex-direction: column;
}

.eu-dialog::backdrop {
  background-color: rgb(0 0 0 / 0.5);
}

.eu-dialog__header {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 1em;
  /* extra right padding reserves the corner for the close button */
  padding: 1em 3rem 1em 1.25em;
  border-bottom: 1px solid var(--eu-color-border);
}

/* Close sits in the very top-right corner, like a window close control. */
.eu-dialog__close {
  position: absolute;
  top: 0.3rem;
  right: 0.3rem;
}

.eu-dialog__title {
  margin: 0;
  font-size: 1.125rem;
}

.eu-dialog__body {
  /* The only scrollable region. min-height:0 lets this flex child shrink below
     its content so overflow-y actually kicks in. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25em;
}

.eu-dialog__footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 0.75em;
  padding: 1em 1.25em;
  border-top: 1px solid var(--eu-color-border);
}
</style>
