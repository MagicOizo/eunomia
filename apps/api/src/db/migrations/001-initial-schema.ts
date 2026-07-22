import type { MigrationContext } from '../umzug.js';

/**
 * Initial schema for the invoice-management domain (see Notes/eunomia-plan.md,
 * 2.3). The user/rights tables (Users, Roles, ...) are intentionally NOT here
 * — they arrive in the auth slice.
 *
 * Conventions carried across every table:
 *  - a numeric BIGINT auto-increment primary key for internal ordering, plus
 *    a public prefixed-NanoID `...UID` column (see lib/ids.ts) that foreign
 *    keys reference — never the numeric key;
 *  - soft deletes via a `...Status` TINYINT (1 = active, 0 = inactive,
 *    -1 = deleted), applied CONSISTENTLY here (the first attempt had two
 *    tables that diverged from this);
 *  - money as DECIMAL, dates as DATE, utf8mb4 throughout.
 *
 * Foreign keys use ON DELETE RESTRICT: the application only ever soft-deletes,
 * so a hard delete of a still-referenced row is a mistake we want the database
 * to reject rather than silently cascade.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    CREATE TABLE Accounts (
      accountID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      accountUID VARCHAR(12) NOT NULL UNIQUE,
      surname VARCHAR(50),
      firstname VARCHAR(50) NOT NULL,
      middlename VARCHAR(50),
      birthDate DATE NOT NULL,
      leadAccountUID VARCHAR(12) DEFAULT NULL,
      accountStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (accountID),
      CONSTRAINT fk_accounts_leadAccount FOREIGN KEY (leadAccountUID)
        REFERENCES Accounts (accountUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE InsuranceCompanies (
      companyID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      companyUID VARCHAR(12) NOT NULL UNIQUE,
      companyName VARCHAR(100) NOT NULL,
      addressStreet VARCHAR(255),
      addressPostalCode VARCHAR(5),
      addressCity VARCHAR(100),
      serviceHotline VARCHAR(30),
      url VARCHAR(255),
      companyStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (companyID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE Contracts (
      contractID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      contractUID VARCHAR(12) NOT NULL UNIQUE,
      contractNumber VARCHAR(50) NOT NULL,
      companyUID VARCHAR(12) NOT NULL,
      accountUID VARCHAR(12) NOT NULL,
      contractBegin DATE NOT NULL,
      contractEnd DATE DEFAULT NULL,
      deductible DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      reimbursementCap DECIMAL(8,2) DEFAULT NULL,
      monthlyRate DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      bonus DECIMAL(8,2) NOT NULL DEFAULT 0.00,
      contractStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (contractID),
      CONSTRAINT fk_contracts_company FOREIGN KEY (companyUID)
        REFERENCES InsuranceCompanies (companyUID) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_contracts_account FOREIGN KEY (accountUID)
        REFERENCES Accounts (accountUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE Facilities (
      facilityID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      facilityUID VARCHAR(12) NOT NULL UNIQUE,
      facilityName VARCHAR(100) NOT NULL,
      distanceKm SMALLINT UNSIGNED DEFAULT NULL,
      facilityStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (facilityID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE CollectionAgencies (
      agencyID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      agencyUID VARCHAR(12) NOT NULL UNIQUE,
      agencyName VARCHAR(100) NOT NULL,
      bankAccount VARCHAR(34) NOT NULL,
      agencyStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (agencyID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // A Submission (Einreichung) is the core rebuild fix: it binds one or more
  // invoices to a single contract at submission time, so an invoice can never
  // be submitted twice and service billings attach to the submission rather
  // than to individual invoices.
  await pool.query(`
    CREATE TABLE Submissions (
      submissionID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      submissionUID VARCHAR(12) NOT NULL UNIQUE,
      contractUID VARCHAR(12) NOT NULL,
      submittedDate DATE NOT NULL,
      documentLink VARCHAR(255) DEFAULT NULL,
      submissionStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (submissionID),
      CONSTRAINT fk_submissions_contract FOREIGN KEY (contractUID)
        REFERENCES Contracts (contractUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // submissionUID is nullable (an invoice starts out un-submitted) and, once
  // set, is treated as immutable by the application layer — that is what
  // enforces "an invoice cannot be submitted twice".
  await pool.query(`
    CREATE TABLE Invoices (
      invoiceID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      invoiceUID VARCHAR(12) NOT NULL UNIQUE,
      invoiceNumber VARCHAR(50) NOT NULL,
      invoiceDate DATE NOT NULL,
      treatmentDate DATE DEFAULT NULL,
      accountUID VARCHAR(12) NOT NULL,
      facilityUID VARCHAR(12) DEFAULT NULL,
      submissionUID VARCHAR(12) DEFAULT NULL,
      invoiceAmount DECIMAL(10,2) NOT NULL,
      transferUntilDate DATE DEFAULT NULL,
      transferDate DATE DEFAULT NULL,
      transferSubject VARCHAR(100) DEFAULT NULL,
      documentLink VARCHAR(255) DEFAULT NULL,
      agencyUID VARCHAR(12) DEFAULT NULL,
      directPayment TINYINT(1) NOT NULL DEFAULT 0,
      invoiceStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (invoiceID),
      KEY idx_invoices_account (accountUID),
      KEY idx_invoices_submission (submissionUID),
      CONSTRAINT fk_invoices_account FOREIGN KEY (accountUID)
        REFERENCES Accounts (accountUID) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_invoices_facility FOREIGN KEY (facilityUID)
        REFERENCES Facilities (facilityUID) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_invoices_submission FOREIGN KEY (submissionUID)
        REFERENCES Submissions (submissionUID) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_invoices_agency FOREIGN KEY (agencyUID)
        REFERENCES CollectionAgencies (agencyUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE ServiceBillings (
      billingID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      billingUID VARCHAR(12) NOT NULL UNIQUE,
      submissionUID VARCHAR(12) NOT NULL,
      billingDate DATE NOT NULL,
      billingNumber VARCHAR(50) NOT NULL,
      documentLink VARCHAR(255) DEFAULT NULL,
      billingStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (billingID),
      KEY idx_billings_submission (submissionUID),
      CONSTRAINT fk_billings_submission FOREIGN KEY (submissionUID)
        REFERENCES Submissions (submissionUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // An Allocation maps one service billing to one invoice with the reimbursed
  // amount (successor to the first attempt's Assignment table). The invariant
  // "invoice and billing must belong to the same submission" cannot be a SQL
  // CHECK across tables and is enforced in the application layer.
  await pool.query(`
    CREATE TABLE Allocations (
      allocationID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      allocationUID VARCHAR(12) NOT NULL UNIQUE,
      invoiceUID VARCHAR(12) NOT NULL,
      billingUID VARCHAR(12) NOT NULL,
      receiptNumber VARCHAR(50) DEFAULT NULL,
      reimbursement DECIMAL(10,2) NOT NULL,
      allocationStatus TINYINT NOT NULL DEFAULT 1,
      PRIMARY KEY (allocationID),
      KEY idx_allocations_invoice (invoiceUID),
      KEY idx_allocations_billing (billingUID),
      CONSTRAINT fk_allocations_invoice FOREIGN KEY (invoiceUID)
        REFERENCES Invoices (invoiceUID) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_allocations_billing FOREIGN KEY (billingUID)
        REFERENCES ServiceBillings (billingUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** Drops every table in reverse dependency order. */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  for (const table of [
    'Allocations',
    'ServiceBillings',
    'Invoices',
    'Submissions',
    'CollectionAgencies',
    'Facilities',
    'Contracts',
    'InsuranceCompanies',
    'Accounts',
  ]) {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
