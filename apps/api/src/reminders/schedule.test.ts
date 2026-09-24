import assert from 'node:assert/strict';
import test from 'node:test';

import { isRunDue, zonedNow } from './schedule.js';

const BERLIN = 'Europe/Berlin';

test('the wall clock is read in the configured zone', () => {
  // 22:30 UTC is already the next day in Berlin — the run must not use the
  // server's idea of "today".
  assert.deepEqual(zonedNow(new Date('2026-09-24T22:30:00Z'), BERLIN), {
    date: '2026-09-25',
    hour: 0,
  });
  assert.deepEqual(zonedNow(new Date('2026-09-24T22:30:00Z'), 'UTC'), {
    date: '2026-09-24',
    hour: 22,
  });
});

test('an unknown zone falls back to UTC instead of stopping every run', () => {
  assert.deepEqual(zonedNow(new Date('2026-09-24T10:00:00Z'), 'Mars/Olympus'), {
    date: '2026-09-24',
    hour: 10,
  });
});

test('the run waits for its hour and then happens once a day', () => {
  const before = new Date('2026-09-24T04:00:00Z'); // 06:00 Berlin
  const after = new Date('2026-09-24T05:30:00Z'); // 07:30 Berlin

  assert.equal(isRunDue(before, null, 7, BERLIN), false);
  assert.equal(isRunDue(after, null, 7, BERLIN), true);
  // Already run today: the next tick does nothing.
  assert.equal(isRunDue(after, '2026-09-24T05:05:00Z', 7, BERLIN), false);
  // Yesterday's run does not count for today.
  assert.equal(isRunDue(after, '2026-09-23T05:05:00Z', 7, BERLIN), true);
});

test('a window missed while the machine was off is caught up, not skipped', () => {
  // Booted at 23:00 Berlin, the 07:00 run never happened today.
  assert.equal(isRunDue(new Date('2026-09-24T21:00:00Z'), '2026-09-23T05:05:00Z', 7, BERLIN), true);
});

test('daylight saving does not move the hour or duplicate the run', () => {
  // 2026-10-25, the day Berlin falls back to UTC+1.
  const morning = new Date('2026-10-25T06:30:00Z'); // 07:30 Berlin (UTC+1)
  assert.equal(isRunDue(morning, '2026-10-24T05:05:00Z', 7, BERLIN), true);
  assert.equal(isRunDue(morning, '2026-10-25T05:05:00Z', 7, BERLIN), false);
});

test('an unreadable watermark makes the run happen rather than never happen', () => {
  assert.equal(isRunDue(new Date('2026-09-24T05:30:00Z'), 'not-a-date', 7, BERLIN), true);
});
