<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuTooltip from '../design-system/components/EuTooltip.vue';
import type { InvoiceBadgeView } from './recommendation';

/** The optimizer's advice for an invoice row: a compact badge, the full text as tooltip. */
defineProps<{ badge: InvoiceBadgeView }>();

const { t } = useI18n();
</script>

<template>
  <EuTooltip plain :text="t('invoices.advice.badge', { advice: badge.tooltip })">
    <EuBadge compact :tone="badge.tone" :icon="badge.icon">{{ badge.label }}</EuBadge>
  </EuTooltip>
</template>
