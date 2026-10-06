<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import EuBadge from '../design-system/components/EuBadge.vue';
import type { RoleDto } from './api';
import { permissionName, roleDescription, roleName } from './role-names';

defineProps<{ roles: RoleDto[] }>();

const { t } = useI18n();
</script>

<template>
  <section class="eu-roles">
    <h3>{{ t('roles.title') }}</h3>
    <p class="eu-roles__lead">{{ t('roles.lead') }}</p>
    <div v-for="role in roles" :key="role.roleUID" class="eu-roles__card">
      <div class="eu-roles__head">
        <strong>{{ roleName(role.roleName) }}</strong>
        <span v-if="roleDescription(role)" class="eu-roles__desc">{{ roleDescription(role) }}</span>
      </div>
      <div class="eu-roles__perms">
        <!-- The key stays reachable as a tooltip: it is what the API and the
             logs speak, and what an administrator may search for. -->
        <EuBadge v-for="perm in role.permissions" :key="perm" tone="neutral" :title="perm">{{
          permissionName(perm)
        }}</EuBadge>
        <span v-if="role.permissions.length === 0" class="eu-roles__desc">{{
          t('roles.noPermissions')
        }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.eu-roles {
  margin-top: 2rem;
  font-family: var(--eu-font-data);
}
.eu-roles h3 {
  margin: 0 0 0.25rem;
  font-family: var(--eu-font-heading);
}
.eu-roles__lead {
  margin: 0 0 1rem;
  color: var(--eu-color-text-muted);
}
.eu-roles__card {
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
}
.eu-roles__head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.eu-roles__desc {
  color: var(--eu-color-text-muted);
  font-size: 0.9rem;
}
.eu-roles__perms {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
</style>
