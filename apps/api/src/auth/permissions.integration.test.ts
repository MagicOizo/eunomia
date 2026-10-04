import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS } from '@eunomia/shared';
import type { Pool } from 'mariadb';

import { runMigrations } from '../db/migrate.js';
import { generateEntityId } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import { openTestDatabase, resetData } from '../test/harness.js';
import {
  accountFilter,
  getAccessibleAccounts,
  getEffectivePermissions,
  hasPermission,
  listUsersWithAccess,
} from './permissions.js';

/**
 * The rights model against a real database (CR-33). Until now these rules were
 * checked only by whatever the workflow tests happened to walk through, while
 * the invariants themselves lived in a comment above the queries:
 *
 *  - a global grant authorizes every account,
 *  - an account-scoped grant authorizes exactly one,
 *  - a grant from a deactivated role never counts,
 *  - `listUsersWithAccess` is the inverse of `getAccessibleAccounts`,
 *  - and — the promise SEC-04 was closed with — an account-scoped grant of an
 *    instance-wide permission is worth nothing. The structural half of that
 *    promise (no route ever scopes such a permission) is in route-guards.test.ts.
 *
 * Four users and two accounts are the whole matrix.
 */

async function insertAccount(pool: Pool, firstname: string): Promise<string> {
  const accountUID = generateEntityId('account');
  await pool.query(
    'INSERT INTO Accounts (accountUID, firstname, surname, birthDate) VALUES (?, ?, ?, ?)',
    [accountUID, firstname, 'Muster', '1980-01-01'],
  );
  return accountUID;
}

async function insertUser(pool: Pool, email: string, active = true): Promise<number> {
  const result = await pool.query<{ insertId: number }>(
    'INSERT INTO Users (email, firstname, passwordHash, userStatus) VALUES (?, ?, ?, ?)',
    [email, 'Test', await hashPassword('permissions1'), active ? 1 : 0],
  );
  return Number(result.insertId);
}

/** A role carrying exactly these permissions, active or deactivated. */
async function insertRole(
  pool: Pool,
  roleName: string,
  permissions: string[],
  active = true,
): Promise<number> {
  const result = await pool.query<{ insertId: number }>(
    'INSERT INTO Roles (roleUID, roleName, roleStatus) VALUES (?, ?, ?)',
    [generateEntityId('role'), roleName, active ? 1 : -1],
  );
  const roleID = Number(result.insertId);
  for (const permissionKey of permissions) {
    await pool.query(
      `INSERT INTO RolePermissions (roleID, permissionID)
       SELECT ?, permissionID FROM Permissions WHERE permissionKey = ?`,
      [roleID, permissionKey],
    );
  }
  return roleID;
}

