#!/usr/bin/env node
/**
 * ingestor-forced-cohort — the GENERIC, reviewed, reusable forced-change cohort
 * bracket for the INGESTOR POST recaptures required by gate G #38.
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AS
 *
 * WHY THIS FILE EXISTS. Gate G #38 needs every converted INGESTOR to carry one
 * NONZERO post capture. A POST capture is only meaningful if the step actually
 * WROTE something, and on unchanged source data a step whose guard names a
 * version/stamp column will legitimately write ZERO rows — a run that proves
 * nothing. The R-AS instrument for that state is a COMMITTED PERTURBATION
 * COHORT: pick N eligible rows, move ONE column so the step's own guard fires,
 * run the REAL step through capture-step-golden.js, and prove the step HEALED
 * the rows (every cohort row is back to its backed-up value) while the summary
 * reports a nonzero write count.
 *
 * The first three INGESTOR recaptures (address_points, parcels, load_wsib —
 * commits 4ea7621e, 61e83927, bd01e07a) were done with hand-run, UNREVIEWED SQL
 * brackets. This file replaces that class of work with ONE script whose safety
 * properties are the ones `scripts/analysis/enrich-centreline-cohort-differential.js`
 * (the safety precedent, read at `.cursor/ref/enrich-centreline-cohort-differential.js`)
 * established: a verified backup BEFORE any perturb, a cohort-scoped restore,
 * `perturbed` latched BEFORE the COMMIT, SIGINT/SIGTERM as a FENCE, the
 * sanctioned `pipeline.withAdvisoryLock` bracket lock, single-mode argv, every
 * refusal BEFORE any DB connect, and a `--self-test` over every pure helper.
 *
 * GENERIC BY FLAGS, NOT BY CODE PATH. There is NO step-specific branch anywhere in
 * this file: the table, the key column, the perturbed column, the perturbation
 * operation, the cohort size, the eligibility predicate, the order expression and
 * the before-image table are ALL flags. `--run` additionally names the step and the
 * capture output, passed through to the harness. A data-driven script is the whole
 * point — a per-step copy is how the hand-run SQL class of work comes back.
 *
 * MODES (exactly one):
 *   --self-test   No DB. Exercises every pure helper; prints 'self-test PASSED'.
 *   --plan        READ ONLY txn. Prints the cohort + the whole-table projected hash
 *                 and the column's current values; refuses if fewer than N eligible.
 *   --backup      CREATE TABLE <backup> AS SELECT (key, column) for the cohort keys
 *                 only; verifies its contents; refuses if the table already exists.
 *   --run         Refuses unless the backup exists and MATCHES the LIVE cohort values.
 *                 Applies the perturbation in ONE transaction (`perturbed = true`
 *                 immediately before COMMIT), spawns the capture harness, reads the
 *                 FIRST PIPELINE_SUMMARY, asserts records_updated (or new+updated) >= 1
 *                 AND that every cohort row is back to its backed-up value (the step
 *                 healed it). ALWAYS (finally) restores ONLY the cohort keys from the
 *                 backup, with an `IS DISTINCT FROM` guard, when `perturbed`.
 *   --restore     Cohort-scoped restore from the backup table + verification.
 *   --help        This text.
 *
 * REQUIRED FLAGS (plan/backup/run/restore):
 *   --table=<t>            the table under test (one shared identifier rule for ALL
 *                          table names, used by hashOf() too — see TABLE_NAME_RE)
 *   --key=<pk col>         the primary-key column
 *   --column=<col>         the ONE column to perturb
 *   --op=<op>              add_number:<n> | append_text:<s> | negate_bool
 *   --count=<N>            the cohort size
 *   --where=<SQL pred>     selects the ELIGIBLE rows (no semicolons)
 *   --order=<SQL expr>     the ORDER BY expression that picks the FIRST N
 *   --backup-table=<t>_cohort_bak_<yyyymmddthhmmz>  the before-image (lower-case)
 * --run additionally:
 *   --step=<scripts/x.js>  --chain=<sources|none|…>  --out=<capture json>
 *   [--env=K=V …]          extra env for the spawned step (repeatable)
 *   [--capture-arg=<arg> …] passed through to capture-step-golden.js (repeatable)
 *
 * Usage (LOCAL dev DB only — never a shared/cloud target; resolve-db refuses unsafe
 * targets and, per its own contract, no `PG_*` env is read directly here):
 *   node scripts/analysis/ingestor-forced-cohort.js --help
 *   node scripts/analysis/ingestor-forced-cohort.js --self-test
 *   node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --plan \
 *       --table=address_points --key=id --column=class_family_desc \
 *       --op='append_text: forced' --count=20 --where='class_family_desc IS NOT NULL' \
 *       --order=id --backup-table=address_points_cohort_bak_20261002t1848z
 *   node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --backup <same flags>
 *   node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --run <same flags> \
 *       --step=scripts/load-address-points.js --chain=sources \
 *       --out=docs/reports/golden/load_address_points/post/forced.json
 *   node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --restore <same flags>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createResolvedPool } = require('../lib/resolve-db');
// The capture harness's OWN hash builders (RULING R-C shape: ONE definition, never a
// second hand-typed copy). `rowTextExpr` quotes each identifier as "col";
// `orderByClause` renders the ORDER BY list. Reaching into the harness's source text
// is forbidden here — if the harness ever changes the narrow-path hash, this file
// inherits the change (that is the point).
const { rowTextExpr, orderByClause } = require('./capture-step-golden.js');
// The sanctioned advisory-lock entry point (Spec 47 §5). The bracket's mutual
// exclusion is taken through `pipeline.withAdvisoryLock` — a TRANSACTION-level
// `pg_try_advisory_xact_lock` on its own dedicated client — never a hand-rolled
// session lock.
const pipeline = require('../lib/pipeline');

const REPO_ROOT = path.resolve(__dirname, '../..');
const GOLDEN_ROOT = path.join(REPO_ROOT, 'docs/reports/golden');
const HARNESS = 'scripts/analysis/capture-step-golden.js';

/**
 * fx1 (idempotency lens): the BRACKET's own advisory lock.
 *
 * The bracket does three things no other mode does: it rewrites N rows, it spawns the
 * real step, and it restores from a before-image. Two concurrent brackets (or a chain
 * run whose own pre-perturbation repair walks the same rows) can interleave — run B's
 * step repair would undo run A's perturbation BEFORE A's capture, and A's capture would
 * record B's output. The perturbation is only meaningful if the bracket owns the rows
 * for its whole duration, so it takes a lock of its own and REFUSES rather than queues
 * (see `withAdvisoryLock`'s `{acquired:false}` return). It is taken via the SANCTIONED
 * helper, which opens its own `BEGIN`, issues `pg_try_advisory_xact_lock($1)` on its own
 * dedicated client (never the pool the queries use) and COMMITs to release it; a killed
 * backend drops the transaction and the lock with it, so no zombie lock can form and no
 * explicit unlock is needed (Spec 47 §5).
 *
 * WHAT IT DOES NOT COVER (be honest about the boundary): this lock excludes OTHER cohort
 * brackets ONLY. It is not a general table lock and it is NOT held by the step, the chain
 * runner, or any producer. A concurrent chain run or a producer writing the table while
 * this bracket is open is NOT prevented. Those interferences are caught AFTER THE FACT by
 * the --run claim asserts: the "every cohort row is back to its backed-up value" check
 * and the "the step wrote >= 1 row" comparison. Treat the lock as mutual exclusion among
 * brackets, not as isolation from every writer.
 *
 * The VALUE collides with nothing. Chosen by grepping the live tree for every
 * advisory-lock literal:
 *   git grep -nE 'ADVISORY_LOCK_ID *= *[0-9]+|COHORT[A-Z_]*_LOCK_ID *= *[0-9]+' -- scripts
 * → the per-step registry occupies 2, 5, 11, 12, 30, 40, 44-46, 53, 55-66, 76, 78, 80-99,
 *   102-126, 195, 4201-4205; the chain/namespace locks live in the 2-arg keyspace (keyed
 *   on hashtext of "chain_<id>", Spec 40) and cannot collide with a 1-arg lock id. The
 *   only other cohort-bracket constant in the tree lives in
 *   `.cursor/ref/enrich-centreline-cohort-differential.js` (902001). A six-digit id in
 *   the 90xxxx range is unused by construction, and NOTABLY it is NOT the step's own lock
 *   (96 = load-address-points, 55 = load-parcels, 97 = load-wsib) — taking a step's lock
 *   here would make the spawn self-skip on the bracket's own lock, turning every capture
 *   into a void differential.
 */
