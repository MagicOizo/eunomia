import type { Pool, PoolConnection } from 'mariadb';

/**
 * Runs `work` on one connection inside a transaction: commits when it
 * resolves, rolls back and rethrows when it throws, always releases.
 */
export async function withTransaction<T>(
  pool: Pool,
  work: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
