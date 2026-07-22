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
 * PRECONDITION — non-empty target (cloud / Phase 4.0 runs), Spec 112 §8 edge case:
 * TRUNCATE runs BEFORE pg_restore, not inside the same `--single-transaction` scope as the
 * restore itself — so `--single-transaction` protects the RESTORE step's atomicity, it does
 * NOT make the whole TRUNCATE-then-restore sequence undoable. A mid-run infra failure (killed
 * process, lost connection, host reboot) between TRUNCATE and a completed pg_restore leaves the
 * target truncated, not rolled back to its pre-run state. The TOC preflight (below) removes the
 * *wrong-dump* failure class (refusing to truncate tables the dump can't actually restore) but
 * does NOT remove the *infra-failure-mid-restore* class. For any target whose current data
 * cannot be regenerated (an irreplaceable cloud database — this is never true of the Phase 0.5
 * local-stack load, which is always re-run fresh from Docker per D13), the operator MUST take a
 * target-side safety dump (e.g. `pg_dump` of the target itself) before invoking this script with
 * `--mode=fresh` — restore-db.js does not do this automatically, and this is the operator
 * mitigation for that residual gap.
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
// BINARY must be >= the highest Postgres server version in play: Supabase's
// PG17 (post-D13 cutover the PG_*-addressed dev source is ITSELF the local
// Supabase PG17 stack; the retired Docker source was PG15, CI is PG16) — an
// older client dumping/restoring a newer server fails silently/opaquely far
// more often than not.
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
    iReallyMeanToTruncate: false,
    skipTruncate: false,
  };
  for (const raw of argv) {
    if (raw === '--i-really-mean-to-truncate') {
      args.iReallyMeanToTruncate = true;
      continue;
    }
    // --skip-truncate: bypass the pre-restore TRUNCATE entirely. Correct ONLY
    // when the target is freshly empty (e.g. the Phase-4.0 cloud greenfield
    // load of a table SUBSET): a partial --tables scope truncates non-CASCADE,
    // which Postgres refuses when an OUT-OF-SCOPE table (an intentionally
    // excluded, empty user table) carries an FK INTO an in-scope table. An
    // empty target needs no truncation at all, so skipping sidesteps the FK
    // barrier. The truncate guard's emptiness check runs ONLY for a
    // NON-LOOPBACK target (P4-F0 fold C1: it now probes the actual scoped
    // tables + the auth.users/parcels belt, and FAILS CLOSED on probe error);
    // on a LOOPBACK target no guard runs at all — the only remaining net for
    // a mistakenly-populated local target is pg_restore --data-only dup-key
    // failing loudly. Never combine with a populated target.
    if (raw === '--skip-truncate') {
      args.skipTruncate = true;
      continue;
    }
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

/** Strip a single matching pair of double quotes, the only quoting `pg_restore --list` uses for identifiers needing it. */
function unquoteTocIdent(s) {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1);
  return s;
}

/**
 * TOC preflight (Spec 112 §4.3, the CRITICAL gate) — pure parse of
 * `pg_restore --list <dump>` output into the set of tables the dump can
 * actually restore. Extracted as a pure function (no spawn) so
 * src/tests/restore-db.infra.test.ts can feed it real `pg_restore --list`
 * output and src/tests/restore-db.logic.test.ts can feed it synthetic
 * fixtures without spawning a process.
 *
 * A `TABLE DATA` TOC line has the shape:
 *   <dumpId>; <catalog-oid> <oid> TABLE DATA <schema> <table> <owner>
 * e.g. `3312; 0 16463 TABLE DATA public trades postgres`. Schema/table are
 * occasionally double-quoted by pg_restore (mixed-case or reserved-word
 * identifiers) — unquoted before being added to the set.
 *
 * @param {string} listOutput - raw stdout of `pg_restore --list <dump>`
 * @returns {Set<string>} lowercase `schema.table` strings covered by TABLE DATA entries
 */
function parseTocTables(listOutput) {
  const tables = new Set();
  const lines = (listOutput || '').split('\n');
  const tocLineRe = /^\d+;\s+\d+\s+\d+\s+TABLE DATA\s+(\S+)\s+(\S+)\s+\S+\s*$/;
  for (const line of lines) {
    const m = line.match(tocLineRe);
    if (!m) continue;
    const schema = unquoteTocIdent(m[1]);
    const table = unquoteTocIdent(m[2]);
    tables.add(`${schema}.${table}`.toLowerCase());
  }
  return tables;
}

