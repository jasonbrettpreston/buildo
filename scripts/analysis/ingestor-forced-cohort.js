#!/usr/bin/env node
/**
 * ingestor-forced-cohort — the GENERIC, reviewed, reusable forced-change cohort
 * bracket for the INGESTOR POST recaptures required by gate G #38.
 *
 * SCOPE (state it plainly, because the R-AS document is wider than this bracket):
 * this is the HEAL-THE-COHORT bracket for gate G #38 — it perturbs N rows, runs the
 * real step and proves the step healed them while reporting a nonzero write count.
 * It is NOT the R-AS (ii)/(iii) differential. Those are separate instruments; do not
 * read this file as discharging them.
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
 *   --op=<op>              add_number:<n> | append_text:<s> | negate_bool | delete_reinsert
 *                          (delete_reinsert, Spec 124 R-DP: the INSERT-only form — see isPairMode)
 *                          | derived_status:<s> (R-ET, Spec 124 R-DY (e): the derived-target form —
 *                          see isDerivedMode; needs the --derive-column/--derived-* flags below)
 *   --count=<N>            the cohort size
 *   --where=<SQL pred>     selects the ELIGIBLE rows (no semicolons)
 *   --order=<SQL expr>     the ORDER BY expression that picks the FIRST N
 *   --backup-table=<t>_cohort_bak_<yyyymmddthhmmz>  the before-image (lower-case)
 * --run additionally:
 *   --step=<scripts/x.js>  --chain=<sources|none|…>  --out=<capture json>
 *   [--env=K=V …]          extra env for the spawned step (repeatable)
 *   [--capture-arg=<arg> …] passed through to capture-step-golden.js (repeatable)
 * --op=derived_status:<s> additionally (every mode; R-ET):
 *   --derive-column=<col>          the R-DY `derive.prior_columns` column the step reads before its upsert
 *   --derived-table=<t>            the derived target (`outputs.writes[i].table`, i >= 1)
 *   --derived-key=<col>            the derived column that carries the cohort key
 *   [--derived-key-prefix=<s>]     literal prefix of that value (e.g. `coa:` for lead_id)
 *   --derived-natural-key=<c,c,…>  the derived row identity (must include --derived-key)
 *   and, with --run, --count-path=<derived-table>_written (R-DN: the step's own int emit)
 *
 * Usage (LOCAL dev DB only — never a shared/cloud target; `assertLocalTarget` refuses any
 * resolved target that is not loopback, on the RESOLVED description, in every connecting
 * mode, and resolve-db itself has no default target to fall back to):
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
/** How many unreachable keys the transcript prints before eliding (the count still prints). */
const MAX_UNREACHABLE_PRINTED = 10;

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
/**
 * F1 (MEDIUM — cloud risk): the ONLY hostnames this bracket may ever connect to.
 *
 * `resolve-db`'s chain is DATABASE_URL → SUPABASE_DATABASE_URL → PG_*, and
 * `SUPABASE_DATABASE_URL` names the CLOUD database. The `expectDatabase` pin in
 * `makePool` was not enough on its own: BOTH the cloud DB and the local stack present a
 * database literally called `postgres`, so a machine whose only set var is
 * `SUPABASE_DATABASE_URL` would pass that pin and this bracket would PERTURB N ROWS OF
 * PRODUCTION. A cohort bracket must never run there, so the host is checked as well.
 *
 * This is a pure predicate over the RESOLVED TARGET DESCRIPTION (`buildoTarget.description`,
 * already password-redacted by resolve-db), so it holds for every connection path. The
 * description has TWO shapes and both must be accepted when local:
 *   - a connection string:  `postgresql://user:pass@127.0.0.1:54322/postgres` (`@host:`)
 *   - a discrete PG_* form: `127.0.0.1:54322/postgres`                      (`host:port/`)
 * Hence the `(^|@)` — without the `^` alternative the DISCRETE local form, which carries
 * no `@`, would be refused and the PG_* path could never run.
 */
const LOCAL_HOST_RE = /(^|@)(127\.0\.0\.1|localhost)[:\/]/;

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
    sourceCsv: null, sourceKey: null,
    env: [], captureArgs: [], countPath: null,
    deriveColumn: null, derivedTable: null, derivedKey: null, derivedKeyPrefix: null, derivedNaturalKey: null,
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
      'source-csv': 'sourceCsv', 'source-key': 'sourceKey',
      'count-path': 'countPath',
      'derive-column': 'deriveColumn', 'derived-table': 'derivedTable', 'derived-key': 'derivedKey',
      'derived-key-prefix': 'derivedKeyPrefix', 'derived-natural-key': 'derivedNaturalKey',
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
  // The before-image name must START with `--table` — `<table>_cohort_bak_…`. The regex
  // above alone would admit `parcels_cohort_bak_…` for `--table=address_points`, i.e. a
  // before-image frozen from a DIFFERENT table, which the restore would then "verify"
  // against the wrong rows. The name is the operator's one handle on the image in an
  // incident, so it must say which table it belongs to.
  if (!backupTable.startsWith(`${table}_cohort_bak_`)) {
    throw new Error(`--backup-table must be ${table}_cohort_bak_<yyyymmddthhmmz> (got ${JSON.stringify(backupTable)}) — the before-image name must name the table it came from`);
  }
  // The key and the perturbed column are two different roles; the same name in both would
  // make the perturbation rewrite the join key the restore matches on.
  if (key === column) throw new Error(`--key and --column must differ (both are ${JSON.stringify(key)})`);
  // The predicate is interpolated into the plan/backup/perturb SQL. A semicolon would
  // make it a multi-statement vector, so refuse it here (the brief's own rule) — the
  // statement must stay a single statement.
  if (String(where).includes(';')) throw new Error('--where must not contain a semicolon');
  if (typeof order !== 'string' || order.trim() === '') throw new Error('--order must be a non-empty SQL order expression');
  if (order.includes(';')) throw new Error('--order must not contain a semicolon');
  // F4 (LOW): `$` and backtick are the two characters that make a value unsafe to embed in
  // the RECOVERY COMMAND. `recoveryCommand()` JSON-stringifies `--where`/`--order`/`--op`
  // into a copy-pasteable shell line printed before the COMMIT and on every failure path;
  // a `$(…)` or a backtick inside a JSON double-quoted string is still COMMAND-SUBSTITUTED
  // by the shell the operator pastes it into. These values are SQL predicates/expressions,
  // so neither character has a legitimate use, and refusing them here keeps the printed
  // recovery command shell-safe by construction rather than by convention.
  const shellUnsafe = (n, v) => {
    if (String(v).includes('$') || String(v).includes('`')) {
      throw new Error(`--${n} must not contain "$" or a backtick (got ${JSON.stringify(v)}) — these values are reprinted in the recovery command, where the shell would substitute them`);
    }
  };
  shellUnsafe('where', where);
  shellUnsafe('order', order);
  shellUnsafe('op', opRaw);
  const count = Number(countRaw);
  if (!Number.isInteger(count) || count <= 0) throw new Error(`--count must be a positive integer (got ${JSON.stringify(countRaw)})`);
  const op = parseOp(opRaw);
  // R-DP: the pair-mode cohort is the first N DISTINCT keys, so --order must BE the key (a
  // GROUP BY cannot order by any other expression), and the source-checked draw (one row per
  // key) does not apply to a key that holds many rows.
  if (op.kind === 'delete_reinsert') {
    if (![key, `t.${key}`, `"${key}"`, `t."${key}"`].includes(String(order).trim())) {
      throw new Error(`--op=delete_reinsert orders by the cohort key: --order must be ${key} or t.${key} (got ${JSON.stringify(order)})`);
    }
    if ((args.sourceCsv !== null && args.sourceCsv !== undefined) || (args.sourceKey !== null && args.sourceKey !== undefined)) {
      throw new Error('--op=delete_reinsert does not take --source-csv/--source-key');
    }
  }
  // The optional source pair (both or neither). Refused BEFORE any DB connect and BEFORE
  // the run-only block, so `--plan --source-csv=nope.csv` costs seconds and touches no
  // database. The path is resolved against the repo root and must EXIST: a typo'd path
  // would otherwise draw the cohort from an empty key set and refuse with the misleading
  // "only 0 reachable" message instead of naming the missing file.
  const { sourceCsv, sourceKey } = sourceFlags(args);
  if (sourceCsv !== null) {
    const abs = path.resolve(REPO_ROOT, sourceCsv);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`--source-csv ${JSON.stringify(sourceCsv)} does not exist (resolved ${abs}) — pass the path of the source CSV whose keys the cohort must come from`);
    }
  }
  // R-DN (Spec 124, McDonald's Airtight V3): an optional per-table write count read from the SAME
  // `count_path` gate G #38 reads (countPathDecision, gates/captures.mjs) — never a second count
  // source. Only --run reads a capture, so any other mode refuses it before any DB connect.
  const countPath = args.countPath === null || args.countPath === undefined ? null : args.countPath;
  if (countPath !== null) {
    if (mode !== 'run') throw new Error(`--count-path is a --run flag (got it with --${modeFlag(mode)})`);
    if (typeof countPath !== 'string' || !/^[a-z][a-z0-9_]*$/.test(countPath)) {
      throw new Error(`--count-path must be a top-level emits key (got ${JSON.stringify(countPath)})`);
    }
  }
  const derived = derivedFlags(args, { mode, table, key, column, op, countPath, need });
  if (derived.deriveColumn !== null) shellUnsafe('derived-key-prefix', derived.derivedKeyPrefix);
  if (mode === 'run') {
    const step = need('step', args.step);
    const chain = need('chain', args.chain);
    const out = need('out', args.out);
    if (typeof step !== 'string' || !/^scripts\/.+\.js$/.test(step)) {
      throw new Error(`--step must be a scripts/<name>.js path (got ${JSON.stringify(step)})`);
    }
    // F3: a `..` segment lets the regex above be satisfied while the REAL path escapes
    // `scripts/` — `scripts/../../etc/x.js` matches `^scripts/.+\.js$`. The step is spawned
    // with `execFileSync('node', …)`, so this is not a shell injection, but it does let the
    // bracket run arbitrary JS in the repo on the operator's credentials. Resolve it and
    // require the result to stay under `scripts/`.
    if (step.split('/').includes('..')) {
      throw new Error(`--step must not contain a ".." path segment (got ${JSON.stringify(step)})`);
    }
    if (!path.resolve(REPO_ROOT, step).startsWith(`${path.join(REPO_ROOT, 'scripts')}${path.sep}`)) {
      throw new Error(`--step must resolve to a file under scripts/ (got ${JSON.stringify(step)})`);
    }
    for (const a of args.captureArgs) {
      if (typeof a !== 'string' || !a.startsWith('--')) {
        throw new Error(`--capture-arg must be a --flag[=value] (got ${JSON.stringify(a)})`);
      }
      // F3: the harness owns these flags itself (nodeArgv passes --overwrite and the
      // caller's --out/--step/--chain). A passthrough that re-sets one of them would be
      // duplicated on the child argv, and argv order — not the harness's parser — would
      // decide which wins. Refuse rather than rely on last-one-wins.
      const reowned = ['--step', '--chain', '--out', '--overwrite'];
      if (reowned.some((f) => a === f || a.startsWith(`${f}=`))) {
        throw new Error(`--capture-arg must not set ${reowned.join(', ')} — the bracket owns those on the harness argv (got ${JSON.stringify(a)})`);
      }
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
    sourceCsv, sourceKey,
    step: args.step, chain: args.chain, out: args.out, env: args.env, captureArgs: args.captureArgs,
    countPath,
    ...derived,
  };
}

/**
 * R-ET (Spec 124 R-DY (e)): the derived-target flags, validated before any DB connect. Pure.
 * Returns all-null fields when the op is not derived_status, and refuses a derived flag given without it
 * (a flag that silently does nothing is a recipe nobody can replay).
 */
function derivedFlags(args, { mode, table, key, column, op, countPath, need }) {
  const given = (v) => v !== null && v !== undefined;
  const flagNames = { deriveColumn: 'derive-column', derivedTable: 'derived-table', derivedKey: 'derived-key', derivedKeyPrefix: 'derived-key-prefix', derivedNaturalKey: 'derived-natural-key' };
  if (op.kind !== 'derived_status') {
    const stray = Object.keys(flagNames).filter((k) => given(args[k]));
    if (stray.length > 0) throw new Error(`--${flagNames[stray[0]]} is valid only with --op=derived_status:<s> (R-ET)`);
    return { deriveColumn: null, derivedTable: null, derivedKey: null, derivedKeyPrefix: null, derivedNaturalKey: null };
  }
  const deriveColumn = need('derive-column', args.deriveColumn);
  const derivedTable = need('derived-table', args.derivedTable);
  const derivedKey = need('derived-key', args.derivedKey);
  const naturalRaw = need('derived-natural-key', args.derivedNaturalKey);
  const derivedKeyPrefix = given(args.derivedKeyPrefix) && args.derivedKeyPrefix !== true ? String(args.derivedKeyPrefix) : '';
  const derivedNaturalKey = String(naturalRaw).split(',').map((s) => s.trim());
  for (const [n, v] of [['derive-column', deriveColumn], ['derived-table', derivedTable], ['derived-key', derivedKey], ...derivedNaturalKey.map((c) => ['derived-natural-key', c])]) {
    if (!TABLE_NAME_RE.test(v)) throw new Error(`--${n}=${JSON.stringify(v)} is not a legal identifier (${TABLE_NAME_RE})`);
  }
  if (deriveColumn === key || deriveColumn === column) throw new Error(`--derive-column must differ from --key and --column (got ${JSON.stringify(deriveColumn)})`);
  if (derivedTable === table) throw new Error(`--derived-table must differ from --table (both are ${JSON.stringify(table)})`);
  if (!derivedNaturalKey.includes(derivedKey)) throw new Error(`--derived-natural-key must include --derived-key ${JSON.stringify(derivedKey)} (got ${JSON.stringify(naturalRaw)})`);
  if (new Set(derivedNaturalKey).size !== derivedNaturalKey.length) throw new Error(`--derived-natural-key repeats a column (got ${JSON.stringify(naturalRaw)})`);
  // R-DN: the derived write count is the step's own per-table int emit, never the step-level counters.
  const expected = `${derivedTable}_written`;
  if (mode === 'run' && countPath !== expected) {
    throw new Error(`--op=derived_status --run requires --count-path=${expected} (the step's own int emit for the derived table, R-DN; got ${JSON.stringify(countPath)})`);
  }
  return { deriveColumn, derivedTable, derivedKey, derivedKeyPrefix, derivedNaturalKey };
}

