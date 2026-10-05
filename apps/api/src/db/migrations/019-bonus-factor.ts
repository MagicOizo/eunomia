import type { MigrationContext } from '../umzug.js';

/**
 * Bonus tiers as a factor of the bonus-relevant premium (Slice 76, see
 * Notes/eunomia-plan.md §2.3). Insurers state their bonus scale in monthly
 * premiums ("1.5 Monatsbeiträge"), not in euros, so a tier can now carry a
 * factor instead of an amount. The factor applies to the yearly average of
 * a new premium figure, the bonus-relevant monthly premium: usually only the
 * main part of the tariff, not the full premium. That reverses §2.3, where
 * premiums were informational only.
 *  - ContractPremiums.bonusRelevantPremium: new, optional. monthlyPremium (the
 *    full cost) becomes optional too; the API demands at least one of them.
 *  - ContractBonusTiers.bonusFactor: new; bonusAmount becomes optional. The
 *    API demands exactly one of them per tier. Existing tiers keep their
 *    amounts.
 */
export async function up({ context: pool }: MigrationContext): Promise<void> {
  await pool.query(`
    ALTER TABLE ContractPremiums
      MODIFY monthlyPremium DECIMAL(8,2) DEFAULT NULL,
      ADD COLUMN bonusRelevantPremium DECIMAL(8,2) DEFAULT NULL AFTER monthlyPremium
  `);
  await pool.query(`
    ALTER TABLE ContractBonusTiers
      MODIFY bonusAmount DECIMAL(8,2) DEFAULT NULL,
      ADD COLUMN bonusFactor DECIMAL(4,2) DEFAULT NULL AFTER bonusAmount
  `);
}

/**
 * Restores the amount-only shape. Factor tiers have no amount to fall back
 * on and are dropped; a premium recorded only as bonus-relevant keeps that
 * figure as its monthly premium rather than being lost.
 */
export async function down({ context: pool }: MigrationContext): Promise<void> {
  await pool.query('DELETE FROM ContractBonusTiers WHERE bonusAmount IS NULL');
  await pool.query(`
    ALTER TABLE ContractBonusTiers
      DROP COLUMN bonusFactor,
      MODIFY bonusAmount DECIMAL(8,2) NOT NULL
  `);
  await pool.query(
    'UPDATE ContractPremiums SET monthlyPremium = bonusRelevantPremium WHERE monthlyPremium IS NULL',
  );
  await pool.query(`
    ALTER TABLE ContractPremiums
      DROP COLUMN bonusRelevantPremium,
      MODIFY monthlyPremium DECIMAL(8,2) NOT NULL
  `);
}
