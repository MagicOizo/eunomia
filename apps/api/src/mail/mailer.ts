import nodemailer from 'nodemailer';

import { ApiError } from '../lib/api-error.js';
import { ERROR_CODES } from '../lib/error-codes.js';
import { logEvent } from '../lib/log.js';
import type { SettingKey, SettingValue } from '../settings/registry.js';

/**
 * Sending mail through the SMTP account configured in the system settings
 * (see Notes/eunomia-plan.md, 2.6 / Slice 30).
 *
 * This slice has exactly one caller — the test mail from the settings page —
 * but the shape is the one the later notification features (payment reminders,
 * 2.5) will use: they call `sendMail` and inherit the status bookkeeping and
 * the log events for free.
 *
 * The mailer talks to a `MailSettingsStore` rather than to the pool directly, so
 * its unit tests need neither a database nor a socket (see mail/store.ts for the
 * database-backed implementation).
 */

/** What the settings page shows about the last attempt, in the API's shape. */
export interface MailSendStatus {
  /** ISO timestamp of the last attempt, or null when nothing was ever sent. */
  lastSendAt: string | null;
  lastSendResult: 'ok' | 'error' | null;
  /** The mail server's own words, kept for the admin — not shown to other users. */
  lastSendError: string | null;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** The settings the mailer needs, and the one thing it writes back. */
export interface MailSettingsStore {
  read(): Promise<Record<SettingKey, SettingValue>>;
  writeStatus(status: MailSendStatus): Promise<void>;
}

/** The slice of nodemailer we use, so tests can inject a stub instead of a socket. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export interface MailTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

export interface MailerDeps {
  /** Injectable so unit tests never open a connection (as update-check.ts does with fetch). */
  createTransport?: (options: MailTransportOptions) => MailTransport;
  now?: () => Date;
}

/**
 * A mail server that never answers must not hold a request open: Express would
 * keep the connection and the admin would stare at a spinner.
 */
const TIMEOUT_MS = 10_000;

/** The configuration a send needs, once the settings have been read. */
interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  fromAddress: string;
  fromName: string | null;
}

/**
 * Reads the mail settings and reports what is missing. Returning the reason
 * rather than throwing lets the caller distinguish "not set up" from "tried and
 * failed" — only the second one is a failed send.
 */
function readMailConfig(
  settings: Record<SettingKey, SettingValue>,
): { ok: true; config: MailConfig } | { ok: false; reason: string } {
  if (settings['mail.enabled'] !== true) {
    return { ok: false, reason: 'Mail delivery is not enabled in the settings' };
  }
  const host = settings['mail.host'];
  if (typeof host !== 'string' || host === '') {
    return { ok: false, reason: 'No mail server is configured' };
  }
  const fromAddress = settings['mail.fromAddress'];
  if (typeof fromAddress !== 'string' || fromAddress === '') {
    return { ok: false, reason: 'No sender address is configured' };
  }
  const user = typeof settings['mail.user'] === 'string' ? settings['mail.user'] : null;
  const password = typeof settings['mail.password'] === 'string' ? settings['mail.password'] : null;
  if (user !== null && password === null) {
    // Either the password was never stored, or it could not be decrypted — the
    // settings repository has already logged which of the two it was.
    return {
      ok: false,
      reason: 'The mail server has a user but no readable password',
    };
  }

  const port = settings['mail.port'];
  return {
    ok: true,
    config: {
      host,
      port: typeof port === 'number' ? port : 587,
      secure: settings['mail.secure'] === true,
      user,
      password,
      fromAddress,
      fromName: typeof settings['mail.fromName'] === 'string' ? settings['mail.fromName'] : null,
    },
  };
}

export interface Mailer {
  /** Sends a message, records the outcome and logs one greppable event. */
  sendMail(message: MailMessage): Promise<MailSendStatus>;
  /** The test mail from the settings page; always goes to the admin's own address. */
  sendTestMail(recipient: string): Promise<MailSendStatus>;
  /** The recorded status of the last attempt, for GET /settings. */
  readStatus(): Promise<MailSendStatus>;
}

export function createMailer(store: MailSettingsStore, deps: MailerDeps = {}): Mailer {
  const createTransport =
    deps.createTransport ??
    ((options: MailTransportOptions): MailTransport =>
      nodemailer.createTransport(options) as unknown as MailTransport);
  const now = deps.now ?? ((): Date => new Date());

  async function recordStatus(
    result: 'ok' | 'error',
    errorMessage: string | null,
  ): Promise<MailSendStatus> {
    const status: MailSendStatus = {
      lastSendAt: now().toISOString(),
      lastSendResult: result,
      lastSendError: errorMessage,
    };
    await store.writeStatus(status);
    return status;
  }

  async function readStatus(): Promise<MailSendStatus> {
    const settings = await store.read();
    const result = settings['mail.lastSendResult'];
    const at = settings['mail.lastSendAt'];
    const error = settings['mail.lastSendError'];
    return {
      lastSendAt: typeof at === 'string' ? at : null,
      lastSendResult: result === 'ok' || result === 'error' ? result : null,
      lastSendError: typeof error === 'string' ? error : null,
    };
  }

  async function sendMail(message: MailMessage): Promise<MailSendStatus> {
    const resolved = readMailConfig(await store.read());

    if (!resolved.ok) {
      logEvent('warn', 'MAIL_NOT_CONFIGURED', { to: message.to, reason: resolved.reason });
      // Not recorded as a failed send: nothing was attempted, and painting the
      // status red because someone switched the feature off would be a lie.
      throw new ApiError(409, ERROR_CODES.MAIL_NOT_CONFIGURED, resolved.reason);
    }

    const { config } = resolved;
    const transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user !== null && config.password !== null
          ? { user: config.user, pass: config.password }
          : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });

    const from =
      config.fromName === null
        ? config.fromAddress
        : `"${config.fromName}" <${config.fromAddress}>`;

    try {
      const info = await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      logEvent('info', 'MAIL_SEND_OK', {
        to: message.to,
        host: `${config.host}:${config.port}`,
        messageId: info.messageId,
      });
      return await recordStatus('ok', null);
    } catch (error) {
      const detail = describeTransportError(error);
      // The one line an operator greps for. It carries the server's own words,
      // never the password — see lib/log.ts.
      logEvent('error', 'MAIL_SEND_FAILED', {
        to: message.to,
        host: `${config.host}:${config.port}`,
        secure: config.secure,
        code: detail.code,
        message: detail.message,
      });
      await recordStatus('error', detail.message);
      throw new ApiError(
        502,
        ERROR_CODES.MAIL_SEND_FAILED,
        `Sending mail failed: ${detail.message}`,
        { reason: detail.message, code: detail.code },
      );
    }
  }

  async function sendTestMail(recipient: string): Promise<MailSendStatus> {
    return sendMail({
      to: recipient,
      subject: 'Eunomia: Testnachricht',
      text: [
        'Diese Nachricht bestätigt, dass Eunomia über den eingetragenen Mailserver versenden kann.',
        '',
        'Sie wurde über die Schaltfläche „Testmail senden" in den System-Einstellungen ausgelöst.',
      ].join('\n'),
    });
  }

  return { sendMail, sendTestMail, readStatus };
}

/** Pulls the useful parts out of whatever nodemailer threw. */
function describeTransportError(error: unknown): { code: string | undefined; message: string } {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return { code: typeof code === 'string' ? code : undefined, message: error.message };
  }
  return { code: undefined, message: String(error) };
}