/**
 * Parse `--op`. Pure. The three supported operations are exactly the forced changes
 * the INGESTOR recaptures need; anything else is refused rather than guessed.
 */
function parseOp(raw) {
  if (typeof raw !== 'string' || raw === '') throw new Error(`--op must be add_number:<n>|append_text:<s>|negate_bool|delete_reinsert (got ${JSON.stringify(raw)})`);
  if (raw === 'negate_bool') return { kind: 'negate_bool' };
  if (raw === 'delete_reinsert') return { kind: 'delete_reinsert' };
  if (raw === 'derived_status') throw new Error('--op=derived_status:<s> needs the text <s> to append to --column and --derive-column');
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
  // R-ET: appends <s> to BOTH the guard column and the derive prior column; <s> must be non-empty
  // (an empty suffix is a void perturbation the --run unmoved check would refuse anyway).
  if (head === 'derived_status') {
    if (arg === '') throw new Error('--op=derived_status:<s> needs a non-empty <s> to append');
    return { kind: 'derived_status' };
  }
  throw new Error(`--op kind must be add_number|append_text|negate_bool (got ${JSON.stringify(head)})`);
}

/**
 * R-DP (Spec 124, McDonald's Airtight V3): `delete_reinsert` is the INSERT-only form of the
 * same bracket. An insert-only step (ON CONFLICT DO NOTHING, no column to move) cannot be
 * perturbed by an UPDATE, so the cohort is the first N DISTINCT `--key` values and the
 * perturbation DELETEs every row they hold; the step must re-insert exactly the deleted
 * (key, column) pairs. The before-image holds the FULL rows, the heal and restore checks
 * compare the (key, column) PAIR SET, and the restore re-inserts only the missing pairs.
 * Pure.
 */
function isPairMode(o) {
  return Boolean(o && o.op && o.op.kind === 'delete_reinsert');
}

/** The `$2` bind value for an op, or `null` when the op takes none. Pure. */
function opBindValue(opRaw) {
  const op = parseOp(opRaw);
  if (op.kind === 'add_number') return Number(opRaw.slice(opRaw.indexOf(':') + 1));
  if (op.kind === 'append_text' || op.kind === 'derived_status') return opRaw.slice(opRaw.indexOf(':') + 1);
  return null;
}

/**
 * R-ET (Spec 124 R-DY (e)): `derived_status:<s>` is the #38 bracket for a DERIVED target. The step
 * writes a derived row only when its runner-owned prior read of `--derive-column` differs from the new
 * value, and only re-upserts a primary row whose guard (`--column`) moved — so BOTH are perturbed in one
 * transaction. The before-image holds (key, column, derive column); a sibling before-image snapshots the
 * derived table's natural keys for the cohort. --run requires the primary back to the before-image AND
 * exactly one inserted derived row per cohort key (counted by the `<derived_table>_written` emit, R-DN);
 * the restore deletes exactly the inserted derived rows and commits only on an exact RETURNING match. Pure.
 */
function isDerivedMode(o) {
  return Boolean(o && o.op && o.op.kind === 'derived_status');
}

/**
 * The `UPDATE … SET <column> = …` assignment, as a pure function of the op. `<column>`
 * is the column the perturbation moves; `$2` (when the op takes a bind) is the parseOp
 * value. `negate_bool` is deliberately `NOT x` — the operator declares the column is
 * boolean; a non-boolean column makes Postgres raise, which is the right failure
 * (silently coercing would produce an unmodelled perturbation).
 */
function perturbationSetExpr(op, column, deriveColumn, widths = {}) {
  if (!TABLE_NAME_RE.test(column)) throw new Error(`invalid column name ${JSON.stringify(column)}`);
  if (op.kind === 'delete_reinsert') throw new Error('delete_reinsert has no SET expression — its perturbation is perturbationDeleteSql');
  if (op.kind === 'derived_status') {
    if (typeof deriveColumn !== 'string' || !TABLE_NAME_RE.test(deriveColumn)) throw new Error(`derived_status needs a valid derive column (got ${JSON.stringify(deriveColumn)})`);
    return `${appendAssignment(column, widths)}, ${appendAssignment(deriveColumn, widths)}`;
  }
  if (op.kind === 'negate_bool') return `"${column}" = NOT "${column}"`;
  if (op.kind === 'add_number') return `"${column}" = "${column}" + $2`;
  if (op.kind === 'append_text') return appendAssignment(column, widths);
  throw new Error(`unknown op kind ${JSON.stringify(op.kind)}`);
}

/**
 * R-GZ (Spec 124, provisional id; operator y 2026-10-20; amends R-CZ append_text and R-ET derived_status):
 * fit-to-width. A text suffix is appended to a BOUNDED column (catalog character_maximum_length w) in the
 * fitted form `left(col, w - char_length($2)) || $2`, so a full-width value (coa_applications.data_hash,
 * sha256 hex in varchar(64)) keeps its width and still changes; a shorter value gets exactly the plain append.
 * An unbounded column (w null, or no catalog answer) keeps the plain append, byte-identical to before R-GZ.
 * `fitWidthDecision` refuses a suffix as wide as the column before anything is perturbed. Pure.
 */
function appendAssignment(column, widths) {
  const w = widths && Object.prototype.hasOwnProperty.call(widths, column) ? widths[column] : null;
  if (Number.isInteger(w) && w > 0) return `"${column}" = left("${column}", ${w} - char_length($2)) || $2`;
  return `"${column}" = "${column}" || $2`;
}

/** R-GZ: the catalog widths of the perturbed columns ($1 table, $2 columns); null = unbounded. */
const COLUMN_WIDTH_SQL = `SELECT column_name, character_maximum_length AS w
    FROM information_schema.columns
   WHERE table_schema = current_schema() AND table_name = $1 AND column_name = ANY($2)`;

/** R-GZ: the text columns an op appends to (none for the other ops). Pure. */
function appendColumns(o) {
  if (!o || !o.op) return [];
  if (o.op.kind === 'append_text') return [o.column];
  if (o.op.kind === 'derived_status') return [o.column, o.deriveColumn];
  return [];
}

/** R-GZ: read the widths of `appendColumns(o)` from the catalog ({col: w|null}). */
async function columnWidths(pool, o) {
  const cols = appendColumns(o);
  const widths = {};
  for (const c of cols) widths[c] = null;
  if (cols.length === 0) return widths;
  const rows = await readOnlyQuery(pool, COLUMN_WIDTH_SQL, [o.table, cols]);
  for (const r of rows) widths[r.column_name] = r.w === null || r.w === undefined ? null : Number(r.w);
  return widths;
}

/**
 * R-GZ: may the suffix be fitted into every bounded perturbed column? Refuses when the suffix is as
 * wide as (or wider than) a column: `left(col, w - n)` would keep nothing of the original value (and a
 * negative length would drop from the right). Returns the bounded columns it fits. Pure.
 */
function fitWidthDecision({ columns, widths, suffix }) {
  const n = String(suffix).length;
  const fitted = [];
  for (const c of columns) {
    const w = widths ? widths[c] : null;
    if (!Number.isInteger(w)) continue;
    if (n >= w) return { ok: false, reason: `the suffix (${n} char(s)) is as wide as ${c} (${w}); fit-to-width needs suffix < width (R-GZ)` };
    fitted.push(c);
  }
  return { ok: true, fitted };
}

/** R-GZ: the value the fitted SQL produces, for --plan's transcript (JS mirror of left(...) || s). Pure. */
function fittedPreview(value, width, suffix) {
  const v = value === null || value === undefined ? '' : String(value);
  if (!Number.isInteger(width)) return v + suffix;
  return v.slice(0, Math.max(0, width - String(suffix).length)) + suffix;
}

/** R-GZ: read the widths, refuse an unfittable suffix, print the fitted form; returns the widths. */
async function resolveFitWidths(pool, o, tag) {
  const cols = appendColumns(o);
  if (cols.length === 0) return {};
  const widths = await columnWidths(pool, o);
  const suffix = opBindValue(o.opRaw);
  const d = fitWidthDecision({ columns: cols, widths, suffix });
  if (!d.ok) throw new Error(`refusing: ${d.reason}`);
  for (const c of cols) {
    console.log(`[cohort:${tag}] width ${o.table}.${c}: ${widths[c] === null ? 'unbounded (plain append)' : `${widths[c]} → fitted form left("${c}", ${widths[c]} - char_length(suffix)) || suffix`} (R-GZ)`);
  }
  console.log(`[cohort:${tag}] SET ${perturbationSetExpr(o.op, o.column, o.deriveColumn, widths)}`);
  return widths;
}

/**
 * R-DP: the pair-mode perturbation — DELETE every row the cohort keys hold, RETURNING the
 * (key, column) pairs that went, so --run can prove the deleted pair set IS the before-image
 * before it COMMITs (Spec 08 output panel round 1, 2026-10-18). Pure.
 */
function perturbationDeleteSql(o) {
  if (!TABLE_NAME_RE.test(o.table) || !TABLE_NAME_RE.test(o.key) || !TABLE_NAME_RE.test(o.column)) throw new Error('perturbationDeleteSql: invalid identifier');
  return `DELETE FROM ${o.table} t WHERE t."${o.key}" = ANY($1) RETURNING t."${o.key}", t."${o.column}"`;
}

/**
 * R-DP safety (Spec 08 output panel round 1, 2026-10-18): the three catalog reads that decide
 * whether a table may be bracketed by DELETE-and-reinsert. Each binds `$1` = the table name and
 * returns `n` plus the offending names. Pure SQL builders.
 *   - inbound foreign keys: a DELETE would cascade into, or be blocked by, another table;
 *   - non-internal triggers firing on DELETE (tgtype bit 8, TRIGGER_TYPE_DELETE): the DELETE
 *     would run side effects the restore cannot undo;
 *   - generated or identity columns: an INSERT of the before-image cannot write them back as they were.
 */
const PAIR_SAFETY_SQL = Object.freeze({
  inboundFks: "SELECT count(*)::int AS n, coalesce(string_agg(conname::text, ',' ORDER BY conname), '') AS names FROM pg_constraint WHERE contype = 'f' AND confrelid = $1::regclass",
  deleteTriggers: "SELECT count(*)::int AS n, coalesce(string_agg(tgname::text, ',' ORDER BY tgname), '') AS names FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal AND (tgtype::int & 8) <> 0",
  generatedColumns: "SELECT count(*)::int AS n, coalesce(string_agg(attname::text, ',' ORDER BY attnum), '') AS names FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND (attgenerated <> '' OR attidentity <> '')",
});
function pairSafetySql(kind) {
  if (!Object.prototype.hasOwnProperty.call(PAIR_SAFETY_SQL, kind)) throw new Error(`pairSafetySql: unknown kind ${JSON.stringify(kind)}`);
  return PAIR_SAFETY_SQL[kind];
}

/**
 * R-DP safety decision. PURE: the caller resolves each catalog read to `{n, names}` and this
 * decides. Any inbound FK, DELETE-firing trigger, or generated/identity column refuses pair mode.
 */
function pairModeRefusal({ inboundFks, deleteTriggers, generatedColumns } = {}) {
  const reasons = [];
  const count = (r) => (r && Number.isInteger(Number(r.n)) ? Number(r.n) : NaN);
  for (const [label, r] of [['inbound foreign key(s)', inboundFks], ['non-internal DELETE trigger(s)', deleteTriggers], ['generated/identity column(s)', generatedColumns]]) {
    const n = count(r);
    if (!Number.isFinite(n)) return { ok: false, reason: `pair-mode safety read for ${label} is missing — refusing` };
    if (n > 0) reasons.push(`${n} ${label} (${r.names || '?'})`);
  }
  if (reasons.length > 0) return { ok: false, reason: `--op=delete_reinsert refuses this table: ${reasons.join('; ')} — a DELETE-and-reinsert bracket could not restore it exactly (Spec 124 R-DP)` };
  return { ok: true };
}

/**
 * R-DP: the restore's EXPLICIT column list, read from the before-image's own catalog (never
 * `SELECT b.*`, which would silently depend on the two tables' physical column order). Pure.
 */
