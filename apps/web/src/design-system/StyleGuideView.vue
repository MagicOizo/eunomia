<script setup lang="ts">
import {
  faCalendarDay,
  faCircleCheck,
  faCircleHalfStroke,
  faFileInvoiceDollar,
  faHourglassHalf,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons';
import { ref } from 'vue';

import EuBadge from './components/EuBadge.vue';
import EuButton from './components/EuButton.vue';
import EuDialog from './components/EuDialog.vue';
import EuEntityPicker from './components/EuEntityPicker.vue';
import EuIconLabel from './components/EuIconLabel.vue';
import EuTextField from './components/EuTextField.vue';
import EuTooltip from './components/EuTooltip.vue';

const isDialogOpen = ref(false);
const textValue = ref('');
const invalidValue = ref('12,50');
const pickerValue = ref<string | null>(null);
const pickerAction = ref('');
const pickerOptions = [
  { value: 'b-1', label: 'LA-42', hint: '01.04.2025' },
  { value: 'b-2', label: 'LA-43', hint: '12.05.2025' },
];
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
        <EuBadge tone="partial" :icon="faCircleHalfStroke">teilabgerechnet</EuBadge>
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
        <EuEntityPicker
          v-model="pickerValue"
          label="Leistungsabrechnung"
          allow-search
          allow-create
          create-noun="Leistungsabrechnung"
          :options="pickerOptions"
          @search="pickerAction = 'Suche geöffnet'"
          @create="pickerAction = 'Anlegen geöffnet'"
        />
        <p class="eu-style-guide__icon-note">
          Typeahead mit den In-Feld-Aktionen Suchen, Hinzufügen und Löschen (in dieser Reihenfolge).
          Suchen und Hinzufügen melden sich beim Elternteil, das den passenden Dialog
          öffnet<template v-if="pickerAction"> — zuletzt: {{ pickerAction }}</template
          >.
        </p>
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
      <p>
        <EuIconLabel :icon="faCalendarDay" label="Zahlungsziel" />
        <span class="eu-style-guide__icon-note">
          12.05.2026 — <code>EuIconLabel</code> lets an icon stand in for a label where space is
          tight: tooltip on hover and focus, hidden text for screen readers.
        </span>
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

.eu-style-guide__icon-note {
  margin-left: 0.5rem;
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
