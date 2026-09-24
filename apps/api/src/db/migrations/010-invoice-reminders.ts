import type { MigrationContext } from '../umzug.js';

/**
 * Payment reminders (see Notes/eunomia-plan.md, 2.5 / Slice 31): which invoice
 * a user was last reminded about, at which stage, and when.
 *
 * One row per (invoice, recipient) holding the LAST reminder rather than a
 * history — the run only ever asks "what did this person hear about this
 * invoice, and how long ago", and a history nobody reads would grow forever.
 *
 * `sentOn` is a DATE, not a timestamp: the repeat interval is counted in whole
 * days, and everything else about a due date is calendar arithmetic too. A
 * time of day would only invite the question which zone it is in.
 *
 * Both foreign keys cascade on delete: a reminder without its invoice or
 * without its recipient means nothing. That is the opposite of
 * SystemSettings.updatedByUserID, which is audit information and deliberately
 * outlives the user account.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    CREATE TABLE InvoiceReminders (
      invoiceUID VARCHAR(12) NOT NULL,
      userID BIGINT UNSIGNED NOT NULL,
      stage VARCHAR(10) NOT NULL,
      sentOn DATE NOT NULL,
      PRIMARY KEY (invoiceUID, userID),
      CONSTRAINT fk_invoicereminders_invoice FOREIGN KEY (invoiceUID)
        REFERENCES Invoices (invoiceUID) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_invoicereminders_user FOREIGN KEY (userID)
        REFERENCES Users (userID) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Drops the table. Everything in it is bookkeeping about mails already sent;
 * after a rollback the next run starts over, which costs one extra reminder.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS InvoiceReminders');
}
