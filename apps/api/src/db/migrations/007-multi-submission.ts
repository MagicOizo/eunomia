import type { MigrationContext } from '../umzug.js';

/**
 * Data model v3, part 2 (see Notes/eunomia-plan.md, 2.3 / Slice 17): an
 * invoice may be submitted to several policies, but to each policy at most
 * once.
 *  - SubmissionInvoices replaces Invoices.submissionUID. contractUID is
 *    denormalised so UNIQUE (invoiceUID, contractUID) can enforce "once per
 *    policy"; the composite foreign key to Submissions (submissionUID,
 *    contractUID) keeps that copy from ever diverging from the submission.
 *  - InvoiceExclusions: manual "not reimbursable under this policy" marks.
 *  - Invoices.reimbursementClosed: the author declares the reimbursement of
 *    an invoice finished although the allocations do not cover its amount.
 *
 * Link tables carry no UID and no status column (like UserAccountRoles):
 * a withdrawn link is simply deleted.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(
    'ALTER TABLE Submissions ADD UNIQUE KEY uq_submissions_contract (submissionUID, contractUID)',
  );

  await pool.query(`
    CREATE TABLE SubmissionInvoices (
      submissionUID VARCHAR(12) NOT NULL,
      invoiceUID VARCHAR(12) NOT NULL,
      contractUID VARCHAR(12) NOT NULL,
      PRIMARY KEY (submissionUID, invoiceUID),
      UNIQUE KEY uq_subinv_invoice_contract (invoiceUID, contractUID),
      CONSTRAINT fk_subinv_submission FOREIGN KEY (submissionUID, contractUID)
        REFERENCES Submissions (submissionUID, contractUID) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_subinv_invoice FOREIGN KEY (invoiceUID)
        REFERENCES Invoices (invoiceUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    INSERT INTO SubmissionInvoices (submissionUID, invoiceUID, contractUID)
    SELECT i.submissionUID, i.invoiceUID, s.contractUID
      FROM Invoices i
      JOIN Submissions s ON s.submissionUID = i.submissionUID
  `);

  await pool.query(`
    ALTER TABLE Invoices
      DROP FOREIGN KEY fk_invoices_submission
  `);
  await pool.query(`
    ALTER TABLE Invoices
      DROP INDEX idx_invoices_submission,
      DROP COLUMN submissionUID,
      ADD COLUMN reimbursementClosed TINYINT(1) NOT NULL DEFAULT 0 AFTER directPayment
  `);

  await pool.query(`
    CREATE TABLE InvoiceExclusions (
      invoiceUID VARCHAR(12) NOT NULL,
      contractUID VARCHAR(12) NOT NULL,
      note VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (invoiceUID, contractUID),
      KEY idx_exclusions_contract (contractUID),
      CONSTRAINT fk_exclusions_invoice FOREIGN KEY (invoiceUID)
        REFERENCES Invoices (invoiceUID) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_exclusions_contract FOREIGN KEY (contractUID)
        REFERENCES Contracts (contractUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * Restores Invoices.submissionUID. LOSSY: an invoice submitted to several
 * policies keeps only one of its submissions (the smallest UID); exclusions
 * and the "reimbursement closed" flag are dropped.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS InvoiceExclusions');
  await pool.query(`
    ALTER TABLE Invoices
      DROP COLUMN reimbursementClosed,
      ADD COLUMN submissionUID VARCHAR(12) DEFAULT NULL AFTER facilityUID,
      ADD KEY idx_invoices_submission (submissionUID),
      ADD CONSTRAINT fk_invoices_submission FOREIGN KEY (submissionUID)
        REFERENCES Submissions (submissionUID) ON DELETE RESTRICT ON UPDATE CASCADE
  `);
  await pool.query(`
    UPDATE Invoices i
      JOIN (SELECT invoiceUID, MIN(submissionUID) AS submissionUID
              FROM SubmissionInvoices GROUP BY invoiceUID) si
        ON si.invoiceUID = i.invoiceUID
       SET i.submissionUID = si.submissionUID
  `);
  await pool.query('DROP TABLE IF EXISTS SubmissionInvoices');
  await pool.query('ALTER TABLE Submissions DROP INDEX uq_submissions_contract');
}
