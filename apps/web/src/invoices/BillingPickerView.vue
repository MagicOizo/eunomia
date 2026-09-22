<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { listResource } from '../lib/resource';

interface ContractRow {
  contractUID: string;
  contractNumber: string;
  companyName: string;
  accountUID: string;
}
interface AccountRow {
  accountUID: string;
  firstname: string;
  surname: string | null;
}

const contracts = ref<ContractRow[]>([]);
const personByAccount = ref<Map<string, string>>(new Map());
const loading = ref(true);

const tiles = computed(() =>
  contracts.value.map((c) => ({
    contractUID: c.contractUID,
    contractNumber: c.contractNumber,
    companyName: c.companyName,
    person: personByAccount.value.get(c.accountUID) ?? '',
  })),
);

onMounted(async () => {
  try {
    const [contractRows, accountRows] = await Promise.all([
      listResource<ContractRow>('/contracts'),
      listResource<AccountRow>('/accounts'),
    ]);
    personByAccount.value = new Map(
      accountRows.map((a) => [a.accountUID, [a.firstname, a.surname].filter(Boolean).join(' ')]),
    );
    contracts.value = contractRows;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <p class="eu-picker__lead">
      Für welchen Vertrag möchtest du die Leistungsabrechnungen ansehen?
    </p>

    <p v-if="loading" class="eu-picker__hint">Wird geladen…</p>
    <p v-else-if="tiles.length === 0" class="eu-picker__hint">Noch keine Verträge erfasst.</p>

    <ul v-else class="eu-picker__grid">
      <li v-for="tile in tiles" :key="tile.contractUID">
        <RouterLink class="eu-picker__tile" :to="`/billings/${tile.contractUID}`">
          <span class="eu-picker__name">{{ tile.contractNumber }}</span>
          <span class="eu-picker__person">{{ tile.companyName }} · {{ tile.person }}</span>
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

.eu-picker__person {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}
</style>
