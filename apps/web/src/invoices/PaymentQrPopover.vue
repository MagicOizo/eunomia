<script setup lang="ts">
import { faQrcode } from '@fortawesome/free-solid-svg-icons';
import QRCode from 'qrcode';
import { ref, watch } from 'vue';

import EuButton from '../design-system/components/EuButton.vue';
import EuPopover from '../design-system/components/EuPopover.vue';
import { formatMoney } from '../lib/format';
import { buildGirocode } from './girocode';

/**
 * The GiroCode for one transfer, behind a fa-qrcode button: scan it with a
 * banking app instead of typing IBAN, amount and reference. Sits next to the
 * IBAN wherever it is shown (payment popover, invoice detail mask), so the
 * data stays readable as text as well — a QR code is an image, and this is the
 * one place in the application where the image carries meaning.
 *
 * The code is built on first open, not on mount: one of these exists per row
 * of the invoice table, and encoding them all up front would be work for codes
 * nobody looks at.
 */
const props = defineProps<{
  /** Beneficiary — the name the transfer is addressed to (see agencies/payment-details.ts). */
  recipient: string;
  iban: string;
  /** Optional in the scheme; an account without one still yields a valid code. */
  bic?: string | null;
  amount: number;
  subject: string | null;
}>();

const requested = ref(false);
const imageUrl = ref<string | null>(null);
/** Why there is no code, as a finished sentence — shown in its place. */
const problem = ref<string | null>(null);

async function generate(): Promise<void> {
  const result = buildGirocode({
    recipient: props.recipient,
    iban: props.iban,
    bic: props.bic,
    amount: props.amount,
    subject: props.subject,
  });
  if (!result.ok) {
    imageUrl.value = null;
    problem.value = result.reason;
    return;
  }

  try {
    // SVG, not toDataURL(): the SVG renderer is plain JS, while the data-URL
    // one needs a canvas — which jsdom does not have, so the component test
    // would silently exercise nothing. Error correction level M is the
    // scheme's requirement.
    const svg = await QRCode.toString(result.payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
    });
    imageUrl.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    problem.value = null;
  } catch {
    imageUrl.value = null;
    problem.value = 'Der GiroCode konnte nicht erzeugt werden.';
  }
}

function onOpen(): void {
  if (requested.value) return;
  requested.value = true;
  void generate();
}

// Picking a different agency in the detail mask changes the beneficiary; only
// refresh a code that has already been asked for.
watch(
  () => [props.recipient, props.iban, props.bic, props.amount, props.subject],
  () => {
    if (requested.value) void generate();
  },
);
</script>

<template>
  <EuPopover title="GiroCode">
    <template #trigger="{ expanded, panelId }">
      <EuButton
        class="eu-girocode__trigger"
        variant="ghost"
        icon-only
        :icon="faQrcode"
        aria-label="GiroCode anzeigen"
        title="GiroCode für die Überweisung anzeigen"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        @click="onOpen"
      />
    </template>

    <div class="eu-girocode">
      <template v-if="imageUrl">
        <img
          class="eu-girocode__image"
          :src="imageUrl"
          :alt="`GiroCode für eine Überweisung von ${formatMoney(amount)} an ${recipient}`"
        />
        <p class="eu-girocode__hint">Mit der Banking-App scannen.</p>
      </template>
      <p v-else-if="problem" class="eu-girocode__hint">{{ problem }}</p>
    </div>
  </EuPopover>
</template>

<style scoped>
/*
 * The trigger sits inside a line of text (the IBAN in the payment popover and
 * in the invoice mask), so it takes that line's size instead of a button's
 * own: at EuButton's 1rem and 0.5em padding it was twice the row height and
 * pushed the row — and with it the label icon opposite — out of the list's
 * rhythm.
 */
.eu-girocode__trigger {
  font-size: inherit;
  padding: 0.15em;
  border-width: 0;
  /* Without this, EuButton's square icon button would still be a hair taller
     than the line and nudge the row. */
  aspect-ratio: auto;
}

.eu-girocode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

/* Own white plate in both themes: the code must not sit on the dark surface
   colour, scanners need the light quiet zone around it. */
.eu-girocode__image {
  width: min(11rem, 100%);
  height: auto;
  padding: 0.5rem;
  border-radius: 0.25rem;
  background-color: #fff;
}

.eu-girocode__hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--eu-color-text-muted);
  text-align: center;
}
</style>