const COHORT_LOCK_ID = 902002;

/** The ONE shared identifier rule for EVERY table name (--table, --backup-table, hashOf). */
const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;
/** The before-image name: `<table>_cohort_bak_<yyyymmddthhmmz>` (lower-case, one rule). */
const BACKUP_TABLE_RE = /^[a-z_][a-z0-9_]*_cohort_bak_\d{8}t\d{4}z$/;

const MODE_KEYS = ['selfTest', 'plan', 'backup', 'run', 'restore'];

// ── argv ─────────────────────────────────────────────────────────────────────
/** The CLI spelling of a mode key (`selfTest` → `self-test`). Pure. */
function modeFlag(mode) {
  return String(mode).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * Parse argv into `{mode, help, flags, env, captureArgs}`. Pure — no DB, no fs.
 *
 * `--env=K=V` and `--capture-arg=<arg>` are REPEATABLE and therefore collected into
 * arrays rather than overwritten (a scalar slot would silently drop all but the last).
 * Every other `--x=y` is stored by name. EXACTLY ONE mode is enforced HERE: several
 * modes set at once would let main() silently run only one and drop the others.
 */
function parseArgs(argv) {
  const out = {
    mode: null, help: false,
    table: null, key: null, column: null, op: null, count: null,
    where: null, order: null, backupTable: null,
    step: null, chain: null, out: null,
    env: [], captureArgs: [],
  };
  const setMode = (name) => {
    if (out.mode !== null) {
      throw new Error('pass exactly one of ' + MODE_KEYS.map((m) => `--${modeFlag(m)}`).join('|') + ` (got --${modeFlag(out.mode)} and --${name})`);
    }
    out.mode = name;
  };
  for (const a of argv) {
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (a === '--self-test') { setMode('selfTest'); continue; }
    if (a === '--plan') { setMode('plan'); continue; }
    if (a === '--backup') { setMode('backup'); continue; }
    if (a === '--run') { setMode('run'); continue; }
    if (a === '--restore') { setMode('restore'); continue; }
    if (a.startsWith('--env=')) { out.env.push(a.slice('--env='.length)); continue; }
    if (a.startsWith('--capture-arg=')) {
      const v = a.slice('--capture-arg='.length);
      if (v === '') throw new Error('--capture-arg= needs a value');
      out.captureArgs.push(v);
      continue;
    }
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${JSON.stringify(a)} (try --help)`);
    const name = m[1];
    const value = m[2] === undefined ? true : m[2];
    const slot = {
      table: 'table', key: 'key', column: 'column', op: 'op', count: 'count',
      where: 'where', order: 'order', 'backup-table': 'backupTable',
      step: 'step', chain: 'chain', out: 'out',
    }[name];
    if (!slot) throw new Error(`unknown flag --${name} (try --help)`);
    out[slot] = value;
  }
  return out;
}

// ── flags → validated options (ALL refusals BEFORE any DB connect) ────────────
/**
 * Validate the shared flags and return the derived, DB-queryable pieces. Pure.
 *
 * Every refusal here happens BEFORE `makePool()` — a mistyped flag must cost seconds
 * and touch NO database, never a partial write followed by a refusal.
 */
function validateFlags(args) {
  const mode = args.mode;
  const need = (name, v) => {
    if (v === null || v === undefined || v === '' || v === true) {
      throw new Error(`--${modeFlag(mode)} requires --${name}=<value>`);
    }
    return v;
  };
  const table = need('table', args.table);
  const key = need('key', args.key);
  const column = need('column', args.column);
  const opRaw = need('op', args.op);
  const countRaw = need('count', args.count);
  const where = need('where', args.where);
  const order = need('order', args.order);
  const backupTable = need('backup-table', args.backupTable);
  for (const [n, v] of [['table', table], ['key', key], ['column', column]]) {
    if (!TABLE_NAME_RE.test(v)) throw new Error(`--${n}=${JSON.stringify(v)} is not a legal identifier (${TABLE_NAME_RE})`);
  }
  if (!BACKUP_TABLE_RE.test(backupTable)) {
    throw new Error(`--backup-table must match ${BACKUP_TABLE_RE} (got ${JSON.stringify(backupTable)}) — it names a before-image that must be identifiable and disposable (lower-case, <table>_cohort_bak_<yyyymmddthhmmz>)`);
  }
  if (backupTable === table) throw new Error('--backup-table must not be --table itself');
  // The predicate is interpolated into the plan/backup/perturb SQL. A semicolon would
  // make it a multi-statement vector, so refuse it here (the brief's own rule) — the
  // statement must stay a single statement.
  if (String(where).includes(';')) throw new Error('--where must not contain a semicolon');
  if (typeof order !== 'string' || order.trim() === '') throw new Error('--order must be a non-empty SQL order expression');
  if (order.includes(';')) throw new Error('--order must not contain a semicolon');
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count <= 0) throw new Error(`--count must be a positive integer (got ${JSON.stringify(countRaw)})`);
  const op = parseOp(opRaw);
  if (mode === 'run') {
    const step = need('step', args.step);
    const chain = need('chain', args.chain);
    const out = need('out', args.out);
    if (typeof step !== 'string' || !/^scripts\/.+\.js$/.test(step)) {
      throw new Error(`--step must be a scripts/<name>.js path (got ${JSON.stringify(step)})`);
    }
    if (typeof chain !== 'string' || chain.trim() === '') throw new Error('--chain must be a non-empty chain id (or none)');
    resolveCaptureOut(out);
    for (const e of args.env) {
      if (typeof e !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(e)) {
        throw new Error(`--env must be K=V (got ${JSON.stringify(e)})`);
      }
    }
  }
  return {
    mode, table, key, column, op, opRaw, count, where, order, backupTable,
    step: args.step, chain: args.chain, out: args.out, env: args.env, captureArgs: args.captureArgs,
  };
}

/**
 * Parse `--op`. Pure. The three supported operations are exactly the forced changes
 * the INGESTOR recaptures need; anything else is refused rather than guessed.
 */
function parseOp(raw) {
  if (typeof raw !== 'string' || raw === '') throw new Error(`--op must be add_number:<n>|append_text:<s>|negate_bool (got ${JSON.stringify(raw)})`);
  if (raw === 'negate_bool') return { kind: 'negate_bool' };
  const i = raw.indexOf(':');
  if (i < 0) throw new Error(`--op must be add_number:<n>|append_text:<s>|negate_bool (got ${JSON.stringify(raw)})`);
  const head = raw.slice(0, i);
  const arg = raw.slice(i + 1);
  if (head === 'add_number') {
    const n = Number(arg);
    if (arg.trim() === '' || !Number.isFinite(n)) throw new Error(`--op=add_number:<n> needs a finite number (got ${JSON.stringify(arg)})`);
    return { kind: 'add_number' };
  }
  if (head === 'append_text') return { kind: 'append_text' };
  throw new Error(`--op kind must be add_number|append_text|negate_bool (got ${JSON.stringify(head)})`);
}

/** The `$2` bind value for an op, or `null` when the op takes none. Pure. */
function opBindValue(opRaw) {
  const op = parseOp(opRaw);
  if (op.kind === 'add_number') return Number(opRaw.slice(opRaw.indexOf(':') + 1));
  if (op.kind === 'append_text') return opRaw.slice(opRaw.indexOf(':') + 1);
  return null;
}

/**
 * The `UPDATE … SET <column> = …` assignment, as a pure function of the op. `<column>`
 * is the column the perturbation moves; `$2` (when the op takes a bind) is the parseOp
 * value. `negate_bool` is deliberately `NOT x` — the operator declares the column is
 * boolean; a non-boolean column makes Postgres raise, which is the right failure
 * (silently coercing would produce an unmodelled perturbation).
 */
function perturbationSetExpr(op, column) {
  if (!TABLE_NAME_RE.test(column)) throw new Error(`invalid column name ${JSON.stringify(column)}`);
  if (op.kind === 'negate_bool') return `"${column}" = NOT "${column}"`;
  if (op.kind === 'add_number') return `"${column}" = "${column}" + $2`;
  if (op.kind === 'append_text') return `"${column}" = "${column}" || $2`;
  throw new Error(`unknown op kind ${JSON.stringify(op.kind)}`);
}

// ── SQL builders (pure, shared by every mode) ────────────────────────────────
/**
 * The cohort projection: the key AND the perturbed column. This is the projector the
 * whole-table hash uses, in the harness's OWN narrow-table form, so a hash computed here
 * is comparable to one the harness computes for the same projection. Pure.
 */
function projection(key, column) {
  if (!TABLE_NAME_RE.test(key)) throw new Error(`invalid key column ${JSON.stringify(key)}`);
  if (!TABLE_NAME_RE.test(column)) throw new Error(`invalid column name ${JSON.stringify(column)}`);
  return [key, column];
}

/**
 * `md5(string_agg(ROW(<proj>)::text, '|' ORDER BY <key>))` over `table`, optionally
 * restricted. Pure. The order is ALWAYS the key column: the hash must be stable across
 * hosts and must NOT depend on the table's physical order.
 */
function hashSqlFor({ table, key, column, where }) {
  const rowText = rowTextExpr(projection(key, column));
  const orderBy = orderByClause({ orderColumns: [key], pkColumns: [], allColumns: [] });
  const pred = where ? ` WHERE ${where}` : '';
  return `SELECT md5(string_agg(${rowText}, '|' ORDER BY ${orderBy})) AS h FROM ${table} t${pred}`;
}

/**
 * The whole-table (unrestricted) hash. Pure. `table` is validated by the ONE shared rule,
 * which is why `hashOf` and `BACKUP_TABLE_RE` cannot disagree on case: Postgres folds
 * unquoted identifiers to lower case, so both must be lower-case.
 */
function hashOf({ table, key, column }) {
  if (typeof table !== 'string' || !TABLE_NAME_RE.test(table)) {
    throw new Error(`refusing to build a hash for table name ${JSON.stringify(table)}`);
  }
  return hashSqlFor({ table, key, column, where: null });
}

/** The cohort SELECT: the FIRST N eligible rows by --order, key + column. READ ONLY. Pure. */
function cohortSelect(o) {
  if (!Number.isInteger(o.count) || o.count <= 0) throw new Error(`invalid cohort count ${JSON.stringify(o.count)}`);
  return `SELECT t."${o.key}", t."${o.column}" FROM ${o.table} t WHERE ${o.where} ORDER BY ${o.order} LIMIT ${o.count}`;
}

/** The eligibility COUNT: how many rows --where selects. Pure. */
function eligibleCountSql(o) {
  return `SELECT count(*)::int AS n FROM ${o.table} t WHERE ${o.where}`;
}

/**
 * `CREATE TABLE <backup> AS SELECT <key>, <column> FROM <table> WHERE <key> = ANY($1)`
 * — the before-image, COHORT KEYS ONLY (never the whole table). Pure.
 */
function backupCreateSql(o) {
  if (!TABLE_NAME_RE.test(o.backupTable)) throw new Error(`invalid before-image name ${JSON.stringify(o.backupTable)}`);
  return `CREATE TABLE ${o.backupTable} AS SELECT t."${o.key}", t."${o.column}" FROM ${o.table} t WHERE t."${o.key}" = ANY($1)`;
}

/**
 * Read the before-image's cohort rows, ordered by key so comparisons are set-wise, never
 * physical-order-wise. Pure.
 */
function backupSelectSql(o) {
  if (!TABLE_NAME_RE.test(o.backupTable)) throw new Error(`invalid before-image name ${JSON.stringify(o.backupTable)}`);
  return `SELECT t."${o.key}", t."${o.column}" FROM ${o.backupTable} t ORDER BY t."${o.key}"`;
}

/**
 * The cohort-scoped restore UPDATE. Pure.
 *
 * The `t."<key>" = ANY($1)` predicate is the whole point: a restore that did not name
 * the cohort keys would revert every row the backup happens to hold. The
 * `IS DISTINCT FROM` guard means a no-op restore writes nothing (preserving every other
 * row's xmin) and only the column this bracket moved is ever touched.
 */
function restoreSql(o) {
  if (!TABLE_NAME_RE.test(o.backupTable)) throw new Error(`invalid before-image name ${JSON.stringify(o.backupTable)}`);
  return `UPDATE ${o.table} t SET "${o.column}" = b."${o.column}" FROM ${o.backupTable} b`
    + ` WHERE b."${o.key}" = t."${o.key}" AND t."${o.key}" = ANY($1)`
    + ` AND t."${o.column}" IS DISTINCT FROM b."${o.column}"`;
}

/**
 * The --run precondition. A perturbation is only reversible if a before-image exists AND
 * its cohort values ARE the live cohort values we intend to overwrite — otherwise a
 * capture would write N live rows with nothing provably restorable. PURE: the caller
 * resolves `exists` and the two value sets, and this decides.
 */
function backupPrecondition({ exists, liveValues, backupValues }) {
  if (!exists) {
    return { ok: false, reason: '--backup-table does not exist — take --backup first; refusing to perturb without a before-image' };
  }
  const same = sameValueMap(canonicalValueMap(backupValues), canonicalValueMap(liveValues));
  if (!same.ok) {
    return { ok: false, reason: `the before-image does not describe the state we are about to overwrite — ${same.reason}; re-take --backup` };
  }
  return { ok: true };
}

/**
 * A `Map<keyString, valueString>` from `[{key, value}]` rows. PURE. The value is
 * normalised with `String()` so a bigint/text/bool round-trip through the backup table
 * compares by MEANING, never by the driver's transient JS type.
 */
function canonicalValueMap(rows) {
  const m = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    m.set(String(r.key), r.value === null || r.value === undefined ? null : String(r.value));
  }
  return m;
}

/** Compare two canonical maps by key set AND value. Pure; returns `{ok, reason}`. */
function sameValueMap(a, b) {
  const aKeys = [...a.keys()].sort();
  const bKeys = [...b.keys()].sort();
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) {
    return { ok: false, reason: `key sets differ (${aKeys.length} vs ${bKeys.length} rows)` };
  }
  for (const k of aKeys) {
    if (a.get(k) !== b.get(k)) {
      return { ok: false, reason: `key ${k}: ${JSON.stringify(a.get(k))} != ${JSON.stringify(b.get(k))}` };
    }
  }
  return { ok: true };
}

/**
 * The --run claim: did the step WRITE and HEAL? PURE — the caller supplies the summary
 * counts and the two value sets. `records_updated` alone is not enough for an INGESTOR
 * (a fresh row count can read `records_new`), so the union is what a nonzero post capture
 * requires. The heal check is the differential: every cohort row must be back to its
 * backed-up value.
 */
function captureClaim({ recordsUpdated, recordsNew, liveValues, backupValues }) {
  const written = (Number(recordsUpdated) || 0) + (Number(recordsNew) || 0);
  if (written < 1) {
    return { ok: false, reason: `the harness summary reports 0 rows written (records_updated=${recordsUpdated}, records_new=${recordsNew}) — a zero-write POST capture proves nothing (gate G #38)` };
  }
  const same = sameValueMap(canonicalValueMap(backupValues), canonicalValueMap(liveValues));
  if (!same.ok) {
    return { ok: false, reason: `the step did not heal the perturbation — ${same.reason}` };
  }
  return { ok: true, written };
}

/**
 * The signal FENCE, as a pure function of the run's signal state. `--run` calls it
 * immediately before the perturbation's BEGIN and again immediately before the spawn, so
 * a Ctrl-C observed at either point throws out through the SAME `finally` that restores.
 * Deliberately only `interrupted === true` aborts — a missing state is a no-op, so the
 * call is safe on any path that never installed the flag.
 */
function abortIfInterrupted(state) {
  if (state && state.interrupted === true) {
    throw new Error('interrupted by signal before the perturbation/step — nothing further will run');
  }
}

/** A restore may ONLY touch the cohort rows. Pure. An empty list would mean "no predicate". */
function assertRestoreKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error(`assertRestoreKeys: refusing to restore with ${Array.isArray(keys) ? 'an empty' : 'a non-array'} key list — a restore without cohort keys would revert every row the backup happens to hold`);
  }
}

