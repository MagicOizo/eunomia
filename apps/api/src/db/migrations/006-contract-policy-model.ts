import type { MigrationContext } from '../umzug.js';

/**
 * Data model v3, part 1 (see Notes/eunomia-plan.md, 1.3.7 / 2.3 / Slice 16):
 * a contract becomes a stable policy ("Police"); what changes over its life
 * moves into dated child rows:
 *  - ContractPremiums: monthly premium valid from a date (intra-year premium
 *    adjustments). Informational only — no effect on deductible or bonus.
 *  - ContractTerms: deductible, annual reimbursement cap and reimbursement
 *    rate, valid from a calendar year until the next entry. The deductible is
 *    an annual figure of the policy and never changes mid-year.
 *
 * DELIBERATELY DESTRUCTIVE: existing contracts, submissions, service billings
 * and allocations are deleted, not converted. The author decided to re-enter
 * them under the new model; they are exported beforehand with
 * scripts/export-legacy-contracts.sh (and a regular backup). Master data and
 * invoices are kept — invoices simply become un-submitted again.
 *
 * bonusForfeitRule and the claim-free-years start values are stored from now
 * on but only evaluated once the bonus scale arrives (Slice 18).
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('UPDATE Invoices SET submissionUID = NULL WHERE submissionUID IS NOT NULL');
  await pool.query('DELETE FROM Allocations');
  await pool.query('DELETE FROM ServiceBillings');
  await pool.query('DELETE FROM Submissions');
  await pool.query('DELETE FROM Contracts');

  await pool.query(`
    ALTER TABLE Contracts
      DROP COLUMN deductible,
      DROP COLUMN reimbursementCap,
      DROP COLUMN monthlyRate,
      DROP COLUMN bonus,
      ADD COLUMN contractKind VARCHAR(16) NOT NULL DEFAULT 'FULL' AFTER accountUID,
      ADD COLUMN bonusForfeitRule VARCHAR(16) NOT NULL DEFAULT 'ON_REIMBURSEMENT' AFTER contractEnd,
      ADD COLUMN claimFreeYearsAtStart TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER bonusForfeitRule,
      ADD COLUMN claimFreeCountingFromYear SMALLINT DEFAULT NULL AFTER claimFreeYearsAtStart
  `);

  // validTo is not stored: a premium is valid until the day before the next
  // entry's validFrom (derived in the API), so the history can never overlap.
  await pool.query(`
    CREATE TABLE ContractPremiums (
      premiumID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      premiumUID VARCHAR(12) NOT NULL UNIQUE,
      contractUID VARCHAR(12) NOT NULL,
      validFrom DATE NOT NULL,
      monthlyPremium DECIMAL(8,2) NOT NULL,
      note VARCHAR(255) DEFAULT NULL,
      premiumStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (premiumID),
      KEY idx_premiums_contract (contractUID, validFrom),
      CONSTRAINT fk_premiums_contract FOREIGN KEY (contractUID)
        REFERENCES Contracts (contractUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE ContractTerms (
      termsID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      termsUID VARCHAR(12) NOT NULL UNIQUE,
      contractUID VARCHAR(12) NOT NULL,
      validFromYear SMALLINT NOT NULL,
      deductible DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      reimbursementCap DECIMAL(8,2) DEFAULT NULL,
      reimbursementRate DECIMAL(5,2) NOT NULL DEFAULT 100.00,
      termsStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (termsID),
      KEY idx_terms_contract (contractUID, validFromYear),
      CONSTRAINT fk_terms_contract FOREIGN KEY (contractUID)
        REFERENCES Contracts (contractUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** Restores the pre-v3 schema shape. The data deleted by `up` does not come back. */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS ContractTerms');
  await pool.query('DROP TABLE IF EXISTS ContractPremiums');
  await pool.query(`
    ALTER TABLE Contracts
      DROP COLUMN claimFreeCountingFromYear,
      DROP COLUMN claimFreeYearsAtStart,
      DROP COLUMN bonusForfeitRule,
      DROP COLUMN contractKind,
      ADD COLUMN deductible DECIMAL(8,2) NOT NULL DEFAULT 0.00 AFTER contractEnd,
      ADD COLUMN reimbursementCap DECIMAL(8,2) DEFAULT NULL AFTER deductible,
      ADD COLUMN monthlyRate DECIMAL(8,2) NOT NULL DEFAULT 0.00 AFTER reimbursementCap,
      ADD COLUMN bonus DECIMAL(8,2) NOT NULL DEFAULT 0.00 AFTER monthlyRate
  `);
}
