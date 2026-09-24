import assert from 'node:assert/strict';
import test from 'node:test';

import { formatLogEvent } from './log.js';

test('the event and level come first, in a fixed order', () => {
  // The documented filter is `grep MAIL_SEND_FAILED`, so the token must be
  // present verbatim and the prefix must not move.
  assert.equal(
    formatLogEvent('error', 'MAIL_SEND_FAILED', { host: 'smtp.example.com' }),
    'eunomia event=MAIL_SEND_FAILED level=error host=smtp.example.com',
  );
});

test('values with spaces or quotes are quoted and escaped', () => {
  assert.equal(
    formatLogEvent('error', 'X', { message: 'Invalid login: 535 "nope"' }),
    'eunomia event=X level=error message="Invalid login: 535 \\"nope\\""',
  );
  assert.equal(
    formatLogEvent('info', 'X', { message: '' }),
    'eunomia event=X level=info message=""',
  );
});

test('a multi-line message stays on one line', () => {
  const line = formatLogEvent('error', 'X', { message: 'first\nsecond\r\nthird' });
  assert.equal(line.includes('\n'), false);
  assert.equal(line, 'eunomia event=X level=error message="first second third"');
});

test('numbers, booleans and null print bare; undefined fields are dropped', () => {
  assert.equal(
    formatLogEvent('info', 'X', { port: 587, secure: false, code: null, absent: undefined }),
    'eunomia event=X level=info port=587 secure=false code=null',
  );
});
