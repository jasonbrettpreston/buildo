import { Pool, PoolClient, QueryResultRow } from 'pg';
import { logError } from '@/lib/logger';
import { resolveSslConfig } from './ssl-config';

// Pool sizing: default is 10, which is too small for admin dashboard
// routes that fan out 10-20 parallel COUNT queries (e.g. the admin stats +
// coverage endpoints run ~12 aggregate queries per request). With default 10
// + connectionTimeoutMillis 5000, the overflow queries time out with "timeout
// exceeded when trying to connect" before the primary batch finishes. WF3
// 2026-04-10 regression fix. (Phase 18: the prior `getLeadFeedReadiness` /
// `/api/admin/leads/health` reference was stale — that health route was never
// built; see Spec 76 §3.1 DEFERRED.)
//
// 20 leaves headroom for: ~12 readiness queries + 2-3 concurrent requests
// + transaction clients from pipeline scripts. Postgres default max_connections
// is 100, so 20 is still well within safe territory.
//
// Both values are env-overridable but must be positive finite integers. If
// a misconfigured env var produces NaN or a non-positive value, fall back
// to the defaults rather than passing garbage to pg (which would either
// block forever on `max: 0` or behave unpredictably on NaN).
//
// Exported for reuse by other lib modules that parse positive-integer env
// vars (e.g., cache TTLs). Testable in isolation.
function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const POOL_MAX = parsePositiveIntEnv(process.env.PG_POOL_MAX, 20);
const POOL_CONNECTION_TIMEOUT_MS = parsePositiveIntEnv(process.env.PG_CONNECTION_TIMEOUT_MS, 10000);

// Spec 113 §3 — DB connection-string var alias (OD-A, Phase 4 ballot #1). The
// Vercel↔Supabase native integration injects `POSTGRES_URL` (the pooled 6543
// runtime string) into the DEPLOYED APP's environment; it does NOT inject
// `DATABASE_URL`. Local dev + pipeline/scripts keep `DATABASE_URL` (they run on
// the runner with SUPABASE_DATABASE_URL, never Vercel-injected POSTGRES_URL).
// Prefer POSTGRES_URL when present so the Vercel-deployed app's raw-pg pool has
// a connection string, falling back to DATABASE_URL for local dev. This alias is
// scoped to THIS app-runtime pool only — migrate.js and the pipeline scripts are
// intentionally NOT aliased.
//
// An empty-string (or whitespace-only) POSTGRES_URL is treated as ABSENT
// (P4-F0 fold C3, Code Reviewer): with `??`, a dashboard-set `POSTGRES_URL=""`
// would shadow a valid DATABASE_URL, silently dropping the pool to the PG_*
// localhost defaults in a deployed environment. `||` + trim makes both vars
// fall through on empty, and a both-empty env resolves to undefined (the
// PG_* branch), never `""`.
//
// Exported for the client.ts alias regression test (src/tests/db-client.logic.test.ts).
export function resolveRuntimeConnectionString(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return env.POSTGRES_URL?.trim() || env.DATABASE_URL?.trim() || undefined;
}

const RUNTIME_CONNECTION_STRING = resolveRuntimeConnectionString();

// Spec 113 §4.1 — resolveSslConfig (src/lib/db/ssl-config.ts, the ADR-001 TS
// twin of scripts/lib/ssl-config.js) is the only place an `ssl` config is
// constructed. It is environment-aware by TARGET HOST, not NODE_ENV: a
// loopback host (Docker dev DB, local `supabase start`) gets no TLS; any
// non-loopback host gets CA-pinned verify-full and throws if
// SUPABASE_CA_CERT_PATH is missing. `rejectUnauthorized: false` — the weak
// setting this used to ship in production (Spec 113 §4 G4) — is retired.
const poolConfig = RUNTIME_CONNECTION_STRING
  ? {
      connectionString: RUNTIME_CONNECTION_STRING,
      ssl: resolveSslConfig({ connectionString: RUNTIME_CONNECTION_STRING }),
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
      ssl: resolveSslConfig({ host: process.env.PG_HOST || 'localhost' }),
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
