<script setup lang="ts">
import { faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { onMounted, ref } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import { HttpError } from '../lib/http';
import { listResource } from '../lib/resource';
import {
  type AdminUserDto,
  type RoleDto,
  createUser,
  deleteUser,
  listRoles,
  listUsers,
  setAccountRoles,
  setGlobalRoles,
  updateUser,
} from './api';
import RolesOverview from './RolesOverview.vue';
import UserFormDialog, { type UserFormPayload } from './UserFormDialog.vue';

const users = ref<AdminUserDto[]>([]);
const roles = ref<RoleDto[]>([]);
const accountOptions = ref<SelectOption[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const dialogOpen = ref(false);
const editing = ref<AdminUserDto | null>(null);
const busy = ref(false);
const formError = ref<string | null>(null);
const deleteTarget = ref<AdminUserDto | null>(null);
const deleteError = ref<string | null>(null);

function describeError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      const messages = (error.details as Array<{ message?: string }>).map((i) => i.message).filter(Boolean);
      if (messages.length > 0) return messages.join('; ');
    }
    if (error.code === 'CONFLICT') return 'Diese E-Mail-Adresse wird bereits verwendet.';
    if (error.status === 403) return 'Dazu fehlt dir die Berechtigung.';
    return error.message;
  }
  return 'Unerwarteter Fehler.';
}

async function reload(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    users.value = await listUsers();
    roles.value = await listRoles();
    const accounts = await listResource<{ accountUID: string; firstname: string; surname: string | null }>(
      '/accounts',
    );
    accountOptions.value = accounts.map((a) => ({
      value: a.accountUID,
      label: [a.firstname, a.surname].filter(Boolean).join(' '),
    }));
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

function openCreate(): void {
  editing.value = null;
  formError.value = null;
  dialogOpen.value = true;
}
function openEdit(user: AdminUserDto): void {
  editing.value = user;
  formError.value = null;
  dialogOpen.value = true;
}

async function onSubmit(payload: UserFormPayload): Promise<void> {
  busy.value = true;
  formError.value = null;
  try {
    let uuid = editing.value?.uuid;
    if (editing.value) {
      await updateUser(editing.value.uuid, payload.user);
    } else {
      uuid = (
        await createUser({
          email: payload.user.email,
          firstname: payload.user.firstname,
          surname: payload.user.surname,
          password: payload.user.password ?? '',
        })
      ).uuid;
    }
    await setGlobalRoles(uuid!, payload.globalRoleUIDs);
    await setAccountRoles(uuid!, payload.grants);
    dialogOpen.value = false;
    await reload();
  } catch (error) {
    formError.value = describeError(error);
  } finally {
    busy.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  deleteError.value = null;
  try {
    await deleteUser(deleteTarget.value.uuid);
    deleteTarget.value = null;
    await reload();
  } catch (error) {
    deleteError.value = describeError(error);
  }
}
</script>

<template>
  <section>
    <div class="eu-users__head">
      <EuButton :icon="faPlus" @click="openCreate">Neuer Nutzer</EuButton>
    </div>

    <p v-if="loading" class="eu-users__hint">Wird geladen…</p>
    <p v-else-if="loadError" class="eu-users__error" role="alert">{{ loadError }}</p>

    <div v-else class="eu-users__table-wrap">
      <table class="eu-users__table">
        <thead>
          <tr>
            <th>E-Mail</th>
            <th>Name</th>
            <th>Status</th>
            <th>Globale Rollen</th>
            <th>Konto-Zugriffe</th>
            <th class="eu-users__actions-head">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.uuid">
            <td>{{ user.email }}</td>
            <td>{{ [user.firstname, user.surname].filter(Boolean).join(' ') }}</td>
            <td>
              <EuBadge :tone="user.status === 1 ? 'done' : 'neutral'">
                {{ user.status === 1 ? 'Aktiv' : 'Inaktiv' }}
              </EuBadge>
            </td>
            <td>{{ user.globalRoles.join(', ') || '–' }}</td>
            <td>{{ user.accountGrants.length }}</td>
            <td class="eu-users__actions">
              <EuButton
                variant="secondary"
                icon-only
                :icon="faPen"
                aria-label="Bearbeiten"
                title="Nutzer bearbeiten"
                @click="openEdit(user)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faTrash"
                aria-label="Löschen"
                title="Nutzer löschen"
                @click="deleteTarget = user"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <RolesOverview v-if="!loading && !loadError" :roles="roles" />

    <UserFormDialog
      :open="dialogOpen"
      :editing="editing"
      :roles="roles"
      :accounts="accountOptions"
      :submitting="busy"
      :error="formError"
      @close="dialogOpen = false"
      @submit="onSubmit"
    />

    <EuDialog :open="deleteTarget !== null" title="Nutzer löschen" @close="deleteTarget = null">
      <p>Nutzer „{{ deleteTarget?.email }}" wirklich löschen?</p>
      <p v-if="deleteError" class="eu-users__error" role="alert">{{ deleteError }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="deleteTarget = null">Abbrechen</EuButton>
        <EuButton @click="confirmDelete">Löschen</EuButton>
      </template>
    </EuDialog>
  </section>
</template>

<style scoped>
.eu-users__head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
}
.eu-users__hint {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}
.eu-users__error {
  color: var(--eu-color-error-fg);
  font-family: var(--eu-font-data);
}

.eu-users__table-wrap {
  overflow-x: auto;
}
.eu-users__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}
.eu-users__table th,
.eu-users__table td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}
.eu-users__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.eu-users__actions-head {
  text-align: right;
}
.eu-users__actions {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
}
</style>
