import { Pool, PoolClient, QueryResultRow } from 'pg';
import { logError } from '@/lib/logger';

// Pool sizing: default is 10, which is too small for admin dashboard
// routes that fan out 10-20 parallel COUNT queries (`getLeadFeedReadiness`
// runs ~8 after consolidation, plus getCostCoverage + getEngagement = 12
// per /api/admin/leads/health request). With default 10 + connectionTimeoutMillis
// 5000, the overflow queries time out with "timeout exceeded when trying to
// connect" before the primary batch finishes. WF3 2026-04-10 regression fix.
//
// 20 leaves headroom for: ~12 readiness queries + 2-3 concurrent requests
// + transaction clients from pipeline scripts. Postgres default max_connections
// is 100, so 20 is still well within safe territory.
//
// Both values are env-overridable but must be positive finite integers. If
// a misconfigured env var produces NaN or a non-positive value, fall back
// to the defaults rather than passing garbage to pg (which would either
// block forever on `max: 0` or behave unpredictably on NaN).
function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const POOL_MAX = parsePositiveIntEnv(process.env.PG_POOL_MAX, 20);
const POOL_CONNECTION_TIMEOUT_MS = parsePositiveIntEnv(process.env.PG_CONNECTION_TIMEOUT_MS, 10000);

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: POOL_MAX,
      connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: 30000,
    }
  : {
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'buildo',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
      max: POOL_MAX,
      connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
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