function backupColumnsSql() {
  return 'SELECT attname::text AS c FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum';
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
function hashSqlFor({ table, key, column, where, pair = false }) {
  const rowText = rowTextExpr(projection(key, column));
  // R-DP: a pair-mode key holds many rows, so the hash orders by (key, column) to be total.
  const orderBy = orderByClause({ orderColumns: pair ? [key, column] : [key], pkColumns: [], allColumns: [] });
  const pred = where ? ` WHERE ${where}` : '';
  return `SELECT md5(string_agg(${rowText}, '|' ORDER BY ${orderBy})) AS h FROM ${table} t${pred}`;
}

/**
 * The whole-table (unrestricted) hash. Pure. `table` is validated by the ONE shared rule,
 * which is why `hashOf` and `BACKUP_TABLE_RE` cannot disagree on case: Postgres folds
 * unquoted identifiers to lower case, so both must be lower-case.
 */
function hashOf(o) {
  const { table, key, column } = o;
  if (typeof table !== 'string' || !TABLE_NAME_RE.test(table)) {
    throw new Error(`refusing to build a hash for table name ${JSON.stringify(table)}`);
  }
  return hashSqlFor({ table, key, column, where: null, pair: isPairMode(o) });
}

/**
 * The projected cohort columns `t."key", t."column"` — plus `t."<derive column>"` in derived mode (R-ET),
 * so every value read, before-image and heal check covers BOTH perturbed columns. Pure.
 */
function selectCols(o) {
  return isDerivedMode(o) ? `t."${o.key}", t."${o.column}", t."${o.deriveColumn}"` : `t."${o.key}", t."${o.column}"`;
}

/** The cohort SELECT: the FIRST N eligible rows by --order, key + column. READ ONLY. Pure. */
function cohortSelect(o) {
  if (!Number.isInteger(o.count) || o.count <= 0) throw new Error(`invalid cohort count ${JSON.stringify(o.count)}`);
  return `SELECT ${selectCols(o)} FROM ${o.table} t WHERE ${o.where} ORDER BY ${o.order} LIMIT ${o.count}`;
}

/** The eligibility COUNT: how many rows --where selects. Pure. */
function eligibleCountSql(o) {
  if (isPairMode(o)) return `SELECT count(DISTINCT t."${o.key}")::int AS n FROM ${o.table} t WHERE ${o.where}`;
  return `SELECT count(*)::int AS n FROM ${o.table} t WHERE ${o.where}`;
}

/**
 * The ordered KEY-ONLY read: every key --where selects, in --order order. Pure.
 *
 * `bounded` (the unflagged path) keeps `LIMIT count` — the pre-ruling SELECT exactly.
 * Unbounded (the source-checked path) is the whole eligible population: the cohort can
 * only be drawn from keys the source still carries, and a `LIMIT count` here would
 * re-introduce the very re-derivation this path exists to remove (if the first `count`
 * ordered rows include a retired key, the bracket would need the NEXT reachable key,
 * which is not in the limited window).
 */
function orderedKeysSql(o, { bounded }) {
  if (!Number.isInteger(o.count) || o.count <= 0) throw new Error(`invalid cohort count ${JSON.stringify(o.count)}`);
  const limit = bounded ? ` LIMIT ${o.count}` : '';
  // R-DP: the pair-mode cohort is N DISTINCT keys (validateFlags pins --order to the key).
  if (isPairMode(o)) return `SELECT t."${o.key}" FROM ${o.table} t WHERE ${o.where} GROUP BY t."${o.key}" ORDER BY t."${o.key}"${limit}`;
  return `SELECT t."${o.key}" FROM ${o.table} t WHERE ${o.where} ORDER BY ${o.order}${limit}`;
}

/**
 * `CREATE TABLE <backup> AS SELECT <key>, <column> FROM <table> WHERE <key> = ANY($1)`
 * — the before-image, COHORT KEYS ONLY (never the whole table). Pure.
 */
function backupCreateSql(o) {
  if (!TABLE_NAME_RE.test(o.backupTable)) throw new Error(`invalid before-image name ${JSON.stringify(o.backupTable)}`);
  // R-DP: a deleted row must come back whole, so the pair-mode before-image is the FULL row.
  if (isPairMode(o)) return `CREATE TABLE ${o.backupTable} AS SELECT t.* FROM ${o.table} t WHERE t."${o.key}" = ANY($1)`;
  return `CREATE TABLE ${o.backupTable} AS SELECT ${selectCols(o)} FROM ${o.table} t WHERE t."${o.key}" = ANY($1)`;
}

/**
 * Read the before-image's cohort rows, ordered by key so comparisons are set-wise, never
 * physical-order-wise. Pure.
 */
function backupSelectSql(o) {
  if (!TABLE_NAME_RE.test(o.backupTable)) throw new Error(`invalid before-image name ${JSON.stringify(o.backupTable)}`);
  return `SELECT ${selectCols(o)} FROM ${o.backupTable} t ORDER BY t."${o.key}"`;
}

/**
 * The cohort-scoped restore UPDATE. Pure.
 *
 * The `t."<key>" = ANY($1)` predicate is the whole point: a restore that did not name
 * the cohort keys would revert every row the backup happens to hold. The
 * `IS DISTINCT FROM` guard means a no-op restore writes nothing (preserving every other
 * row's xmin) and only the column this bracket moved is ever touched.
 */
function restoreSql(o, columns) {
  if (!TABLE_NAME_RE.test(o.backupTable)) throw new Error(`invalid before-image name ${JSON.stringify(o.backupTable)}`);
  // R-DP: re-insert ONLY the cohort pairs that are missing — a pair the step already put back
  // is left as the step wrote it, and a no-op restore inserts nothing. The column list is
  // EXPLICIT, read from the before-image (backupColumnsSql), never `SELECT b.*`.
  if (isPairMode(o)) {
    if (!Array.isArray(columns) || columns.length === 0) throw new Error('restoreSql: pair mode needs the before-image column list');
    for (const c of columns) if (!TABLE_NAME_RE.test(c)) throw new Error(`restoreSql: invalid column name ${JSON.stringify(c)}`);
    if (!columns.includes(o.key) || !columns.includes(o.column)) throw new Error('restoreSql: the before-image column list lacks the key or the column');
    const cols = columns.map((c) => `"${c}"`).join(', ');
    const bcols = columns.map((c) => `b."${c}"`).join(', ');
    return `INSERT INTO ${o.table} (${cols}) SELECT ${bcols} FROM ${o.backupTable} b WHERE b."${o.key}" = ANY($1)`
      + ` AND NOT EXISTS (SELECT 1 FROM ${o.table} t WHERE t."${o.key}" = b."${o.key}" AND t."${o.column}" = b."${o.column}")`;
  }
  // R-ET: both perturbed columns come back, guarded so a no-op restore writes nothing.
  if (isDerivedMode(o)) {
    const c = o.column;
    const d = o.deriveColumn;
    return `UPDATE ${o.table} t SET "${c}" = b."${c}", "${d}" = b."${d}" FROM ${o.backupTable} b`
      + ` WHERE b."${o.key}" = t."${o.key}" AND t."${o.key}" = ANY($1)`
      + ` AND (t."${c}" IS DISTINCT FROM b."${c}" OR t."${d}" IS DISTINCT FROM b."${d}")`;
  }
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
function captureClaim({ recordsUpdated, recordsNew, liveValues, backupValues, countPathResult }) {
  // R-DN: with --count-path the write count is gate G's own per-table count_path decision
  // (`{ok, n}` | `{ok:false, reason}`), not the step-level summary counters.
  if (countPathResult !== undefined && countPathResult !== null) {
    if (!countPathResult.ok) return { ok: false, reason: `count_path: ${countPathResult.reason} (gate G #38)` };
    const same = sameValueMap(canonicalValueMap(backupValues), canonicalValueMap(liveValues));
    if (!same.ok) return { ok: false, reason: `the step did not heal the perturbation — ${same.reason}` };
    return { ok: true, written: countPathResult.n };
  }
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
  // F3: `path.resolve` — NOT `path.join` — collapses `..` segments. With `path.join` an
  // absolute `docs/reports/golden/<slug>/golden/../post/x.json` kept its `..` text, and the
  // `startsWith(root)` / 3-segment checks below graded the UNRESOLVED string rather than the
  // path the harness would actually write. Resolving first means we validate the real
  // destination, so `..` can neither hide a location outside the golden root nor fake the
  // `<slug>/<side>/<name>.json` shape.
  const abs = path.resolve(REPO_ROOT, out);
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

// ── R-ET: the derived-target half (Spec 124 R-DY (e)) ─────────────────────
/**
 * The derived snapshot's name: `<derived_table>_cohort_bak_<the --backup-table stamp>` — the same
 * disposable, identifiable before-image shape as the primary's, so one stamp names both. Pure.
 */
function derivedSnapshotTable(o) {
  const stamp = String(o.backupTable).slice(`${o.table}_cohort_bak_`.length);
  const name = `${o.derivedTable}_cohort_bak_${stamp}`;
  if (!BACKUP_TABLE_RE.test(name)) throw new Error(`derivedSnapshotTable: ${JSON.stringify(name)} does not match ${BACKUP_TABLE_RE}`);
  return name;
}

/** The derived-key values for the cohort keys: `--derived-key-prefix` + String(key). Pure. */
function derivedKeysFor(o, keys) {
  return (Array.isArray(keys) ? keys : []).map((k) => `${o.derivedKeyPrefix || ''}${String(k)}`);
}

/**
 * The derived row identity as SERVER-RENDERED text: `ROW(<natural key cols>)::text`. Rendered by Postgres
 * in every read and in the DELETE predicate alike, so no JS type round-trip can alias two rows. A session
 * whose DateStyle/TimeZone renders differently fails the --run snapshot precondition (refuse, never guess).
 */
function derivedRowText(o) {
  for (const c of o.derivedNaturalKey || []) if (!TABLE_NAME_RE.test(c)) throw new Error(`invalid natural-key column ${JSON.stringify(c)}`);
  if (!Array.isArray(o.derivedNaturalKey) || o.derivedNaturalKey.length === 0) throw new Error('derivedRowText: no --derived-natural-key');
  return `ROW(${o.derivedNaturalKey.map((c) => `t."${c}"`).join(', ')})::text`;
}

/** Read the cohort's derived rows `{dk, nk}`; `$1` = derivedKeysFor(cohort keys). Pure. */
function derivedRowsSql(o) {
  return `SELECT t."${o.derivedKey}"::text AS dk, ${derivedRowText(o)} AS nk FROM ${o.derivedTable} t WHERE t."${o.derivedKey}" = ANY($1)`;
}

/** The derived before-image: the cohort's derived natural keys, frozen at --backup. Pure. */
function derivedSnapshotCreateSql(o) {
  return `CREATE TABLE ${derivedSnapshotTable(o)} AS SELECT t."${o.derivedKey}"::text AS dk, ${derivedRowText(o)} AS nk FROM ${o.derivedTable} t WHERE t."${o.derivedKey}" = ANY($1)`;
}

/** Read the derived before-image back. Pure. */
function derivedSnapshotSelectSql(o) {
  return `SELECT dk, nk FROM ${derivedSnapshotTable(o)}`;
}

/** The restore DELETE: exactly the inserted natural keys, RETURNING them for the exact-set check. Pure. */
function derivedDeleteSql(o) {
  const rowText = derivedRowText(o);
  return `DELETE FROM ${o.derivedTable} t WHERE t."${o.derivedKey}" = ANY($1) AND ${rowText} = ANY($2::text[]) RETURNING t."${o.derivedKey}"::text AS dk, ${rowText} AS nk`;
}

/** `{dk, nk}` rows as a value map keyed by nk (dk is the value), for sameValueMap. Pure. */
function derivedEntries(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({ key: r.nk, value: r.dk }));
}

/**
 * The derived diff. PURE: `inserted` = rows present after and absent before; `removed` = rows present
 * before and absent after (a derived ledger the step DELETED from — never legitimate for R-DY).
 */
function derivedInsertedRows({ before, after }) {
  const had = new Set((before || []).map((r) => r.nk));
  const has = new Set((after || []).map((r) => r.nk));
  return {
    inserted: (after || []).filter((r) => !had.has(r.nk)),
    removed: (before || []).filter((r) => !has.has(r.nk)),
  };
}

/**
 * The derived --run claim. PURE. Green only when ALL hold:
 *   - R-DN: the `<derived_table>_written` count_path decision is ok and counts >= the cohort size (other
 *     keys may legitimately change status in the same run, so >=, never ==);
 *   - the primary healed: (column, derive column) back to the before-image for every cohort key;
 *   - no prior derived row vanished;
 *   - EXACTLY ONE inserted derived row per cohort key (0 = the step wrote no ledger row: RED).
 */
function derivedClaim({ countPathResult, liveValues, backupValues, derivedKeys, before, after }) {
  if (!countPathResult) return { ok: false, reason: 'derived_status needs the count_path decision (R-DN) — none was computed' };
  if (!countPathResult.ok) return { ok: false, reason: `count_path: ${countPathResult.reason} (gate G #38)` };
  const keys = Array.isArray(derivedKeys) ? derivedKeys : [];
  if (countPathResult.n < keys.length) {
    return { ok: false, reason: `count_path emitted ${countPathResult.n} < the cohort's ${keys.length} derived key(s) — the emit does not cover the cohort (R-DN)` };
  }
  const same = sameValueMap(canonicalValueMap(backupValues), canonicalValueMap(liveValues));
  if (!same.ok) return { ok: false, reason: `the step did not heal the perturbation — ${same.reason}` };
  const { inserted, removed } = derivedInsertedRows({ before, after });
  if (removed.length > 0) return { ok: false, reason: `${removed.length} prior derived row(s) vanished during the run (first: ${removed[0].nk})` };
  for (const k of keys) {
    const n = inserted.filter((r) => r.dk === k).length;
    if (n !== 1) return { ok: false, reason: `${k}: ${n} inserted derived row(s), expected exactly 1 per cohort key (R-DY (e))` };
  }
  const stray = inserted.filter((r) => !keys.includes(r.dk));
  if (stray.length > 0) return { ok: false, reason: `${stray.length} inserted derived row(s) outside the cohort keys (first: ${stray[0].nk})` };
  return { ok: true, written: countPathResult.n };
}

/** The restore's exact-set decision: the DELETE's RETURNING must BE the inserted set. PURE. */
function derivedRestoreDecision({ expected, returned }) {
  const exp = expected || [];
  const got = returned || [];
  if (got.length !== exp.length) return { ok: false, reason: `DELETE returned ${got.length} row(s), expected ${exp.length}` };
  const same = sameValueMap(canonicalValueMap(derivedEntries(exp)), canonicalValueMap(derivedEntries(got)));
  return same.ok ? { ok: true } : { ok: false, reason: same.reason };
}

/**
 * Delete exactly the `inserted` derived rows in ONE transaction on `client`, COMMIT only when the
 * DELETE's RETURNING set equals them, else ROLLBACK and throw. Nothing inserted ⇒ no transaction.
 * Returns the number of rows deleted. Shared by the --run finally and --restore.
 */
async function deleteInsertedDerived(client, o, derivedKeys, inserted) {
  if (!Array.isArray(inserted) || inserted.length === 0) return 0;
  assertRestoreKeys(derivedKeys);
  await client.query('BEGIN');
  try {
    const del = await client.query(derivedDeleteSql(o), [derivedKeys, inserted.map((r) => r.nk)]);
    const verdict = derivedRestoreDecision({ expected: inserted, returned: del.rows });
    if (!verdict.ok) throw new Error(`derived restore mismatch on ${o.derivedTable} — ${verdict.reason}; rolled back`);
    await client.query('COMMIT');
    return del.rowCount;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    throw err;
  }
}

// ── source reachability (the source-checked cohort, operator ruling 2026-10-03) ──
/**
 * Parse ONE CSV record starting at `text[i]`, per RFC 4180. Pure. Returns
 * `{fields, i}` with `i` positioned on the record's terminating newline (or `text.length`).
 *
 * Handles the three shapes the source files actually use and that a naive
 * `split(',')` mangles: a double-QUOTED field containing the delimiter, a `""` escape
 * for a literal quote inside that field, and CRLF line endings. A character-wise
 * scanner is used rather than a regex because quote state is not regular when the
 * delimiter and the quote can both appear inside a field.
 */
function parseCsvRecord(text, start) {
  const fields = [];
  let i = start;
  for (;;) {
    let value = '';
    if (text[i] === '"') {
      i += 1;
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { value += '"'; i += 2; continue; }
          i += 1;
          break;
        }
        value += text[i];
        i += 1;
      }
    }
    while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
      value += text[i];
      i += 1;
    }
    fields.push(value);
    if (text[i] === ',') { i += 1; continue; }
    break;
  }
  if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
  else if (text[i] === '\r' || text[i] === '\n') i += 1;
  return { fields, i };
}