/**
 * Spec 112 §4.3 TOC preflight rule: FAIL (nothing truncated) unless every
 * table about to be truncated is covered by the dump's TOC ∩ scope. Assumes
 * `public` schema (this script's TRUNCATE/pg_dump `--table` args are always
 * `public.<table>`, per `buildTruncateSql`/`buildPgDumpArgs`).
 *
 * @param {Set<string>} tocTables - output of parseTocTables
 * @param {string[]} scopedTables - bare table names about to be truncated+restored
 * @returns {{ covered: boolean, missing: string[] }}
 */
function checkTocCoversScope(tocTables, scopedTables) {
  const missing = scopedTables.filter((t) => !tocTables.has(`public.${t}`.toLowerCase()));
  return { covered: missing.length === 0, missing };
}

/**
 * Destructive-truncate guard (Phase 4 F0 step 0, Gemini CRITICAL fold #3;
 * reworked P4-F0 output-panel fold C1) — pure decision, no DB access. This
 * one-off tool must not become a post-launch landmine: a `--target` that
 * already holds REAL users or data must not be silently TRUNCATEd. The
 * Phase-4.0 cloud load runs against an EMPTY cloud, so the zero-row path
 * returns `tripped: false` and needs NO flag; a populated (post-launch /
 * accidentally-repointed) remote target trips and refuses unless the operator
 * passes `--i-really-mean-to-truncate`.
 *
 * C1 rework (Code Reviewer CRITICAL, 4-reviewer converge): the probe set is
 * the ACTUAL tables about to be truncated (`dataRowCounts`, one entry per
 * scoped table — a `--tables=trades,...` subset holding data must trip the
 * guard even when parcels/auth.users are empty), with `auth.users` retained
 * as the primary production signal and `public.parcels` as a belt probe.
 * A `null` count means the probe itself FAILED — the guard FAILS CLOSED on
 * it (an unverifiable target is treated as populated, never as empty).
 *
 * @param {{ authUsersCount: number|null, dataRowCounts: Record<string, number|null>, override: boolean, dataThreshold?: number }} args
 * @returns {{ allowed: boolean, tripped: boolean, reason: string }}
 */
const TRUNCATE_GUARD_DATA_THRESHOLD = 0; // any real data rows in a probed table is a signal

function truncateGuardDecision({ authUsersCount, dataRowCounts, override, dataThreshold = TRUNCATE_GUARD_DATA_THRESHOLD }) {
  const counts = dataRowCounts || {};

  // FAIL CLOSED (C1): a probe that errored (null/undefined count) means we
  // could NOT verify emptiness — refuse unless the operator overrides.
  const unprobeable = [];
  if (authUsersCount === null || authUsersCount === undefined) unprobeable.push('auth.users');
  for (const [expr, n] of Object.entries(counts)) {
    if (n === null || n === undefined) unprobeable.push(expr);
  }
  if (unprobeable.length > 0) {
    if (override) {
      return {
        allowed: true,
        tripped: true,
        reason:
          `probe failed for ${unprobeable.join(', ')} — proceeding under --i-really-mean-to-truncate ` +
          `(operator-asserted; emptiness could NOT be verified)`,
      };
    }
    return {
      allowed: false,
      tripped: true,
      reason:
        `REFUSING to TRUNCATE: could not count ${unprobeable.join(', ')} — the guard fails CLOSED on a ` +
        `probe error (an unverifiable target is treated as populated, never as empty). Fix ` +
        `connectivity/permissions, or pass --i-really-mean-to-truncate if you are certain the target is safe.`,
    };
  }

  const users = Number(authUsersCount) || 0;
  const populatedTables = Object.entries(counts).filter(([, n]) => Number(n) > dataThreshold);
  if (users === 0 && populatedTables.length === 0) {
    return {
      allowed: true,
      tripped: false,
      reason: `target is empty across auth.users + ${Object.keys(counts).length} probed table(s) — safe to TRUNCATE (no flag needed)`,
    };
  }
  const detail =
    `${users} auth.users row(s)` +
    (populatedTables.length > 0
      ? ` and data rows in ${populatedTables.map(([t, n]) => `${t}=${n}`).join(', ')}`
      : '');
  if (override) {
    return {
      allowed: true,
      tripped: true,
      reason: `target holds ${detail} — proceeding under --i-really-mean-to-truncate`,
    };
  }
  return {
    allowed: false,
    tripped: true,
    reason:
      `REFUSING to TRUNCATE: target holds ${detail} (threshold ${dataThreshold}). This looks like a ` +
      `populated/production database. Pass --i-really-mean-to-truncate to override if this is intentional.`,
  };
}

