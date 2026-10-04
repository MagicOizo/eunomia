import type { Pool, PoolConnection } from 'mariadb';

/**
 * Runs `work` on one connection from the pool and always releases it. This is
 * the only place in the project that takes a connection out of the pool —
 * anything that needs a session of its own (a transaction below, the migration
 * lock in db/migrate.ts) comes through here.
 */
export async function withConnection<T>(
  pool: Pool,
  work: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    return await work(conn);
  } finally {
    conn.release();
  }
}

/**
 * Runs `work` on one connection inside a transaction: commits when it
 * resolves, rolls back and rethrows when it throws, always releases.
 */
export async function withTransaction<T>(
  pool: Pool,
  work: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  return withConnection(pool, async (conn) => {
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}
