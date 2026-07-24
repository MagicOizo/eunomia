<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { germanDate } from '../lib/format';
import { listResource } from '../lib/resource';

interface AccountDto {
  accountUID: string;
  firstname: string;
  surname: string | null;
  birthDate: string;
}

const accounts = ref<AccountDto[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    accounts.value = await listResource<AccountDto>('/accounts');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <p class="eu-picker__lead">Für welchen Versicherten möchtest du die Rechnungen ansehen?</p>

    <p v-if="loading" class="eu-picker__hint">Wird geladen…</p>
    <p v-else-if="accounts.length === 0" class="eu-picker__hint">
      Noch keine Versicherten erfasst.
    </p>

    <ul v-else class="eu-picker__grid">
      <li v-for="account in accounts" :key="account.accountUID">
        <RouterLink class="eu-picker__tile" :to="`/invoices/${account.accountUID}`">
          <span class="eu-picker__name">{{ account.firstname }} {{ account.surname }}</span>
          <span class="eu-picker__birth">{{ germanDate(account.birthDate) }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.eu-picker__lead {
  margin: 0 0 1.5rem;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-picker__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-picker__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 1rem;
}

.eu-picker__tile {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.25rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.75rem;
  text-decoration: none;
  color: var(--eu-color-text);
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.eu-picker__tile:hover {
  border-color: var(--eu-color-accent);
  transform: translateY(-2px);
}

.eu-picker__name {
  font-family: var(--eu-font-heading);
  font-size: 1.1rem;
}

.eu-picker__birth {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}
</style>