/**
 * The truncate guard's probe list (C1): the ACTUAL tables this run is about to
 * truncate/restore, plus the two fixed belt probes — `auth.users` (any
 * registered human = production signal) and `public.parcels` (canonical
 * data-bearing table) — which are retained even when out of scope. Table names
 * pass through quoteIdent (they come from information_schema via
 * computeTableList, but defense-in-depth is free here).
 * @param {string[]} scopedTables
 * @returns {string[]} probe expressions, `auth.users` first
 */
function buildGuardProbeExprs(scopedTables) {
  const exprs = new Set(['auth.users', `public.${quoteIdent('parcels')}`]);
  for (const t of scopedTables || []) exprs.add(`public.${quoteIdent(t)}`);
  return [...exprs];
}

/**
 * Whether the destructive-truncate guard applies to a target (C1 regression
 * lock, Guardian MED-1): a LOOPBACK target is the D13 truncate-first re-run
 * flow (Phase 0.5) — by design it reloads a fully-populated local DB every
 * run and must NOT be gated. Any non-loopback (cloud/remote) target is.
 * @param {string} targetConnectionString
 */
function truncateGuardApplies(targetConnectionString) {
  return !isLocalMode({ connectionString: targetConnectionString });
}

/**
 * Whether the pre-restore TRUNCATE may use CASCADE (Round-3 fold GT#1,
 * 2026-07-22 — a defect the C2 auto-exclusion introduced). CASCADE is safe
 * ONLY when the statement's table list covers EVERY eligible table: no
 * operator `--tables` scope AND nothing auto-excluded. After the C2
 * auth-linked exclusion, an unscoped remote run is no longer full-scope —
 * the excluded tables sit OUTSIDE the statement's list, and CASCADE would
 * silently truncate an excluded auth-linked dependent (`lead_views` FKs into
 * `permits`/`entities` ON DELETE CASCADE, mig 070 + 229) that is not in the
 * dump and never reloaded — real-user data loss the exclusion log implied
 * was protected. With plain TRUNCATE the FK barrier fails LOUDLY instead;
 * the operator then uses --skip-truncate (empty greenfield target) or an
 * explicit scope — never silent data loss.
 * @param {{ requested: string[]|null, excludedCount: number }} args
 */
function cascadeAllowed({ requested, excludedCount }) {
  return (!requested || requested.length === 0) && excludedCount === 0;
}

/**
 * §1a/§1b cleanup-pathing decision — pure, no fs access. Decides WHICH of
 * the three dump-path modes a given parsed-args object selects, and whether
 * the eventual mkdtemp() directory this run creates (if any) is temp/
 * deletable. Extracted so the branch logic is unit-testable without a real
 * filesystem: `run()` calls this once, then does the actual `mkdtempSync`
 * itself only for the `'temp'` mode.
 *
 * - `'existing'` — operator supplied --dump=<path>. NEVER temp — this path
 *   is never created or deleted by this script, regardless of --keep-dump.
 * - `'explicit-out'` — operator supplied --dump-out=<path> (no --dump=).
 *   NEVER temp — an explicit output location is not auto-cleaned, mirroring
 *   the "existing" case's never-delete-a-named-path rule.
 * - `'temp'` — neither given: this run creates its own private mkdtemp()
 *   directory. Deletable (`dumpIsTemp: true`) unless --keep-dump was passed.
 *
 * @param {{ dumpPath: string|null, dumpOut: string|null, keepDump: boolean }} args
 * @returns {{ mode: 'existing'|'explicit-out'|'temp', dumpIsTemp: boolean }}
 */