/**
 * `--out` must name a `<name>.json` UNDER `docs/reports/golden/<slug>/<side>/` — the only
 * capture location the harness accepts, and the pair Fold A9 fixes. Resolved (absolute)
 * with every separator normalised to `/` so a Windows backslash path validates like a
 * POSIX one. Pure (no fs). Returns the absolute path.
 */
function resolveCaptureOut(out) {
  if (typeof out !== 'string' || out.length === 0) throw new Error('--run requires --out=<path under docs/reports/golden/<slug>/[pre|post]/>');
  const abs = path.isAbsolute(out) ? out : path.join(REPO_ROOT, out);
  const norm = abs.split('\\').join('/');
  const root = GOLDEN_ROOT.split('\\').join('/');
  if (!norm.startsWith(`${root}/`)) {
    throw new Error(`--out must live under docs/reports/golden/<slug>/ (got ${out})`);
  }
  const parts = norm.slice(root.length + 1).split('/');
  if (parts.length !== 3 || !['pre', 'post'].includes(parts[1]) || !parts[2].endsWith('.json') || parts[2].length <= '.json'.length) {
    throw new Error(`--out must name a <name>.json directly under docs/reports/golden/<slug>/[pre|post]/ (got ${out})`);
  }
  return abs;
}

// ── DB plumbing ──────────────────────────────────────────────────────────────
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`ingestor-forced-cohort: ${name} is not set — refusing to guess a database target`);
  return v;
}