/**
 * The Set of key values in a CSV with a header row. PURE — the caller reads the bytes.
 *
 * `keyColumn` must appear in the header (refused by NAME, not by position, so a
 * reordered source file still works and a renamed column is caught here rather than
 * silently producing an empty cohort). Every value is `String()`-ed because the DB
 * driver hands back a bigint for an integer PK while the CSV always reads text: the
 * comparison must be by MEANING, never by the driver's transient JS type.
 *
 * A UTF-8 BOM on the first header cell is stripped: a BOM-prefixed `\ufeffid` would
 * otherwise not equal `id`, and the operator's `--source-key=id` would be refused as
 * "absent from the header" for a file whose header plainly reads `id`.
 */
function readSourceKeys(csvText, keyColumn) {
  if (typeof csvText !== 'string') throw new Error('readSourceKeys: csvText must be a string');
  if (typeof keyColumn !== 'string' || keyColumn === '') throw new Error('readSourceKeys: keyColumn must be a non-empty string');
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const header = parseCsvRecord(text, 0).fields;
  const col = header.indexOf(keyColumn);
  if (col < 0) {
    throw new Error(`readSourceKeys: --source-key ${JSON.stringify(keyColumn)} is not a column of the source header (${JSON.stringify(header.join(','))})`);
  }
  const keys = new Set();
  let i = header.length === 0 ? text.length : parseCsvRecord(text, 0).i;
  while (i < text.length) {
    const rec = parseCsvRecord(text, i);
    i = rec.i;
    // A blank trailing line (a file that ends in a newline) is not a record.
    if (rec.fields.length === 1 && rec.fields[0] === '') continue;
    keys.add(String(rec.fields[col] === undefined ? '' : rec.fields[col]));
  }
  return keys;
}

/**
 * Draw the cohort from keys the source STILL CARRIES. PURE — the caller supplies the
 * ordered DB keys and the source key set.
 *
 * `cohort` = the FIRST `count` keys of `orderedDbKeys` that are in `sourceKeySet`;
 * `unreachable` = the keys encountered BEFORE the cohort filled that are NOT in the set
 * (i.e. the rows a perturbation of this cohort would leave stranded: a retired key's DB
 * row is never revisited by a step whose guard reads the source, so its bracket can
 * never heal it — the address_points key 16487 failure of 2026-10-03).
 *
 * `unreachable` is clipped at the moment the cohort fills: keys after the cut are not
 * part of this bracket's population, and reporting them would overstate what the run
 * did not check. Fewer than `count` reachable keys is a refusal, never a short cohort —
 * a short cohort makes the --run "wrote >= 1" and heal claims describe a population the
 * source cannot support.
 */
function selectCohort(orderedDbKeys, sourceKeySet, count) {
  if (!Array.isArray(orderedDbKeys)) throw new Error('selectCohort: orderedDbKeys must be an array');
  if (!(sourceKeySet instanceof Set)) throw new Error('selectCohort: sourceKeySet must be a Set');
  if (!Number.isInteger(count) || count <= 0) throw new Error(`selectCohort: count must be a positive integer (got ${JSON.stringify(count)})`);
  const keys = orderedDbKeys.map((k) => String(k));
  const cohort = [];
  const unreachable = [];
  for (const k of keys) {
    if (cohort.length >= count) break;
    if (sourceKeySet.has(k)) cohort.push(k);
    else unreachable.push(k);
  }
  if (cohort.length < count) {
    throw new Error(`selectCohort: only ${cohort.length} of ${keys.length} ordered DB key(s) are present in the source; --count=${count} cannot be drawn from keys the source still carries`);
  }
  return { cohort, unreachable };
}

/**
 * The DEFAULT (unflagged) source check. PURE.
 *
 * The pre-2026-10-03 behaviour is kept for callers that legitimately cannot reach the
 * source bytes (a historical re-run, a test), but it is no longer SILENT: a key the
 * source retired cannot be healed by any step whose guard reads that source, and a run
 * that skipped the check must say so in its transcript. The set is every DB key — so
 * `unreachable` is empty and the cohort is exactly the first `count` keys, unchanged.
 */
function defaultSourceCheck(orderedDbKeys, count) {
  const { cohort, unreachable } = selectCohort(orderedDbKeys, new Set(orderedDbKeys.map((k) => String(k))), count);
  return { checked: false, sourcePath: null, sourceKeys: null, cohort, unreachable };
}

/** The two optional flags: both or neither. Pure (no fs — `--source-csv` existence is checked by the caller). */
function sourceFlags(args) {
  const csv = args.sourceCsv === null || args.sourceCsv === undefined || args.sourceCsv === true || args.sourceCsv === '' ? null : args.sourceCsv;
  const key = args.sourceKey === null || args.sourceKey === undefined || args.sourceKey === true || args.sourceKey === '' ? null : args.sourceKey;
  if ((csv === null) !== (key === null)) {
    throw new Error('--source-csv and --source-key must be given together (a source file without the key column, or a key column with no file, would silently decide nothing); pass both or neither');
  }
  if (csv !== null && typeof csv !== 'string') throw new Error('--source-csv must be a path');
  if (key !== null && typeof key !== 'string') throw new Error('--source-key must be a header column name');
  return { sourceCsv: csv, sourceKey: key };
}

/**
 * The `{checked, sourcePath, sourceKeys, cohort, unreachable}` decision for a mode that
 * has already read the DB's ordered keys. PURE — the caller reads the DB and the file.
 *
 * `sourcePath` is `path.resolve`d for the transcript so the operator sees WHICH file was
 * consulted, not the relative spelling they typed.
 */
function sourceCheckedCohort({ orderedDbKeys, count, sourceCsv, sourceKey, sourceCsvText }) {
  if (sourceCsv === null || sourceCsv === undefined) return defaultSourceCheck(orderedDbKeys, count);
  if (typeof sourceCsvText !== 'string') throw new Error('sourceCheckedCohort: sourceCsvText is required when sourceCsv is given');
  const sourceKeys = readSourceKeys(sourceCsvText, sourceKey);
  const { cohort, unreachable } = selectCohort(orderedDbKeys, sourceKeys, count);
  return { checked: true, sourcePath: path.resolve(REPO_ROOT, sourceCsv), sourceKeys, cohort, unreachable };
}

/** The one-line verdict + up to 10 unreachable keys. Pure. Shared by every cohort-using mode. */
function sourceCheckLines(mode, { checked, sourcePath, cohort, unreachable }) {
  if (!checked) {
    return ['[cohort:' + mode + '] cohort NOT checked against the source — a key the source retired cannot be healed'];
  }
  const lines = [`[cohort:${mode}] source-checked: ${cohort.length} reachable, ${unreachable.length} unreachable (absent from ${sourcePath})`];
  if (unreachable.length > 0) {
    lines.push(`[cohort:${mode}] unreachable key(s), up to ${MAX_UNREACHABLE_PRINTED} of ${unreachable.length}: ${unreachable.slice(0, MAX_UNREACHABLE_PRINTED).join(', ')}`);
  }
  return lines;
}

/**
 * The cohort SELECT when the cohort keys come from the source check: `key = ANY($1)`
 * with ALL `--where` matches in `--order` order (NO LIMIT — the keys are a parameter, not
 * a predicate, so the ORDER and the population are the caller's; keeping `LIMIT` here
 * would re-introduce the very re-derivation this path exists to avoid).
 * The key list is passed as a bind array, so nothing is textually interpolated. Pure.
 *
 * When the source check is ABSENT the ordered-key read is cohortSelect as before — the
 * unchanged ordering/limit path.
 */
function cohortRowsSql(o, checked, cohortKeys) {
  // R-DP: pair mode reads EVERY row the cohort keys hold (a key holds many rows).
  if (isPairMode(o)) {
    if (!Array.isArray(cohortKeys) || cohortKeys.length === 0) throw new Error('cohortRowsSql: the pair-mode cohort must be a non-empty key list');
    return `SELECT t."${o.key}", t."${o.column}" FROM ${o.table} t WHERE t."${o.key}" = ANY($1)`;
  }
  if (!checked) return cohortSelect(o);
  if (!Array.isArray(cohortKeys) || cohortKeys.length === 0) throw new Error('cohortRowsSql: the source-checked cohort must be a non-empty key list');
  return `SELECT ${selectCols(o)} FROM ${o.table} t WHERE ${o.where} AND t."${o.key}" = ANY($1) ORDER BY ${o.order}`;
}

// ── DB plumbing ──────────────────────────────────────────────────────────────
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`ingestor-forced-cohort: ${name} is not set — refusing to guess a database target`);
  return v;
}

/**
 * F1 (MEDIUM — cloud risk). PURE: throw unless the RESOLVED TARGET DESCRIPTION names a
 * loopback host. See `LOCAL_HOST_RE` for why `expectDatabase` alone was not sufficient.
 *
 * The argument is `pool.buildoTarget.description` (resolve-db redacts the password, so
 * this text is safe to log inside the refusal). Returns the description on success so a
 * caller can log it, and NEVER inspects the env directly — the whole point is that the
 * decision is made on what the resolver actually RESOLVED, not on what we hoped it would.
 */
function assertLocalTarget(description) {
  if (typeof description !== 'string' || !LOCAL_HOST_RE.test(description)) {
    throw new Error(
      `REFUSING: the resolved DB target ${JSON.stringify(description)} is not a loopback host ` +
      `(${LOCAL_HOST_RE}). This bracket PERTURBS and RESTORES real rows and is a LOCAL dev ` +
      `instrument only — a cloud/shared target (e.g. SUPABASE_DATABASE_URL) is NOT acceptable, ` +
      `even though both databases are named "postgres". Point DATABASE_URL at ` +
      `127.0.0.1:54322 and re-run, or run without the cloud var set.`,
    );
  }
  return description;
}

/**
 * Build the pool and PROVE it is local before returning it. F1.
 *
 * The assertion runs immediately after the pool object exists and therefore BEFORE any
 * mode's first query: `createResolvedPool` is synchronous and pool-less (it wraps
 * `pool.connect`), so this costs no connection and touches no database. Every connecting
 * mode — plan/backup/run/restore — goes through here, so there is no path to a query
 * that skipped it.
 */
