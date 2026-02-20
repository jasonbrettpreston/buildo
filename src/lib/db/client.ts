import { Pool, PoolClient, QueryResultRow } from 'pg';

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined }
    : {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        database: process.env.PG_DATABASE || 'buildo',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
      }
);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

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
 * Acquire a client from the pool for use in transactions.
 * The caller is responsible for calling client.release() when done.
 *
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... transactional queries ...
 *     await client.query('COMMIT');
 *   } catch (err) {
 *     await client.query('ROLLBACK');
 *     throw err;
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export { pool };
