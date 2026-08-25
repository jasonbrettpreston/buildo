/**
 * resolve-db — the ONE database-target resolver for `scripts/` tooling.
 *
 * WHY THIS FILE EXISTS (Spec 122 programme, stage P0 — WF3 2026-08-23).
 * 24 files under `scripts/` resolved their Postgres target with a chain of
 * `|| 'localhost'` / `|| '5432'` / `|| 'buildo'` fallbacks. With no env set
 * they connected — silently, successfully, and with no log line — to the
 * PRE-CUTOVER Docker dev DB (`localhost:5432/buildo`, 222 migrations) instead
 * of the authoritative Supabase-local DB (`127.0.0.1:54322/postgres`, 241).
 * The same audit, at the same commit, reported 2,394 HIGH/MED violations
 * against the stale DB and 30,288 against the real one; `max_build_dim_below_floor`
 * read `0 — PASS` on one and `27,984 — GATE→FAIL` on the other. The audit
 * instrument was lying, and nothing in its output said which DB it graded.
 *
 * The same class is recorded in `tasks/lessons.md` (AIC scraper, 2026-07-30):
 * *"Verify against the DB the code will actually use"* — that one burned three
 * CI cycles. **The silence was the defect, not just the target.**
 *
 * THE CONTRACT
 *   (a) NO SILENT DEFAULT. With no explicit target — neither a caller-supplied
 *       config nor an explicit env var — `resolveDbConfig` THROWS, and the
 *       message names the fix. There is no "sensible default" here: a default
 *       is precisely what let 24 scripts grade the wrong database for months.
 *   (b) ASSERT ON FIRST CONNECTION. The pool returned by `createResolvedPool`
 *       wraps `pool.connect` so the first checked-out client runs
 *       `assertDbTarget` once: it reads `current_database()`, LOGS the resolved
 *       target unconditionally, and REFUSES (loudly) any database below the
 *       `min_migration` floor.
 *
 * ⚠️ THE FLOOR IS A COUNT, NOT A MAX. `schema_migrations` is keyed by
 * **`filename`** (`'244_fix_wsib_unlinked_index_comment.sql'`), not by a
 * numeric `version` column, and every one of these databases has GAPS.
 *
 * Measured 2026-08-25 (the 2026-08-23 row for the cloud DB is superseded — P2
 * landed the pending migrations there, so its "237" no longer describes it):
 *
 *   | database                            | COUNT(*) | MAX(filename)  |
 *   |-------------------------------------|---------:|----------------|
 *   | localhost:5432/buildo (pre-cutover) |      222 | 225_…          |
 *   | cloud Supabase (postgres)           |    (P2)  | 245_…          |
 *   | 127.0.0.1:54322/postgres (local)    |      242 | 245_…          |
 *
 * The local DB has **242 rows** and carries migrations through **245**; per the
 * P2 record the cloud DB has now had migrations through **245** applied too, so
 * it is no longer the laggard the 223 floor was calibrated around.
 *
 * Parsing the leading integer out of MAX(filename) would give the pre-cutover
 * DB a **225** — ABOVE a 223 floor — and it would sail through. Only COUNT(*)
 * separates the three. Hence `migration_count`, and hence this note.
 *
 * ⚠️ FLOOR CALIBRATION CONSTRAINT. The floor must exclude the 222-migration
 * pre-cutover DB while refusing nothing that is legitimately current. Before P2
 * the cloud DB was the binding upper constraint (it lagged local by several
 * migrations), which pinned the default to **223**. P2 has since brought cloud
 * up to the same 245-series head as local, so 223 now clears both by a wide
 * margin and is kept as a conservative floor rather than a tight one. Callers
 * whose script genuinely requires a later schema may pass a HIGHER
 * `minMigration`; raising the DEFAULT is a separate, measured decision.
 *
 * ⚠️ THE ONE SANCTIONED FLOOR EXEMPTION IS `scripts/migrate.js`. A floor check
 * there deadlocks the tool: a fresh database has ZERO migrations, the resolver
 * would refuse, and the migrations that would raise it above the floor could
 * never be applied. `migrate.js` is the thing that RAISES a database over the
 * floor, so it cannot also be gated on it. It passes `minMigration: null`
 * (floor exempt) and keeps the half of the contract that matters for it:
 * an explicit target is REQUIRED, and `current_database()` is asserted and
 * logged. No other caller may pass `null`.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md (§P0)
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §4.1 (ssl)
 */
'use strict';

const { Pool } = require('pg');
const { resolveSslConfig, stripSslParams } = require('./ssl-config');

