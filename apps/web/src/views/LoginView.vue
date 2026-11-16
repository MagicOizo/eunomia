<script setup lang="ts">
import { type LoginOptions, OIDC_START_PATH } from '@eunomia/shared';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import logoBlue from '../assets/logo/eunomia-blue.svg';
import logoWhite from '../assets/logo/eunomia-white.svg';
import EuButton from '../design-system/components/EuButton.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import { HttpError } from '../lib/http';
import { FALLBACK_LOGIN_OPTIONS, loadLoginOptions } from '../lib/login-options';
import { oidcLoginErrorText } from '../lib/oidc-login-text';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

/**
 * Until the answer is in, the password form alone — what nearly every instance
 * shows anyway, so the page does not jump; the button joins when it is known.
 */
const options = ref<LoginOptions>(FALLBACK_LOGIN_OPTIONS);

/**
 * The way back from the provider ends here with `?oidcError=<code>` (Slice 88).
 * The sentence is a function so it follows a language switch on the page; the
 * code leaves the address bar at once, or a reload would repeat a failure
 * that is already over.
 */
const oidcError = route.query.oidcError;
const oidcErrorCode = ref<unknown>(
  oidcError === undefined ? null : Array.isArray(oidcError) ? oidcError[0] : oidcError,
);
if (oidcError !== undefined) {
  const query = { ...route.query };
  delete query.oidcError;
  void router.replace({ query });
}

onMounted(async () => {
  options.value = await loadLoginOptions();
});

async function submit(): Promise<void> {
  error.value = null;
  oidcErrorCode.value = null;
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

    <form v-if="options.password" class="eu-login__form" @submit.prevent="submit">
      <!-- The one place the browser's prefill is wanted, so it is asked for by
           name; every other field is left at EuTextField's `off`. -->
      <EuTextField v-model="email" :label="t('login.email')" type="email" autocomplete="username" />
      <EuTextField
        v-model="password"
        :label="t('login.password')"
        type="password"
        autocomplete="current-password"
      />
      <EuButton type="submit" :disabled="busy">
        {{ busy ? t('login.submitting') : t('login.submit') }}
      </EuButton>
    </form>

    <template v-if="options.oidc">
      <p v-if="options.password" class="eu-login__or">{{ t('login.or') }}</p>
      <!-- A link, not a form: the CSP's form-action 'self' would stop Chromium
           from following the API's redirect on to the provider. -->
      <EuButton
        class="eu-login__oidc"
        :href="OIDC_START_PATH"
        :variant="options.password ? 'secondary' : 'primary'"
      >
        {{ options.oidc.label ?? t('login.oidc.button') }}
      </EuButton>
    </template>

    <p v-if="error !== null || oidcErrorCode !== null" class="eu-login__error" role="alert">
      {{ error ?? oidcLoginErrorText(oidcErrorCode) }}
    </p>
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

.eu-login__or {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.25rem 0;
  color: var(--eu-color-text-muted);
  font-size: 0.9rem;
}

/* A rule either side of the word. */
.eu-login__or::before,
.eu-login__or::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--eu-color-border);
}

/* Full width like the submit button above it, the label aligned the same way. */
.eu-login__oidc {
  width: 100%;
}

.eu-login__error {
  margin: 1rem 0 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}
</style>
