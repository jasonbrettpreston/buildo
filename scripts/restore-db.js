#!/usr/bin/env node
/**
 * restore-db — standalone operator CLI: dumps SOURCE Postgres data (data-only)
 * and restores it into TARGET via `pg_restore --single-transaction
 * --exit-on-error` (NOT `--disable-triggers` — see buildPgRestoreArgs's doc
 * comment: Supabase's `postgres` role isn't a superuser and can't disable
 * system RI-constraint triggers; discovered during Phase 0.5 smoke-testing).
 * This is the restore tooling identified as a gap by Spec 113 §9.2 and
 * required by `.cursor/active_task.md` Phase 0.5 (local Supabase data load) /
 * Phase 4.0 (cloud data load).
 *
 * NOT a pipeline.run step (Spec 112 §4.3) — restore is destructive,
 * human-gated, and deliberately excluded from the Spec 47 §R1-R12 skeleton,
 * the same rationale that already keeps `scripts/migrate.js` outside it. No
 * advisory lock, no emitSummary/emitMeta — a restore-validation report is the
 * analogous artifact (printed by scripts/validation/supabase-load-gates.js).
 *
 * Two modes:
 *   1. Combined dump+restore (no --dump given): pg_dump's the SOURCE (PG_*
 *      env vars — the Docker dev DB) straight into a temp file, then restores
 *      that file into TARGET. This is the Phase 0.5/4.0 data-load shape.
 *   2. Restore-only (--dump=<path> given): restores an existing dump file —
 *      the disaster-recovery shape Spec 112 §4.3's `--dump=` contract
 *      describes (e.g. a nightly backup-db.js artifact).
 *
 * Usage:
 *   node scripts/restore-db.js --target=local --mode=fresh
 *   node scripts/restore-db.js --target=local --mode=fresh --tables=trades,logic_variables
 *   node scripts/restore-db.js --dump=./pg_dump/2026-07-18.dump --target=local --mode=fresh
 *   node scripts/restore-db.js --target=local --verify-only        # gates only, no dump/restore
 *
 * Flags:
 *   --target=local|cloud   which env-contract connection to restore into (D14). Default: local.
 *   --mode=fresh            REQUIRED for any actual restore (not --verify-only). The operator
 *                            must explicitly state the target is expected-empty/idempotently
 *                            reloadable (Spec 112 §8 edge case — never inferred from DB state).
 *                            `--mode=dr` (in-place disaster-recovery restore, `--clean`/DROP
 *                            SCHEMA) is NOT implemented by this Phase 0.5 tooling — refuses.
 *   --tables=t1,t2          restrict the load to an explicit table subset (smoke tests).
 *   --dump=<path>            restore this existing dump file instead of dumping SOURCE fresh.
 *   --dump-out=<path>        where to write the fresh dump (default: an OS-tmp file, deleted
 *                            after a successful restore unless --keep-dump).
 *   --keep-dump              don't delete the dump file after a successful restore.
 *   --skip-gates             don't run the G10 gate suite after a successful restore.
 *   --verify-only             run the G10 gate suite only — no dump, no restore, no truncate.
 *
 * SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md §4.3
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §5, §9.2, §13
 * SPEC LINK: .cursor/active_task.md (Phase 0.5, Ground truth G10)
 */
'use strict';
require('dotenv').config();

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isLocalMode } = require('./lib/ssl-config');
const gates = require('./validation/supabase-load-gates');

// Client-tool minimum major version (Spec 112 §5) — the pg_dump/pg_restore
// BINARY must be >= the highest Postgres server version in play. During the
// Phase 0-3 coexistence window that's Supabase's PG17 (local stack + cloud),
// not the Docker source's PG15 or CI's PG16 — an older client dumping/
// restoring a newer server fails silently/opaquely far more often than not.
const MIN_CLIENT_MAJOR = 17;

// ---------------------------------------------------------------------------
// Pure functions — arg parsing, table exclusion, stderr-gating decision,
// pg_dump/pg_restore arg builders. Exported for src/tests/restore-db.logic.test.ts.
// ---------------------------------------------------------------------------

