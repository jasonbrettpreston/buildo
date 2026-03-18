import { Pool, PoolClient, QueryResultRow } from 'pg';
import { logError } from '@/lib/logger';

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    }
  : {
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'buildo',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    };

// Next.js HMR connection leak prevention: cache pool on globalThis in dev
// so hot reloads reuse the same pool instead of orphaning connections.
const globalForPg = globalThis as unknown as { pgPool: Pool | undefined };
const pool = globalForPg.pgPool ?? new Pool(poolConfig);

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}

if (pool.listenerCount('error') === 0) {
  pool.on('error', (err) => {
    logError('[db/pool]', err, { event: 'idle_client_error' });
  });
}

/**
 * Execute a parameterized query and return the resulting rows.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/**
 * Safely execute database queries inside a managed transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and client.release().
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logError('[db/transaction]', rollbackErr as Error, { phase: 'rollback_failed' });
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @deprecated Use {@link withTransaction} instead. getClient() requires manual
 * BEGIN/COMMIT/ROLLBACK/release() which is error-prone.
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export { pool };
