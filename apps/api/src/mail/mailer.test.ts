import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';

import { ApiError } from '../lib/api-error.js';
import { type ResolvedSettings, SETTING_KEYS, fallbackOf } from '../settings/registry.js';
import {
  type MailSendStatus,
  type MailTransport,
  type MailTransportOptions,
  createMailer,
} from './mailer.js';

type Settings = Partial<ResolvedSettings>;

/**
 * Every setting at its documented default with the test's own on top — the
 * shape `getSettings` always answers. A test that "takes a piece away" sets it
 * to null and gets what an unconfigured instance has, not a missing key.
 */
function settingsOf(overrides: Settings): ResolvedSettings {
  const defaults = Object.fromEntries(SETTING_KEYS.map((key) => [key, fallbackOf(key)]));
  return { ...defaults, ...overrides } as ResolvedSettings;
}

/** A working configuration; individual tests take pieces away from it. */
const configured: Settings = {
  'mail.enabled': true,
  'mail.host': 'smtp.example.com',
  'mail.port': 587,
  'mail.secure': false,
  'mail.user': 'eunomia@example.com',
  'mail.password': 'hunter2',
  'mail.fromAddress': 'eunomia@example.com',
  'mail.fromName': 'Eunomia',
};

/** In-memory store: the mailer never touches a database in these tests. */
function stubStore(settings: Settings) {
  const state: Settings = { ...settings };
  const written: MailSendStatus[] = [];
  return {
    store: {
      read: async (): Promise<ResolvedSettings> => settingsOf(state),
      writeStatus: async (status: MailSendStatus): Promise<void> => {
        written.push(status);
        state['mail.lastSendAt'] = status.lastSendAt;
        state['mail.lastSendResult'] = status.lastSendResult;
        state['mail.lastSendError'] = status.lastSendError;
      },
    },
    written,
  };
}

interface SentMail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/** Records what would have gone over the wire, or fails the way a server would. */
function stubTransport(failure?: Error) {
  const options: MailTransportOptions[] = [];
  const sent: SentMail[] = [];
  const createTransport = (opts: MailTransportOptions): MailTransport => {
    options.push(opts);
    return {
      sendMail: async (message: SentMail) => {
        if (failure) throw failure;
        sent.push(message);
        return { messageId: '<test@example.com>' };
      },
    };
  };
  return { createTransport, options, sent };
}

/** Swallows the log lines so the test output stays readable; returns what was logged. */
function captureLog<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const collect =
    () =>
    (...args: unknown[]): void => {
      lines.push(args.map(String).join(' '));
    };
  console.log = collect();
  console.warn = collect();
  console.error = collect();
  return run()
    .then((result) => ({ result, lines }))
    .finally(() => {
      Object.assign(console, original);
    });
}

const clock = (): Date => new Date('2026-09-24T10:00:00.000Z');

test('a successful send records a green status and logs one event', async () => {
  const { store, written } = stubStore(configured);
  const transport = stubTransport();
  const mailer = createMailer(store, { createTransport: transport.createTransport, now: clock });

  const { result: status, lines } = await captureLog(() => mailer.sendTestMail('max@example.com'));

  assert.deepEqual(status, {
    lastSendAt: '2026-09-24T10:00:00.000Z',
    lastSendResult: 'ok',
    lastSendError: null,
  });
  assert.deepEqual(written, [status]);
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0]?.to, 'max@example.com');
  assert.equal(transport.sent[0]?.from, '"Eunomia" <eunomia@example.com>');
  assert.match(transport.sent[0]?.subject ?? '', /Testnachricht/);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /^eunomia event=MAIL_SEND_OK level=info /);
});

test('the transport gets the configured host, port, TLS mode, credentials and timeouts', async () => {
  const { store } = stubStore({ ...configured, 'mail.port': 465, 'mail.secure': true });
  const transport = stubTransport();
  const mailer = createMailer(store, { createTransport: transport.createTransport, now: clock });

  await captureLog(() => mailer.sendTestMail('max@example.com'));

  assert.deepEqual(transport.options[0], {
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    auth: { user: 'eunomia@example.com', pass: 'hunter2' },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
});

test('a server without authentication is sent no credentials', async () => {
  const { store } = stubStore({ ...configured, 'mail.user': null, 'mail.password': null });
  const transport = stubTransport();
  const mailer = createMailer(store, { createTransport: transport.createTransport, now: clock });

  await captureLog(() => mailer.sendTestMail('max@example.com'));

  assert.equal(transport.options[0]?.auth, undefined);
});

test('a rejected send records a red status and logs the greppable failure line', async () => {
  const failure = Object.assign(new Error('Invalid login: 535 nope'), { code: 'EAUTH' });
  const { store, written } = stubStore(configured);
  const transport = stubTransport(failure);
  const mailer = createMailer(store, { createTransport: transport.createTransport, now: clock });

  const { lines } = await captureLog(async () => {
    await assert.rejects(
      () => mailer.sendTestMail('max@example.com'),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === ERROR_CODES.MAIL_SEND_FAILED &&
        error.httpStatus === 502,
    );
  });

  assert.deepEqual(written, [
    {
      lastSendAt: '2026-09-24T10:00:00.000Z',
      lastSendResult: 'error',
      lastSendError: 'Invalid login: 535 nope',
    },
  ]);
  assert.equal(lines.length, 1, 'exactly one line, so a grep finds one failure per attempt');
  const line = lines[0] ?? '';
  assert.match(line, /^eunomia event=MAIL_SEND_FAILED level=error /);
  assert.match(line, /code=EAUTH/);
  assert.match(line, /host=smtp\.example\.com:587/);
  // The password must never reach the log.
  assert.equal(line.includes('hunter2'), false);
});

test('an incomplete configuration is reported without attempting a connection', async () => {
  const cases: Array<[string, Settings]> = [
    ['disabled', { ...configured, 'mail.enabled': false }],
    ['no host', { ...configured, 'mail.host': null }],
    ['no sender', { ...configured, 'mail.fromAddress': null }],
    ['user without a readable password', { ...configured, 'mail.password': null }],
  ];

  for (const [label, settings] of cases) {
    const { store, written } = stubStore(settings);
    const transport = stubTransport();
    const mailer = createMailer(store, { createTransport: transport.createTransport, now: clock });

    await captureLog(async () => {
      await assert.rejects(
        () => mailer.sendTestMail('max@example.com'),
        (error: unknown) =>
          error instanceof ApiError &&
          error.code === ERROR_CODES.MAIL_NOT_CONFIGURED &&
          error.httpStatus === 409,
        label,
      );
    });

    assert.equal(transport.options.length, 0, `${label}: no transport may be built`);
    // A configuration gap must not overwrite the status of the last real send.
    assert.deepEqual(written, [], `${label}: nothing was attempted, so nothing is recorded`);
  }
});

test('readStatus reports what was recorded, and null before the first send', async () => {
  const empty = createMailer(stubStore(configured).store, { now: clock });
  assert.deepEqual(await empty.readStatus(), {
    lastSendAt: null,
    lastSendResult: null,
    lastSendError: null,
  });

  const { store } = stubStore(configured);
  const transport = stubTransport();
  const mailer = createMailer(store, { createTransport: transport.createTransport, now: clock });
  await captureLog(() => mailer.sendTestMail('max@example.com'));

  assert.deepEqual(await mailer.readStatus(), {
    lastSendAt: '2026-09-24T10:00:00.000Z',
    lastSendResult: 'ok',
    lastSendError: null,
  });
});