function makePool(label) {
  // Default migration floor (resolve-db): scripts/migrate.js is the ONE sanctioned floor
  // exemption. This bracket has no reason to run below it. `expectDatabase` pins the
  // target so a half-set PG_* triple cannot silently land on the pre-cutover DB the
  // resolver exists to refuse.
  return createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
}

/** Query (optionally parameterized) inside `BEGIN READ ONLY` — `--plan` can never write. */
async function readOnlyQuery(pool, text, params) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query(text, params);
    await client.query('ROLLBACK');
    return res.rows;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    throw e;
  } finally {
    client.release();
  }
}

/** The FIRST PIPELINE_SUMMARY line's JSON, or refuse. Pure over the spawned stdout. */
function firstSummary(stdout) {
  const line = String(stdout).split('\n').find((l) => l.startsWith('PIPELINE_SUMMARY:'));
  if (!line) throw new Error('no PIPELINE_SUMMARY line in the harness output');
  try {
    return JSON.parse(line.slice('PIPELINE_SUMMARY:'.length));
  } catch (e) {
    throw new Error(`could not parse the harness PIPELINE_SUMMARY line: ${e.message}`);
  }
}

/** The cohort rows as `[{key, value}]` from a `SELECT key, column` result. Pure. */
function rowsToKeyValues(rows, key, column) {
  return rows.map((r) => ({ key: r[key], value: r[column] }));
}

/** The standalone undo an operator can run by hand while the bracket is suspended. Pure. */
function recoveryCommand(o) {
  return 'node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --restore'
    + ` --table=${o.table} --key=${o.key} --column=${o.column} --op=${JSON.stringify(o.opRaw)}`
    + ` --count=${o.count} --where=${JSON.stringify(o.where)} --order=${JSON.stringify(o.order)}`
    + ` --backup-table=${o.backupTable}`;
}

/**
 * The capture harness's argv, as a PURE function of the validated options. Assembled (and
 * therefore validated) BEFORE the bracket lock is taken, so a bad passthrough costs
 * seconds and touches no database.
 */
function nodeArgv(o) {
  const argv = [
    '-r', 'dotenv/config', HARNESS,
    `--step=${o.step}`, `--chain=${o.chain}`, `--out=${o.out}`, '--overwrite',
    ...o.captureArgs,
  ];
  for (const a of o.captureArgs) {
    if (typeof a !== 'string' || !a.startsWith('--')) throw new Error(`--capture-arg must be a --flag[=value] (got ${JSON.stringify(a)})`);
  }
  return argv;
}

/** The env for the spawned step: the parent env plus every --env=K=V. Pure. */
function spawnEnv(o) {
  const env = { ...process.env };
  for (const e of o.env) {
    const i = e.indexOf('=');
    env[e.slice(0, i)] = e.slice(i + 1);
  }
  return env;
}

/**
 * Resolve the cohort (the FIRST N eligible keys) and the value set the whole bracket
 * reasons about. Used by --plan, --backup and --run. Reads only.
 *
 * Refuses when fewer than N rows are eligible — a short cohort would make the --run
 * "wrote >= 1" claim and the heal check describe a population the predicate cannot
 * support. Also refuses a non-deterministic --order (the SELECT returning != N rows),
 * because the keys the backup holds must be the keys the perturbation moves.
 */
async function resolveCohort(pool, o) {
  const eligible = Number((await readOnlyQuery(pool, eligibleCountSql(o)))[0].n);
  if (eligible < o.count) {
    throw new Error(`refusing: ${eligible} row(s) match --where but the cohort is --count=${o.count} — the eligibility predicate cannot support this cohort (widen --where or lower --count)`);
  }
  const rows = await readOnlyQuery(pool, cohortSelect(o));
  if (rows.length !== o.count) {
    throw new Error(`refusing: the cohort SELECT returned ${rows.length} row(s), expected ${o.count} — --order is not deterministic over --where`);
  }
  const keys = rows.map((r) => r[o.key]);
  assertRestoreKeys(keys);
  return { eligible, keys, rows: rowsToKeyValues(rows, o.key, o.column) };
}

/** The cohort's CURRENT values, read back by key. Reads only. */
async function liveCohortValues(pool, o, keys) {
  const rows = await readOnlyQuery(pool, `SELECT t."${o.key}", t."${o.column}" FROM ${o.table} t WHERE t."${o.key}" = ANY($1)`, [keys]);
  return rowsToKeyValues(rows, o.key, o.column);
}

/** The before-image's rows, read back by key. Reads only. */
async function backupCohortValues(pool, o) {
  return rowsToKeyValues(await readOnlyQuery(pool, backupSelectSql(o)), o.key, o.column);
}

/** Does `table` resolve on this connection? Reads only. */
async function tableExists(pool, table) {
  return (await readOnlyQuery(pool, 'SELECT to_regclass($1) AS r', [table]))[0].r !== null;
}

// ── --plan ────────────────────────────────────────────────────────────────────
/**
 * READ ONLY. Prints the cohort (the first N keys by --order among --where), the table's
 * whole-table projected hash over (key, column), and the column's current values. No
 * writes anywhere — every query runs inside `BEGIN READ ONLY`.
 */
