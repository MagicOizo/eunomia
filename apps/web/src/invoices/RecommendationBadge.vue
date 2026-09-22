<script setup lang="ts">
import EuBadge from '../design-system/components/EuBadge.vue';
import EuTooltip from '../design-system/components/EuTooltip.vue';
import type { InvoiceBadgeView } from './recommendation';

/** The optimizer's advice for an invoice row: a compact badge, the full text as tooltip. */
defineProps<{ badge: InvoiceBadgeView }>();
</script>

<template>
  <EuTooltip plain :text="`Empfehlung: ${badge.tooltip}`">
    <EuBadge compact :tone="badge.tone" :icon="badge.icon">{{ badge.label }}</EuBadge>
  </EuTooltip>
</template>
