import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PERMISSIONS } from '@eunomia/shared';

import { captureLog } from '../test/log-capture.js';
import {
  AUDIT_EVENTS,
  auditForbidden,
  auditLoginFailed,
  auditLogout,
  auditSettingsChanged,
  auditTrashPurged,
  auditUnauthenticated,
  auditUserRolesChanged,
  auditUserUpdated,
} from './audit.js';

/**
 * `DEV.md` is where an operator looks up what to grep for, which makes the
 * list there an interface and not prose. Read from four levels up, the same
 * depth `lib/app-version.ts` relies on for package.json.
 */
const DEV_MD = readFileSync(new URL('../../../../DEV.md', import.meta.url), 'utf8');

/**
 * The names in the "The audit trail" section, and only there. Scoped to that
 * one section rather than filtered by a name prefix: the mail section above it
 * documents SETTINGS_SECRET_UNREADABLE, which looks like an audit event by its
 * name and is a diagnostic — a prefix rule read it as a stale entry.
 */
function documentedEvents(): string[] {
  const section = DEV_MD.split('### The audit trail')[1]?.split('\n### ')[0] ?? '';
  assert.notEqual(section, '', 'DEV.md has no "### The audit trail" section');
  return [...section.matchAll(/^docker logs eunomia 2>&1 \| grep ([A-Z][A-Z_]+)\s/gm)].map(
    (match) => match[1] ?? '',
  );
}

/** Runs one audit call and returns the single line it wrote. */
async function lineOf(write: () => void): Promise<string> {
  const { lines } = await captureLog(async () => {
    write();
  });
  assert.equal(lines.length, 1, `expected exactly one line, got ${lines.length}`);
  return lines[0] ?? '';
}

test('every event of the catalogue is documented in DEV.md', () => {
  const documented = documentedEvents();
  for (const event of AUDIT_EVENTS) {
    assert.ok(
      documented.includes(event),
      `${event} has no grep line in DEV.md — add it under "The audit trail"`,
    );
  }
});

test('DEV.md documents no event that no longer exists', () => {
  // The other direction, so a renamed or dropped event cannot leave a grep
  // line behind that silently never matches again.
  const audit = new Set<string>(AUDIT_EVENTS);
  const stale = documentedEvents().filter((event) => !audit.has(event));
  assert.deepEqual(stale, [], 'DEV.md names audit events that are not in AUDIT_EVENTS');
});

test('the catalogue has no duplicate names', () => {
  assert.equal(new Set<string>(AUDIT_EVENTS).size, AUDIT_EVENTS.length);
});

test('a failed login names ip, email and reason', async () => {
  assert.equal(
    await lineOf(() =>
      auditLoginFailed({ email: 'max@example.com', ip: '192.0.2.7', reason: 'bad_password' }),
    ),
    'eunomia event=AUTH_LOGIN_FAILED level=warn email=max@example.com ip=192.0.2.7 reason=bad_password',
  );
});

test('a refused request names what was missing, and where', async () => {
  assert.equal(
    await lineOf(() =>
      auditUnauthenticated({
        reason: 'invalid_token',
        method: 'GET',
        path: '/api/v1/users',
        ip: '192.0.2.7',
      }),
    ),
    'eunomia event=AUTH_UNAUTHENTICATED level=warn reason=invalid_token method=GET path=/api/v1/users ip=192.0.2.7',
  );
  assert.equal(
    await lineOf(() =>
      auditForbidden({
        user: 'u-1',
        permission: PERMISSIONS.MANAGE_TRASH,
        account: undefined,
        method: 'DELETE',
        path: '/api/v1/trash/inv_abc',
        ip: '192.0.2.7',
      }),
    ),
    'eunomia event=AUTH_FORBIDDEN level=warn user=u-1 permission=MANAGE_TRASH method=DELETE path=/api/v1/trash/inv_abc ip=192.0.2.7',
  );
});

test('a logout without a known owner still writes a line', async () => {
  assert.equal(
    await lineOf(() => auditLogout({ user: null, ip: undefined })),
    'eunomia event=AUTH_LOGOUT level=info user=unknown',
  );
});

test('a user update names the fields and never their values', async () => {
  const line = await lineOf(() =>
    auditUserUpdated({ actor: 'u-1', user: 'u-2', fields: ['email', 'password'] }),
  );
  assert.equal(
    line,
    'eunomia event=USER_UPDATED level=info actor=u-1 user=u-2 fields=email,password',
  );
});

test('deactivating through PATCH is a warning, like the DELETE route', async () => {
  const line = await lineOf(() =>
    auditUserUpdated({ actor: 'u-1', user: 'u-2', fields: ['status'], status: 0 }),
  );
  assert.match(line, /level=warn/);
  assert.match(line, /status=0/);
});

test('a role change carries the whole new set plus its size', async () => {
  assert.equal(
    await lineOf(() =>
      auditUserRolesChanged({
        actor: 'u-1',
        user: 'u-2',
        scope: 'account',
        roles: ['acc_1:rol_a', 'acc_2:rol_b'],
      }),
    ),
    'eunomia event=USER_ROLES_CHANGED level=warn actor=u-1 user=u-2 scope=account count=2 roles=acc_1:rol_a,acc_2:rol_b',
  );
  // Taking everything away is the case a count makes greppable.
  assert.match(
    await lineOf(() =>
      auditUserRolesChanged({ actor: 'u-1', user: 'u-2', scope: 'global', roles: [] }),
    ),
    /count=0 roles=""/,
  );
});

test('a purge names the kind and the UID, and no label', async () => {
  const line = await lineOf(() =>
    auditTrashPurged({ actor: 'u-1', kind: 'invoice', uid: 'inv_abc', alsoRemoved: 3 }),
  );
  assert.equal(
    line,
    'eunomia event=TRASH_PURGED level=warn actor=u-1 kind=invoice uid=inv_abc alsoRemoved=3',
  );
});

test('a settings change names keys and carries no value', async () => {
  const line = await lineOf(() =>
    auditSettingsChanged({
      actor: 'u-1',
      set: ['mail.host', 'mail.password'],
      cleared: ['mail.fromName'],
    }),
  );
  assert.equal(
    line,
    'eunomia event=SETTINGS_CHANGED level=info actor=u-1 set=mail.host,mail.password cleared=mail.fromName',
  );
});