async function plan(o) {
  const pool = makePool('ingestor-forced-cohort:plan');
  console.log(`[cohort:plan] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    const cohort = await resolveCohort(pool, o);
    const whole = (await readOnlyQuery(pool, hashOf(o)))[0].h;
    console.log(`[cohort:plan] table=${o.table} key=${o.key} column=${o.column} op=${JSON.stringify(o.opRaw)}`);
    console.log(`[cohort:plan] eligible=${cohort.eligible} cohort=${cohort.keys.length} (where ${JSON.stringify(o.where)}; order ${o.order})`);
    console.log(`[cohort:plan] whole-table hash over (${[o.key, o.column].join(', ')}): ${whole}`);
    for (const r of cohort.rows) console.log(`[cohort:plan]   ${o.key}=${r.key} ${o.column}=${JSON.stringify(r.value)}`);
  } finally {
    await pool.end();
  }
}

// ── --backup ──────────────────────────────────────────────────────────────────
/**
 * Freeze the cohort's (key, column) into a disposable before-image table.
 *
 * Refuses (before a pool exists) a `--backup-table` that is not the
 * `<t>_cohort_bak_<yyyymmddthhmmz>` shape. Refuses (after connecting, because both are
 * facts about the DB) a name that already resolves, and a copy that does not hold the
 * cohort's current values (there is nothing to back up that is known-good).
 */
async function backup(o) {
  const pool = makePool('ingestor-forced-cohort:backup');
  console.log(`[cohort:backup] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    if (await tableExists(pool, o.backupTable)) {
      throw new Error(`--backup-table ${o.backupTable} already exists — refusing to overwrite a before-image; pick a fresh <yyyymmddthhmmz> name`);
    }
    const cohort = await resolveCohort(pool, o);
    await pool.query(backupCreateSql(o), [cohort.keys]);
    await pool.query(`ALTER TABLE ${o.backupTable} ADD PRIMARY KEY ("${o.key}")`);
    const copied = await backupCohortValues(pool, o);
    const ok = backupPrecondition({ exists: true, liveValues: cohort.rows, backupValues: copied });
    if (!ok.ok) {
      throw new Error(`the copy ${o.backupTable} does not hold the cohort's current values — ${ok.reason}; DROP ${o.backupTable} and investigate`);
    }
    console.log(`[cohort:backup] wrote ${o.backupTable} — ${cohort.keys.length} row(s) of (${o.key}, ${o.column})`);
    console.log(`[cohort:backup] ${recoveryCommand(o)}`);
  } finally {
    await pool.end();
  }
}

/**
 * Put the cohort's column back from the before-image, in ONE transaction, ONLY where a
 * row differs (`IS DISTINCT FROM`) so a no-op restore writes nothing and preserves every
 * other row's xmin, and ONLY for `keys` so a restore can never revert rows outside the
 * cohort. Returns the number of rows restored. Shared by --restore and the --run finally.
 */
async function restoreFromBackup(pool, o, keys) {
  assertRestoreKeys(keys);
  const res = await pool.query(restoreSql(o), [keys]);
  return res.rowCount;
}

