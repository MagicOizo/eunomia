import type { MigrationContext } from '../umzug.js';

/**
 * Data model v3, part 3 (see Notes/eunomia-plan.md, 2.3 / Slice 18): the bonus
 * scale and the claim-free-year bookkeeping.
 *  - ContractBonusTiers: the scale of one ContractTerms entry (so it is bound
 *    to an insurance year): minimum claim-free years → absolute bonus in €.
 *    Replaced as a whole set, so like the other link tables it has no UID and
 *    no status column.
 *  - ContractYears: optional per policy and year — the bonus actually paid
 *    (overrides the forecast) and a manual "bonus forfeited yes/no" override.
 *  - ServiceBillings.forfeitsBonus: whether this billing forfeits the bonus;
 *    NULL means "follow the policy's bonusForfeitRule".
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    CREATE TABLE ContractBonusTiers (
      termsUID VARCHAR(12) NOT NULL,
      claimFreeYears TINYINT UNSIGNED NOT NULL,
      bonusAmount DECIMAL(8,2) NOT NULL,
      PRIMARY KEY (termsUID, claimFreeYears),
      CONSTRAINT fk_bonustiers_terms FOREIGN KEY (termsUID)
        REFERENCES ContractTerms (termsUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE ContractYears (
      contractUID VARCHAR(12) NOT NULL,
      year SMALLINT NOT NULL,
      actualBonus DECIMAL(8,2) DEFAULT NULL,
      bonusForfeited TINYINT(1) DEFAULT NULL,
      note VARCHAR(255) DEFAULT NULL,
      PRIMARY KEY (contractUID, year),
      CONSTRAINT fk_contractyears_contract FOREIGN KEY (contractUID)
        REFERENCES Contracts (contractUID) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(
    'ALTER TABLE ServiceBillings ADD COLUMN forfeitsBonus TINYINT(1) DEFAULT NULL AFTER documentLink',
  );
}

/** Drops the scale, the year rows and the per-billing forfeit flag. */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('ALTER TABLE ServiceBillings DROP COLUMN forfeitsBonus');
  await pool.query('DROP TABLE IF EXISTS ContractYears');
  await pool.query('DROP TABLE IF EXISTS ContractBonusTiers');
}
