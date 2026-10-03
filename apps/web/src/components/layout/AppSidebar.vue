<script setup lang="ts">
import { faArrowRightFromBracket, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { useRouter } from 'vue-router';

import eunomiaLogo from '../../assets/logo/eunomia-white.svg';
import { mainNav, systemNav } from '../../router/nav';
import { useAuthStore } from '../../stores/auth';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ navigate: [] }>();

const auth = useAuthStore();
const router = useRouter();

async function logout(): Promise<void> {
  await auth.logout();
  emit('navigate');
  await router.push({ name: 'login' });
}
</script>

<template>
  <aside class="eu-sidebar" :class="{ 'eu-sidebar--open': open }">
    <RouterLink
      class="eu-sidebar__brand"
      to="/"
      title="Eunomia Startseite"
      @click="emit('navigate')"
    >
      <img :src="eunomiaLogo" alt="" class="eu-sidebar__logo" />
      <span class="eu-sidebar__wordmark">Eunomia</span>
    </RouterLink>

    <nav class="eu-sidebar__nav" aria-label="Hauptnavigation">
      <ul>
        <li v-for="item in mainNav" :key="item.to">
          <RouterLink :to="item.to" @click="emit('navigate')">
            <FontAwesomeIcon :icon="item.icon" class="eu-sidebar__icon" aria-hidden="true" />
            <span>{{ item.title }}</span>
          </RouterLink>
        </li>
      </ul>

      <template v-if="auth.isAdmin">
        <hr />
        <p class="eu-sidebar__section">System</p>
        <ul>
          <li v-for="item in systemNav" :key="item.to">
            <RouterLink :to="item.to" @click="emit('navigate')">
              <FontAwesomeIcon :icon="item.icon" class="eu-sidebar__icon" aria-hidden="true" />
              <span>{{ item.title }}</span>
            </RouterLink>
          </li>
        </ul>
      </template>
    </nav>

    <div class="eu-sidebar__footer">
      <hr />
      <RouterLink v-if="auth.user" class="eu-sidebar__user" to="/profile" @click="emit('navigate')">
        <FontAwesomeIcon :icon="faUser" aria-hidden="true" />
        <span>{{ auth.user.firstname }}</span>
      </RouterLink>
      <button type="button" class="eu-sidebar__logout" @click="logout">
        <FontAwesomeIcon :icon="faArrowRightFromBracket" aria-hidden="true" />
        <span>Abmelden</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.eu-sidebar {
  display: flex;
  flex-direction: column;
  width: 15rem;
  flex-shrink: 0;
  /* Pinned to the viewport height, so the logout stays in view however long
     the main content gets; a menu taller than the window scrolls on its own. */
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  padding: 1.5rem 1rem;
  color: var(--eu-color-text-inverse);
  background-color: var(--eu-color-sidebar-bg);
}

.eu-sidebar__brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 2rem;
  padding: 0 0.5rem;
  color: var(--eu-color-text-inverse);
  text-decoration: none;
  font-family: var(--eu-font-heading);
  font-size: 1.6rem;
}

.eu-sidebar__logo {
  height: 2.25rem;
  width: auto;
}

.eu-sidebar__nav {
  flex: 1;
}

.eu-sidebar__nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.eu-sidebar__nav a,
.eu-sidebar__logout,
.eu-sidebar__user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  margin: 0.15rem 0;
  border-radius: 0.5rem;
  color: var(--eu-color-text-inverse);
  text-decoration: none;
  font-size: 0.95rem;
}

.eu-sidebar__icon {
  width: 1.2rem;
  text-align: center;
}

.eu-sidebar__nav a:hover {
  background-color: rgb(255 255 255 / 12%);
}

/* Active route: filled accent pill, matching the first attempt's selected state. */
.eu-sidebar__nav a.router-link-active {
  background-color: rgb(255 255 255 / 18%);
  font-family: var(--eu-font-heading);
}

.eu-sidebar__section {
  margin: 0.5rem 0.75rem 0.25rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--eu-color-text-inverse-muted);
}

.eu-sidebar hr {
  border: none;
  border-top: 1px solid rgb(255 255 255 / 20%);
  margin: 1rem 0.25rem;
}

/* The name is the way to one's own account (Slice 7 of the review slices), so
   it answers like the nav links above it — muted until pointed at, and full
   contrast while it is the open page. */
.eu-sidebar__user {
  color: var(--eu-color-text-inverse-muted);
  margin: 0;
}

.eu-sidebar__user:hover {
  background-color: rgb(255 255 255 / 12%);
  color: var(--eu-color-text-inverse);
}

.eu-sidebar__user.router-link-active {
  background-color: rgb(255 255 255 / 18%);
  color: var(--eu-color-text-inverse);
  font-family: var(--eu-font-heading);
}

.eu-sidebar__logout {
  border: none;
  background: none;
  cursor: pointer;
  font-family: var(--eu-font-body);
}

.eu-sidebar__logout:hover {
  background-color: rgb(255 255 255 / 12%);
}

/* Mobile: off-canvas drawer toggled from the header. */
@media (max-width: 48rem) {
  .eu-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 20;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: 0 0 2rem rgb(0 0 0 / 35%);
  }
  .eu-sidebar--open {
    transform: translateX(0);
  }
}
</style>
