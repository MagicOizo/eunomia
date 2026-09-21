<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';

import { mainNav } from '../router/nav';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
// The nav entries other than the dashboard itself, shown as quick-access cards.
const cards = mainNav.filter((item) => item.to !== '/');
</script>

<template>
  <section>
    <h2 class="eu-dashboard__greeting">
      Willkommen{{ auth.user ? `, ${auth.user.firstname}` : '' }}.
    </h2>
    <p class="eu-dashboard__lead">
      Eunomia begleitet den Weg einer Rechnung von der Erfassung über die Einreichung bei der
      Versicherung bis zur Erstattung. Wähle einen Bereich:
    </p>

    <ul class="eu-dashboard__grid">
      <li v-for="item in cards" :key="item.to">
        <RouterLink class="eu-dashboard__card" :to="item.to">
          <FontAwesomeIcon :icon="item.icon" class="eu-dashboard__icon" aria-hidden="true" />
          <span>{{ item.title }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.eu-dashboard__greeting {
  margin: 0 0 0.25rem;
}

.eu-dashboard__lead {
  margin: 0 0 1.5rem;
  max-width: 42rem;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-dashboard__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 1rem;
}

.eu-dashboard__card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.25rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.75rem;
  text-decoration: none;
  color: var(--eu-color-text);
  font-family: var(--eu-font-heading);
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.eu-dashboard__card:hover {
  border-color: var(--eu-color-accent);
  transform: translateY(-2px);
}

.eu-dashboard__icon {
  font-size: 1.6rem;
  color: var(--eu-color-accent-text);
}
</style>
