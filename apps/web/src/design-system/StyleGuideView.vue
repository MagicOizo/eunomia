<script setup lang="ts">
import {
  faCircleCheck,
  faFileInvoiceDollar,
  faHourglassHalf,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons';
import { ref } from 'vue';

import EuBadge from './components/EuBadge.vue';
import EuButton from './components/EuButton.vue';
import EuDialog from './components/EuDialog.vue';
import EuTextField from './components/EuTextField.vue';
import EuTooltip from './components/EuTooltip.vue';

const isDialogOpen = ref(false);
const textValue = ref('');
const invalidValue = ref('12,50');
</script>

<template>
  <main class="style-guide">
    <h1>Eunomia Design System</h1>
    <p>
      Living reference for every following UI slice (see Notes/eunomia-plan.md, Slice 1). Colors
      switch automatically between light and dark based on your browser/OS setting — there is no
      in-app toggle by design.
    </p>

    <section>
      <h2>Buttons</h2>
      <div class="row">
        <EuButton variant="primary" :icon="faPaperPlane">Einreichen</EuButton>
        <EuButton variant="secondary">Abbrechen</EuButton>
        <EuButton variant="primary" disabled>Deaktiviert</EuButton>
        <EuButton icon-only :icon="faFileInvoiceDollar" aria-label="Rechnung öffnen" />
      </div>
    </section>

    <section>
      <h2>Status badges</h2>
      <p>Color is always paired with text and an icon — never the only signal (WCAG 1.4.1).</p>
      <div class="row">
        <EuBadge tone="open" :icon="faHourglassHalf">offen</EuBadge>
        <EuBadge tone="submitted" :icon="faPaperPlane">eingereicht</EuBadge>
        <EuBadge tone="billed" :icon="faFileInvoiceDollar">abgerechnet</EuBadge>
        <EuBadge tone="done" :icon="faCircleCheck">erledigt</EuBadge>
      </div>
    </section>

    <section>
      <h2>Form fields</h2>
      <div class="stack">
        <EuTextField v-model="textValue" label="Rechnungsnummer" />
        <EuTextField
          v-model="invalidValue"
          label="Betrag"
          error="Bitte einen gültigen Betrag im Format 0,00 eingeben."
        />
      </div>
    </section>

    <section>
      <h2>Tooltip</h2>
      <p>
        Hover or focus (Tab) this
        <EuTooltip text="Positioniert mit @floating-ui/vue, nicht mit CSS-Anchor-Positioning.">
          <strong>Beispieltext</strong>
        </EuTooltip>
        to see the tooltip — it works with keyboard focus, not only the mouse.
      </p>
    </section>

    <section>
      <h2>Dialog</h2>
      <EuButton variant="primary" @click="isDialogOpen = true">Dialog öffnen</EuButton>
      <EuDialog :open="isDialogOpen" title="Beispiel-Dialog" @close="isDialogOpen = false">
        <p>
          Basiert auf dem nativen <code>&lt;dialog&gt;</code>-Element: Fokus-Trap, Escape zum
          Schließen und Backdrop kommen ohne Zusatzcode.
        </p>
        <template #footer>
          <EuButton variant="secondary" @click="isDialogOpen = false">Schließen</EuButton>
          <EuButton variant="primary" @click="isDialogOpen = false">Speichern</EuButton>
        </template>
      </EuDialog>
    </section>
  </main>
</template>

<style scoped>
.style-guide {
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  background-color: var(--eu-color-surface-bg);
  color: var(--eu-color-text);
  border-radius: 0.5em;
}

section {
  margin-block: 2rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 20rem;
}
</style>