test('the rights model: global beats scoped, deactivated counts for nothing', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const accountA = await insertAccount(pool, 'Anna');
    const accountB = await insertAccount(pool, 'Bert');

    // One role for the account-scoped case, one that is deactivated, and one
    // that carries an instance-wide permission so it can be mis-granted.
    const viewer = await insertRole(pool, 'Test Viewer', [
      PERMISSIONS.VIEW_INVOICES,
      PERMISSIONS.VIEW_ACCOUNTS,
    ]);
    const retired = await insertRole(pool, 'Test Retired', [PERMISSIONS.VIEW_INVOICES], false);
    const janitor = await insertRole(pool, 'Test Janitor', [PERMISSIONS.MANAGE_TRASH]);

    const global = await insertUser(pool, 'global@example.com');
    const scoped = await insertUser(pool, 'scoped@example.com');
    const stale = await insertUser(pool, 'stale@example.com');
    const misgranted = await insertUser(pool, 'misgranted@example.com');

    await pool.query('INSERT INTO UserRoles (userID, roleID) VALUES (?, ?)', [global, viewer]);
    await pool.query('INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)', [
      scoped,
      viewer,
      accountA,
    ]);
    await pool.query('INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)', [
      stale,
      retired,
      accountA,
    ]);
    await pool.query('INSERT INTO UserAccountRoles (userID, roleID, accountUID) VALUES (?, ?, ?)', [
      misgranted,
      janitor,
      accountA,
    ]);

    await t.test('hasPermission: a global grant reaches every account', async () => {
      assert.equal(await hasPermission(pool, global, PERMISSIONS.VIEW_INVOICES, accountA), true);
      assert.equal(await hasPermission(pool, global, PERMISSIONS.VIEW_INVOICES, accountB), true);
      // No account at all: only a global grant can satisfy the check, and does.
      assert.equal(await hasPermission(pool, global, PERMISSIONS.VIEW_INVOICES), true);
      // A permission the role does not carry stays denied, globally granted or not.
      assert.equal(await hasPermission(pool, global, PERMISSIONS.MANAGE_INVOICES, accountA), false);
    });

    await t.test('hasPermission: a scoped grant reaches exactly its account', async () => {
      assert.equal(await hasPermission(pool, scoped, PERMISSIONS.VIEW_INVOICES, accountA), true);
      assert.equal(await hasPermission(pool, scoped, PERMISSIONS.VIEW_INVOICES, accountB), false);
      // Asked without an account, a scoped grant is no answer — this is what
      // makes an instance-wide permission unreachable through UserAccountRoles.
      assert.equal(await hasPermission(pool, scoped, PERMISSIONS.VIEW_INVOICES), false);
    });

    await t.test('hasPermission: a deactivated role grants nothing', async () => {
      assert.equal(await hasPermission(pool, stale, PERMISSIONS.VIEW_INVOICES, accountA), false);
      assert.equal(await hasPermission(pool, stale, PERMISSIONS.VIEW_INVOICES), false);
      // And it is really the role's status, not a missing row: reactivate it
      // and the same grant answers.
      await pool.query('UPDATE Roles SET roleStatus = 1 WHERE roleID = ?', [retired]);
      assert.equal(await hasPermission(pool, stale, PERMISSIONS.VIEW_INVOICES, accountA), true);
      await pool.query('UPDATE Roles SET roleStatus = -1 WHERE roleID = ?', [retired]);
    });

    await t.test(
      'SEC-04: an instance-wide permission granted per account is worth nothing',
      async () => {
        // How the API asks for MANAGE_TRASH (domain/trash.ts): without an account.
        assert.equal(await hasPermission(pool, misgranted, PERMISSIONS.MANAGE_TRASH), false);
        // Even naming the very account it was granted on does not help, which is
        // why §2.4 says such a right belongs to administrators globally.
        assert.equal(
          await hasPermission(pool, misgranted, PERMISSIONS.MANAGE_TRASH, accountA),
          true,
          'the row is there — the grant is ineffective because nothing asks this way',
        );
        const scope = await getAccessibleAccounts(pool, misgranted, PERMISSIONS.MANAGE_TRASH);
        assert.deepEqual(scope, { all: false, accountUIDs: [accountA] });
      },
    );

    await t.test('getAccessibleAccounts answers in the three shapes the lists expect', async () => {
      assert.deepEqual(await getAccessibleAccounts(pool, global, PERMISSIONS.VIEW_INVOICES), {
        all: true,
        accountUIDs: [],
      });
      assert.deepEqual(await getAccessibleAccounts(pool, scoped, PERMISSIONS.VIEW_INVOICES), {
        all: false,
        accountUIDs: [accountA],
      });
      assert.deepEqual(await getAccessibleAccounts(pool, stale, PERMISSIONS.VIEW_INVOICES), {
        all: false,
        accountUIDs: [],
      });
    });

    await t.test(
      'accountFilter collapses the three cases into TRUE, IN (…) and nothing',
      async () => {
        assert.deepEqual(
          await accountFilter(pool, global, PERMISSIONS.VIEW_INVOICES, 'i.accountUID'),
          { clause: 'TRUE', params: [] },
        );
        assert.deepEqual(
          await accountFilter(pool, scoped, PERMISSIONS.VIEW_INVOICES, 'i.accountUID'),
          { clause: 'i.accountUID IN (?)', params: [accountA] },
        );
        // null, not an empty IN (): the route answers [] and asks nothing.
        assert.equal(
          await accountFilter(pool, stale, PERMISSIONS.VIEW_INVOICES, 'i.accountUID'),
          null,
        );
      },
    );

    await t.test(
      'listUsersWithAccess is the inverse, and leaves out who cannot log in',
      async () => {
        const users = await listUsersWithAccess(pool, PERMISSIONS.VIEW_INVOICES);
        assert.deepEqual(
          users.map((user) => ({
            email: user.email,
            all: user.all,
            accountUIDs: user.accountUIDs,
          })),
          [
            { email: 'global@example.com', all: true, accountUIDs: [] },
            { email: 'scoped@example.com', all: false, accountUIDs: [accountA] },
          ],
          'the deactivated role brings nobody, and nobody else holds VIEW_INVOICES',
        );

        // A global grant subsumes a scoped one: the same user with both reports
        // `all` and an empty list, never a half-filled one.
        await pool.query('INSERT INTO UserRoles (userID, roleID) VALUES (?, ?)', [scoped, viewer]);
        const both = await listUsersWithAccess(pool, PERMISSIONS.VIEW_INVOICES);
        const subsumed = both.find((user) => user.email === 'scoped@example.com');
        assert.deepEqual(
          { all: subsumed?.all, accountUIDs: subsumed?.accountUIDs },
          {
            all: true,
            accountUIDs: [],
          },
        );
        await pool.query('DELETE FROM UserRoles WHERE userID = ? AND roleID = ?', [scoped, viewer]);

        // A deactivated user is nobody to write to, however the grant reads.
        await pool.query('UPDATE Users SET userStatus = 0 WHERE userID = ?', [scoped]);
        const remaining = await listUsersWithAccess(pool, PERMISSIONS.VIEW_INVOICES);
        assert.deepEqual(
          remaining.map((user) => user.email),
          ['global@example.com'],
        );
        await pool.query('UPDATE Users SET userStatus = 1 WHERE userID = ?', [scoped]);
      },
    );

    await t.test('getEffectivePermissions reports what /me shows', async () => {
      const forGlobal = await getEffectivePermissions(pool, global);
      assert.deepEqual(forGlobal.global.toSorted(), [
        PERMISSIONS.VIEW_ACCOUNTS,
        PERMISSIONS.VIEW_INVOICES,
      ]);
      assert.deepEqual(forGlobal.perAccount, []);

      const forScoped = await getEffectivePermissions(pool, scoped);
      assert.deepEqual(forScoped.global, []);
      assert.deepEqual(
        forScoped.perAccount.toSorted((a, b) => a.permissionKey.localeCompare(b.permissionKey)),
        [
          { accountUID: accountA, permissionKey: PERMISSIONS.VIEW_ACCOUNTS },
          { accountUID: accountA, permissionKey: PERMISSIONS.VIEW_INVOICES },
        ],
      );

      // A deactivated role is invisible here too, so the interface does not
      // offer what the API would refuse (CR-26).
      const forStale = await getEffectivePermissions(pool, stale);
      assert.deepEqual(forStale, { global: [], perAccount: [] });
    });
  } finally {
    await pool.end();
  }
});
