import type { Pool } from 'mariadb';

import { PERMISSIONS, listUsersWithAccess } from '../auth/permissions.js';
import { withTransaction } from '../db/transaction.js';
import { type EncryptionKey, getSettings, setApplicationValues } from '../settings/repository.js';
import type { SettingKey, SettingValue } from '../settings/registry.js';
import type { PayableInvoice, ReminderStage } from './payment.js';

/**
 * Everything the reminder run touches in the database, behind one interface.
 * Same line as mail/store.ts: the runner talks to this, so its tests need
 * neither a database nor a socket, and the SQL has one place to live.
 */

/** The configuration a run reads, already typed. */
export interface ReminderSettings {
  enabled: boolean;
  /** Mail can be off independently — then there is nothing to send with. */
  mailEnabled: boolean;
  hour: number;
  timeZone: string;
  repeatDays: number;
  appUrl: string | null;
}

/** What the last run left behind, for the settings page. */
export interface ReminderRunStatus {
  lastRunAt: string;
  lastRunResult: 'ok' | 'error';
  lastRunError: string | null;
  lastRunSent: number;
}

/** The same, as it reads back before the first run has happened. */
export interface StoredRunStatus {
  lastRunAt: string | null;
  lastRunResult: 'ok' | 'error' | null;
  lastRunError: string | null;
  lastRunSent: number | null;
}

/** An unpaid invoice with everything a reminder line needs. */
export interface PayableInvoiceRow extends PayableInvoice {
  invoiceUID: string;
  invoiceNumber: string;
  accountUID: string;
  accountName: string;
  payee: string | null;
  amount: number;
}

/** The last reminder a recipient got about an invoice. */
export interface ReminderRecord {
  invoiceUID: string;
  userId: number;
  stage: ReminderStage;
  /** The calendar day it went out, `YYYY-MM-DD` in the configured zone. */
  sentOn: string;
}

export interface ReminderStore {
  readSettings(): Promise<ReminderSettings>;
  /** `lastRunAt` doubles as the scheduler's watermark — see schedule.ts. */
  readStatus(): Promise<StoredRunStatus>;
  writeStatus(status: ReminderRunStatus): Promise<void>;
  listPayableInvoices(): Promise<PayableInvoiceRow[]>;
  listRecipients(): Promise<
    Array<{ userId: number; email: string; name: string; all: boolean; accountUIDs: string[] }>
  >;
  listReminders(invoiceUIDs: string[]): Promise<ReminderRecord[]>;
  recordReminders(records: ReminderRecord[]): Promise<void>;
}

/** Joins the parts of a name that exist, so a missing surname leaves no gap. */
function fullName(firstname: string, surname: string | null): string {
  return [firstname, surname].filter((part) => part !== null && part !== '').join(' ');
}

export function createReminderStore(pool: Pool, encryptionKey: EncryptionKey): ReminderStore {
  return {
    readSettings: async (): Promise<ReminderSettings> => {
      const settings = await getSettings(pool, encryptionKey);
      return {
        enabled: settings['reminders.enabled'] === true,
        mailEnabled: settings['mail.enabled'] === true,
        hour: Number(settings['reminders.hour']),
        timeZone: String(settings['reminders.timeZone']),
        repeatDays: Number(settings['reminders.repeatDays']),
        appUrl: (settings['reminders.appUrl'] as string | null) ?? null,
      };
    },

    readStatus: async (): Promise<StoredRunStatus> => {
      const settings = await getSettings(pool, encryptionKey);
      return {
        lastRunAt: (settings['reminders.lastRunAt'] as string | null) ?? null,
        lastRunResult: (settings['reminders.lastRunResult'] as 'ok' | 'error' | null) ?? null,
        lastRunError: (settings['reminders.lastRunError'] as string | null) ?? null,
        lastRunSent: (settings['reminders.lastRunSent'] as number | null) ?? null,
      };
    },

    // Through setApplicationValues, which bypasses the readonly guard the API
    // applies to client writes — the runner is the one component allowed here.
    writeStatus: async (status: ReminderRunStatus): Promise<void> => {
      await setApplicationValues(
        pool,
        new Map<SettingKey, SettingValue>([
          ['reminders.lastRunAt', status.lastRunAt],
          ['reminders.lastRunResult', status.lastRunResult],
          ['reminders.lastRunError', status.lastRunError],
          ['reminders.lastRunSent', status.lastRunSent],
        ]),
      );
    },

    /*
     * Every unpaid invoice, with the payee a transfer would go to: the
     * collection agency when one took the billing over, otherwise the facility.
     * Filtering by due date is left to calcPaymentState — the set is small
     * (a household's open invoices), and one rule in one place beats a WHERE
     * clause that has to agree with it.
     */
    listPayableInvoices: async (): Promise<PayableInvoiceRow[]> =>
      pool.query<PayableInvoiceRow[]>(
        `SELECT i.invoiceUID, i.invoiceNumber, i.accountUID,
                i.invoiceAmount AS amount, i.transferDate, i.transferUntilDate, i.directPayment,
                COALESCE(ag.agencyName, f.facilityName) AS payee,
                CONCAT_WS(' ', a.firstname, a.surname) AS accountName
           FROM Invoices i
           JOIN Accounts a ON a.accountUID = i.accountUID
           LEFT JOIN CollectionAgencies ag ON ag.agencyUID = i.agencyUID
           LEFT JOIN Facilities f ON f.facilityUID = i.facilityUID
          WHERE i.invoiceStatus <> -1
            AND i.transferDate IS NULL
            AND i.directPayment = 0
          ORDER BY i.transferUntilDate IS NULL, i.transferUntilDate, i.invoiceNumber`,
      ),

    listRecipients: async () => {
      const users = await listUsersWithAccess(pool, PERMISSIONS.VIEW_INVOICES);
      return users.map((user) => ({
        userId: user.userId,
        email: user.email,
        name: fullName(user.firstname, user.surname),
        all: user.all,
        accountUIDs: user.accountUIDs,
      }));
    },

    listReminders: async (invoiceUIDs: string[]): Promise<ReminderRecord[]> => {
      if (invoiceUIDs.length === 0) return [];
      const placeholders = invoiceUIDs.map(() => '?').join(', ');
      const rows = await pool.query<
        Array<{ invoiceUID: string; userID: number; stage: ReminderStage; sentOn: string }>
      >(
        `SELECT invoiceUID, userID, stage, sentOn
           FROM InvoiceReminders
          WHERE invoiceUID IN (${placeholders})`,
        invoiceUIDs,
      );
      return rows.map((row) => ({
        invoiceUID: row.invoiceUID,
        userId: row.userID,
        stage: row.stage,
        sentOn: row.sentOn,
      }));
    },

    /*
     * One statement for the whole batch, in a transaction: a mail went out, so
     * either every invoice it named is stamped or none is — a half-written
     * batch would repeat part of a reminder the recipient already has.
     */
    recordReminders: async (records: ReminderRecord[]): Promise<void> => {
      if (records.length === 0) return;
      await withTransaction(pool, async (conn) => {
        const placeholders = records.map(() => '(?, ?, ?, ?)').join(', ');
        const params = records.flatMap((record) => [
          record.invoiceUID,
          record.userId,
          record.stage,
          record.sentOn,
        ]);
        await conn.query(
          `INSERT INTO InvoiceReminders (invoiceUID, userID, stage, sentOn)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE stage = VALUES(stage), sentOn = VALUES(sentOn)`,
          params,
        );
      });
    },
  };
}
