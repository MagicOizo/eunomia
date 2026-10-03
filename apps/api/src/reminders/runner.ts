import { type ReminderStage, calcPaymentState, daysUntil } from '@eunomia/shared';

import { logEvent } from '../lib/log.js';
import type { Mailer } from '../mail/mailer.js';
import { type ReminderEntry, renderReminderMail } from './message.js';
import { zonedNow } from './schedule.js';
import type { PayableInvoiceRow, ReminderRecord, ReminderStore } from './store.js';

/**
 * One run of the payment reminders (see Notes/eunomia-plan.md, Slice 31).
 *
 * Shape of the rule, decided in plan mode:
 *  - a due invoice is announced ONCE. It does not repeat, because an invoice
 *    with no due date recorded counts as due forever and would nag forever.
 *  - the step from due to overdue is announced again — that is news.
 *  - an overdue invoice repeats every `repeatDays` days while it stays unpaid.
 *
 * The run stamps an invoice only after the mail for it was accepted, so a
 * failed send is retried rather than silently swallowed.
 */

/** Why a run did nothing, when it did nothing. */
export type ReminderSkip = 'disabled' | 'mail_not_configured';

export interface ReminderRunResult {
  ranAt: string;
  skipped: ReminderSkip | null;
  /** Unpaid invoices considered, before the due/overdue rule. */
  invoices: number;
  /** Recipients that had at least one invoice to hear about. */
  recipients: number;
  sent: number;
  failed: number;
  dryRun: boolean;
  /** Per recipient, what they would get — the settings page shows this for a preview. */
  preview: ReminderPreview[];
}

/**
 * One recipient's rendered mail. `accountUIDs` says whose case data the text
 * speaks about, so the route can withhold a text from a caller who may not read
 * those accounts (SEC-03) — the run itself needs no caller and asks no one.
 */
export interface ReminderPreview {
  email: string;
  subject: string;
  text: string;
  accountUIDs: string[];
}

export interface ReminderRunOptions {
  /** Compute everything, send nothing, stamp nothing, write no status. */
  dryRun?: boolean;
}

export interface ReminderRunnerDeps {
  now?: () => Date;
}

export interface ReminderRunner {
  run(options?: ReminderRunOptions): Promise<ReminderRunResult>;
}

/** The recipient's view of one invoice, or null when they hear nothing about it. */
function stageFor(
  invoice: PayableInvoiceRow,
  previous: ReminderRecord | undefined,
  today: string,
  repeatDays: number,
): ReminderStage | null {
  const state = calcPaymentState(invoice, today);
  if (state !== 'due' && state !== 'overdue') return null;

  if (previous === undefined) return state;
  // The step up to overdue is worth a mail even if the last one was yesterday.
  if (state === 'overdue' && previous.stage === 'due') return 'overdue';
  if (state === 'overdue' && -daysUntil(previous.sentOn, today) >= repeatDays) return 'overdue';
  return null;
}

export function createReminderRunner(
  store: ReminderStore,
  mailer: Mailer,
  deps: ReminderRunnerDeps = {},
): ReminderRunner {
  const now = deps.now ?? (() => new Date());

  return {
    async run(options: ReminderRunOptions = {}): Promise<ReminderRunResult> {
      const dryRun = options.dryRun === true;
      const settings = await store.readSettings();
      const ranAt = now().toISOString();
      const empty = (skipped: ReminderSkip | null): ReminderRunResult => ({
        ranAt,
        skipped,
        invoices: 0,
        recipients: 0,
        sent: 0,
        failed: 0,
        dryRun,
        preview: [],
      });

      if (!settings.enabled) return empty('disabled');
      /*
       * Nothing was attempted, so nothing is recorded — the same reasoning as
       * in the mailer: a red status for a send that never happened would be a
       * lie, and the settings page names the cause itself.
       */
      if (!settings.mailEnabled) {
        logEvent('warn', 'REMINDERS_SKIPPED', { reason: 'mail_not_configured' });
        return empty('mail_not_configured');
      }

      const today = zonedNow(now(), settings.timeZone).date;
      const invoices = await store.listPayableInvoices();
      const recipients = await store.listRecipients();
      const history = await store.listReminders(invoices.map((invoice) => invoice.invoiceUID));

      let sent = 0;
      let failed = 0;
      let lastError: string | null = null;
      const preview: ReminderRunResult['preview'] = [];

      for (const recipient of recipients) {
        const visible = recipient.all
          ? invoices
          : invoices.filter((invoice) => recipient.accountUIDs.includes(invoice.accountUID));

        const entries: ReminderEntry[] = [];
        const records: ReminderRecord[] = [];
        const accountUIDs = new Set<string>();
        for (const invoice of visible) {
          const previous = history.find(
            (record) =>
              record.invoiceUID === invoice.invoiceUID && record.userId === recipient.userId,
          );
          const stage = stageFor(invoice, previous, today, settings.repeatDays);
          if (stage === null) continue;

          accountUIDs.add(invoice.accountUID);
          entries.push({
            invoiceUID: invoice.invoiceUID,
            invoiceNumber: invoice.invoiceNumber,
            accountName: invoice.accountName,
            payee: invoice.payee,
            amount: invoice.amount,
            transferUntilDate: invoice.transferUntilDate,
            stage,
          });
          records.push({
            invoiceUID: invoice.invoiceUID,
            userId: recipient.userId,
            stage,
            sentOn: today,
          });
        }
        if (entries.length === 0) continue;

        const mail = renderReminderMail(recipient.name, entries, {
          today,
          appUrl: settings.appUrl,
        });
        preview.push({
          email: recipient.email,
          subject: mail.subject,
          text: mail.text,
          accountUIDs: [...accountUIDs],
        });
        if (dryRun) continue;

        try {
          await mailer.sendMail({ to: recipient.email, subject: mail.subject, text: mail.text });
          // Only now: an unstamped invoice is tried again next run, a stamped
          // one whose mail never arrived would be silently skipped.
          await store.recordReminders(records);
          sent += 1;
        } catch (error) {
          // The mailer already logged the transport failure with its details.
          failed += 1;
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      const result: ReminderRunResult = {
        ranAt,
        skipped: null,
        invoices: invoices.length,
        recipients: preview.length,
        sent,
        failed,
        dryRun,
        preview,
      };

      logEvent(failed > 0 ? 'warn' : 'info', 'REMINDERS_RUN', {
        invoices: result.invoices,
        recipients: result.recipients,
        sent,
        failed,
        dryRun,
      });

      if (!dryRun) {
        await store.writeStatus({
          lastRunAt: ranAt,
          lastRunResult: failed > 0 ? 'error' : 'ok',
          lastRunError: lastError,
          lastRunSent: sent,
        });
      }
      return result;
    },
  };
}
