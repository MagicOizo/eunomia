<script setup lang="ts">
import EuBadge from '../design-system/components/EuBadge.vue';
import type { RoleDto } from './api';

defineProps<{ roles: RoleDto[] }>();
</script>

<template>
  <section class="eu-roles">
    <h3>Rollen</h3>
    <p class="eu-roles__lead">
      Rollen bündeln Rechte. Aktuell fest vorgegeben – eigene Rollen bearbeiten kommt später.
    </p>
    <div v-for="role in roles" :key="role.roleUID" class="eu-roles__card">
      <div class="eu-roles__head">
        <strong>{{ role.roleName }}</strong>
        <span v-if="role.description" class="eu-roles__desc">{{ role.description }}</span>
      </div>
      <div class="eu-roles__perms">
        <EuBadge v-for="perm in role.permissions" :key="perm" tone="neutral">{{ perm }}</EuBadge>
        <span v-if="role.permissions.length === 0" class="eu-roles__desc">Keine Rechte</span>
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
