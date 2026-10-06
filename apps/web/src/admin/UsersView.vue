<script setup lang="ts">
import { faPen, faPlus, faRotateLeft, faTrash } from '@fortawesome/free-solid-svg-icons';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import EuCollapsibleSection from '../design-system/components/EuCollapsibleSection.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuSortableTh from '../design-system/components/EuSortableTh.vue';
import type { SelectOption } from '../components/resource/EuSelectField.vue';
import { useDialogAction } from '../lib/dialog-action';
import { describeError } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { listResource } from '../lib/resource';
import { useTableSort } from '../lib/table-sort';
import {
  type AdminUserDto,
  type RoleDto,
  createUser,
  deleteUser,
  listRoles,
  listUsers,
  purgeUser,
  restoreUser,
  setAccountRoles,
  setGlobalRoles,
  updateUser,
} from './api';
import { roleName } from './role-names';
import RolesOverview from './RolesOverview.vue';
import UserFormDialog, { type UserFormPayload } from './UserFormDialog.vue';

const { t } = useI18n();

const users = ref<AdminUserDto[]>([]);
/**
 * The list carries the deleted users too (`status === -1`), so the two tables
 * below come out of one request. Everywhere else in the app a deleted user is
 * simply gone.
 */
const active = computed(() => users.value.filter((user) => user.status !== -1));
const deleted = computed(() => users.value.filter((user) => user.status === -1));
const roles = ref<RoleDto[]>([]);
const accountOptions = ref<SelectOption[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const dialogOpen = ref(false);
const editing = ref<AdminUserDto | null>(null);
const deleteTarget = ref<AdminUserDto | null>(null);
const purgeTarget = ref<AdminUserDto | null>(null);

/** The same sentence for both: the e-mail address is what can collide. */
const DUPLICATE_EMAIL = (): string => t('users.duplicateEmail');
const form = useDialogAction(reload);
const removal = useDialogAction(reload);
const purge = useDialogAction(reload);
/** Per-row error in the deleted table, keyed by UUID, as the trash does it. */
const rowErrors = ref<Record<string, string>>({});
const busyUuid = ref<string | null>(null);

function userSortValue(u: AdminUserDto, key: string): string | number {
  switch (key) {
    case 'email':
      return u.email;
    case 'name':
      return [u.firstname, u.surname].filter(Boolean).join(' ');
    case 'status':
      return u.status;
    case 'roles':
      return u.globalRoles.map(roleName).join(', ');
    case 'grants':
      return u.accountGrants.length;
    default:
      return '';
  }
}
const sort = useTableSort(active, userSortValue);

async function reload(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    users.value = await listUsers(true);
    roles.value = await listRoles();
    const accounts = await listResource<{
      accountUID: string;
      firstname: string;
      surname: string | null;
    }>('/accounts');
    accountOptions.value = accounts.map((a) => ({
      value: a.accountUID,
      label: [a.firstname, a.surname].filter(Boolean).join(' '),
    }));
  } catch (error) {
    loadError.value = describeError(error, DUPLICATE_EMAIL());
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

function openCreate(): void {
  editing.value = null;
  form.clear();
  dialogOpen.value = true;
}
function openEdit(user: AdminUserDto): void {
  editing.value = user;
  form.clear();
  dialogOpen.value = true;
}

async function onSubmit(payload: UserFormPayload): Promise<void> {
  await form.run(
    async () => {
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
    },
    () => (dialogOpen.value = false),
    DUPLICATE_EMAIL(),
  );
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) return;
  await removal.run(
    () => deleteUser(target.uuid),
    () => (deleteTarget.value = null),
    DUPLICATE_EMAIL(),
  );
}

/**
 * Brings a deleted user back. It returns deactivated, which the sentence in the
 * table says — nobody should have to guess whether a login works again.
 */
async function restore(user: AdminUserDto): Promise<void> {
  rowErrors.value = { ...rowErrors.value, [user.uuid]: '' };
  busyUuid.value = user.uuid;
  try {
    await restoreUser(user.uuid);
    await reload();
  } catch (error) {
    rowErrors.value = { ...rowErrors.value, [user.uuid]: describeError(error) };
  } finally {
    busyUuid.value = null;
  }
}

async function confirmPurge(): Promise<void> {
  const target = purgeTarget.value;
  if (!target) return;
  await purge.run(
    () => purgeUser(target.uuid),
    () => (purgeTarget.value = null),
  );
}
</script>

<template>
  <section>
    <div class="eu-users__head">
      <EuButton :icon="faPlus" @click="openCreate">{{ t('users.new') }}</EuButton>
    </div>

    <p v-if="loading" class="eu-users__hint">{{ t('common.loading') }}</p>
    <p v-else-if="loadError" class="eu-users__error" role="alert">{{ loadError }}</p>

    <div v-else class="eu-users__table-wrap">
      <table class="eu-users__table">
        <thead>
          <tr>
            <EuSortableTh
              :label="t('users.columns.email')"
              :state="sort.stateOf('email')"
              @sort="sort.toggle('email')"
            />
            <EuSortableTh
              :label="t('users.columns.name')"
              :state="sort.stateOf('name')"
              @sort="sort.toggle('name')"
            />
            <EuSortableTh
              :label="t('users.columns.status')"
              :state="sort.stateOf('status')"
              @sort="sort.toggle('status')"
            />
            <EuSortableTh
              :label="t('users.columns.globalRoles')"
              :state="sort.stateOf('roles')"
              @sort="sort.toggle('roles')"
            />
            <EuSortableTh
              :label="t('users.columns.grants')"
              :state="sort.stateOf('grants')"
              @sort="sort.toggle('grants')"
            />
            <th class="eu-users__actions-head">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in sort.sorted" :key="user.uuid">
            <td>{{ user.email }}</td>
            <td>{{ [user.firstname, user.surname].filter(Boolean).join(' ') }}</td>
            <td>
              <EuBadge :tone="user.status === 1 ? 'done' : 'neutral'">
                {{ user.status === 1 ? t('users.active') : t('users.inactive') }}
              </EuBadge>
            </td>
            <td>{{ user.globalRoles.map(roleName).join(', ') || '–' }}</td>
            <td>{{ user.accountGrants.length }}</td>
            <td class="eu-users__actions">
              <EuButton
                variant="secondary"
                icon-only
                :icon="faPen"
                :aria-label="t('users.edit')"
                :title="t('users.editTitle')"
                @click="openEdit(user)"
              />
              <EuButton
                variant="secondary"
                icon-only
                :icon="faTrash"
                :aria-label="t('users.delete')"
                :title="t('users.deleteTitle')"
                @click="deleteTarget = user"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Deleted users were invisible until Scheibe 18: the row stayed in the
         table with name and address, and no mask could reach it (SEC-15). -->
    <EuCollapsibleSection
      v-if="!loading && !loadError && deleted.length > 0"
      class="eu-users__deleted"
      :title="t('users.deletedTitle', { n: deleted.length })"
      initially-collapsed
    >
      <p class="eu-users__hint">{{ t('users.deletedLead') }}</p>
      <div class="eu-users__table-wrap">
        <table class="eu-users__table">
          <thead>
            <tr>
              <th>{{ t('users.columns.email') }}</th>
              <th>{{ t('users.columns.name') }}</th>
              <th>{{ t('users.columns.deletedAt') }}</th>
              <th class="eu-users__actions-head">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in deleted" :key="user.uuid">
              <td>{{ user.email }}</td>
              <td>{{ [user.firstname, user.surname].filter(Boolean).join(' ') }}</td>
              <td>
                {{
                  user.deletedAt === null
                    ? t('users.unknownMoment')
                    : formatDateTime(user.deletedAt)
                }}
              </td>
              <td class="eu-users__actions">
                <EuButton
                  variant="secondary"
                  icon-only
                  :icon="faRotateLeft"
                  :disabled="busyUuid === user.uuid"
                  :aria-label="t('users.restore')"
                  :title="t('users.restoreTitle')"
                  @click="restore(user)"
                />
                <EuButton
                  variant="secondary"
                  icon-only
                  :icon="faTrash"
                  :disabled="busyUuid === user.uuid"
                  :aria-label="t('users.purge')"
                  :title="t('users.purgeTitle')"
                  @click="purgeTarget = user"
                />
                <p v-if="rowErrors[user.uuid]" class="eu-users__error" role="alert">
                  {{ rowErrors[user.uuid] }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </EuCollapsibleSection>

    <RolesOverview v-if="!loading && !loadError" :roles="roles" />

    <UserFormDialog
      :open="dialogOpen"
      :editing="editing"
      :roles="roles"
      :accounts="accountOptions"
      :submitting="form.busy"
      :error="form.error"
      @close="dialogOpen = false"
      @submit="onSubmit"
    />

    <EuDialog
      :open="deleteTarget !== null"
      :title="t('users.deleteTitle')"
      @close="deleteTarget = null"
    >
      <p>{{ t('users.confirmDelete', { email: deleteTarget?.email ?? '' }) }}</p>
      <p v-if="removal.error" class="eu-users__error" role="alert">{{ removal.error }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="deleteTarget = null">{{
          t('common.cancel')
        }}</EuButton>
        <EuButton :disabled="removal.busy" @click="confirmDelete">{{
          t('common.delete')
        }}</EuButton>
      </template>
    </EuDialog>

    <EuDialog
      :open="purgeTarget !== null"
      :title="t('users.purgeTitle')"
      @close="purgeTarget = null"
    >
      <p>{{ t('users.confirmPurge', { email: purgeTarget?.email ?? '' }) }}</p>
      <p v-if="purge.error" class="eu-users__error" role="alert">{{ purge.error }}</p>
      <template #footer>
        <EuButton variant="secondary" @click="purgeTarget = null">{{
          t('common.cancel')
        }}</EuButton>
        <EuButton :disabled="purge.busy" @click="confirmPurge">{{ t('users.purge') }}</EuButton>
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
/* Shrink the actions column to its content so the data columns get the rest.
   Prefixed with the table class to outweigh the base `.eu-users__table td`. */
.eu-users__table .eu-users__actions-head,
.eu-users__table .eu-users__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}
.eu-users__actions button + button {
  margin-left: 0.4rem;
}

/* The deleted users sit below the table, not against it. */
.eu-users__deleted {
  margin-top: 1.5rem;
}
</style>