function decideDumpPlan(args) {
  if (args.dumpPath) return { mode: 'existing', dumpIsTemp: false };
  if (args.dumpOut) return { mode: 'explicit-out', dumpIsTemp: false };
  return { mode: 'temp', dumpIsTemp: !args.keepDump };
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

/**
 * Count rows in a table expression from buildGuardProbeExprs (quoteIdent-
 * validated or the fixed `auth.users` literal — never raw operator input).
 *
 * Returns:
 *  - a number for a successful count;
 *  - 0 ONLY when the relation/schema genuinely does not exist (SQLSTATE
 *    42P01 undefined_table / 3F000 invalid_schema_name — a table that does
 *    not exist cannot hold data, e.g. a pre-schema-catch-up target);
 *  - null for ANY other probe failure (network, auth, permission, timeout)
 *    — the caller's truncateGuardDecision FAILS CLOSED on null (P4-F0 fold
 *    C1: the old code returned 0 here, silently waving a populated-but-
 *    unreachable target through the guard).
 * @param {import('pg').Pool} pool
 * @param {string} tableExpr
 * @returns {Promise<number|null>}
 */
async function countTableRowsSafe(pool, tableExpr) {
  try {
    const res = await pool.query(`SELECT count(*)::bigint AS n FROM ${tableExpr}`);
    return Number(res.rows[0].n);
  } catch (err) {
    if (err.code === '42P01' || err.code === '3F000') {
      console.warn(`[restore-db] ${tableExpr} does not exist on target — counting as 0 for the truncate guard: ${err.message}`);
      return 0;
    }
    console.warn(`[restore-db] probe FAILED for ${tableExpr} (guard fails closed): ${err.message}`);
    return null;
  }
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
    let tables = gates.computeTableList({ sourceTables, targetTables, requested: args.tables });

    const targetConnectionString = gates.resolveTargetConnectionString(args.target);
    const targetIsLocal = !truncateGuardApplies(targetConnectionString);

    // Auth-linked auto-exclusion (P4-F0 fold C2, Integration MED — reproduced
    // live): on a REMOTE target, tables carrying an FK into auth.users are
    // greenfield-empty by design (their dev rows point at dev auth.users uuids
    // absent on cloud) and later hold REAL user rows that never match the dev
    // source — an unscoped run must not load or false-FAIL-verify them. The
    // exclusion list is DERIVED from the target's pg_constraint, never a
    // hand-typed CLI argument (the F0 session's 68-table list, codified).
    // Local targets and explicit --tables scopes are untouched (D13 full-load
    // flow / operator wins).
    const authLinkedTables = await gates.getAuthLinkedTables(targetPool);
    const authExclusion = gates.applyAuthLinkedExclusion({
      tables,
      authLinkedTables,
      requested: args.tables,
      targetIsLocal,
    });
    tables = authExclusion.tables;
    if (authExclusion.excluded.length > 0) {
      console.log(
        `[restore-db] auto-excluded ${authExclusion.excluded.length} auth-linked table(s) ` +
          `(FK → auth.users, derived from target pg_constraint): ${authExclusion.excluded.join(', ')}`
      );
    }

    console.log(`[restore-db] target=${args.target} mode=${args.verifyOnly ? 'verify-only' : args.mode}`);
    console.log(`[restore-db] table scope (${tables.length}): ${tables.join(', ')}`);

    if (args.verifyOnly) {
      const report = await gates.runAllGates({ sourcePool, targetPool, tables });
      gates.printReport(report);
      process.exitCode = report.verdict === 'FAIL' ? 1 : 0;
      return;
    }

    await checkClientVersion();

    // Destructive-truncate guard (Phase 4 F0 step 0, Gemini CRITICAL fold #3;
    // reworked P4-F0 fold C1). Scoped to a NON-LOOPBACK (cloud/remote) target
    // ONLY (truncateGuardApplies): a loopback SOURCE→local target is the D13
    // truncate-first re-run flow (Phase 0.5), which by design reloads a fully-
    // populated local DB on every run and must NOT be gated. A remote target
    // that already holds real users/data, however, is a post-launch landmine —
    // refuse to TRUNCATE it without an explicit override. C1: the probe now
    // covers the ACTUAL scoped tables (+ auth.users/parcels belt) and FAILS
    // CLOSED on probe error. The Phase-4.0 cloud load runs against an EMPTY
    // cloud, so this passes with no flag; only a populated remote target trips.
    let guardRan = false;
    if (!targetIsLocal) {
      guardRan = true;
      const probeExprs = buildGuardProbeExprs(tables);
      const countEntries = await Promise.all(
        probeExprs.map(async (expr) => [expr, await countTableRowsSafe(targetPool, expr)])
      );
      const countsByExpr = Object.fromEntries(countEntries);
      const authUsersCount = countsByExpr['auth.users'];
      delete countsByExpr['auth.users'];
      const guard = truncateGuardDecision({
        authUsersCount,
        dataRowCounts: countsByExpr,
        override: args.iReallyMeanToTruncate,
      });
      if (!guard.allowed) {
        throw new Error(`[restore-db] ${guard.reason}`);
      }
      console.log(`[restore-db] truncate guard: ${guard.reason}`);
    }

    // §1a — a private mkdtemp() directory, not a predictable os.tmpdir() file
    // path, is where the auto-generated dump is written: mkdtemp's 0700-mode,
    // uniquely-named directory defeats the TOCTOU/symlink race a shared,
    // guessable tmpdir path is exposed to (a concurrent process — or an
    // attacker — pre-creating/symlinking the exact predictable filename
    // between "path computed" and "pg_dump opens it for write"). Only created
    // when we're generating a fresh dump ourselves (no --dump=, no
    // --dump-out=); a user-supplied --dump= path is NEVER touched by this
    // directory or the cleanup below.
    const dumpPlan = decideDumpPlan(args);
    let dumpPath = args.dumpPath;
    let dumpTempDir = null;
    const dumpIsTemp = dumpPlan.dumpIsTemp;

    try {
      if (dumpPlan.mode !== 'existing') {
        if (dumpPlan.mode === 'explicit-out') {
          dumpPath = args.dumpOut;
        } else {
          dumpTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildo-restore-'));
          dumpPath = path.join(dumpTempDir, 'source.dump');
        }

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

      // §1c — TOC preflight (Spec 112 §4.3, the CRITICAL gate). Runs for
      // BOTH a freshly generated dump AND an operator-supplied --dump=,
      // and — this is the point — strictly BEFORE any TRUNCATE. A dump
      // that can't actually restore every table this run is about to wipe
      // must never be allowed to wipe them anyway.
      console.log('[restore-db] pg_restore --list (TOC preflight)');
      const listResult = await spawnCapture('pg_restore', ['--list', dumpPath]);
      if (listResult.exitCode !== 0) {
        throw new Error(
          `[restore-db] pg_restore --list FAILED (exit ${listResult.exitCode}) — cannot verify TOC ` +
            `coverage, refusing to proceed. Nothing was truncated.\n${listResult.stderr || listResult.stdout}`
        );
      }
      const tocTables = parseTocTables(listResult.stdout);
      const tocCheck = checkTocCoversScope(tocTables, tables);
      if (!tocCheck.covered) {
        throw new Error(
          `[restore-db] TOC preflight FAILED (Spec 112 §4.3) — dump has no TABLE DATA entry for: ` +
            `${tocCheck.missing.join(', ')}. Refusing to TRUNCATE target tables this dump cannot ` +
            `restore. Nothing was truncated. (dump=${dumpPath})`
        );
      }
      console.log(`[restore-db] TOC preflight OK — dump covers all ${tables.length} scoped table(s)`);

      // CASCADE only for a GENUINELY full-scope run — no --tables scope AND
      // no auth-linked auto-exclusion (see cascadeAllowed's doc comment for
      // the Round-3 GT#1 data-loss scenario; buildTruncateSql's for the
      // original scoped-run rationale).
      const isFullRun = cascadeAllowed({ requested: args.tables, excludedCount: authExclusion.excluded.length });
      if (args.skipTruncate) {
        console.log(
          `[restore-db] --skip-truncate: skipping TRUNCATE of ${tables.length} table(s) ` +
            `(target asserted empty — greenfield subset load; ` +
            (guardRan
              ? `the truncate guard probed the scoped tables + auth.users/parcels belt above).`
              : `LOOPBACK target — NO truncate guard ran; a populated table will dup-key loudly in pg_restore).`)
        );
      } else {
        console.log(
          `[restore-db] TRUNCATE ${tables.length} target table(s) before restore ` +
            `(idempotent re-run, D13; cascade=${isFullRun})`
        );
        await truncateTargetTables(targetPool, tables, { cascade: isFullRun });
      }

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
    } finally {
      // §1b — cleanup runs on EVERY path out of the block above: success,
      // pg_dump failure, TOC-preflight failure, truncate failure, or
      // pg_restore failure. Only removes a directory THIS run created
      // (dumpTempDir is null for both an operator --dump= and an explicit
      // --dump-out=) and only when the operator didn't ask to --keep-dump.
      if (dumpTempDir && dumpIsTemp) {
        try {
          fs.rmSync(dumpTempDir, { recursive: true, force: true });
        } catch (err) {
          console.warn(`[restore-db] could not remove temp dump dir ${dumpTempDir}: ${err.message}`);
        }
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
  unquoteTocIdent,
  parseTocTables,
  checkTocCoversScope,
  decideDumpPlan,
  truncateGuardDecision,
  buildGuardProbeExprs,
  truncateGuardApplies,
  cascadeAllowed,
  TRUNCATE_GUARD_DATA_THRESHOLD,
  spawnCapture,
  checkClientVersion,
  truncateTargetTables,
  countTableRowsSafe,
  run,
};