/**
 * Minimum `COUNT(*)` of `schema_migrations` rows a database must carry to be
 * accepted. 223 = one above the pre-cutover DB's 222, and 14 below the cloud
 * DB's 237. See the calibration constraint in the file header before changing.
 */
const DEFAULT_MIN_MIGRATION = 223;

/** Env vars consulted, in precedence order, when the caller supplies no target. */
const DEFAULT_ENV_VARS = ['DATABASE_URL', 'SUPABASE_DATABASE_URL'];

/** Discrete `PG_*` vars that must ALL be set for the discrete path to count as explicit. */
const REQUIRED_PG_VARS = ['PG_HOST', 'PG_PORT', 'PG_DATABASE'];

/**
 * Mask the password in a Postgres connection string so a target can be logged.
 * @param {string} connectionString
 * @returns {string}
 */
function redactConnectionString(connectionString) {
  return String(connectionString).replace(/:\/\/([^:@/]+):[^@]+@/, '://$1:***@');
}

/**
 * Is `v` a usable (present, non-blank) env value? `''` is NOT a target.
 * @param {string|undefined} v
 * @returns {boolean}
 */
function isSet(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Resolve the database target from an explicit caller config or explicit env,
 * with NO fallback default. Throws when nothing explicit is available.
 *
 * Precedence: caller `connectionString` > caller `pgOptions` > the first set
 * var in `envVars` (default `DATABASE_URL`, then `SUPABASE_DATABASE_URL`) >
 * a COMPLETE discrete `PG_HOST`+`PG_PORT`+`PG_DATABASE` triple > THROW.
 *
 * `DATABASE_URL` winning over `PG_*` preserves `scripts/migrate.js`'s existing
 * precedence (Spec 113 §3 D14: `SUPABASE_DATABASE_URL` is the CI fallback;
 * `DATABASE_URL` wins when both are set so local runs stay local).
 *
 * @param {object} [opts]
 * @param {string} [opts.label] - script name used in log/error messages
 * @param {string} [opts.connectionString] - explicit caller-supplied target
 * @param {object} [opts.pgOptions] - explicit caller-supplied discrete pg options
 * @param {string[]} [opts.envVars] - env vars to consult, in order
 * @param {object} [opts.env] - env object to read (tests); defaults to process.env
 * @returns {{poolConfig: object, description: string, source: string}}
 */
function resolveDbConfig(opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const label = o.label || 'resolve-db';
  const envVars = o.envVars || DEFAULT_ENV_VARS;

  if (isSet(o.connectionString)) {
    return {
      poolConfig: {
        connectionString: stripSslParams(o.connectionString),
        ssl: resolveSslConfig({ connectionString: o.connectionString }),
      },
      description: redactConnectionString(o.connectionString),
      source: 'caller:connectionString',
    };
  }

  if (o.pgOptions && isSet(o.pgOptions.host) && isSet(o.pgOptions.database)) {
    const host = o.pgOptions.host;
    return {
      poolConfig: { ...o.pgOptions, ssl: resolveSslConfig({ host }) },
      description: `${host}:${o.pgOptions.port}/${o.pgOptions.database}`,
      source: 'caller:pgOptions',
    };
  }

  for (const name of envVars) {
    if (!isSet(env[name])) continue;
    const connectionString = env[name].trim();
    return {
      poolConfig: {
        // stripSslParams (F1g root-cause class, Spec 113 §4.1): an `sslmode=`
        // query param makes pg build its OWN ssl config and silently DISCARD
        // the pinned-CA object below.
        connectionString: stripSslParams(connectionString),
        ssl: resolveSslConfig({ connectionString }),
      },
      description: redactConnectionString(connectionString),
      source: `env:${name}`,
    };
  }

  // Discrete PG_* — accepted ONLY when the caller set every var that selects a
  // TARGET. A partial triple is exactly the defect this file exists to remove:
  // `PG_HOST` alone with `PG_PORT`/`PG_DATABASE` defaulted lands on
  // localhost:5432/buildo without saying so.
  const missing = REQUIRED_PG_VARS.filter((n) => !isSet(env[n]));
  if (missing.length === 0) {
    const host = env.PG_HOST.trim();
    const rawPort = env.PG_PORT.trim();
    const port = parseInt(rawPort, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error(
        `[${label}] PG_PORT must be a valid port number (1-65535), got: ${JSON.stringify(rawPort)}`,
      );
    }
    const database = env.PG_DATABASE.trim();

    // ── MIRRORED FROM scripts/lib/pipeline.js#createPool (WF3 B3-H5, cedf6dd1) ──
    // WF3 B3-H5 (2026-04-23): in production/staging a missing PG_PASSWORD
    // is never acceptable — the old `|| 'postgres'` fallback would attempt
    // to connect as the default dev user and either succeed silently
    // (misconfigured prod DB) or fail with a confusing pg auth error that
    // obscured the real cause. Throw explicitly so the chain fails loudly
    // with an actionable message. Dev + test environments retain the
    // convenience fallback.
    //
    // Carried here DELIBERATELY (Spec 122 §P0, 2026-08-23): this resolver is
    // where `createPool`'s discrete-PG_* path is heading at the follow-up. If
    // the guard did not exist here, retiring createPool would evaporate B3-H5
    // fleet-wide — a load-bearing behaviour silently dropped by a refactor
    // that looked like pure plumbing. Keep the two blocks in sync.
    const pgPassword = env.PG_PASSWORD;
    const isProd = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
    if (isProd && !pgPassword) {
      throw new Error(
        `[${label}] PG_PASSWORD env var is required in production/staging — ` +
          'refusing to resolve a database target without it',
      );
    }

    return {
      poolConfig: {
        host,
        port,
        database,
        user: isSet(env.PG_USER) ? env.PG_USER.trim() : 'postgres',
        // Dev convenience fallback, PRESERVED from the ~20 converted sites that
        // each spelled `PG_PASSWORD || 'postgres'`. 'postgres' is not a guess:
        // it is the local stack's actual password (docker-compose pins
        // `POSTGRES_PASSWORD:-postgres`). Dropping it to `undefined` would have
        // broken every zero-PG_PASSWORD local invocation. The isProd guard
        // above makes this line unreachable in production/staging.
        password: pgPassword || 'postgres',
        ssl: resolveSslConfig({ host }),
      },
      description: `${host}:${port}/${database}`,
      source: 'env:PG_*',
    };
  }

  const partial = REQUIRED_PG_VARS.filter((n) => isSet(env[n]));
  throw new Error(
    `[${label}] refusing to connect: no explicit database target.\n` +
      `  There is deliberately NO default. Until 2026-08-23 this script fell back to\n` +
      `  localhost:5432/buildo — the PRE-CUTOVER database — and said nothing about it.\n` +
      (partial.length > 0
        ? `  Partial discrete config found (${partial.join(', ')}); still missing: ${missing.join(', ')}.\n`
        : '') +
      `  FIX — set ONE of:\n` +
      `    ${envVars.join(' / ')}   e.g. DATABASE_URL=postgresql://postgres:...@127.0.0.1:54322/postgres\n` +
      `    or ALL of ${REQUIRED_PG_VARS.join(', ')}\n` +
      `  The repo's .env already carries the authoritative target — run with\n` +
      `  \`node -r dotenv/config <script>\` if this script does not load it itself.`,
  );
}

/**
 * Read the connected database's identity + migration depth, LOG it, and refuse
 * a below-floor target.
 *
 * `schema_migrations` may not exist at all (a genuinely fresh database) — that
 * is treated as a migration count of 0, i.e. below every positive floor.
 *
 * @param {{query: Function}} client - a connected pg client (or any queryable)
 * @param {object} [opts]
 * @param {string} [opts.label]
 * @param {number|null} [opts.minMigration] - floor; `null` = EXEMPT (migrate.js only)
 * @param {string} [opts.description] - the resolved target, for messages
 * @param {string|string[]} [opts.expectDatabase] - optional `current_database()` allow-list
 * @param {{log: Function, warn: Function}} [opts.logger]
 * @returns {Promise<{database: string, migrationCount: number, hasTracking: boolean}>}
 */
async function assertDbTarget(client, opts) {
  const o = opts || {};
  const label = o.label || 'resolve-db';
  const logger = o.logger || console;
  const minMigration = o.minMigration === undefined ? DEFAULT_MIN_MIGRATION : o.minMigration;
  const description = o.description || '(unknown target)';

  // Two round-trips on purpose: a subquery over `schema_migrations` fails at
  // PARSE time when the table is absent, so it cannot be guarded by a CASE.
  const idRes = await client.query(
    "SELECT current_database() AS database, current_user AS db_user, " +
      "to_regclass('public.schema_migrations') IS NOT NULL AS has_tracking",
  );
  const { database, db_user: dbUser, has_tracking: hasTracking } = idRes.rows[0];

  let migrationCount = 0;
  if (hasTracking) {
    const cntRes = await client.query('SELECT count(*)::int AS n FROM public.schema_migrations');
    migrationCount = cntRes.rows[0].n;
  }

  // Unconditional, always — the SILENCE was the defect.
  logger.log(
    `[${label}] target: ${description} → database=${database} user=${dbUser} ` +
      `migrations=${migrationCount}${hasTracking ? '' : ' (no schema_migrations table)'}` +
      `${minMigration === null ? ' [floor exempt]' : ` (floor ${minMigration})`}`,
  );

  if (o.expectDatabase) {
    const allowed = Array.isArray(o.expectDatabase) ? o.expectDatabase : [o.expectDatabase];
    if (!allowed.includes(database)) {
      throw new Error(
        `[${label}] REFUSING: connected to database "${database}", expected one of ` +
          `${allowed.map((d) => `"${d}"`).join(', ')} (target ${description}).`,
      );
    }
  }

  // `null` = the migrate.js exemption (see the file header). Not `0`, not
  // falsy-by-accident: an explicit sentinel, so an omitted option can never
  // silently disable the floor.
  if (minMigration === null) {
    return { database, migrationCount, hasTracking };
  }

  if (migrationCount < minMigration) {
    throw new Error(
      `[${label}] REFUSING to run against a below-floor database.\n` +
        `  target        : ${description}\n` +
        `  database      : ${database}\n` +
        `  migrations    : ${migrationCount}${hasTracking ? '' : ' (schema_migrations does not exist)'}\n` +
        `  required floor: ${minMigration}\n` +
        `  This is almost certainly the PRE-CUTOVER database (localhost:5432/buildo, 222\n` +
        `  migrations). The authoritative target is 127.0.0.1:54322/postgres.\n` +
        `  FIX: point DATABASE_URL at the authoritative database, or run with\n` +
        `  \`node -r dotenv/config <script>\` so the repo's .env target is used.`,
    );
  }

  return { database, migrationCount, hasTracking };
}

/**
 * Build a `pg.Pool` for an explicitly-resolved target whose FIRST checked-out
 * client asserts `current_database()` + the migration floor (once per pool).
 *
 * Wrapping `pool.connect` — rather than asserting eagerly in this function —
 * keeps the factory synchronous and pool-less until something actually
 * connects, and covers `pool.query()` too (pg routes it through `connect`).
 * Same shape as `withPipelineStatementTimeout` in `scripts/lib/pipeline.js`.
 *
 * @param {object} [opts] - everything `resolveDbConfig` accepts, plus:
 * @param {number|null} [opts.minMigration] - floor; `null` = EXEMPT (migrate.js only)
 * @param {string|string[]} [opts.expectDatabase]
 * @param {object} [opts.poolOverrides] - extra pg Pool options (e.g. max, timeouts)
 * @returns {import('pg').Pool}
 */
function createResolvedPool(opts) {
  const o = opts || {};
  const label = o.label || 'resolve-db';
  const { poolConfig, description, source } = resolveDbConfig(o);
  const pool = new Pool({ ...poolConfig, ...(o.poolOverrides || {}) });
  pool.buildoTarget = { description, source };
  return withTargetAssertion(pool, {
    label,
    description,
    minMigration: o.minMigration,
    expectDatabase: o.expectDatabase,
    logger: o.logger,
  });
}

/**
 * Wrap `pool.connect` so the first successful checkout runs `assertDbTarget`
 * exactly once. A failed assertion releases the client WITH the error (so pg
 * destroys rather than reuses it) and rejects the checkout.
 *
 * @param {import('pg').Pool} pool
 * @param {object} assertOpts - forwarded to assertDbTarget
 * @returns {import('pg').Pool}
 */
function withTargetAssertion(pool, assertOpts) {
  let asserted = null; // memoized promise — assert once per pool, not per checkout
  const origConnect = pool.connect.bind(pool);

  const runAssertion = async (client) => {
    if (!asserted) {
      asserted = assertDbTarget(client, assertOpts);
    }
    await asserted;
  };

  pool.connect = function connectWithTargetAssertion(cb) {
    if (typeof cb === 'function') {
      return origConnect((err, client, release) => {
        if (err) return cb(err, client, release);
        runAssertion(client).then(
          () => cb(null, client, release),
          (assertErr) => { release(assertErr); cb(assertErr); },
        );
      });
    }
    return origConnect().then(async (client) => {
      try {
        await runAssertion(client);
      } catch (assertErr) {
        client.release(assertErr);
        throw assertErr;
      }
      return client;
    });
  };

  return pool;
}

module.exports = {
  DEFAULT_MIN_MIGRATION,
  DEFAULT_ENV_VARS,
  REQUIRED_PG_VARS,
  redactConnectionString,
  resolveDbConfig,
  assertDbTarget,
  createResolvedPool,
  withTargetAssertion,
};
