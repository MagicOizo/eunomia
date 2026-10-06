<script setup lang="ts">
import { faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import EuButton from '../design-system/components/EuButton.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuTextField from '../design-system/components/EuTextField.vue';
import EuToggle from '../design-system/components/EuToggle.vue';
import EuEntityPicker from '../design-system/components/EuEntityPicker.vue';
import { type SelectOption } from '../components/resource/EuSelectField.vue';
import { fieldLabel } from '../lib/field-labels';
import { useFormDialog, type FormDialogProps } from '../lib/form-dialog';
import { useAuthStore } from '../stores/auth';
import type { AdminUserDto, RoleDto } from './api';
import { roleName } from './role-names';

export interface UserFormPayload {
  user: {
    email: string;
    firstname: string;
    surname: string | null;
    status?: number;
    password?: string;
  };
  globalRoleUIDs: string[];
  grants: Array<{ accountUID: string; roleUID: string }>;
}

const props = defineProps<
  FormDialogProps & {
    editing: AdminUserDto | null;
    roles: RoleDto[];
    accounts: SelectOption[];
  }
>();

const emit = defineEmits<{ close: []; submit: [payload: UserFormPayload] }>();
const { t } = useI18n();

const email = ref('');
const firstname = ref('');
const surname = ref('');
const password = ref('');
const active = ref(true);
const globalRoleUIDs = ref<Set<string>>(new Set());
const grants = ref<Array<{ accountUID: string; roleUID: string }>>([]);

/**
 * One's own password is not set here. The API refuses it (auth/admin-routes.ts)
 * so that a new password always costs the old one — and because setting it
 * revokes the sessions of the account it belongs to, which would be this one.
 */
const auth = useAuthStore();
const editingSelf = computed(
  () => props.editing !== null && props.editing.uuid === auth.user?.uuid,
);

const roleUidByName = computed(() => new Map(props.roles.map((r) => [r.roleName, r.roleUID])));
const roleOptions = computed<SelectOption[]>(() =>
  props.roles.map((r) => ({ value: r.roleUID, label: roleName(r.roleName) })),
);
const defaultRoleUID = computed(
  () => roleUidByName.value.get('Nutzer') ?? props.roles[0]?.roleUID ?? '',
);

const { shownError, fail, clear } = useFormDialog(
  props,
  () => {
    const e = props.editing;
    email.value = e?.email ?? '';
    firstname.value = e?.firstname ?? '';
    surname.value = e?.surname ?? '';
    password.value = '';
    active.value = e ? e.status === 1 : true;
    globalRoleUIDs.value = new Set(
      (e?.globalRoles ?? [])
        .map((name) => roleUidByName.value.get(name))
        .filter((v): v is string => Boolean(v)),
    );
    grants.value = (e?.accountGrants ?? []).map((g) => ({
      accountUID: g.accountUID,
      roleUID: roleUidByName.value.get(g.roleName) ?? defaultRoleUID.value,
    }));
  },
  () => props.editing,
);

function toggleRole(roleUID: string, on: boolean): void {
  const next = new Set(globalRoleUIDs.value);
  if (on) next.add(roleUID);
  else next.delete(roleUID);
  globalRoleUIDs.value = next;
}

function addGrant(): void {
  grants.value = [...grants.value, { accountUID: '', roleUID: defaultRoleUID.value }];
}
function removeGrant(index: number): void {
  grants.value = grants.value.filter((_, i) => i !== index);
}

function submit(): void {
  clear();
  if (!email.value.trim() || !firstname.value.trim()) {
    return fail(t('users.form.emailAndFirstnameRequired'));
  }
  if (!props.editing && password.value.length < 8) {
    return fail(t('users.form.passwordTooShort'));
  }
  const validGrants = grants.value.filter((g) => g.accountUID && g.roleUID);

  const user: UserFormPayload['user'] = {
    email: email.value.trim(),
    firstname: firstname.value.trim(),
    surname: surname.value.trim() || null,
  };
  if (props.editing) user.status = active.value ? 1 : 0;
  if (password.value) user.password = password.value;

  emit('submit', { user, globalRoleUIDs: Array.from(globalRoleUIDs.value), grants: validGrants });
}
</script>

<template>
  <EuDialog
    :open="open"
    :title="editing ? t('users.editTitle') : t('users.form.newTitle')"
    @close="emit('close')"
  >
    <form class="eu-form" @submit.prevent="submit">
      <EuTextField v-model="email" :label="t('users.form.email')" type="email" />
      <EuTextField v-model="firstname" :label="fieldLabel('firstname')" />
      <EuTextField v-model="surname" :label="fieldLabel('surname')" />
      <EuTextField
        v-if="!editingSelf"
        v-model="password"
        :label="editing ? t('users.form.newPassword') : t('users.form.password')"
        type="password"
      />
      <i18n-t v-else keypath="users.form.ownPassword" tag="p" class="eu-form__hint" scope="global">
        <template #link>
          <RouterLink to="/profile">{{ t('nav.profile') }}</RouterLink>
        </template>
      </i18n-t>
      <EuToggle v-if="editing" v-model="active" :label="t('users.form.active')" />

      <fieldset class="eu-form__group">
        <legend>{{ t('users.form.globalRoles') }}</legend>
        <EuToggle
          v-for="role in roles"
          :key="role.roleUID"
          :model-value="globalRoleUIDs.has(role.roleUID)"
          :label="roleName(role.roleName)"
          @update:model-value="(on: boolean) => toggleRole(role.roleUID, on)"
        />
      </fieldset>

      <fieldset class="eu-form__group">
        <legend>{{ t('users.form.grants') }}</legend>
        <p v-if="grants.length === 0" class="eu-form__hint">{{ t('users.form.noGrants') }}</p>
        <div v-for="(grant, index) in grants" :key="index" class="eu-form__grant">
          <EuEntityPicker
            :model-value="grant.accountUID || null"
            :label="t('users.form.account')"
            required
            :options="accounts"
            @update:model-value="grant.accountUID = $event ?? ''"
          />
          <EuEntityPicker
            :model-value="grant.roleUID || null"
            :label="t('users.form.role')"
            required
            :options="roleOptions"
            @update:model-value="grant.roleUID = $event ?? ''"
          />
          <EuButton
            variant="secondary"
            icon-only
            :icon="faXmark"
            :aria-label="t('users.form.removeGrant')"
            @click="removeGrant(index)"
          />
        </div>
        <EuButton variant="secondary" :icon="faPlus" @click="addGrant">{{
          t('users.form.addGrant')
        }}</EuButton>
      </fieldset>

      <p v-if="shownError" class="eu-form__error" role="alert">{{ shownError }}</p>
    </form>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">{{ t('common.cancel') }}</EuButton>
      <EuButton :disabled="submitting" @click="submit">
        {{ submitting ? t('common.saving') : t('common.save') }}
      </EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-form__group {
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
}

.eu-form__group legend {
  font-family: var(--eu-font-heading);
  padding: 0 0.4rem;
}

.eu-form__grant {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
}

.eu-form__grant > :first-child {
  flex: 2;
}
.eu-form__grant > :nth-child(2) {
  flex: 1;
}

.eu-form__hint {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}
</style>
