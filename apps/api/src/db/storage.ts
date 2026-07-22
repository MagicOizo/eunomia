import type { Pool } from 'mariadb';
import type { UmzugStorage } from 'umzug';

const MIGRATIONS_TABLE = 'schema_migrations';

/**
 * umzug storage backed by a `schema_migrations` table in the application's
 * own database, so the record of which migrations have run lives alongside
 * the schema it describes (and travels with a database backup). We use a
 * plain table rather than umzug's file-based JSON storage because there is
 * no persistent writable filesystem in the production container.
 */
export function createMariadbStorage(pool: Pool): UmzugStorage<Pool> {
  async function ensureTable(): Promise<void> {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
        name VARCHAR(255) NOT NULL,
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
  }

  return {
    async logMigration({ name }): Promise<void> {
      await ensureTable();
      await pool.query(`INSERT INTO \`${MIGRATIONS_TABLE}\` (name) VALUES (?)`, [name]);
    },

    async unlogMigration({ name }): Promise<void> {
      await ensureTable();
      await pool.query(`DELETE FROM \`${MIGRATIONS_TABLE}\` WHERE name = ?`, [name]);
    },

    async executed(): Promise<string[]> {
      await ensureTable();
      const rows = await pool.query<Array<{ name: string }>>(
        `SELECT name FROM \`${MIGRATIONS_TABLE}\` ORDER BY name ASC`,
      );
      return rows.map((row) => row.name);
    },
  };
}
