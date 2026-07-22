<script setup lang="ts">
import { faScaleBalanced } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import EuButton from '../design-system/components/EuButton.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { HttpError } from '../lib/http';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = null;
  busy.value = true;
  try {
    await auth.login(email.value, password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (err) {
    error.value =
      err instanceof HttpError && err.status === 401
        ? 'E-Mail oder Passwort ist falsch.'
        : 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="eu-login">
    <div class="eu-login__brand">
      <FontAwesomeIcon :icon="faScaleBalanced" aria-hidden="true" />
      <span>Eunomia</span>
    </div>
    <p class="eu-login__subtitle">Verwaltung privater Krankenversicherungs-Abrechnungen</p>

    <form class="eu-login__form" @submit.prevent="submit">
      <EuTextField v-model="email" label="E-Mail" type="email" />
      <EuTextField v-model="password" label="Passwort" type="password" />
      <p v-if="error" class="eu-login__error" role="alert">{{ error }}</p>
      <EuButton type="submit" :disabled="busy">
        {{ busy ? 'Anmelden…' : 'Anmelden' }}
      </EuButton>
    </form>
  </div>
</template>

<style scoped>
.eu-login {
  width: min(24rem, 100%);
  padding: 2rem;
  background-color: var(--eu-color-surface-bg);
  border-radius: 1rem;
  box-shadow: 0 1rem 2rem rgb(0 0 0 / 25%);
}

.eu-login__brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--eu-font-heading);
  font-size: 1.8rem;
  color: var(--eu-color-accent);
}

.eu-login__subtitle {
  margin: 0.5rem 0 1.5rem;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}

.eu-login__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eu-login__error {
  margin: 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