// ── --restore ─────────────────────────────────────────────────────────────────
/** The standalone undo. Prints the number of rows restored and the cohort's re-read values. */
async function restore(o) {
  const pool = makePool('ingestor-forced-cohort:restore');
  console.log(`[cohort:restore] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    if (!(await tableExists(pool, o.backupTable))) {
      throw new Error(`--backup-table ${o.backupTable} does not exist — nothing to restore from`);
    }
    const backupRows = await backupCohortValues(pool, o);
    const keys = backupRows.map((r) => r.key);
    assertRestoreKeys(keys);
    const restored = await restoreFromBackup(pool, o, keys);
    const after = await liveCohortValues(pool, o, keys);
    const check = backupPrecondition({ exists: true, liveValues: after, backupValues: backupRows });
    console.log(`[cohort:restore] restored ${restored} row(s) from ${o.backupTable}`);
    console.log(`[cohort:restore] cohort ${check.ok ? 'matches the before-image (OK)' : `MISMATCH — ${check.reason}`}`);
    if (!check.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// ── signals (the Ctrl-C fence) ────────────────────────────────────────────────
/**
 * The signal handler. A Ctrl-C during the blocking spawn kills the CHILD; with a handler
 * INSTALLED, Node does NOT take its default action on SIGINT/SIGTERM, the in-flight
 * `execFileSync` throws into the existing catch, and control reaches `finally`, which
 * restores. The handler ALSO latches `state.interrupted`, so a signal seen BEFORE the
 * spawn is not merely logged — see abortIfInterrupted(). It is deliberate that the
 * handler writes nothing to the database: everything it would need to do is already
 * `finally`'s job.
 */
function onSignal(state, signal) {
  state.interrupted = true;
  console.error(`[cohort] signal received (${signal}) — aborting before the next write; the bracket restores what it changed`);
}

function installSignalHandlers(state) {
  process.on('SIGINT', (signal) => onSignal(state, signal));
  process.on('SIGTERM', (signal) => onSignal(state, signal));
}

function removeSignalHandlers() {
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
}

// ── --run ─────────────────────────────────────────────────────────────────────
/**
 * The forced-change capture bracket.
 *
 *   1. argument validation — NOTHING here touches a database (validateFlags and nodeArgv
 *      are pure and run before the lock);
 *   2. the bracket lock (`pipeline.withAdvisoryLock(COHORT_LOCK_ID)`) is taken BEFORE any
 *      read that assumes we own the rows;
 *   3. the before-image must EXIST and its cohort values must equal the LIVE ones
 *      (`backupPrecondition`) — a perturbation without a verified before-image is
 *      unrollbackable;
 *   4. apply the perturbation in ONE transaction (latched `perturbed = true` immediately
 *      BEFORE COMMIT), then assert the cohort moved;
 *   5. spawn the REAL step through capture-step-golden.js;
 *   6. assert the claims: the FIRST summary reports >= 1 row written AND every cohort row
 *      is back to its backed-up value;
 *   7. finally: restore the cohort from the before-image when `perturbed`, re-verify,
 *      exit 1 on any failed claim, exit 2 if the restore failed, print the exact
 *      `--restore` command before the COMMIT, and close the pool (no process.exit()).
 */
async function run(o) {
  // Assembled FIRST, from pure inputs, so a bad --capture-arg refuses before a pool is even
  // constructed — a mistyped passthrough must cost seconds and touch NO database.
  const argv = nodeArgv(o);
  const pool = makePool('ingestor-forced-cohort:run');
  console.log(`[cohort:run] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  console.log(`[cohort:run] table=${o.table} key=${o.key} column=${o.column} op=${JSON.stringify(o.opRaw)} count=${o.count}`);
  console.log(`[cohort:run] step=${o.step} chain=${o.chain} out=${o.out}`);
  let asserted = false;
  let restored = false;
  // A restore in `finally` is only legitimate if THIS run actually wrote the table. Set
  // true immediately BEFORE the perturbation's COMMIT — never earlier, and never derived
  // from "the hash moved" (the hash also moves when some OTHER writer did). Setting it
  // before the COMMIT is safe because the restore is cohort-scoped and `IS DISTINCT
  // FROM`-guarded against a value-verified before-image: if the COMMIT never landed and
  // the transaction rolled back, the restore matches no row and writes nothing; and it
  // closes the hole where a COMMIT that SUCCEEDED but whose reply was lost left N rows
  // perturbed with `perturbed === false`.
  let perturbed = false;
  // The latched signal state, created BEFORE the handlers are installed so a signal cannot
  // be observed before there is somewhere to record it.
  const sig = { interrupted: false };
  let backupRows = [];
  let cohortKeys = [];
  let restoreFailed = false;
  installSignalHandlers(sig);
  try {
    const res = await pipeline.withAdvisoryLock(pool, COHORT_LOCK_ID, async () => {
      if (!(await tableExists(pool, o.backupTable))) {
        throw new Error(`--backup-table ${o.backupTable} does not exist — take --backup first; refusing to perturb without a before-image`);
      }
      const cohort = await resolveCohort(pool, o);
      cohortKeys = cohort.keys;
      backupRows = await backupCohortValues(pool, o);
      const pre = backupPrecondition({ exists: true, liveValues: cohort.rows, backupValues: backupRows });
      if (!pre.ok) throw new Error(pre.reason);
      console.log(`[cohort:run] before-image verified: ${o.backupTable} covers ${backupRows.length} key(s) == live cohort`);

      // (4) the perturbation, ONE committed transaction.
      abortIfInterrupted(sig);
      const client = await pool.connect();
      let perturbedRows = 0;
      try {
        await client.query('BEGIN');
        const bind = opBindValue(o.opRaw);
        const setExpr = perturbationSetExpr(o.op, o.column);
        const upd = bind === null
          ? await client.query(`UPDATE ${o.table} t SET ${setExpr} WHERE t."${o.key}" = ANY($1)`, [cohortKeys])
          : await client.query(`UPDATE ${o.table} t SET ${setExpr} WHERE t."${o.key}" = ANY($1)`, [cohortKeys, bind]);
        perturbedRows = upd.rowCount;
        if (perturbedRows !== cohortKeys.length) {
          throw new Error(`perturbation wrote ${perturbedRows} row(s), expected ${cohortKeys.length} — a cohort row is missing from ${o.table}`);
        }
        // Print the STANDALONE recovery command immediately BEFORE the COMMIT — the exact
        // instant the perturbation becomes durable. Everything that could be lost is lost
        // by the next statement, so the operator must not have to reconstruct the command
        // (or the before-image's name) from a stack trace in order to undo it.
        console.log(`[cohort:run] perturbation about to COMMIT — if this run cannot finish, recover with: ${recoveryCommand(o)}`);
        perturbed = true;
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
        throw err;
      } finally {
        client.release();
      }
      const moved = await liveCohortValues(pool, o, cohortKeys);
      const unmoved = sameValueMap(canonicalValueMap(backupRows), canonicalValueMap(moved));
      console.log(`[cohort:run] PERTURBED: ${perturbedRows} row(s) written (cohort ${unmoved.ok ? 'UNCHANGED — void perturbation!' : 'moved'})`);
      if (unmoved.ok) {
        // The perturbation did not move the value set (e.g. appending '' to every row, or
        // negating a column already at its own inverse on this sample). A capture over an
        // unmoved cohort proves nothing — refuse rather than record it.
        throw new Error('the perturbation did not change the cohort values — void differential; check --op against --column');
      }

      // (5) spawn the REAL step through the capture harness.
      abortIfInterrupted(sig);
      console.log(`[cohort:run] running the real step: node ${argv.join(' ')}`);
      const stdout = execFileSync('node', argv, {
        cwd: REPO_ROOT,
        env: spawnEnv(o),
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 64,
        stdio: ['ignore', 'pipe', 'inherit'],
      });

      // (6) assert the claims. The FIRST summary is the run under test: a POST capture
      // path makes the harness run the step a SECOND time (the two-run zero-writes proof)
      // whose summary reads 0/0 by design; reading the LAST one would fail a genuine run.
      const summary = firstSummary(stdout);
      const after = await liveCohortValues(pool, o, cohortKeys);
      const claim = captureClaim({
        recordsUpdated: summary.records_updated,
        recordsNew: summary.records_new,
        liveValues: after,
        backupValues: backupRows,
      });
      const written = (Number(summary.records_updated) || 0) + (Number(summary.records_new) || 0);
      console.log(`[cohort:run] summary: records_updated=${summary.records_updated} records_new=${summary.records_new} -> written=${written}`);
      console.log(`[cohort:run] assert ${claim.ok ? 'PASS' : 'FAIL'} the step wrote >= 1 row AND healed the cohort (${claim.ok ? written + ' row(s) written' : claim.reason})`);
      asserted = claim.ok;
      if (!claim.ok) throw new Error(claim.reason);
      return { written };
    }, { skipEmit: false });
    if (!res.acquired) {
      throw new Error(`another cohort bracket holds advisory lock ${COHORT_LOCK_ID}`);
    }
    console.log(`[cohort:run] PASS — ${res.result.written} row(s) written, cohort healed`);
  } catch (err) {
    console.error(`[cohort:run] ERROR: ${err.message}`);
  } finally {
    // (7) restore — but ONLY what this run perturbed.
    try {
      if (perturbed) {
        if (!(await tableExists(pool, o.backupTable))) {
          throw new Error(`the before-image ${o.backupTable} is gone — table left UNRESTORED`);
        }
        const n = await restoreFromBackup(pool, o, cohortKeys);
        console.log(`[cohort:run] restore: put ${n} row(s) back from ${o.backupTable}`);
      } else {
        console.log('[cohort:run] this run never perturbed; the table is left as found');
      }
      const after = await liveCohortValues(pool, o, cohortKeys);
      const check = backupPrecondition({ exists: true, liveValues: after, backupValues: backupRows });
      restored = check.ok;
      console.log(`[cohort:run] POST-RESTORE cohort ${restored ? 'matches the before-image (OK)' : `MISMATCH — ${check.reason}`}`);
    } catch (err) {
      console.error(`[cohort:run] RESTORE FAILED: ${err.message}`);
      console.error(`[cohort:run] recover by hand with: ${recoveryCommand(o)}`);
      restored = false;
      restoreFailed = true;
    }
    console.log(`[cohort:run] restored: ${restored}`);
    // Exit 2 is reserved for an unrestorable table — the operator must see a DIFFERENT
    // code for "I could not put it back" than for "the claim failed but it is restored".
    if (restoreFailed) process.exitCode = 2;
    else if (!asserted || !restored) process.exitCode = 1;
    // The fence comes down LAST, once the table is restored and the lock is gone. From here
    // a second signal is fatal, which is the correct default for a run with nothing left to
    // protect.
    removeSignalHandlers();
    await pool.end();
  }
}

// ── --self-test (no DB) ──────────────────────────────────────────────────────
/**
 * Exercises EVERY pure helper in this file — the argv contract, the op parser, the SQL
 * builders, the value-map comparison, the two decision functions and the signal fence.
 * No DB, no fs writes: `node --check` plus `--self-test` plus eslint is the whole
 * pre-merge verification surface for a script this file never daemonizes.
 */
function selfTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(`self-test FAILED: ${msg}`); };
  const throws = (fn, msg) => {
    let t = false;
    try { fn(); } catch { t = true; }
    assert(t, msg);
  };

  // parseArgs: ONE mode per invocation (F5) + repeatable --env/--capture-arg arrays.
  throws(() => parseArgs(['--plan', '--run']), 'parseArgs accepted --plan together with --run');
  throws(() => parseArgs(['--nope']), 'parseArgs accepted an unknown flag');
  throws(() => parseArgs(['--backup', '--self-test']), 'parseArgs accepted --backup together with --self-test');
  const parsed = parseArgs(['--run', '--table=a', '--key=b', '--column=c', '--op=append_text:x', '--count=3', '--where=w', '--order=o', '--backup-table=parcels_cohort_bak_20261002t1848z', '--step=scripts/x.js', '--chain=sources', '--out=p/q/R.json', '--env=A=1', '--env=B=2', '--capture-arg=--tables=parcels']);
  assert(parsed.mode === 'run', 'parseArgs dropped the mode');
  assert(parsed.table === 'a' && parsed.key === 'b' && parsed.column === 'c' && parsed.count === '3', 'parseArgs dropped a scalar flag');
  assert(parsed.backupTable === 'parcels_cohort_bak_20261002t1848z', 'parseArgs dropped --backup-table');
  assert(parsed.env.length === 2 && parsed.env[0] === 'A=1' && parsed.env[1] === 'B=2', 'parseArgs did not collect --env repeatably');
  assert(parsed.captureArgs.length === 1 && parsed.captureArgs[0] === '--tables=parcels', 'parseArgs did not collect --capture-arg');
  assert(parseArgs(['--self-test']).mode === 'selfTest', 'parseArgs dropped --self-test');
  assert(parseArgs(['--plan']).mode === 'plan', 'parseArgs dropped --plan');
  assert(parseArgs(['--help']).help === true, 'parseArgs dropped --help');

  // modeFlag: the CLI spelling is derived from the mode key.
  assert(modeFlag('selfTest') === 'self-test', `modeFlag('selfTest') = ${modeFlag('selfTest')}`);
  assert(modeFlag('plan') === 'plan', `modeFlag('plan') = ${modeFlag('plan')}`);

  // parseOp / opBindValue: the three ops, and a refusal for anything else.
  assert(parseOp('negate_bool').kind === 'negate_bool', 'parseOp misclassified negate_bool');
  assert(parseOp('add_number:3').kind === 'add_number', 'parseOp misclassified add_number');
  assert(parseOp('append_text: x').kind === 'append_text', 'parseOp misclassified append_text');
  assert(opBindValue('add_number:3') === 3, 'opBindValue lost the number');
  assert(opBindValue('add_number:-2.5') === -2.5, 'opBindValue lost a negative number');
  assert(opBindValue('append_text: ~f') === ' ~f', 'opBindValue lost the text');
  assert(opBindValue('append_text:') === '', 'opBindValue lost an empty text');
  assert(opBindValue('negate_bool') === null, 'opBindValue should be null for negate_bool');
  throws(() => parseOp('multiply:2'), 'parseOp accepted an unknown op kind');
  throws(() => parseOp('add_number:x'), 'parseOp accepted a non-numeric add_number');
  throws(() => parseOp('negate_bool:1'), 'parseOp accepted negate_bool with an argument');

  // perturbationSetExpr: one SET assignment per op, the column quoted.
  assert(perturbationSetExpr(parseOp('negate_bool'), 'is_x') === '"is_x" = NOT "is_x"', `negate_bool set expr: ${perturbationSetExpr(parseOp('negate_bool'), 'is_x')}`);
  assert(perturbationSetExpr(parseOp('add_number:1'), 'n') === '"n" = "n" + $2', `add_number set expr: ${perturbationSetExpr(parseOp('add_number:1'), 'n')}`);
  assert(perturbationSetExpr(parseOp('append_text:x'), 's') === '"s" = "s" || $2', `append_text set expr: ${perturbationSetExpr(parseOp('append_text:x'), 's')}`);
  throws(() => perturbationSetExpr(parseOp('negate_bool'), 'bad col'), 'perturbationSetExpr accepted an invalid column name');

  // hashOf: the harness's narrow-table shape, ordered by the key, over (key, column).
  const h = hashOf({ table: 'address_points', key: 'id', column: 'class_family_desc' });
  assert(h.includes('ROW("id", "class_family_desc")::text'), `hashOf row text: ${h}`);
  assert(h.includes('ORDER BY "id"'), `hashOf has no key order: ${h}`);
  assert(h.includes('FROM address_points t'), `hashOf does not select from the table: ${h}`);
  // The true invariant: with the SAME key/column the generated SQL varies ONLY in the table
  // identifier — so substituting the table name into `h` yields the OTHER table's SQL exactly.
  // (Held at equal key/column on purpose, and the probe strips `h`'s own table name rather
  // than replacing the bare word: one projection already contains the column `class_family_desc`,
  // and a raw `h.replace('address_points', …)` would rewrite ONLY the table, leaving that
  // projection in place and comparing two different projections — the false failure this replaces.)
  const sameProjectionOtherTable = hashOf({ table: 'zz', key: 'id', column: 'class_family_desc' });
  assert(sameProjectionOtherTable === h.replace('address_points', 'zz'), `hashOf must vary only the table name at equal key/column: ${sameProjectionOtherTable} vs ${h}`);
  throws(() => hashOf({ table: 'Bad-Name', key: 'id', column: 'c' }), 'hashOf accepted an invalid table name');

  // The ONE identifier rule: hashOf and BACKUP_TABLE_RE must agree on case, or --backup
  // can NEVER succeed (Postgres folds unquoted identifiers to lower case).
  const lowerBak = 'address_points_cohort_bak_20261002t1848z';
  assert(BACKUP_TABLE_RE.test(lowerBak) === true, `BACKUP_TABLE_RE must accept ${lowerBak}`);
  assert(TABLE_NAME_RE.test(lowerBak) === true, 'TABLE_NAME_RE must accept a lower-case before-image name');
  assert(BACKUP_TABLE_RE.test('Address_Points_cohort_bak_20261002t1848z') === false, 'BACKUP_TABLE_RE must refuse an upper-case name');
  assert(BACKUP_TABLE_RE.test('address_points_bak_20261002t1848z') === false, 'BACKUP_TABLE_RE must refuse a name missing the _cohort_ marker');
  assert(BACKUP_TABLE_RE.test('address_points_cohort_bak_2026102t1848z') === false, 'BACKUP_TABLE_RE must refuse a malformed timestamp');
  assert(hashOf({ table: lowerBak, key: 'id', column: 'c' }).includes(`FROM ${lowerBak} t`), 'hashOf must build a hash for a name BACKUP_TABLE_RE accepts');

  // cohortSelect / eligibleCountSql / backupCreateSql / restoreSql carry the cohort-key
  // predicate — the whole reason a restore cannot touch non-cohort rows.
  const o = validateFlags(parseArgs(['--plan', '--table=address_points', '--key=id', '--column=class_family_desc', '--op=append_text: f', '--count=20', '--where=class_family_desc IS NOT NULL', '--order=id', '--backup-table=address_points_cohort_bak_20261002t1848z']));
  assert(cohortSelect(o).includes('LIMIT 20'), `cohortSelect lost the limit: ${cohortSelect(o)}`);
  assert(cohortSelect(o).includes('ORDER BY id'), `cohortSelect lost the order: ${cohortSelect(o)}`);
  assert(backupCreateSql(o).includes('WHERE t."id" = ANY($1)'), `backupCreateSql lost the key predicate: ${backupCreateSql(o)}`);
  assert(restoreSql(o).includes('t."id" = ANY($1)'), `restoreSql lost the cohort-key predicate: ${restoreSql(o)}`);
  assert(restoreSql(o).includes('IS DISTINCT FROM'), `restoreSql lost the difference guard: ${restoreSql(o)}`);
  assert(eligibleCountSql(o).includes('count(*)::int'), `eligibleCountSql is not a count: ${eligibleCountSql(o)}`);

  // assertRestoreKeys: an empty list would mean "no predicate".
  throws(() => assertRestoreKeys([]), 'assertRestoreKeys([]) did not throw');
  throws(() => assertRestoreKeys(undefined), 'assertRestoreKeys(undefined) did not throw');
  assertRestoreKeys([1]); // must not throw

  // backupPrecondition: refuse a missing image, refuse a drifted image, accept only a
  // verified one. The comparison is value-wise (not row-object identity).
  assert(backupPrecondition({ exists: false, liveValues: [], backupValues: [] }).ok === false, 'backupPrecondition accepted a nonexistent before-image');
  const live = [{ key: 1, value: 'a' }, { key: 2, value: null }];
  assert(backupPrecondition({ exists: true, liveValues: live, backupValues: [{ key: 1, value: 'a' }, { key: 2, value: null }] }).ok === true, 'backupPrecondition rejected a verified before-image');
  assert(backupPrecondition({ exists: true, liveValues: live, backupValues: [{ key: 1, value: 'b' }, { key: 2, value: null }] }).ok === false, 'backupPrecondition accepted an image whose value drifted');
  assert(backupPrecondition({ exists: true, liveValues: live, backupValues: [{ key: 1, value: 'a' }] }).ok === false, 'backupPrecondition accepted an image covering fewer rows');

  // captureClaim: >= 1 written (updated OR new) AND healed.
  assert(captureClaim({ recordsUpdated: 2, recordsNew: 0, liveValues: live, backupValues: live }).ok === true, 'captureClaim rejected a nonzero, healed run');
  assert(captureClaim({ recordsUpdated: 0, recordsNew: 2, liveValues: live, backupValues: live }).ok === true, 'captureClaim rejected a nonzero records_new, healed run');
  assert(captureClaim({ recordsUpdated: 0, recordsNew: 0, liveValues: live, backupValues: live }).ok === false, 'captureClaim accepted a zero-write run');
  assert(captureClaim({ recordsUpdated: 2, recordsNew: 0, liveValues: [{ key: 1, value: 'z' }, { key: 2, value: null }], backupValues: live }).ok === false, 'captureClaim accepted an unhealed cohort');

  // canonicalValueMap: a bigint/number round-trip compares equal (the driver types differ).
  assert(canonicalValueMap([{ key: 1, value: 5 }]).get('1') === '5', 'canonicalValueMap did not stringify the value');
  assert(canonicalValueMap([{ key: 1n, value: null }]).get('1') === null, 'canonicalValueMap did not normalise a bigint key / null value');

  // abortIfInterrupted: the fence — only an explicit `true` aborts.
  throws(() => abortIfInterrupted({ interrupted: true }), 'abortIfInterrupted({interrupted:true}) did not throw');
  assert(abortIfInterrupted({ interrupted: false }) === undefined, 'abortIfInterrupted({interrupted:false}) was not a no-op');
  assert(abortIfInterrupted(undefined) === undefined, 'abortIfInterrupted(undefined) was not a no-op');

  // firstSummary: the FIRST PIPELINE_SUMMARY line, refusals for absent/garbage.
  const s = firstSummary('noise\nPIPELINE_SUMMARY:{"records_updated":3}\nPIPELINE_SUMMARY:{"records_updated":0}\n');
  assert(s.records_updated === 3, 'firstSummary did not take the FIRST summary line');
  throws(() => firstSummary('nothing here'), 'firstSummary accepted output with no summary');

  // resolveCaptureOut: the harness's fixed capture locations only.
  assert(resolveCaptureOut('docs/reports/golden/load_address_points/post/forced.json').endsWith('post/forced.json'), 'resolveCaptureOut rejected a legal post path');
  throws(() => resolveCaptureOut('elsewhere/forced.json'), 'resolveCaptureOut accepted a path outside docs/reports/golden');
  throws(() => resolveCaptureOut('docs/reports/golden/load_address_points/forced.json'), 'resolveCaptureOut accepted a missing <side>/ level');
  throws(() => resolveCaptureOut('docs/reports/golden/load_address_points/post/'), 'resolveCaptureOut accepted a directory');

  // nodeArgv / spawnEnv: the passthrough, and the refusal BEFORE any DB connect.
  const runO = validateFlags(parseArgs(['--run', '--table=address_points', '--key=id', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=id', '--backup-table=address_points_cohort_bak_20261002t1848z', '--step=scripts/load-address-points.js', '--chain=sources', '--out=docs/reports/golden/load_address_points/post/f.json', '--env=FOO=bar', '--capture-arg=--tables=address_points']));
  assert(nodeArgv(runO).includes('--overwrite'), 'nodeArgv did not pass --overwrite');
  assert(nodeArgv(runO).includes('--step=scripts/load-address-points.js'), 'nodeArgv lost --step');
  assert(spawnEnv(runO).FOO === 'bar', 'spawnEnv did not apply --env');
  // Missing --step/--chain/--out on --run must throw HERE, before a pool exists.
  throws(() => validateFlags(parseArgs(['--run', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted --run without --step/--chain/--out');
  throws(() => validateFlags(parseArgs(['--run', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z', '--step=not-scripts.js', '--chain=sources', '--out=docs/reports/golden/s/post/f.json'])), 'validateFlags accepted a non-scripts --step');

  // validateFlags refusals: missing flags, a semicolon, a bad identifier, a bad count.
  throws(() => validateFlags(parseArgs(['--plan'])), 'validateFlags accepted --plan with no flags');
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=a;b', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted a semicolon in --where');
  throws(() => validateFlags(parseArgs(['--plan', '--table=Bad', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted an invalid --table');
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=0', '--where=w', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted --count=0');
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=k', '--backup-table=t'])), 'validateFlags accepted a malformed --backup-table');

  // fx1: the lock must be an integer and must NOT be a step's own lock (taking one would
  // make the spawn self-skip, turning every capture into a void differential).
  assert(Number.isInteger(COHORT_LOCK_ID) && COHORT_LOCK_ID !== 96 && COHORT_LOCK_ID !== 55 && COHORT_LOCK_ID !== 97, `COHORT_LOCK_ID must be an integer and not a step's lock (got ${JSON.stringify(COHORT_LOCK_ID)})`);
  assert(COHORT_LOCK_ID !== 902001, 'COHORT_LOCK_ID must not collide with the enrich-centreline cohort bracket lock');

  // recoveryCommand: mentions --restore and the exact before-image name.
  assert(recoveryCommand(o).includes('--restore') && recoveryCommand(o).includes(o.backupTable), 'recoveryCommand does not name --restore and the before-image');
}

// ── CLI dispatch ─────────────────────────────────────────────────────────────
const HELP = `ingestor-forced-cohort — the generic, reusable forced-change cohort bracket for INGESTOR POST recaptures (gate G #38, Spec 124 R-AS)

Usage (LOCAL dev DB only):
  node scripts/analysis/ingestor-forced-cohort.js --self-test
  node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --plan <flags>
  node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --backup <flags>
  node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --run <flags> --step=<scripts/x.js> --chain=<sources|none|…> --out=<capture json> [--env=K=V …] [--capture-arg=<arg> …]
  node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --restore <flags>

Shared flags (plan/backup/run/restore):
  --table=<t>            the table under test
  --key=<pk col>         the primary-key column
  --column=<col>         the ONE column to perturb
  --op=<op>              add_number:<n> | append_text:<s> | negate_bool
  --count=<N>            the cohort size
  --where=<SQL pred>     selects the ELIGIBLE rows (no semicolons)
  --order=<SQL expr>     the ORDER BY expression that picks the FIRST N
  --backup-table=<t>_cohort_bak_<yyyymmddthhmmz>  the before-image (lower-case)

  --plan      SELECT-only (READ ONLY txn). Prints the cohort, the whole-table projected
              hash and the column's current values; refuses if fewer than N eligible.
  --backup    Freeze the cohort's (key, column) into the before-image; refuses if it exists.
  --run       Perturb the cohort, spawn the real step through ${HARNESS}, assert
              records_updated (or new+updated) >= 1 AND that every cohort row is back to
              its backed-up value, then restore unconditionally (cohort-scoped).
              Exit 1 on a failed claim; exit 2 if the restore failed (the exact --restore
              command is printed before the COMMIT).
  --restore   Put the before-image back and re-verify the cohort.
  --self-test No DB. Asserts the argv/SQL/decision invariants. Prints 'self-test PASSED'.
  --help      This text.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const parsed = parseArgs(argv);
  if (parsed.mode === null && !parsed.help) {
    throw new Error('nothing to do: pass --self-test, --plan, --backup, --run or --restore (see --help)');
  }
  if (parsed.mode === 'selfTest') return selfTest();
  const o = validateFlags(parsed);
  if (o.mode === 'plan') return plan(o);
  if (o.mode === 'backup') return backup(o);
  if (o.mode === 'run') return run(o);
  if (o.mode === 'restore') return restore(o);
  throw new Error(`unknown mode ${JSON.stringify(o.mode)}`);
}

if (require.main === module) {
  main()
    .then(() => {
      if (process.argv.includes('--self-test')) console.log('self-test PASSED');
    })
    .catch((err) => {
      console.error('[cohort] ERROR:', err.message);
      process.exitCode = process.exitCode || 1;
    });
}

module.exports = {
  COHORT_LOCK_ID,
  TABLE_NAME_RE,
  BACKUP_TABLE_RE,
  parseArgs,
  modeFlag,
  validateFlags,
  parseOp,
  opBindValue,
  perturbationSetExpr,
  projection,
  hashSqlFor,
  hashOf,
  cohortSelect,
  eligibleCountSql,
  backupCreateSql,
  backupSelectSql,
  restoreSql,
  backupPrecondition,
  canonicalValueMap,
  sameValueMap,
  captureClaim,
  abortIfInterrupted,
  assertRestoreKeys,
  resolveCaptureOut,
  nodeArgv,
  spawnEnv,
  firstSummary,
  rowsToKeyValues,
  recoveryCommand,
  readOnlyQuery,
};


