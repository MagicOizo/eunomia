import type { Pool } from 'mariadb';

/**
 * Wipes every application row so the seed can rebuild a clean dataset — for
 * the local development database only, never for production data.
 *
 * Order matters: children before parents. `Accounts.leadAccountUID` points at
 * another account, so that link is cleared before the table itself is emptied.
 * Roles and Permissions are left alone: they are reference data written by the
 * migrations, not by the seed.
 */
export async function clearData(pool: Pool): Promise<void> {
  await pool.query('UPDATE Accounts SET leadAccountUID = NULL');
  for (const table of [
    'Allocations',
    'ServiceBillings',
    'SubmissionInvoices',
    'InvoiceExclusions',
    'InvoiceTreatmentDays',
    'Invoices',
    'Submissions',
    'ContractPremiums',
    'ContractBonusTiers',
    'ContractYears',
    'ContractTerms',
    'Contracts',
    'InsuranceCompanies',
    'Facilities',
    'AgencyBankAccounts',
    'CollectionAgencies',
    'RefreshTokens',
    'UserAccountRoles',
    'UserRoles',
    'Users',
    'Accounts',
  ]) {
    await pool.query(`DELETE FROM ${table}`);
  }
}