/** @param {string[]} argv */
function parseArgs(argv) {
  const args = {
    target: 'local',
    mode: null,
    dumpPath: null,
    dumpOut: null,
    tables: null,
    keepDump: false,
    skipGates: false,
    verifyOnly: false,
  };
  for (const raw of argv) {
    if (raw === '--verify-only') {
      args.verifyOnly = true;
      continue;
    }
    if (raw === '--skip-gates') {
      args.skipGates = true;
      continue;
    }
    if (raw === '--keep-dump') {
      args.keepDump = true;
      continue;
    }
    const m = raw.match(/^--([a-z-]+)=(.*)$/);
    if (!m) continue; // unrecognized bare flag — ignored rather than crashing on stray args
    const [, key, val] = m;
    if (key === 'target') args.target = val;
    else if (key === 'mode') args.mode = val;
    else if (key === 'dump') args.dumpPath = val;
    else if (key === 'dump-out') args.dumpOut = val;
    else if (key === 'tables') {
      args.tables = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return args;
}

/**
 * Validate a parsed args object, throwing a descriptive error on any
 * violation of the Spec 112 §8 edge cases this script must honor.
 * @param {ReturnType<typeof parseArgs>} args
 */
function validateArgs(args) {
  if (args.target !== 'local' && args.target !== 'cloud') {
    throw new Error(`--target must be "local" or "cloud", got: ${JSON.stringify(args.target)}`);
  }
  if (args.verifyOnly) return; // no restore happening — mode/dump irrelevant
  if (args.mode === null) {
    throw new Error(
      'Spec 112 §8 edge case: restore-db.js MUST require the operator to state (via --mode, not ' +
        'inference) whether the target is expected empty. Pass --mode=fresh for the Phase 0.5/4.0 ' +
        'fresh-load pattern, or run with --verify-only if you only want the gate report.'
    );
  }
  if (args.mode !== 'fresh') {
    throw new Error(
      `--mode=${JSON.stringify(args.mode)} is not supported by this tooling. Only "fresh" (truncate-` +
        'first, no --clean/DROP SCHEMA) is implemented — an in-place disaster-recovery restore is a ' +
        'separate, explicitly-confirmed destructive path not built in Phase 0.5.'
    );
  }
}

/**
 * Parse a `pg_dump --version` / `pg_restore --version` style string.
 * @param {string} versionOutput
 * @returns {{ major: number, minor: number, patch: number, raw: string }}
 */
function parsePgToolVersion(versionOutput) {
  const m = (versionOutput || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) {
    throw new Error(`Could not parse Postgres tool version from: ${JSON.stringify(versionOutput)}`);
  }
  return {
    major: parseInt(m[1], 10),
    minor: m[2] ? parseInt(m[2], 10) : 0,
    patch: m[3] ? parseInt(m[3], 10) : 0,
    raw: (versionOutput || '').trim(),
  };
}

/**
 * @param {{ major: number }} parsedVersion
 * @param {number} [minMajor]
 */
function isClientVersionSufficient(parsedVersion, minMajor = MIN_CLIENT_MAJOR) {
  return parsedVersion.major >= minMajor;
}

/**
 * Spec 112 §9 known failure mode: "no stderr output" is the pass condition,
 * NOT "exit code 0" — plain pg_restore can complete exit-0 while individual
 * statements failed, surfacing only stderr. This gate treats ANY non-empty
 * stderr as failure, on top of the exit-code check, for both pg_dump and
 * pg_restore invocations (belt-and-suspenders with --exit-on-error).
 * @param {{ exitCode: number, stderr: string }} args
 * @returns {{ pass: boolean, reason: string }}
 */
function stderrGateDecision({ exitCode, stderr }) {
  const trimmed = (stderr || '').trim();
  if (exitCode !== 0) {
    return {
      pass: false,
      reason: `exit code ${exitCode}${trimmed ? ` — ${trimmed.split('\n')[0]}` : ''}`,
    };
  }
  if (trimmed.length > 0) {
    return {
      pass: false,
      reason: `non-empty stderr despite exit 0 (Spec 112 §9 — "no stderr output" is the pass ` +
        `condition, not exit code) — ${trimmed.split('\n')[0]}`,
    };
  }
  return { pass: true, reason: 'exit 0, empty stderr' };
}

/** Strict identifier validator — refuses anything that isn't a bare SQL identifier. */
function quoteIdent(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to quote unsafe identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

/**
 * `TRUNCATE TABLE ...` for the given tables in one statement. Needed for
 * idempotent re-runs (D13: the 0.5 load is re-run fresh from Docker
 * immediately before the 0.8 cutover).
 *
 * `cascade` MUST be true only for a full-scope run (every eligible table is
 * being truncated+reloaded together, so CASCADE never reaches outside the
 * statement's own table list — a no-op safety net, not a real risk). For a
 * `--tables`-scoped run (smoke tests, partial restores), CASCADE is
 * dangerous: an out-of-scope table with an FK into one of the truncated
 * tables would get silently CASCADE-truncated too and then never reloaded
 * (it wasn't in the dump) — a real data-loss bug caught during Phase 0.5
 * smoke-testing (`trades` is FK-referenced by `trade_products`,
 * `permit_trades`, `lead_trades`, etc.). Scoped runs use plain TRUNCATE,
 * which fails loudly with a clear FK-violation error instead of silently
 * deleting data the operator didn't ask to touch.
 * @param {string[]} tables
 * @param {{ cascade: boolean }} opts
 * @returns {string|null}
 */
function buildTruncateSql(tables, opts) {
  if (!tables || tables.length === 0) return null;
  const cascade = !!(opts && opts.cascade);
  const list = tables.map((t) => `public.${quoteIdent(t)}`).join(', ');
  return `TRUNCATE TABLE ${list}${cascade ? ' CASCADE' : ''}`;
}

/**
 * @param {{ tables: string[], outFile: string, source: { host: string, port: number, user: string, database: string } }} args
 */
function buildPgDumpArgs({ tables, outFile, source }) {
  const args = ['--format=custom', '--data-only', '--no-owner', '--no-acl', '--file', outFile];
  for (const t of tables) args.push('--table', `public.${t}`);
  if (source.host) args.push('--host', source.host);
  if (source.port) args.push('--port', String(source.port));
  if (source.user) args.push('--username', source.user);
  args.push(source.database);
  return args;
}

/**
 * NOTE — `--disable-triggers` is deliberately NOT included (Phase 0.5
 * smoke-test finding, 2026-07-18): `ALTER TABLE ... DISABLE TRIGGER ALL`
 * requires superuser to disable a system RI-constraint trigger, and
 * Supabase's `postgres` role is NOT a superuser on either the local stack or
 * (per Spec 113 §2) the cloud project — `supabase_admin` is. Attempting
 * `--disable-triggers` against `postgres` fails with `permission denied:
 * "RI_ConstraintTrigger_..." is a system trigger`. This is exactly the
 * "combination is not viable for a given restore path" carve-out Spec 112
 * §4.3 anticipates — the stderr-gated wrapper (`stderrGateDecision`) is the
 * actual guard here, not `--disable-triggers`. `--single-transaction
 * --exit-on-error` remains fully viable (no elevated privilege needed) and
 * is kept as the primary integrity mechanism; pg_dump's TOC already orders
 * data sections in FK-dependency order, so normal trigger-enforced restore
 * loads tables in a safe order without needing triggers disabled — viable
 * pre-D6 specifically because ADR-006 means almost no FKs exist yet.
 * @param {{ dumpPath: string, targetConnectionString: string }} args
 */
function buildPgRestoreArgs({ dumpPath, targetConnectionString }) {
  return [
    '--data-only',
    '--no-owner',
    '--no-acl',
    '--single-transaction',
    '--exit-on-error',
    '--dbname',
    targetConnectionString,
    dumpPath,
  ];
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

/** Spawn a Postgres client-tool binary, capturing stdout/stderr fully. */
function spawnCapture(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c.toString()));
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('error', (err) => reject(new Error(`[restore-db] ${cmd} spawn error: ${err.message}`)));
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

/**
 * Client-version guard (Spec 112 §5). Decision recorded for this repo: the
 * scoop-installed `pg_dump`/`pg_restore` 18.2 on PATH already satisfies
 * "client >= highest server version" (target PG17) — no need for the
 * Docker-postgres17-container fallback the task brief flagged as a fallback
 * option.
 */
async function checkClientVersion() {
  const dumpVer = await spawnCapture('pg_dump', ['--version']);
  const restoreVer = await spawnCapture('pg_restore', ['--version']);
  const dumpParsed = parsePgToolVersion(dumpVer.stdout);
  const restoreParsed = parsePgToolVersion(restoreVer.stdout);
  if (!isClientVersionSufficient(dumpParsed) || !isClientVersionSufficient(restoreParsed)) {
    throw new Error(
      `pg_dump/pg_restore client too old (pg_dump=${dumpParsed.raw}, pg_restore=${restoreParsed.raw}); ` +
        `need >= ${MIN_CLIENT_MAJOR}.x to safely dump/restore against PG${MIN_CLIENT_MAJOR} Supabase ` +
        '(Spec 112 §5). Install a newer client toolchain, or route through the Supabase-bundled tools / ' +
        'a postgres:17 Docker container ("docker exec ... pg_dump/pg_restore ...") as a fallback.'
    );
  }
  return { pg_dump: dumpParsed, pg_restore: restoreParsed };
}

async function truncateTargetTables(targetPool, tables, opts) {
  const sql = buildTruncateSql(tables, opts);
  if (!sql) return;
  await targetPool.query(sql);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  const sourcePool = gates.resolveSourcePool();
  const targetPool = gates.resolveTargetPool(args.target);

  try {
    const [sourceTables, targetTables] = await Promise.all([
      gates.getBaseTables(sourcePool),
      gates.getBaseTables(targetPool),
    ]);
    const tables = gates.computeTableList({ sourceTables, targetTables, requested: args.tables });

    console.log(`[restore-db] target=${args.target} mode=${args.verifyOnly ? 'verify-only' : args.mode}`);
    console.log(`[restore-db] table scope (${tables.length}): ${tables.join(', ')}`);

    if (args.verifyOnly) {
      const report = await gates.runAllGates({ sourcePool, targetPool, tables });
      gates.printReport(report);
      process.exitCode = report.verdict === 'FAIL' ? 1 : 0;
      return;
    }

    await checkClientVersion();

    const targetConnectionString = gates.resolveTargetConnectionString(args.target);

    let dumpPath = args.dumpPath;
    let dumpIsTemp = false;
    if (!dumpPath) {
      dumpPath = args.dumpOut || path.join(os.tmpdir(), `buildo-restore-${Date.now()}.dump`);
      dumpIsTemp = !args.dumpOut && !args.keepDump;

      const sourceConn = {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        user: process.env.PG_USER || 'postgres',
        database: process.env.PG_DATABASE || 'buildo',
      };
      // Spec 112 §4.2 — pg_dump/pg_restore don't go through ssl-config.js's
      // pg-Pool-shaped return value; TLS is negotiated via PGSSLMODE/PGSSLROOTCERT
      // env vars passed to the spawned process. Source here is always the
      // Docker dev DB (loopback), so no TLS is needed.
      const dumpEnv = { PGPASSWORD: process.env.PG_PASSWORD || 'postgres' };
      if (!isLocalMode({ host: sourceConn.host })) {
        throw new Error('restore-db.js only supports a loopback SOURCE (Docker dev DB) in Phase 0.5 tooling.');
      }

      console.log(`[restore-db] pg_dump --data-only -> ${dumpPath} (${tables.length} tables)`);
      const dumpResult = await spawnCapture(
        'pg_dump',
        buildPgDumpArgs({ tables, outFile: dumpPath, source: sourceConn }),
        dumpEnv
      );
      const dumpGate = stderrGateDecision(dumpResult);
      if (!dumpGate.pass) {
        throw new Error(`[restore-db] pg_dump FAILED: ${dumpGate.reason}\nstderr:\n${dumpResult.stderr}`);
      }
      console.log('[restore-db] pg_dump OK (no stderr)');
    } else {
      console.log(`[restore-db] using existing dump: ${dumpPath}`);
    }

    // CASCADE only for a full-scope run (every eligible table truncated+
    // reloaded together — see buildTruncateSql's doc comment for why a
    // --tables-scoped run must NOT cascade into out-of-scope dependents).
    const isFullRun = !args.tables;
    console.log(
      `[restore-db] TRUNCATE ${tables.length} target table(s) before restore ` +
        `(idempotent re-run, D13; cascade=${isFullRun})`
    );
    await truncateTargetTables(targetPool, tables, { cascade: isFullRun });

    const restoreEnv = {};
    if (!isLocalMode({ connectionString: targetConnectionString })) {
      const caCertPath = process.env.SUPABASE_CA_CERT_PATH;
      if (!caCertPath) {
        throw new Error('SUPABASE_CA_CERT_PATH is not set — required for a non-loopback (cloud) restore target (Spec 113 §4).');
      }
      restoreEnv.PGSSLMODE = 'verify-full';
      restoreEnv.PGSSLROOTCERT = caCertPath;
    }

    console.log('[restore-db] pg_restore --single-transaction --exit-on-error');
    const restoreResult = await spawnCapture(
      'pg_restore',
      buildPgRestoreArgs({ dumpPath, targetConnectionString }),
      restoreEnv
    );
    const restoreGate = stderrGateDecision(restoreResult);
    if (!restoreGate.pass) {
      // --single-transaction means the DB itself already rolled back on error;
      // nothing further to undo here.
      throw new Error(`[restore-db] pg_restore FAILED: ${restoreGate.reason}\nstderr:\n${restoreResult.stderr}`);
    }
    console.log('[restore-db] pg_restore OK (no stderr) — restore committed');

    if (dumpIsTemp) {
      try {
        fs.unlinkSync(dumpPath);
      } catch (err) {
        console.warn(`[restore-db] could not remove temp dump file ${dumpPath}: ${err.message}`);
      }
    }

    if (args.skipGates) {
      console.log('[restore-db] --skip-gates set — not running the G10 gate suite');
      return;
    }

    const report = await gates.runAllGates({ sourcePool, targetPool, tables });
    gates.printReport(report);
    process.exitCode = report.verdict === 'FAIL' ? 1 : 0;
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[restore-db] FAILED:', err.message);
    process.exitCode = 1;
  });
}

module.exports = {
  MIN_CLIENT_MAJOR,
  parseArgs,
  validateArgs,
  parsePgToolVersion,
  isClientVersionSufficient,
  stderrGateDecision,
  quoteIdent,
  buildTruncateSql,
  buildPgDumpArgs,
  buildPgRestoreArgs,
  spawnCapture,
  checkClientVersion,
  truncateTargetTables,
  run,
};