function makePool(label) {
  // Default migration floor (resolve-db): scripts/migrate.js is the ONE sanctioned floor
  // exemption. This bracket has no reason to run below it. `expectDatabase` pins the
  // target so a half-set PG_* triple cannot silently land on the pre-cutover DB the
  // resolver exists to refuse.
  const pool = createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
  // F1: `expectDatabase: 'postgres'` is satisfied by BOTH the cloud DB and the local one,
  // so the pin above cannot by itself keep a cloud target out. Refuse anything that is not
  // loopback, on the RESOLVED description, before the caller can issue a single query.
  assertLocalTarget(pool.buildoTarget && pool.buildoTarget.description);
  return pool;
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

/**
 * The cohort rows as `[{key, value}]` from a `SELECT key, column` result. Pure.
 * R-DP: in pair mode each (key, column) PAIR is one entry (`JSON.stringify([key, column])` →
 * present), so the same value-map comparison checks the pair SET — a key holds many rows there.
 * JSON, not `"k|c"`: a value containing `|` cannot alias another pair (Spec 08 output panel round 1).
 */
function pairId(k, c) {
  return JSON.stringify([k === null || k === undefined ? null : String(k), c === null || c === undefined ? null : String(c)]);
}
function rowsToKeyValues(rows, key, column, pairMode = false, deriveColumn = null) {
  if (pairMode) return rows.map((r) => ({ key: pairId(r[key], r[column]), value: 'present' }));
  // R-ET: the value is the (column, derive column) PAIR, JSON-encoded so neither can alias the other.
  if (deriveColumn) return rows.map((r) => ({ key: r[key], value: pairId(r[column], r[deriveColumn]) }));
  return rows.map((r) => ({ key: r[key], value: r[column] }));
}

/** rowsToKeyValues for the bracket's own options (pair / derived / plain). Pure. */
function cohortEntries(rows, o) {
  return rowsToKeyValues(rows, o.key, o.column, isPairMode(o), isDerivedMode(o) ? o.deriveColumn : null);
}

/**
 * The golden's pre-run state. PURE OF WRITES — reads only. Returns
 * `{ existed, content }` for a file that exists, or `{ existed: false, content: null }`
 * for one the harness is about to create. `content` is read as a BUFFER (never `utf8`),
 * so restoring is a byte-exact write with no re-encoding.
 */
function readGoldenState(absPath) {
  if (typeof absPath !== 'string' || absPath === '') throw new Error('readGoldenState: absPath must be a non-empty string');
  if (!fs.existsSync(absPath)) return { existed: false, content: null };
  return { existed: true, content: fs.readFileSync(absPath) };
}

/**
 * Put the golden back to its pre-run state. Returns the action taken, or `null` when
 * nothing needed doing. PURE of decisions — `before` comes from `readGoldenState`.
 *
 * The two shapes the brief names:
 *   - the file EXISTED: write the captured bytes back;
 *   - the file did NOT exist (untracked, created by the harness on this run): DELETE it,
 *     so a failed claim leaves no new artifact for the next `git status` to mistake for
 *     a sanctioned capture.
 * Restoring is deliberately a no-op in BOTH directions when nothing changed: we do not
 * delete a pre-existing file that is still identical, and we do not rewrite bytes that are
 * already there (a pointless mtime bump is a diff-churn hazard).
 */
function restoreGoldenState(absPath, before) {
  if (typeof absPath !== 'string' || absPath === '') throw new Error('restoreGoldenState: absPath must be a non-empty string');
  if (!before || typeof before !== 'object') throw new Error('restoreGoldenState: before must come from readGoldenState');
  if (before.existed) {
    if (!fs.existsSync(absPath)) {
      fs.writeFileSync(absPath, before.content);
      return 'recreated';
    }
    const current = fs.readFileSync(absPath);
    if (current.equals(before.content)) return null;
    fs.writeFileSync(absPath, before.content);
    return 'rewrote';
  }
  if (fs.existsSync(absPath)) {
    fs.rmSync(absPath);
    return 'deleted';
  }
  return null;
}

/** The repo-relative spelling of an absolute path, for the transcript. Pure. */
function toRepoPath(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

/** The standalone undo an operator can run by hand while the bracket is suspended. Pure. */
function recoveryCommand(o) {
  return 'node -r dotenv/config scripts/analysis/ingestor-forced-cohort.js --restore'
    + ` --table=${o.table} --key=${o.key} --column=${o.column} --op=${JSON.stringify(o.opRaw)}`
    + ` --count=${o.count} --where=${JSON.stringify(o.where)} --order=${JSON.stringify(o.order)}`
    + ` --backup-table=${o.backupTable}`
    + (isDerivedMode(o)
      ? ` --derive-column=${o.deriveColumn} --derived-table=${o.derivedTable} --derived-key=${o.derivedKey}`
        + ` --derived-key-prefix=${JSON.stringify(o.derivedKeyPrefix || '')} --derived-natural-key=${o.derivedNaturalKey.join(',')}`
      : '');
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
 * Resolve the cohort and the value set the whole bracket reasons about. Used by --plan,
 * --backup and --run. Reads only.
 *
 * TWO paths, ONE population decision:
 *   - WITHOUT `--source-csv`: the cohort is the FIRST N eligible rows by --order
 *     (`cohortSelect`), unchanged from before this ruling;
 *   - WITH `--source-csv`/`--source-key`: read EVERY key matching --where in --order
 *     order (keys only), parse the source CSV once, and draw the cohort with
 *     `selectCohort` from keys the source STILL CARRIES. The DB rows are then re-read —
 *     projections only, keyed on the cohort — so `--plan`'s value print and `--backup`'s
 *     before-image are exactly the keys the bracket will perturb.
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
  const sourceInfo = await sourceCheckedFor(pool, o);
  const keys = sourceInfo.cohort;
  assertRestoreKeys(keys);
  const pair = isPairMode(o);
  const rows = await readOnlyQuery(pool, cohortRowsSql(o, sourceInfo.checked, keys), sourceInfo.checked || pair ? [keys] : undefined);
  // R-DP: a pair-mode key holds >= 1 row, so the one-row-per-key determinism check becomes
  // "every cohort key still holds a row".
  if (pair ? rows.length < keys.length : rows.length !== keys.length) {
    throw new Error(`refusing: the cohort SELECT returned ${rows.length} row(s), expected ${pair ? `>= ${keys.length}` : keys.length} — --order is not deterministic over --where`);
  }
  return { eligible, keys, rows: cohortEntries(rows, o), sourceInfo };
}

/**
 * The source-check decision for a mode, reading the DB's ordered keys and (when given) the
 * source CSV. Reads only. Used by resolveCohort so --plan/--backup/--run all draw the SAME
 * cohort; --restore derives its keys from the before-image instead (see restore()).
 */
async function sourceCheckedFor(pool, o) {
  if (o.sourceCsv === null || o.sourceCsv === undefined) {
    // The unflagged path still needs the ordered keys (the WARN line prints reachable/
    // unreachable for the SAME population the cohort is drawn from), so one bounded
    // key-only read replaces the projection read cohortSelect would have made.
    const ordered = (await readOnlyQuery(pool, orderedKeysSql(o, { bounded: true }))).map((r) => r[o.key]);
    return defaultSourceCheck(ordered, o.count);
  }
  const ordered = (await readOnlyQuery(pool, orderedKeysSql(o, { bounded: false }))).map((r) => r[o.key]);
  const sourceCsvText = fs.readFileSync(path.resolve(REPO_ROOT, o.sourceCsv), 'utf8');
  return sourceCheckedCohort({
    orderedDbKeys: ordered, count: o.count, sourceCsv: o.sourceCsv, sourceKey: o.sourceKey, sourceCsvText,
  });
}

/** The transcript lines for a mode's source check, appended to `lines`. Pure. */
function reportSourceCheck(mode, sourceInfo, log) {
  for (const line of sourceCheckLines(mode, sourceInfo)) log(line);
}

/** The cohort's CURRENT values, read back by key. Reads only. */
async function liveCohortValues(pool, o, keys) {
  const rows = await readOnlyQuery(pool, `SELECT ${selectCols(o)} FROM ${o.table} t WHERE t."${o.key}" = ANY($1)`, [keys]);
  return cohortEntries(rows, o);
}

/** The before-image's rows, read back by key. Reads only. */
async function backupCohortValues(pool, o) {
  return cohortEntries(await readOnlyQuery(pool, backupSelectSql(o)), o);
}

/**
 * The before-image's distinct cohort KEYS. Reads only. --restore needs the keys, not the
 * value entries: in pair mode an entry is a JSON `[key, column]` pair id, never a key.
 */
async function backupCohortKeys(pool, o) {
  const rows = await readOnlyQuery(pool, `SELECT DISTINCT t."${o.key}" FROM ${o.backupTable} t`);
  return rows.map((r) => r[o.key]);
}

/**
 * R-DP safety: run the three catalog reads and refuse pair mode by name. Reads only. Called at
 * --backup and again at --run before the DELETE.
 */
async function assertPairModeSafe(pool, o) {
  if (!isPairMode(o)) return;
  const read = async (kind) => (await readOnlyQuery(pool, pairSafetySql(kind), [o.table]))[0];
  const verdict = pairModeRefusal({ inboundFks: await read('inboundFks'), deleteTriggers: await read('deleteTriggers'), generatedColumns: await read('generatedColumns') });
  if (!verdict.ok) throw new Error(verdict.reason);
}

/** R-DP: the before-image's columns, in attnum order. Reads only. */
async function backupColumns(pool, o) {
  return (await readOnlyQuery(pool, backupColumnsSql(), [o.backupTable])).map((r) => r.c);
}

/** Does `table` resolve on this connection? Reads only. */
async function tableExists(pool, table) {
  return (await readOnlyQuery(pool, 'SELECT to_regclass($1) AS r', [table]))[0].r !== null;
}

/** R-ET: the cohort's LIVE derived rows `{dk, nk}`. Reads only. */
async function liveDerivedRows(pool, o, keys) {
  return readOnlyQuery(pool, derivedRowsSql(o), [derivedKeysFor(o, keys)]);
}

/** R-ET: the derived before-image rows `{dk, nk}`. Reads only. */
async function derivedSnapshotRows(pool, o) {
  return readOnlyQuery(pool, derivedSnapshotSelectSql(o));
}

/** R-ET: do the cohort's live derived rows equal the derived before-image? Reads only. */
async function derivedMatchesSnapshot(pool, o, keys) {
  return sameValueMap(canonicalValueMap(derivedEntries(await derivedSnapshotRows(pool, o))), canonicalValueMap(derivedEntries(await liveDerivedRows(pool, o, keys))));
}

/**
 * R-ET: delete the derived rows the cohort gained since the before-image (live minus snapshot),
 * through deleteInsertedDerived — one transaction, exact RETURNING set or ROLLBACK. A prior row that
 * VANISHED cannot be recreated by this bracket (the snapshot holds identities, not rows): it is reported
 * and the caller's verification fails. Returns `{deleted, removed}`.
 */
async function restoreDerived(pool, o, keys) {
  const { inserted, removed } = derivedInsertedRows({ before: await derivedSnapshotRows(pool, o), after: await liveDerivedRows(pool, o, keys) });
  const client = await pool.connect();
  try {
    return { deleted: await deleteInsertedDerived(client, o, derivedKeysFor(o, keys), inserted), removed };
  } finally {
    client.release();
  }
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
    reportSourceCheck('plan', cohort.sourceInfo, console.log);
    console.log(`[cohort:plan] eligible=${cohort.eligible} cohort=${cohort.keys.length} (where ${JSON.stringify(o.where)}; order ${o.order})`);
    console.log(`[cohort:plan] whole-table hash over (${[o.key, o.column].join(', ')}): ${whole}`);
    for (const r of cohort.rows) console.log(`[cohort:plan]   ${o.key}=${r.key} ${o.column}=${JSON.stringify(r.value)}`);
    const widths = await resolveFitWidths(pool, o, 'plan');
    if (appendColumns(o).length > 0 && cohort.rows.length > 0) {
      const first = cohort.rows[0];
      let v = Array.isArray(first.value) ? first.value : [first.value];
      if (isDerivedMode(o) && typeof first.value === 'string') { try { const p = JSON.parse(first.value); if (Array.isArray(p)) v = p; } catch { /* a plain value */ } }
      appendColumns(o).forEach((c, i) => console.log(`[cohort:plan]   fitted ${c} of ${o.key}=${first.key}: ${JSON.stringify(fittedPreview(v[i], widths[c], opBindValue(o.opRaw)))}`));
    }
    if (isDerivedMode(o)) {
      const d = await liveDerivedRows(pool, o, cohort.keys);
      console.log(`[cohort:plan] derived ${o.derivedTable}: ${d.length} existing row(s) for the cohort's ${cohort.keys.length} ${o.derivedKey} value(s); snapshot ${derivedSnapshotTable(o)} (R-ET)`);
    }
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
    if (isDerivedMode(o) && (await tableExists(pool, derivedSnapshotTable(o)))) {
      throw new Error(`the derived before-image ${derivedSnapshotTable(o)} already exists — refusing to overwrite it; pick a fresh <yyyymmddthhmmz> name`);
    }
    await assertPairModeSafe(pool, o);
    await resolveFitWidths(pool, o, 'backup');
    const cohort = await resolveCohort(pool, o);
    reportSourceCheck('backup', cohort.sourceInfo, console.log);
    await pool.query(backupCreateSql(o), [cohort.keys]);
    // R-DP: a pair-mode key holds many rows; the pair is the before-image's identity.
    await pool.query(isPairMode(o)
      ? `ALTER TABLE ${o.backupTable} ADD PRIMARY KEY ("${o.key}", "${o.column}")`
      : `ALTER TABLE ${o.backupTable} ADD PRIMARY KEY ("${o.key}")`);
    const copied = await backupCohortValues(pool, o);
    const ok = backupPrecondition({ exists: true, liveValues: cohort.rows, backupValues: copied });
    if (!ok.ok) {
      throw new Error(`the copy ${o.backupTable} does not hold the cohort's current values — ${ok.reason}; DROP ${o.backupTable} and investigate`);
    }
    console.log(`[cohort:backup] wrote ${o.backupTable} — ${cohort.keys.length} row(s) of (${o.key}, ${o.column}${isDerivedMode(o) ? `, ${o.deriveColumn}` : ''})`);
    if (isDerivedMode(o)) {
      // R-ET: the derived before-image — the cohort's derived natural keys, verified against live.
      await pool.query(derivedSnapshotCreateSql(o), [derivedKeysFor(o, cohort.keys)]);
      const snap = await derivedMatchesSnapshot(pool, o, cohort.keys);
      if (!snap.ok) throw new Error(`the copy ${derivedSnapshotTable(o)} does not hold the cohort's derived rows — ${snap.reason}; DROP it and investigate`);
      console.log(`[cohort:backup] wrote ${derivedSnapshotTable(o)} — ${(await derivedSnapshotRows(pool, o)).length} derived natural key(s) of ${o.derivedTable}`);
    }
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
  const res = await pool.query(restoreSql(o, isPairMode(o) ? await backupColumns(pool, o) : undefined), [keys]);
  return res.rowCount;
}

// ── --restore ─────────────────────────────────────────────────────────────────
/**
 * The standalone undo. Prints the number of rows restored and the cohort's re-read values.
 *
 * The cohort is the BEFORE-IMAGE's keys, never `resolveCohort`: a restore runs precisely
 * when the bracket's own draw is suspect (the address_points 16487 incident), and
 * re-drawing it from `--where`/`--order` would restore a DIFFERENT population on the one
 * run that must put back exactly what was moved. The `--source-csv` check still runs (the
 * operator asked for it), but it only REPORTS: a key the source has retired is exactly
 * the row this mode exists to carry back, so it is listed, not refused.
 */
async function restore(o) {
  const pool = makePool('ingestor-forced-cohort:restore');
  console.log(`[cohort:restore] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    if (!(await tableExists(pool, o.backupTable))) {
      throw new Error(`--backup-table ${o.backupTable} does not exist — nothing to restore from`);
    }
    const backupRows = await backupCohortValues(pool, o);
    const keys = isPairMode(o) ? await backupCohortKeys(pool, o) : backupRows.map((r) => r.key);
    assertRestoreKeys(keys);
    if (o.sourceCsv !== null && o.sourceCsv !== undefined) {
      const sourceCsvText = fs.readFileSync(path.resolve(REPO_ROOT, o.sourceCsv), 'utf8');
      const sourceKeys = readSourceKeys(sourceCsvText, o.sourceKey);
      reportSourceCheck('restore', {
        checked: true,
        sourcePath: path.resolve(REPO_ROOT, o.sourceCsv),
        cohort: keys.filter((k) => sourceKeys.has(String(k))),
        unreachable: keys.filter((k) => !sourceKeys.has(String(k))),
      }, console.log);
    } else {
      reportSourceCheck('restore', { checked: false }, console.log);
    }
    const restored = await restoreFromBackup(pool, o, keys);
    const after = await liveCohortValues(pool, o, keys);
    const check = backupPrecondition({ exists: true, liveValues: after, backupValues: backupRows });
    console.log(`[cohort:restore] restored ${restored} row(s) from ${o.backupTable}`);
    console.log(`[cohort:restore] cohort ${check.ok ? 'matches the before-image (OK)' : `MISMATCH — ${check.reason}`}`);
    if (!check.ok) process.exitCode = 1;
    if (isDerivedMode(o)) {
      if (!(await tableExists(pool, derivedSnapshotTable(o)))) throw new Error(`the derived before-image ${derivedSnapshotTable(o)} does not exist — cannot tell inserted derived rows from prior ones`);
      const d = await restoreDerived(pool, o, keys);
      const dcheck = await derivedMatchesSnapshot(pool, o, keys);
      console.log(`[cohort:restore] derived: deleted ${d.deleted} inserted row(s) from ${o.derivedTable}${d.removed.length ? `; ${d.removed.length} prior row(s) VANISHED and cannot be recreated` : ''}`);
      console.log(`[cohort:restore] derived ${dcheck.ok ? 'matches its before-image (OK)' : `MISMATCH — ${dcheck.reason}`}`);
      if (!dcheck.ok) process.exitCode = 1;
    }
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
 *      exit 1 on any failed claim, exit 2 if the restore failed OR did not verify (the
 *      re-read mismatched) — once `perturbed`, a restore that is not PROVEN correct is an
 *      exit-2 condition — print the exact `--restore` command on that path too, and close
 *      the pool (no process.exit()).
 *
 * 0. every connecting mode refuses a non-loopback target FIRST (F1, `assertLocalTarget`,
 *    called from `makePool`, on the resolved description and before any query).
 */
/**
 * R-DN: gate G #38's own per-table count for this run — `countPathDecision` over the step's
 * descriptor and the capture the harness just wrote. The descriptor sits beside the step
 * (`<step>.descriptor.json`, the fleet convention); a missing one refuses by name.
 */
/**
 * R-DN cross-check (Spec 08 output panel round 1, 2026-10-18): `--count-path` must be the
 * `count_path` the slug's own `cohort.json` declares for `--table` — never a key chosen at the
 * command line that gate G #38 would not read for that table. PURE over the parsed cohort.json
 * (`null` when the file is absent); fails closed when no target names the table.
 */
function countPathCohortDecision(cohortDoc, { table, countPath }) {
  if (countPath === null || countPath === undefined) return { ok: true };
  const targets = cohortDoc && Array.isArray(cohortDoc.targets) ? cohortDoc.targets : null;
  if (!targets) return { ok: false, reason: `--count-path=${countPath}: the slug has no cohort.json targets[] — declare the ${table} target (count_path) first (R-DN)` };
  const hits = targets.filter((t) => t && t.table === table);
  if (hits.length !== 1) return { ok: false, reason: `--count-path=${countPath}: cohort.json has ${hits.length} target(s) for table ${table}, expected exactly 1 (R-DN)` };
  if (hits[0].count_path !== countPath) return { ok: false, reason: `--count-path=${countPath} != cohort.json's count_path ${JSON.stringify(hits[0].count_path)} for table ${table} (R-DN)` };
  return { ok: true };
}

/** The slug's cohort.json beside `--out` (`docs/reports/golden/<slug>/cohort.json`), parsed, or null. */
function readCohortDoc(outAbs) {
  const p = path.join(path.dirname(path.dirname(outAbs)), 'cohort.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

async function countPathFromCapture(o, outAbs) {
  const descAbs = path.resolve(REPO_ROOT, o.step.replace(/\.js$/, '.descriptor.json'));
  if (!fs.existsSync(descAbs)) return { ok: false, reason: `no descriptor beside ${o.step}` };
  const descriptor = JSON.parse(fs.readFileSync(descAbs, 'utf8'));
  const doc = JSON.parse(fs.readFileSync(outAbs, 'utf8'));
  const { countPathDecision } = await import(require('url').pathToFileURL(path.join(REPO_ROOT, 'scripts/analysis/gates/captures.mjs')).href);
  return countPathDecision(descriptor, { file: o.out, doc }, o.countPath);
}

async function run(o) {
  // Assembled FIRST, from pure inputs, so a bad --capture-arg refuses before a pool is even
  // constructed — a mistyped passthrough must cost seconds and touch NO database.
  const argv = nodeArgv(o);
  const pool = makePool('ingestor-forced-cohort:run');
  console.log(`[cohort:run] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  console.log(`[cohort:run] table=${o.table} key=${o.key} column=${o.column} op=${JSON.stringify(o.opRaw)} count=${o.count}`);
  console.log(`[cohort:run] step=${o.step} chain=${o.chain} out=${o.out}`);
  // The golden's PRE-RUN bytes, captured only for a run that will SPAWN the harness. A
  // failed claim (any assert/heal failure or a non-zero harness exit) must leave the
  // repository as it found it: the harness writes --out with --overwrite, so without this
  // the bracket converts a failed claim into a COMMITTED state change (the 2026-10-03
  // incident left a 199-row capture in docs/reports/golden/address_points/post/sources.json).
  // Captured BEFORE makePool so a refusal can never have written anything.
  const outAbs = resolveCaptureOut(o.out);
  const cohortCheck = countPathCohortDecision(o.countPath ? readCohortDoc(outAbs) : null, { table: isDerivedMode(o) ? o.derivedTable : o.table, countPath: o.countPath });
  if (!cohortCheck.ok) throw new Error(`refusing: ${cohortCheck.reason}`);
  const goldenBefore = readGoldenState(outAbs);
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
  let derivedBefore = [];
  let restoreFailed = false;
  installSignalHandlers(sig);
  try {
    const res = await pipeline.withAdvisoryLock(pool, COHORT_LOCK_ID, async () => {
      if (!(await tableExists(pool, o.backupTable))) {
        throw new Error(`--backup-table ${o.backupTable} does not exist — take --backup first; refusing to perturb without a before-image`);
      }
      await assertPairModeSafe(pool, o);
      const fitWidths = await resolveFitWidths(pool, o, 'run');
      const cohort = await resolveCohort(pool, o);
      cohortKeys = cohort.keys;
      reportSourceCheck('run', cohort.sourceInfo, console.log);
      backupRows = await backupCohortValues(pool, o);
      const pre = backupPrecondition({ exists: true, liveValues: cohort.rows, backupValues: backupRows });
      if (!pre.ok) throw new Error(pre.reason);
      console.log(`[cohort:run] before-image verified: ${o.backupTable} covers ${backupRows.length} key(s) == live cohort`);
      if (isDerivedMode(o)) {
        // R-ET: the derived before-image must describe the derived rows the run starts from.
        if (!(await tableExists(pool, derivedSnapshotTable(o)))) throw new Error(`the derived before-image ${derivedSnapshotTable(o)} does not exist — take --backup first`);
        const snap = await derivedMatchesSnapshot(pool, o, cohortKeys);
        if (!snap.ok) throw new Error(`the derived before-image does not describe the live derived rows — ${snap.reason}; re-take --backup`);
        derivedBefore = await derivedSnapshotRows(pool, o);
        console.log(`[cohort:run] derived before-image verified: ${derivedSnapshotTable(o)} holds ${derivedBefore.length} natural key(s) == live`);
      }

      // (4) the perturbation, ONE committed transaction.
      abortIfInterrupted(sig);
      const client = await pool.connect();
      let perturbedRows = 0;
      try {
        await client.query('BEGIN');
        if (isPairMode(o)) {
          // R-DP: DELETE every row the cohort keys hold; it commits only if the RETURNING
          // (key, column) pair set EQUALS the before-image's pair set (a concurrent writer
          // would otherwise be deleted unimaged), else ROLLBACK.
          const del = await client.query(perturbationDeleteSql(o), [cohortKeys]);
          perturbedRows = del.rowCount;
          const gone = sameValueMap(canonicalValueMap(backupRows), canonicalValueMap(rowsToKeyValues(del.rows, o.key, o.column, true)));
          if (perturbedRows !== backupRows.length || !gone.ok) {
            throw new Error(`perturbation deleted ${perturbedRows} row(s) whose pair set is not the before-image's ${backupRows.length} (${gone.ok ? 'duplicate pairs' : gone.reason}) — ${o.table} changed under the bracket; rolled back`);
          }
        } else {
          const bind = opBindValue(o.opRaw);
          const setExpr = perturbationSetExpr(o.op, o.column, o.deriveColumn, fitWidths);
          const upd = bind === null
            ? await client.query(`UPDATE ${o.table} t SET ${setExpr} WHERE t."${o.key}" = ANY($1)`, [cohortKeys])
            : await client.query(`UPDATE ${o.table} t SET ${setExpr} WHERE t."${o.key}" = ANY($1)`, [cohortKeys, bind]);
          perturbedRows = upd.rowCount;
          if (perturbedRows !== cohortKeys.length) {
            throw new Error(`perturbation wrote ${perturbedRows} row(s), expected ${cohortKeys.length} — a cohort row is missing from ${o.table}`);
          }
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
      const countPathResult = o.countPath ? await countPathFromCapture(o, outAbs) : null;
      const claim = isDerivedMode(o)
        ? derivedClaim({
          countPathResult, liveValues: after, backupValues: backupRows,
          derivedKeys: derivedKeysFor(o, cohortKeys), before: derivedBefore, after: await liveDerivedRows(pool, o, cohortKeys),
        })
        : captureClaim({
          recordsUpdated: summary.records_updated,
          recordsNew: summary.records_new,
          liveValues: after,
          backupValues: backupRows,
          countPathResult,
        });
      const written = countPathResult && countPathResult.ok
        ? countPathResult.n
        : (Number(summary.records_updated) || 0) + (Number(summary.records_new) || 0);
      if (o.countPath) console.log(`[cohort:run] count_path ${o.countPath}: ${countPathResult.ok ? countPathResult.n : countPathResult.reason}`);
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
        if (isDerivedMode(o)) {
          // R-ET: delete exactly the derived rows the run inserted; a RETURNING mismatch rolls back and throws (exit 2).
          const d = await restoreDerived(pool, o, cohortKeys);
          console.log(`[cohort:run] restore: deleted ${d.deleted} inserted ${o.derivedTable} row(s)`);
        }
      } else {
        console.log('[cohort:run] this run never perturbed; the table is left as found');
      }
      const after = await liveCohortValues(pool, o, cohortKeys);
      const primaryCheck = backupPrecondition({ exists: true, liveValues: after, backupValues: backupRows });
      // R-ET: a perturbed derived run is restored only when the derived rows match their before-image too.
      const check = primaryCheck.ok && isDerivedMode(o) && perturbed ? await derivedMatchesSnapshot(pool, o, cohortKeys) : primaryCheck;
      restored = check.ok;
      console.log(`[cohort:run] POST-RESTORE cohort ${restored ? 'matches the before-image (OK)' : `MISMATCH — ${check.reason}`}`);
    } catch (err) {
      console.error(`[cohort:run] RESTORE FAILED: ${err.message}`);
      console.error(`[cohort:run] recover by hand with: ${recoveryCommand(o)}`);
      restored = false;
      restoreFailed = true;
    }
    // F2 (LOW-MED). The check above can also fail WITHOUT throwing: `restoreFromBackup`
    // returns cleanly and the re-read simply MISMATCHES the before-image (a writer that
    // touched the cohort after our restore, a backup that went stale, an `IS DISTINCT
    // FROM` that matched nothing). That path used to fall through to `exit 1` — the code
    // reserved for "the claim failed but the table is fine" — which told the operator the
    // opposite of the truth. Once we have PERTURBED, an unverified restore is an exit-2
    // condition, and the operator needs the recovery command on this path exactly as much
    // as on the throwing one.
    if (perturbed && !restored) {
      restoreFailed = true;
      console.error(`[cohort:run] the cohort is NOT back to its before-image — recover by hand with: ${recoveryCommand(o)}`);
    }
    console.log(`[cohort:run] restored: ${restored}`);
    // The golden restore. `asserted` is true ONLY on a PASS; `restoreFailed` /
    // `!restored` mean the table itself is suspect. Any of those is a failed claim, and a
    // failed claim must not leave a capture the harness overwrote: the bracket is not the
    // instrument that legitimizes a changed golden, so it puts the file back.
    if (!asserted || restoreFailed || !restored) {
      const action = restoreGoldenState(outAbs, goldenBefore);
      if (action) console.log(`[cohort:run] golden restored to its pre-run bytes (${action} ${toRepoPath(outAbs)})`);
    }
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
  // R-GZ fit-to-width: fit (bounded), overflow (the Night P4 varchar(64) data_hash), refuse.
  assert(perturbationSetExpr(parseOp('append_text:x'), 'h', null, { h: 64 }) === '"h" = left("h", 64 - char_length($2)) || $2', 'R-GZ: a bounded column did not get the fitted form');
  assert(perturbationSetExpr(parseOp('append_text:x'), 's', null, { s: null }) === '"s" = "s" || $2', 'R-GZ: an unbounded column lost the plain append');
  assert(fittedPreview('a'.repeat(64), 64, ' forced').length === 64 && fittedPreview('a'.repeat(64), 64, ' forced').endsWith(' forced'), 'R-GZ: a full-width value overflowed its width');
  assert(fittedPreview('ab', 64, 'x') === 'abx', 'R-GZ: a short value was not plainly appended');
  assert(fitWidthDecision({ columns: ['c'], widths: { c: 3 }, suffix: 'abc' }).ok === false, 'R-GZ: a suffix as wide as the column was not refused');
  assert(fitWidthDecision({ columns: ['c', 'd'], widths: { c: 64, d: null }, suffix: 'x' }).fitted.join() === 'c', 'R-GZ: fitWidthDecision fitted the wrong columns');

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
  // R-DN: --count-path replaces the step-level counters with gate G's per-table count, both ways.
  assert(captureClaim({ recordsUpdated: 0, recordsNew: 0, liveValues: live, backupValues: live, countPathResult: { ok: true, n: 7 } }).written === 7, 'captureClaim ignored a passing count_path on a zero-summary run');
  assert(captureClaim({ recordsUpdated: 9, recordsNew: 0, liveValues: live, backupValues: live, countPathResult: { ok: false, reason: 'emitted 0' } }).ok === false, 'captureClaim accepted a failing count_path because the summary was nonzero');
  assert(captureClaim({ recordsUpdated: 0, recordsNew: 0, liveValues: [{ key: 1, value: 'z' }, { key: 2, value: null }], backupValues: live, countPathResult: { ok: true, n: 7 } }).ok === false, 'captureClaim accepted an unhealed cohort under count_path');
  throws(() => validateFlags(parseArgs(['--plan', '--table=address_points', '--key=id', '--column=class_family_desc', '--op=append_text: f', '--count=20', '--where=class_family_desc IS NOT NULL', '--order=id', '--backup-table=address_points_cohort_bak_20261002t1848z', '--count-path=run_matched'])), 'validateFlags accepted --count-path outside --run');
  throws(() => validateFlags(parseArgs(['--run', '--table=address_points', '--key=id', '--column=class_family_desc', '--op=append_text: f', '--count=20', '--where=class_family_desc IS NOT NULL', '--order=id', '--backup-table=address_points_cohort_bak_20261002t1848z', '--step=scripts/load-address-points.js', '--chain=sources', '--out=docs/reports/golden/address_points/post/sources.json', '--count-path=meta.x'])), 'validateFlags accepted a dotted --count-path');

  // R-DN cross-check: --count-path must be cohort.json's count_path for --table, both ways.
  const cdoc = { targets: [{ table: 'entities', count_path: 'is_wsib_registered_corrected' }, { table: 'wsib_registry', count_path: 'run_matched' }] };
  assert(countPathCohortDecision(cdoc, { table: 'entities', countPath: 'is_wsib_registered_corrected' }).ok === true, 'countPathCohortDecision refused the declared count_path');
  assert(countPathCohortDecision(cdoc, { table: 'entities', countPath: 'run_matched' }).ok === false, 'countPathCohortDecision accepted another table\'s count_path');
  assert(countPathCohortDecision(cdoc, { table: 'parcels', countPath: 'run_matched' }).ok === false, 'countPathCohortDecision accepted a table with no target');
  assert(countPathCohortDecision(null, { table: 'entities', countPath: 'x' }).ok === false, 'countPathCohortDecision accepted a missing cohort.json');
  assert(countPathCohortDecision(null, { table: 'entities', countPath: null }).ok === true, 'countPathCohortDecision refused a run without --count-path');

  // R-DP delete_reinsert: the INSERT-only pair form, both ways.
  const pairArgs = ['--plan', '--table=parcel_address_points', '--key=parcel_id', '--column=address_point_id', '--op=delete_reinsert', '--count=3', '--where=true', '--order=t.parcel_id', '--backup-table=parcel_address_points_cohort_bak_20261018t0100z'];
  const po = validateFlags(parseArgs(pairArgs));
  assert(parseOp('delete_reinsert').kind === 'delete_reinsert' && opBindValue('delete_reinsert') === null, 'parseOp/opBindValue mishandled delete_reinsert');
  assert(isPairMode(po) === true && isPairMode(o) === false, 'isPairMode misclassified an op');
  throws(() => perturbationSetExpr(parseOp('delete_reinsert'), 'c'), 'perturbationSetExpr accepted delete_reinsert');
  assert(perturbationDeleteSql(po) === 'DELETE FROM parcel_address_points t WHERE t."parcel_id" = ANY($1) RETURNING t."parcel_id", t."address_point_id"', `perturbationDeleteSql: ${perturbationDeleteSql(po)}`);
  // R-DP safety (Spec 08 output panel round 1): the refusal decision, both ways.
  const clean = { n: 0, names: '' };
  assert(pairModeRefusal({ inboundFks: clean, deleteTriggers: clean, generatedColumns: clean }).ok === true, 'pairModeRefusal refused a clean table');
  assert(pairModeRefusal({ inboundFks: { n: 1, names: 'fk_x' }, deleteTriggers: clean, generatedColumns: clean }).ok === false, 'pairModeRefusal accepted an inbound FK');
  assert(pairModeRefusal({ inboundFks: clean, deleteTriggers: { n: 1, names: 'trg' }, generatedColumns: clean }).ok === false, 'pairModeRefusal accepted a DELETE trigger');
  assert(pairModeRefusal({ inboundFks: clean, deleteTriggers: clean, generatedColumns: { n: 1, names: 'id' } }).ok === false, 'pairModeRefusal accepted a generated/identity column');
  assert(pairModeRefusal({ inboundFks: clean, deleteTriggers: clean }).ok === false, 'pairModeRefusal accepted a missing safety read');
  assert(pairSafetySql('inboundFks').includes("contype = 'f' AND confrelid = $1::regclass"), 'pairSafetySql inboundFks');
  assert(pairSafetySql('deleteTriggers').includes('NOT tgisinternal') && pairSafetySql('deleteTriggers').includes('& 8'), 'pairSafetySql deleteTriggers');
  assert(pairSafetySql('generatedColumns').includes("attgenerated <> '' OR attidentity <> ''"), 'pairSafetySql generatedColumns');
  throws(() => pairSafetySql('other'), 'pairSafetySql accepted an unknown kind');
  assert(hashOf(po).includes('ORDER BY "parcel_id", "address_point_id"') && /ORDER BY "[a-z_]+"\)\)/.test(hashOf(o)), `pair hashOf order: ${hashOf(po)}`);
  assert(eligibleCountSql(po).includes('count(DISTINCT t."parcel_id")'), `pair eligibleCountSql is not a distinct-key count: ${eligibleCountSql(po)}`);
  assert(orderedKeysSql(po, { bounded: true }).includes('GROUP BY t."parcel_id" ORDER BY t."parcel_id" LIMIT 3'), `pair orderedKeysSql: ${orderedKeysSql(po, { bounded: true })}`);
  assert(backupCreateSql(po).includes('SELECT t.* FROM parcel_address_points t WHERE t."parcel_id" = ANY($1)'), `pair backupCreateSql is not the full row: ${backupCreateSql(po)}`);
  const rcols = ['parcel_id', 'address_point_id', 'linked_at'];
  assert(restoreSql(po, rcols).startsWith('INSERT INTO parcel_address_points ("parcel_id", "address_point_id", "linked_at") SELECT b."parcel_id", b."address_point_id", b."linked_at" FROM') && !restoreSql(po, rcols).includes('b.*') && restoreSql(po, rcols).includes('b."parcel_id" = ANY($1)') && restoreSql(po, rcols).includes('NOT EXISTS'), `pair restoreSql: ${restoreSql(po, rcols)}`);
  throws(() => restoreSql(po), 'restoreSql accepted pair mode without a column list');
  throws(() => restoreSql(po, ['parcel_id']), 'restoreSql accepted a column list lacking the column');
  assert(cohortRowsSql(po, false, [1]).includes('WHERE t."parcel_id" = ANY($1)'), `pair cohortRowsSql lost the key list: ${cohortRowsSql(po, false, [1])}`);
  throws(() => validateFlags(parseArgs(pairArgs.map((a) => (a.startsWith('--order=') ? '--order=t.address_point_id' : a)))), 'validateFlags accepted delete_reinsert ordered by a non-key');
  throws(() => validateFlags(parseArgs([...pairArgs, '--source-csv=package.json', '--source-key=id'])), 'validateFlags accepted delete_reinsert with --source-csv');
  const pairs = rowsToKeyValues([{ parcel_id: 1, address_point_id: 10 }, { parcel_id: 1, address_point_id: 11 }], 'parcel_id', 'address_point_id', true);
  assert(pairs.length === 2 && pairs[0].key === '["1","10"]' && pairs[1].key === '["1","11"]', `pair rowsToKeyValues: ${JSON.stringify(pairs)}`);
  assert(pairId('a|b', 'c') !== pairId('a', 'b|c'), 'pairId aliased two pairs through a "|"');
  const healedPairs = rowsToKeyValues([{ parcel_id: 1, address_point_id: 11 }, { parcel_id: 1, address_point_id: 10 }], 'parcel_id', 'address_point_id', true);
  const shortPairs = rowsToKeyValues([{ parcel_id: 1, address_point_id: 10 }], 'parcel_id', 'address_point_id', true);
  assert(captureClaim({ recordsUpdated: 0, recordsNew: 2, liveValues: healedPairs, backupValues: pairs }).ok === true, 'captureClaim rejected a fully re-inserted pair set');
  assert(captureClaim({ recordsUpdated: 0, recordsNew: 1, liveValues: shortPairs, backupValues: pairs }).ok === false, 'captureClaim accepted a pair set missing a deleted pair');
  assert(backupPrecondition({ exists: true, liveValues: shortPairs, backupValues: pairs }).ok === false, 'backupPrecondition accepted a pair set that drifted from the before-image');

  // R-ET: derived_status — the op, the claim (0 inserted is RED), and the exact-set restore decision.
  assert(parseOp('derived_status: f').kind === 'derived_status' && opBindValue('derived_status: f') === ' f', 'parseOp/opBindValue mishandled derived_status');
  throws(() => parseOp('derived_status'), 'parseOp accepted derived_status with no text');
  const dPrim = [{ key: 'A1', value: '["h","s"]' }];
  const dRow = { dk: 'coa:A1', nk: '(coa:A1,s,t)' };
  assert(derivedClaim({ countPathResult: { ok: true, n: 1 }, liveValues: dPrim, backupValues: dPrim, derivedKeys: ['coa:A1'], before: [], after: [dRow] }).ok === true, 'derivedClaim refused one inserted row per key');
  assert(derivedClaim({ countPathResult: { ok: true, n: 1 }, liveValues: dPrim, backupValues: dPrim, derivedKeys: ['coa:A1'], before: [], after: [] }).ok === false, 'derivedClaim accepted a run that wrote no derived row');
  assert(derivedRestoreDecision({ expected: [dRow], returned: [dRow] }).ok === true, 'derivedRestoreDecision refused the exact set');
  assert(derivedRestoreDecision({ expected: [dRow], returned: [] }).ok === false, 'derivedRestoreDecision accepted a short DELETE');

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
  assert(resolveCaptureOut('docs/reports/golden/load_address_points/post/forced.json').split('\\').join('/').endsWith('post/forced.json'), 'resolveCaptureOut rejected a legal post path');
  throws(() => resolveCaptureOut('elsewhere/forced.json'), 'resolveCaptureOut accepted a path outside docs/reports/golden');
  throws(() => resolveCaptureOut('docs/reports/golden/load_address_points/forced.json'), 'resolveCaptureOut accepted a missing <side>/ level');
  throws(() => resolveCaptureOut('docs/reports/golden/load_address_points/post/'), 'resolveCaptureOut accepted a directory');
  // F3: `..` must be collapsed BEFORE the shape checks, so an absolute path that only
  // LOOKS like it lives in a side directory is refused.
  // F3: `..` must be collapsed BEFORE the shape checks, so a path that `startsWith` the
  // golden root only in TEXT form — because a `..` still sits in it — is refused.
  throws(() => resolveCaptureOut('docs/reports/golden/load_address_points/post/../../../elsewhere/post/f.json'), 'resolveCaptureOut accepted a ".." escape');
  assert(resolveCaptureOut('docs/reports/golden/load_address_points/post/../post/f.json').split('\\').join('/').endsWith('golden/load_address_points/post/f.json'), 'resolveCaptureOut must resolve ".." before validating');

  // assertLocalTarget (F1): loopback only. Both a connection string and the discrete
  // `host:port/db` description must pass; a cloud host must be REFUSED even though its
  // database is also named `postgres` (which the expectDatabase pin cannot distinguish).
  assert(assertLocalTarget('postgresql://postgres:fakepw@127.0.0.1:54322/postgres') === 'postgresql://postgres:fakepw@127.0.0.1:54322/postgres', 'assertLocalTarget rejected a local 127.0.0.1 connection string');
  assert(assertLocalTarget('127.0.0.1:54322/postgres') === '127.0.0.1:54322/postgres', 'assertLocalTarget rejected a local discrete PG_* description');
  assert(assertLocalTarget('postgresql://postgres:fakepw@localhost:5433/postgres') !== null, 'assertLocalTarget rejected a localhost connection string');
  throws(() => assertLocalTarget('postgresql://postgres:fakepw@db.abc.supabase.co:5432/postgres'), 'assertLocalTarget accepted the CLOUD Supabase host');
  throws(() => assertLocalTarget('aws-0-eu-west-1.pooler.supabase.com:5432/postgres'), 'assertLocalTarget accepted a cloud pooler description');
  throws(() => assertLocalTarget('10.0.0.5:5432/postgres'), 'assertLocalTarget accepted a non-loopback private IP description');
  throws(() => assertLocalTarget('db.abc.supabase.co:5432/postgres'), 'assertLocalTarget accepted a bare cloud host:port description');
  // The DISCRETE PG_* description carries no `@`; the `^` alternative in LOCAL_HOST_RE is
  // what makes it pass, so assert both shapes rather than only the connection-string one.
  assert(LOCAL_HOST_RE.test('127.0.0.1:54322/postgres') === true, 'LOCAL_HOST_RE must accept the discrete local 127.0.0.1 PG_* description');
  assert(LOCAL_HOST_RE.test('localhost:5432/buildo') === true, 'LOCAL_HOST_RE must accept the discrete localhost PG_* description');
  assert(LOCAL_HOST_RE.test('10.0.0.5:5432/postgres') === false, 'LOCAL_HOST_RE must refuse a non-loopback private IP description');
  throws(() => assertLocalTarget(''), 'assertLocalTarget accepted an empty description');
  throws(() => assertLocalTarget(undefined), 'assertLocalTarget accepted an undefined description');
  assert(LOCAL_HOST_RE.test('postgresql://u:p@127.0.0.1:54322/postgres') === true && LOCAL_HOST_RE.test('db.abc.supabase.co:5432/postgres') === false, 'LOCAL_HOST_RE does not discriminate loopback from cloud');

  // F3: --capture-arg must not re-set a flag the bracket owns, and --step must not escape
  // scripts/ with a ".." segment.
  const captureArgBase = ['--run', '--table=address_points', '--key=id', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=id', '--backup-table=address_points_cohort_bak_20261002t1848z'];
  throws(() => validateFlags(parseArgs([...captureArgBase, '--step=scripts/load-address-points.js', '--chain=sources', '--out=docs/reports/golden/s/post/f.json', '--capture-arg=--out=docs/reports/golden/other/post/f.json'])), 'validateFlags accepted --capture-arg=--out');
  throws(() => validateFlags(parseArgs([...captureArgBase, '--step=scripts/load-address-points.js', '--chain=sources', '--out=docs/reports/golden/s/post/f.json', '--capture-arg=--overwrite'])), 'validateFlags accepted --capture-arg=--overwrite');
  throws(() => validateFlags(parseArgs([...captureArgBase, '--step=scripts/load-address-points.js', '--chain=sources', '--out=docs/reports/golden/s/post/f.json', '--capture-arg=--step=scripts/other.js'])), 'validateFlags accepted --capture-arg=--step');
  throws(() => validateFlags(parseArgs([...captureArgBase, '--step=scripts/load-address-points.js', '--chain=sources', '--out=docs/reports/golden/s/post/f.json', '--capture-arg=--chain=other'])), 'validateFlags accepted --capture-arg=--chain');
  throws(() => validateFlags(parseArgs([...captureArgBase, '--step=scripts/../../etc/passwd.js', '--chain=sources', '--out=docs/reports/golden/s/post/f.json'])), 'validateFlags accepted a ".." in --step');
  assert(validateFlags(parseArgs([...captureArgBase, '--step=scripts/load-address-points.js', '--chain=sources', '--out=docs/reports/golden/s/post/f.json', '--capture-arg=--tables=address_points'])) !== null, 'validateFlags rejected a legal --capture-arg passthrough');

  // F4: the shell-unsafe characters that would be substituted inside the printed recovery
  // command's JSON-quoted values.
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=name = $(id)', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted "$(" in --where');
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order="k" || `id`', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted a backtick in --order');
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=append_text:$(x)', '--count=1', '--where=w', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted "$(" in --op');
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=`id`', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted a backtick in --order alone');
  assert(validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])) !== null, 'validateFlags rejected an ordinary shell-safe set of expressions');

  // Nit: --key and --column are distinct roles, and the before-image must name --table.
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=k', '--op=negate_bool', '--count=1', '--where=w', '--order=k', '--backup-table=t_cohort_bak_20261002t1848z'])), 'validateFlags accepted --key === --column');
  throws(() => validateFlags(parseArgs(['--plan', '--table=t', '--key=k', '--column=c', '--op=negate_bool', '--count=1', '--where=w', '--order=k', '--backup-table=other_cohort_bak_20261002t1848z'])), 'validateFlags accepted a before-image named for a different table');

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

  // RED (drawn BEFORE the implementation): readSourceKeys — a header row, quoted fields
  // that CONTAIN commas, `""` escapes, and CRLF line endings.
  const srcKeys = readSourceKeys('id,name\r\n16487,"O\'Brien, Ltd."\r\n16488,"say ""hi"" now"\r\n', 'id');
  assert(srcKeys instanceof Set, 'readSourceKeys did not return a Set');
  assert(srcKeys.has('16487') && srcKeys.has('16488'), `readSourceKeys lost a key: ${[...srcKeys].join(',')}`);
  assert(srcKeys.size === 2, `readSourceKeys counted the quoted comma as a field: size=${srcKeys.size}`);
  // The quoted field's OWN comma must not split the row, and the header lookup must be by
  // name, not position (probe with `name` — whose values contain commas — as the key col).
  const nameKeys = readSourceKeys('id,name\r\n16487,"O\'Brien, Ltd."\r\n', 'name');
  assert(nameKeys.has("O'Brien, Ltd."), `readSourceKeys did not unquote a comma-bearing field: ${[...nameKeys].join('|')}`);
  throws(() => readSourceKeys('id,name\r\n1,a\r\n', 'missing'), 'readSourceKeys accepted a keyColumn absent from the header');

  // RED (drawn BEFORE the implementation): selectCohort — the cohort is only reachable
  // keys; the rest encountered BEFORE it filled are the `unreachable` report.
  const pick = selectCohort(['1', '2', '16487', '3'], new Set(['2', '3']), 2);
  assert(pick.cohort.join(',') === '2,3', `selectCohort cohort = ${pick.cohort.join(',')}`);
  assert(pick.unreachable.join(',') === '1,16487', `selectCohort unreachable = ${pick.unreachable.join(',')}`);
  // Non-string DB keys (a bigint id) must match a string-keyed source Set — the driver's
  // transient JS type must not decide reachability.
  assert(selectCohort([1n, 2n], new Set(['2']), 1).cohort.join(',') === '2', 'selectCohort did not compare a bigint DB key to the string source key set');
  // Fewer reachable keys than --count is a refusal, never a short cohort.
  throws(() => selectCohort(['1', '2'], new Set(['1']), 2), 'selectCohort accepted fewer reachable keys than count');
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
  --op=<op>              add_number:<n> | append_text:<s> | negate_bool | delete_reinsert
  --count=<N>            the cohort size
  --where=<SQL pred>     selects the ELIGIBLE rows (no semicolons)
  --order=<SQL expr>     the ORDER BY expression that picks the FIRST N
  --backup-table=<t>_cohort_bak_<yyyymmddthhmmz>  the before-image (lower-case)

  --op=delete_reinsert (Spec 124 R-DP) is the INSERT-only form: the cohort is the first N
              DISTINCT --key values (--order must be the key), the before-image holds their
              FULL rows, --run DELETEs them and the step must re-insert exactly the deleted
              (--key, --column) pairs; the restore re-inserts only the pairs still missing.

  --plan     SELECT-only (READ ONLY txn). Prints the cohort, the whole-table projected
              hash and the column's current values; refuses if fewer than N eligible.
  --backup    Freeze the cohort's (key, column) into the before-image; refuses if it exists.
  --run       Perturb the cohort, spawn the real step through ${HARNESS}, assert
              records_updated (or new+updated) >= 1 AND that every cohort row is back to
              its backed-up value, then restore unconditionally (cohort-scoped).
              Exit 1 on a failed claim; exit 2 if the restore failed or did not verify (the exact
              --restore command is printed before the COMMIT and on every failed-restore path).
  --count-path=<emit key>  (--run only; Spec 124 R-DN) prove the write count from gate G #38's
              per-table count_path in the capture just written, instead of the step-level
              records_updated/records_new — for a step that reports one table's writes in its own emit.
  --restore   Put the before-image back and re-verify the cohort.
  --self-test No DB. Asserts the argv/SQL/decision invariants. Prints 'self-test PASSED'.
  --help      This text.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  // A bare `--help` prints the text; `--help` ALONGSIDE a mode is accepted but must not
  // run that mode (the operator asked for the docs), and must not report a mode's success.
  if (argv.includes('--help') || argv.includes('-h')) {
    if (argv.some((a) => a !== '--help' && a !== '-h')) {
      console.log('[cohort] --help given with a mode — printing the help text only; no mode was run.');
    }
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
      // The success banner belongs to a self-test that ACTUALLY RAN. `--help` alone, or
      // `--help --self-test`, prints the help text and must not claim a PASS it never
      // computed.
      if (process.argv.includes('--self-test') && !process.argv.includes('--help') && !process.argv.includes('-h')) {
        console.log('self-test PASSED');
      }
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
  LOCAL_HOST_RE,
  assertLocalTarget,
  readSourceKeys,
  selectCohort,
  parseArgs,
  modeFlag,
  validateFlags,
  parseOp,
  opBindValue,
  perturbationSetExpr,
  appendAssignment,
  COLUMN_WIDTH_SQL,
  appendColumns,
  fitWidthDecision,
  fittedPreview,
  perturbationDeleteSql,
  countPathCohortDecision,
  pairSafetySql,
  pairModeRefusal,
  backupColumnsSql,
  pairId,
  isPairMode,
  isDerivedMode,
  derivedSnapshotTable,
  derivedKeysFor,
  derivedRowsSql,
  derivedSnapshotCreateSql,
  derivedSnapshotSelectSql,
  derivedDeleteSql,
  derivedInsertedRows,
  derivedClaim,
  derivedRestoreDecision,
  deleteInsertedDerived,
  orderedKeysSql,
  cohortRowsSql,
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


