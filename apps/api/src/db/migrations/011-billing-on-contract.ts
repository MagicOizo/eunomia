import type { MigrationContext } from '../umzug.js';

/**
 * A Leistungsabrechnung hangs on the policy, not on one submission (see
 * Notes/eunomia-plan.md, Slice 37 / issues.md 7). The insurer routinely
 * answers invoices from several submissions in one letter, which the 1:n key
 * ServiceBillings.submissionUID made impossible to record. Which submissions a
 * billing touches now follows from its Allocations; "one insured person per
 * billing" is still carried by the contract.
 *
 * UNIQUE (contractUID, billingNumber) — the author's express wish — cannot be
 * declared directly: the soft-delete would let a deleted billing block its
 * number forever, and MariaDB has no partial index. activeBillingNumber is a
 * generated column that turns NULL at billingStatus = -1, and NULL never
 * collides in a UNIQUE key. VIRTUAL is enough; InnoDB under MariaDB 11 carries
 * a unique index on it (verified before writing this migration).
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  // Guard first, while the old shape is still intact: today the only way to
  // bill across two submissions is to enter the same letter twice, so such
  // pairs may well exist. Merging them would silently rewrite the author's
  // data, so the migration stops and names them instead.
  const duplicates = await pool.query<
    Array<{ contractUID: string; billingNumber: string; n: number }>
  >(
    `SELECT s.contractUID, b.billingNumber, COUNT(*) AS n
       FROM ServiceBillings b
       JOIN Submissions s ON s.submissionUID = b.submissionUID
      WHERE b.billingStatus <> -1
      GROUP BY s.contractUID, b.billingNumber
     HAVING n > 1
      ORDER BY s.contractUID, b.billingNumber`,
  );
  if (duplicates.length > 0) {
    const listed = duplicates
      .map((row) => `${row.contractUID}/${row.billingNumber} (${Number(row.n)}x)`)
      .join(', ');
    throw new Error(
      `Cannot add UNIQUE (contractUID, billingNumber): the same billing number exists more than ` +
        `once under one policy. Merge or delete these first, then migrate again: ${listed}`,
    );
  }

  await pool.query(
    'ALTER TABLE ServiceBillings ADD COLUMN contractUID VARCHAR(12) DEFAULT NULL AFTER billingUID',
  );
  await pool.query(`
    UPDATE ServiceBillings b
      JOIN Submissions s ON s.submissionUID = b.submissionUID
       SET b.contractUID = s.contractUID
  `);
  await pool.query(`
    ALTER TABLE ServiceBillings
      MODIFY COLUMN contractUID VARCHAR(12) NOT NULL,
      ADD KEY idx_billings_contract (contractUID),
      ADD CONSTRAINT fk_billings_contract FOREIGN KEY (contractUID)
        REFERENCES Contracts (contractUID) ON DELETE RESTRICT ON UPDATE CASCADE
  `);

  await pool.query('ALTER TABLE ServiceBillings DROP FOREIGN KEY fk_billings_submission');
  await pool.query(`
    ALTER TABLE ServiceBillings
      DROP INDEX idx_billings_submission,
      DROP COLUMN submissionUID
  `);

  await pool.query(`
    ALTER TABLE ServiceBillings
      ADD COLUMN activeBillingNumber VARCHAR(50)
        GENERATED ALWAYS AS (IF(billingStatus = -1, NULL, billingNumber)) VIRTUAL,
      ADD UNIQUE KEY uq_billings_contract_number (contractUID, activeBillingNumber)
  `);
}

/**
 * Restores ServiceBillings.submissionUID. LOSSY: a billing that answers
 * several submissions keeps only one of them — the submission of the invoice
 * it booked first — and a billing without any booking falls back to the
 * oldest submission of its policy. A billing under a policy that has no
 * submission at all cannot be expressed in the old shape and is dropped
 * together with its allocations.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE ServiceBillings
      DROP INDEX uq_billings_contract_number,
      DROP COLUMN activeBillingNumber
  `);
  await pool.query(
    'ALTER TABLE ServiceBillings ADD COLUMN submissionUID VARCHAR(12) DEFAULT NULL AFTER billingUID',
  );

  // The submission of the earliest invoice this billing booked, within its
  // own policy.
  await pool.query(`
    UPDATE ServiceBillings b
       SET b.submissionUID = (
         SELECT si.submissionUID
           FROM Allocations a
           JOIN SubmissionInvoices si
             ON si.invoiceUID = a.invoiceUID AND si.contractUID = b.contractUID
          WHERE a.billingUID = b.billingUID AND a.allocationStatus <> -1
          ORDER BY a.allocationID
          LIMIT 1
       )
  `);
  await pool.query(`
    UPDATE ServiceBillings b
       SET b.submissionUID = (
         SELECT s.submissionUID FROM Submissions s
          WHERE s.contractUID = b.contractUID
          ORDER BY s.submittedDate, s.submissionID
          LIMIT 1
       )
     WHERE b.submissionUID IS NULL
  `);
  await pool.query(
    'DELETE FROM Allocations WHERE billingUID IN (SELECT billingUID FROM ServiceBillings WHERE submissionUID IS NULL)',
  );
  await pool.query('DELETE FROM ServiceBillings WHERE submissionUID IS NULL');

  await pool.query(`
    ALTER TABLE ServiceBillings
      MODIFY COLUMN submissionUID VARCHAR(12) NOT NULL,
      ADD KEY idx_billings_submission (submissionUID),
      ADD CONSTRAINT fk_billings_submission FOREIGN KEY (submissionUID)
        REFERENCES Submissions (submissionUID) ON DELETE RESTRICT ON UPDATE CASCADE
  `);
  await pool.query('ALTER TABLE ServiceBillings DROP FOREIGN KEY fk_billings_contract');
  await pool.query(`
    ALTER TABLE ServiceBillings
      DROP INDEX idx_billings_contract,
      DROP COLUMN contractUID
  `);
}
