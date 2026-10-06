import assert from 'node:assert/strict';
import test from 'node:test';

import request from 'supertest';

import { createApp } from '../app.js';
import { runMigrations } from '../db/migrate.js';
import { captureLog, eventLines, singleEvent } from '../test/log-capture.js';
import { bootstrapAdmin, openTestDatabase, resetData, testConfig } from '../test/harness.js';
import { sweepRetention } from './sweep.js';

/**
 * The retention period (SEC-15, Scheibe 18) against a real database: what has
 * aged out goes, what has not stays, and what nobody dated is never touched.
 *
 * The clock is handed in rather than waited for: every row's `deletedAt` is
 * written by hand and the sweep is told what "now" is, so the boundary can be
 * tested to the second instead of to the day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

test('retention: the period empties the trash of what has aged out', async (t) => {
  const opened = await openTestDatabase(t);
  if (!opened) return;
  const { pool, database } = opened;

  try {
    await runMigrations(pool);
    await resetData(pool);

    const config = testConfig({ database });
    const app = createApp({ pool, config });
    const { admin } = await bootstrapAdmin(app);

    const post = (path: string, body: object) => request(app).post(path).set(admin).send(body);
    const del = (path: string) => request(app).delete(path).set(admin);

    /** The moment every sweep below runs at; the rows are dated relative to it. */
    const now = new Date('2026-10-04T12:00:00.000Z');
    const days = 90;
    const ago = (ms: number): Date => new Date(now.getTime() - ms);

    const sweep = (dryRun = false) =>
      sweepRetention(pool, { encryptionKey: null, now: () => now, dryRun });

    const setDeletedAt = async (
      table: string,
      column: string,
      uid: string,
      at: Date | null,
    ): Promise<void> => {
      await pool.query(`UPDATE ${table} SET deletedAt = ? WHERE ${column} = ?`, [at, uid]);
    };

    const facilities = async (): Promise<string[]> => {
      const rows = await pool.query<Array<{ facilityUID: string }>>(
        'SELECT facilityUID FROM Facilities',
      );
      return rows.map((row) => row.facilityUID);
    };

    const trashUids = async (): Promise<string[]> => {
      const res = await request(app).get('/api/v1/trash').set(admin);
      assert.equal(res.status, 200);
      const groups = res.body.data.groups as Array<{ entries: Array<{ uid: string }> }>;
      return groups.flatMap((group) => group.entries.map((one) => one.uid));
    };

    const newFacility = async (name: string): Promise<string> =>
      (await post('/api/v1/facilities', { facilityName: name })).body.data.facilityUID as string;

    // Four deleted facilities, each with a different age, plus one that an
    // active invoice holds on to.
    const old = await newFacility('Alt & Weg');
    const edge = await newFacility('Genau an der Grenze');
    const young = await newFacility('Noch nicht so lange');
    const undated = await newFacility('Ohne Datum');
    const held = await newFacility('Noch in Benutzung');

    const accountUID = (
      await post('/api/v1/accounts', {
        firstname: 'Anna',
        surname: 'Muster',
        birthDate: '1985-04-12',
      })
    ).body.data.accountUID as string;
    await post('/api/v1/invoices', {
      invoiceNumber: 'R-RETENTION',
      invoiceDate: '2024-05-01',
      treatmentDate: '2024-05-01',
      accountUID,
      invoiceAmount: 120,
      facilityUID: held,
    });

    for (const uid of [old, edge, young, undated, held]) await del(`/api/v1/facilities/${uid}`);
    await setDeletedAt('Facilities', 'facilityUID', old, ago(91 * DAY_MS));
    // Exactly the cutoff: the condition is `< cutoff`, so this one survives.
    await setDeletedAt('Facilities', 'facilityUID', edge, ago(90 * DAY_MS));
    await setDeletedAt('Facilities', 'facilityUID', young, ago(2 * DAY_MS));
    await setDeletedAt('Facilities', 'facilityUID', undated, null);
    await setDeletedAt('Facilities', 'facilityUID', held, ago(200 * DAY_MS));

    await t.test(
      'the run button does not bypass the switch, a dry run does not need it',
      async () => {
        const refused = await post('/api/v1/settings/retention/run', { dryRun: false });
        assert.equal(refused.status, 409);
        assert.equal(refused.body.error.code, 'RETENTION_DISABLED');

        const preview = await post('/api/v1/settings/retention/run', { dryRun: true });
        assert.equal(preview.status, 200);
        assert.equal(preview.body.data.dryRun, true);
        assert.equal(preview.body.data.days, days);
      },
    );

    await t.test('the period is stored like any other setting', async () => {
      const res = await request(app)
        .put('/api/v1/settings')
        .set(admin)
        .send({ values: { 'retention.enabled': true, 'retention.trashDays': days } });
      assert.equal(res.status, 200);
      const stored = (res.body.data.settings as Array<{ key: string; value: unknown }>).filter(
        (one) => one.key.startsWith('retention.'),
      );
      assert.equal(stored.find((one) => one.key === 'retention.enabled')?.value, true);
      assert.equal(stored.find((one) => one.key === 'retention.trashDays')?.value, days);
    });

    await t.test('a dry run counts and deletes nothing', async () => {
      const before = await facilities();
      const result = await sweep(true);
      assert.equal(result.dryRun, true);
      assert.equal(result.purged, 1, 'only the facility older than the period');
      assert.equal(result.skipped, 1, 'the one an active invoice still points at');
      assert.deepEqual(await facilities(), before);
      const status = await pool.query<Array<{ settingKey: string }>>(
        "SELECT settingKey FROM SystemSettings WHERE settingKey = 'retention.lastRunAt'",
      );
      assert.equal(status.length, 0, 'a dry run writes no status either');
    });

    await t.test('the sweep removes what has aged out and nothing else', async () => {
      const captured = await captureLog(() => sweep());
      const result = captured.result;
      assert.equal(result.purged, 1);
      assert.equal(result.skipped, 1);
      assert.equal(result.users, 0);
      assert.deepEqual((await facilities()).sort(), [edge, held, undated, young].sort());

      const line = singleEvent(captured.lines, 'TRASH_PURGED');
      assert.ok(line, 'the purge writes exactly one line');
      assert.match(line, /actor=system/, 'nobody pressed anything');
      assert.match(line, new RegExp(`uid=${old}`));
      assert.ok(!line.includes('Alt'), 'a line carries UIDs, never labels (I-7)');

      const swept = singleEvent(captured.lines, 'RETENTION_SWEPT');
      assert.ok(swept);
      assert.match(swept, /days=90/);
      assert.match(swept, /purged=1/);
      assert.match(swept, /skipped=1/);
    });

    await t.test('an entry something active points at stays, and says so per kind', async () => {
      const uids = await trashUids();
      assert.ok(uids.includes(held), 'still in the trash');
      const again = await sweep();
      assert.equal(again.purged, 0, 'nothing left to remove');
      assert.equal(again.skipped, 1, 'and it is tried again every time');
      const facility = again.byKind.find((one) => one.kind === 'facility');
      assert.deepEqual(facility, {
        kind: 'facility',
        purged: 0,
        skipped: 1,
      });
    });

    await t.test('the status of the last sweep is readable on the settings page', async () => {
      const res = await request(app).get('/api/v1/settings').set(admin);
      const settings = res.body.data.settings as Array<{
        key: string;
        value: unknown;
        readonly: boolean;
      }>;
      const value = (key: string): unknown => settings.find((one) => one.key === key)?.value;
      assert.equal(value('retention.lastRunResult'), 'ok');
      assert.equal(value('retention.lastRunPurged'), 0, 'the second sweep found nothing');
      assert.match(String(value('retention.lastRunAt')), /^2026-10-04T12:00:00/);
      assert.equal(
        settings.find((one) => one.key === 'retention.lastRunAt')?.readonly,
        true,
        'written by the sweep, not by a client',
      );
    });

    await t.test('a sweep that removes nothing writes no audit line', async () => {
      // The held-back entry is still there and still skipped — that is not news
      // every day, and a daily line would bury the ones that are.
      const captured = await captureLog(() => sweep());
      assert.equal(captured.result.skipped, 1);
      assert.deepEqual(eventLines(captured.lines, 'RETENTION_SWEPT'), []);
    });

    await t.test('deleted users age out by the same period', async () => {
      const create = async (email: string): Promise<string> =>
        (
          await post('/api/v1/users', {
            email,
            firstname: 'Temp',
            surname: 'Nutzer',
            password: 'temppass1',
          })
        ).body.data.uuid as string;

      const gone = await create('gone@example.com');
      const recent = await create('recent@example.com');
      const nodate = await create('nodate@example.com');
      for (const uuid of [gone, recent, nodate]) await del(`/api/v1/users/${uuid}`);
      await setDeletedAt('Users', 'uuidText', gone, ago(91 * DAY_MS));
      await setDeletedAt('Users', 'uuidText', recent, ago(3 * DAY_MS));
      await setDeletedAt('Users', 'uuidText', nodate, null);

      const captured = await captureLog(() => sweep());
      assert.equal(captured.result.users, 1);
      const line = singleEvent(captured.lines, 'USER_PURGED');
      assert.ok(line);
      assert.match(line, /actor=system/);
      assert.match(line, new RegExp(`user=${gone}`));
      assert.ok(!line.includes('gone@example.com'), 'the UUID, not the address');

      const left = await request(app).get('/api/v1/users?includeDeleted=true').set(admin);
      const emails = (left.body.data as Array<{ email: string }>).map((one) => one.email);
      assert.ok(!emails.includes('gone@example.com'), 'removed for good');
      assert.ok(emails.includes('recent@example.com'), 'not yet due');
      assert.ok(emails.includes('nodate@example.com'), 'never due without a date');
    });
  } finally {
    await pool.end();
  }
});
