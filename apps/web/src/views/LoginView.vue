<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import logoBlue from '../assets/logo/eunomia-blue.svg';
import logoWhite from '../assets/logo/eunomia-white.svg';
import EuButton from '../design-system/components/EuButton.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { HttpError } from '../lib/http';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
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
        ? t('login.wrongCredentials')
        : t('login.failed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="eu-login">
    <div class="eu-login__brand">
      <img :src="logoBlue" alt="" class="eu-login__logo eu-login__logo--light" />
      <img :src="logoWhite" alt="" class="eu-login__logo eu-login__logo--dark" />
      <span>Eunomia</span>
    </div>
    <p class="eu-login__subtitle">{{ t('login.subtitle') }}</p>

    <form class="eu-login__form" @submit.prevent="submit">
      <!-- The one place the browser's prefill is wanted, so it is asked for by
           name; every other field is left at EuTextField's `off`. -->
      <EuTextField v-model="email" :label="t('login.email')" type="email" autocomplete="username" />
      <EuTextField
        v-model="password"
        :label="t('login.password')"
        type="password"
        autocomplete="current-password"
      />
      <p v-if="error" class="eu-login__error" role="alert">{{ error }}</p>
      <EuButton type="submit" :disabled="busy">
        {{ busy ? t('login.submitting') : t('login.submit') }}
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
  color: var(--eu-color-brand);
}

.eu-login__logo {
  height: 2.75rem;
  width: auto;
}

/* Theme-aware emblem: blue on the light card, white on the dark card. */
.eu-login__logo--dark {
  display: none;
}

@media (prefers-color-scheme: dark) {
  .eu-login__logo--light {
    display: none;
  }
  .eu-login__logo--dark {
    display: inline;
  }
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
