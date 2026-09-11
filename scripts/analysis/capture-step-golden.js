#!/usr/bin/env node
/**
 * capture-step-golden — golden-master capture harness for ONE pipeline step.
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3 (Condition 3 — the
 *            golden-master differential, per conversion)
 * SPEC LINK: docs/specs/01-pipeline/120_pipeline_step_runner.md §14.2 (the 4-tuple)
 *
 * Runs a step script as a child process EXACTLY the way `scripts/run-chain.js#spawnStepChild`
 * does (`runtime = node|python`, argv = `[scriptPath, ...args]`, env = `{...process.env,
 * PIPELINE_CHAIN: <chain>}`, stdin inherited) and captures the 4-tuple:
 *
 *   (a) exit code
 *   (b) stdout — raw, plus the LAST `PIPELINE_SUMMARY:` line and every `PIPELINE_META:` line
 *       parsed (markers are the literal prefixes `scripts/lib/pipeline.js#emitSummary/emitMeta`
 *       print; run-chain takes the LAST summary because multi-worker scripts emit several)
 *   (c) the `pipeline_runs` row(s) written during the run — `SELECT max(id)` before, rows with
 *       `id > that` after. NOTE: a step run under `PIPELINE_CHAIN` skips its OWN ledger row
 *       (run-chain owns it — `assert-schema.js:272`), so in-chain captures legitimately show
 *       zero rows; the standalone (`--chain=none`) capture is the one that exercises the
 *       step's own ledger path.
 *   (d) a normalised form + a non-determinism inventory: every key / pattern the normaliser
 *       stripped or masked is listed under `nondeterminism`, declared BEFORE the first diff
 *       (§5.3: "Non-determinism inventory declared *before* the first diff").
 *   (e) TABLE STATE for a WRITE-class step (Spec 120 §14.2 / pilot-2 D-14): for every table in the
 *       step's descriptor `outputs.writes[].table` (`<step>.descriptor.json` beside the script) —
 *       or, when no descriptor exists yet, the `--tables=` list — `{table, row_count, content_hash}`
 *       with `content_hash = md5(string_agg(row::text, '|' ORDER BY <pk cols, else all cols>))`.
 *       The ORDER BY is explicit and pk-anchored because `string_agg` without one is
 *       scan-order-dependent (review_followups claim #173). Both fields are deterministic on
 *       identical data, so they sit in the normalised form → must-match-exactly under --compare.
 *       ROW CEILING: a table with more than `--table-row-ceiling` rows (default 100000) is NOT
 *       hashed; it records `{table, row_count, skipped_reason: 'over_ceiling'}`. Measured cost
 *       (local, 2026-08-25): `ravines` 854 rows / 7,640 kB → count 8 ms + hash 140 ms; `parcels`
 *       (486,530 rows) is over the default ceiling by design so the differential never pays a
 *       full-table text render of the parcel set.
 *       COLUMN PROJECTION + EXPLICIT ORDER (pilot-3 A-4 / Fold B item 5 / D-18): a junction whose
 *       rows carry a serial `id` and a RUN_AT clock (`parcel_buildings.linked_at`) changes its full-row
 *       text on every FULL relink of an identical logical result — a guaranteed false diff. So the
 *       hash may be PROJECTED onto the logical columns and ORDERED by the declared unique key:
 *         `--table-columns=<table>:<col,col,…>[;<table>:…]`  hash `ROW(<cols>)::text` only
 *         `--table-order=<table>:<col,col>[;<table>:…]`       ORDER BY these columns (not the pk)
 *       When the step has a descriptor, both derive from `outputs.writes[]`: order = the entry's
 *       `key` (string | string[]); projection = key ∪ `columns[].name` with `written: "db_default"`
 *       dropped (an explicit CLI value for a table overrides the derivation). The row ceiling applies
 *       to the UNPROJECTED count UNLESS a projection is in force for that table (then the hash is
 *       always computed and the record carries `ceiling_bypassed: 'projected'`). Measured cost
 *       (local, 2026-08-27): `parcel_buildings` 520,492 rows, 6-column projection ordered by
 *       (parcel_id, building_id) — see the `hash_ms` field each capture records; the plan-altitude
 *       measurement was 666 ms vs 922–2,879 ms for the full-row render.
 *   (f) INVARIANTS: `--invariants=<file.json>` — a JSON array of `{name, sql}`; each statement
 *       returns exactly one row with one scalar column. Recorded as `{name, value}` (value
 *       stringified) in the normalised form → must-match-exactly.
 *
 * USAGE
 *   node -r dotenv/config scripts/analysis/capture-step-golden.js \
 *     --step=scripts/quality/assert-schema.js --chain=permits --out=docs/reports/golden/x.json
 *   --chain=none        run standalone (PIPELINE_CHAIN unset — a DIFFERENT ledger path)
 *   --compare=<a>,<b>   diff two captures' normalised forms; exit code 1 on ANY difference
 *   --args=a,b,c        extra argv for the child (run-chain's `chain_args`), comma-separated
 *   --tables=t1,t2      tables to snapshot when the step has no descriptor (descriptor wins)
 *   --table-row-ceiling=N  max rows a table may have and still be content-hashed (default 100000)
 *   --table-columns=t:a,b[;t2:c]  project the content hash onto these columns (bypasses the ceiling)
 *   --table-order=t:a,b[;t2:c]    ORDER BY these columns instead of the pk
 *   --invariants=<f>    JSON array of `{name, sql}` scalar queries captured after the child exits
 *
 * DB target: `scripts/lib/resolve-db.js` — no silent default, host+database printed before the
 * child runs (tasks/lessons.md 2026-07-30: "print the host+database you connected to").
 */
'use strict';

const { spawn, execFileSync } = require('child_process');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createResolvedPool } = require('../lib/resolve-db');

const SUMMARY_MARKER = 'PIPELINE_SUMMARY:';
const META_MARKER = 'PIPELINE_META:';

// ── Non-determinism inventory ─────────────────────────────────────────────────
// Keys deleted wherever they appear (recursively) in summary / meta / ledger rows.
// Every entry here is something that varies run-to-run on IDENTICAL code + data.
const VOLATILE_KEYS = [
  'id', // pipeline_runs.id — serial
  'started_at',
  'completed_at',
  'duration_ms',
  'run_id',
  'timestamp',
  'elapsed_ms',
  'elapsed_s',
  'generated_at',
  'checked_at',
  'captured_at',
  // R-U (records_meta.chain_run_id) — a per-invocation chain-run correlation
  // key (scripts/lib/step/index.js), run-scoped by design ("a fact about THIS
  // invocation's chainId"). WF2 "Rules 10/11/12 mechanical checkers" C2
  // (2026-09-03): found stripping the 3 order_guarantee descriptors' golden
  // fingerprints — recapturing surfaced this as a previously-latent gap (an
  // OLDER pre/post pair happened to share the same value coincidentally; a
  // fresh capture never will), never a defect this WF2 introduced.
  'chain_run_id',
];
// audit_table rows whose `metric` is auto-injected timing by emitSummary (pipeline.js:346-352)
const VOLATILE_METRIC_PREFIXES = ['sys_'];
// String patterns masked inside stdout log lines (and inside string leaf values).
const VOLATILE_PATTERNS = [
  { name: 'iso_timestamp', re: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, mask: '<TS>' },
  { name: 'pg_timestamp', re: /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}(?::?\d{2})?)?/g, mask: '<TS>' },
  { name: 'duration_literal', re: /\b\d+(?:\.\d+)?\s?(?:ms|s|sec|seconds|min|minutes)\b/g, mask: '<DUR>' },
  { name: 'rows_per_sec', re: /\b\d[\d,]*(?:\.\d+)?\s?rows\/s/g, mask: '<RATE>' },
  { name: 'run_id_literal', re: /\b(run[ _#-]?id|runId|run)\s*[=#:]\s*\d+/gi, mask: '$1=<RUN_ID>' },
  { name: 'pipeline_runs_id_literal', re: /\bpipeline_runs(?:\s+row)?\s*#?\s*\d+/g, mask: 'pipeline_runs <ID>' },
  { name: 'pid_literal', re: /\bpid[=: ]\s*\d+/gi, mask: 'pid=<PID>' },
];

// ── CLI parsing ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

// ── Overwrite guard (C4 step H, Spec 124 R-AC — "PRE captures are committed
// before any re-run; the harness overwrites in place") ──────────────────────
//
// Until 2026-09-11 `--out` was a bare fs.writeFileSync: run 2 destroyed run 1's
// reference in place (pilot 9 commit 8 P6 did exactly that to
// enrich_parcels/post/sources_run1.json) with git history as the only rollback
// — and NO rollback at all when the destroyed file had never been committed.
// The guard below makes the ONLY overwritable reference one git can restore.
//
// ONE definition of "recoverable", shared with step-validate.mjs's fast
// invariant #22 (GOLD-PRE-FRESH) — never re-implemented there (Fold A item 3):
//   tracked        = the path is in the INDEX (`git ls-files --error-unmatch`),
//                    which includes a staged-new `A ` file;
//   worktreeClean  = worktree content == index content (`git status --porcelain`
//                    second column is a space, or the line is absent).
// `??` (untracked, incl. git-ignored — ls-files decides), ` M` / `MM` / `AM`
// (worktree differs from index) are NOT recoverable.
// A genuine "not tracked" answer from `git ls-files --error-unmatch` is ALWAYS exit
// status 1 from a live git binary — that's the one case overwriteDecision is entitled
// to read as "untracked". Anything else (git missing → ENOENT; `cwd` not a repo → exit
// 128; permissions, corrupt index, etc.) is a PROBE FAILURE, not an answer, and must
// never be silently folded into "untracked" — that used to make overwriteDecision hand
// the operator a `rm <file>` remedy for a real committed file the probe never actually
// reached. Fail loud instead.
function gitProbeFailure(abs, err) {
  const detail = err && err.code === 'ENOENT' ? err.code : (err && err.message) || String(err);
  return new Error(`[capture-step-golden] git probe failed for ${abs}: ${detail} — cannot decide recoverability; not touching the file`);
}

function captureGitState(file, opts = {}) {
  const abs = path.resolve(String(file));
  const cwd = opts.cwd || process.cwd();
  const gitBin = opts.gitBin || 'git';
  const exists = fs.existsSync(abs);
  if (!exists) return { exists: false, tracked: false, worktreeClean: true };
  let tracked = false;
  try {
    execFileSync(gitBin, ['ls-files', '--error-unmatch', '--', abs], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    tracked = true;
  } catch (err) {
    if (err.code === 'ENOENT' || err.status !== 1) throw gitProbeFailure(abs, err);
    tracked = false;
  }
  let worktreeClean = true;
  if (tracked) {
    let porcelain;
    try {
      porcelain = execFileSync(gitBin, ['status', '--porcelain', '--', abs], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      throw gitProbeFailure(abs, err);
    }
    const line = porcelain.split(/\r?\n/).find((l) => l.length >= 2);
    // "XY path": X = index vs HEAD, Y = worktree vs index. Recoverable iff Y is a space.
    worktreeClean = !line || line[1] === ' ';
  }
  return { exists, tracked, worktreeClean };
}

/**
 * Pure: may `--out` write to a path in this git state? Never touches fs/git.
 * @param {{exists:boolean, tracked:boolean, worktreeClean:boolean, overwriteFlag:boolean}} s
 * @returns {{allow:boolean, reason:string, remedy:string}}
 */
function overwriteDecision(s) {
  if (!s.exists) return { allow: true, reason: 'target absent', remedy: '' };
  if (!s.tracked) {
    return {
      allow: false,
      reason: 'target exists and is NOT tracked by git (untracked or ignored) — nothing can restore it if overwritten',
      remedy: 'commit it first, or `rm <file>` (or `git clean -f -- <file>`) if the earlier attempt was wrong, then re-run',
    };
  }
  if (!s.worktreeClean) {
    return {
      allow: false,
      reason: 'target exists, is tracked, but its worktree content differs from the index — the local edit is unrecoverable',
      remedy: 'commit it, or `git checkout -- <file>` to restore the indexed version, then re-run with --overwrite',
    };
  }
  if (!s.overwriteFlag) {
    return {
      allow: false,
      reason: 'target exists and is a committed/indexed reference — overwriting requires an explicit --overwrite',
      remedy: 're-run with --overwrite (git history restores the previous capture: `git checkout HEAD -- <file>`)',
    };
  }
  return { allow: true, reason: 'target is tracked and clean; --overwrite given — git can restore it', remedy: '' };
}

// ── Table state (e) ───────────────────────────────────────────────────────────
const DEFAULT_TABLE_ROW_CEILING = 100000;
const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

// pilot9 commit5 finding (2026-09-04): a single `string_agg(ROW(...)::text)` over a large
// row_count x wide-column-set (incl. jsonb payloads) OOM'd postgres on `parcels` (486,530 rows
// x 100 projected cols) — docs/reports/golden/enrich_parcels/pre/sources_run1.json records the
// reproduction. Above this many cells, captureTableState switches to a row-hash-then-concat
// method (md5 each row first — fixed 32-byte width — then string_agg+md5 the hashes) instead of
// concatenating full row text. Every table captured by the 8 already-converted pilots is well
// under this (max measured: parcel_buildings 520,492 rows x 6 projected cols = 3,122,952 cells,
// 666ms, unaffected — docs/reports/golden/link_massing/post/permits.json), so their content_hash
// values are reproduced byte-for-byte by the UNCHANGED narrow-table path.
const WIDE_TABLE_CELL_THRESHOLD = 10_000_000;

/** Pure: whether row_count x column-width crosses WIDE_TABLE_CELL_THRESHOLD. */
function isWideTable({ row_count, width, threshold = WIDE_TABLE_CELL_THRESHOLD }) {
  return row_count * width > threshold;
}

/** Strict non-negative integer parse for `--table-row-ceiling` (no parseInt: '12abc' must throw). */
function parseRowCeiling(raw) {
  if (raw === undefined) return DEFAULT_TABLE_ROW_CEILING;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new Error(`--table-row-ceiling must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

/** Descriptor path convention: `<step>.descriptor.json` beside the script (assert-schema precedent). */
function descriptorPathFor(step) {
  return step.replace(/\.(js|py)$/, '') + '.descriptor.json';
}

// ── source_fingerprint (RULING R-C, 2026-08-28) ───────────────────────────────
// "The golden capture is a LOCKFILE." Editing a converted step's compute/descriptor
// without re-capturing must go RED, and a commit-message claim of "differential green"
// is no longer evidence — src/tests/golden-fingerprint.infra.test.ts checks every
// docs/reports/golden/<slug>/post/*.json's `source_fingerprint` against the CURRENT
// tree using this same exported helper.

/** `scripts/lib/compute/<basename(step)>`, or null when the step has no compute module yet. */
function computePathFor(step) {
  const rel = path.posix.join('scripts/lib/compute', path.basename(step));
  return fs.existsSync(rel) ? rel : null;
}

/** The step's `<slug>.notes.json`, resolved from `descriptor.interpretation.file`, or null. */
function notesPathFor(descriptor, descriptorPath) {
  if (!descriptor || !descriptor.interpretation || descriptor.interpretation === 'none') return null;
  const dir = descriptorPath.split(path.sep).join('/').split('/').slice(0, -1).join('/');
  return dir ? `${dir}/${descriptor.interpretation.file}` : descriptor.interpretation.file;
}

/** CRLF → LF, so a checkout-line-ending difference never moves the fingerprint. */
function normaliseEol(text) {
  return text.replace(/\r\n/g, '\n');
}

/**
 * R-T addendum (Fold B-4, commit 3) — `last_measured` (value/at/commit/cost_ms/sample_n/
 * source_run) is EXPECTED to churn every re-time; fingerprinting it would fail the golden
 * fingerprint on every re-time even when the declared CONTRACT (bound/why/frequency/when/
 * source) hasn't changed. Strips the whole `last_measured` object from every `invariants[]`/
 * `plausibility[]` entry before hashing a descriptor file — pure, parse-strip-reserialize,
 * so the fingerprint is a function of the DECLARED contract only. A non-JSON or JSON-without-
 * invariants/plausibility file (every other fingerprinted file: step.js, notes.json,
 * compute.js, or a descriptor with neither category populated) passes through UNCHANGED.
 */
function stripLastMeasuredForFingerprint(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return text; // not JSON (step.js/compute.js) — hash the raw text unchanged
  }
  if (!doc || typeof doc !== 'object') return text;
  let touched = false;
  for (const cat of ['invariants', 'plausibility']) {
    if (!Array.isArray(doc[cat])) continue;
    doc[cat] = doc[cat].map((entry) => {
      if (!entry || typeof entry !== 'object' || !('last_measured' in entry)) return entry;
      touched = true;
      const { last_measured: _omit, ...rest } = entry;
      return rest;
    });
  }
  if (!touched) return text; // no invariants/plausibility entries carried last_measured — unchanged
  return JSON.stringify(doc);
}

/**
 * sha256 over (step file, descriptor, notes, compute module) — SORTED path order, each
 * file contributing its repo-relative path (forward slashes) then its LF-normalised
 * content (the descriptor's own content first passed through
 * stripLastMeasuredForFingerprint, Fold B-4). Any listed file that does not exist THROWS:
 * a lockfile that silently skips a missing input is not a lockfile.
 * @param {{step: string, descriptorPath: string, notesPath: string|null, computePath: string|null}} paths
 * @returns {{source_fingerprint: string, fingerprint_files: string[]}}
 */
function computeSourceFingerprint({ step, descriptorPath, notesPath, computePath }) {
  const files = [step, descriptorPath, notesPath, computePath]
    .filter((f) => typeof f === 'string' && f.length > 0)
    .map((f) => f.split(path.sep).join('/'))
    .sort();
  const normalisedDescriptorPath = typeof descriptorPath === 'string' ? descriptorPath.split(path.sep).join('/') : null;
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    if (!fs.existsSync(f)) throw new Error(`source_fingerprint: fingerprint input ${f} does not exist`);
    hash.update(f);
    hash.update('\n');
    const raw = normaliseEol(fs.readFileSync(f, 'utf8'));
    hash.update(f === normalisedDescriptorPath ? stripLastMeasuredForFingerprint(raw) : raw);
  }
  return { source_fingerprint: hash.digest('hex'), fingerprint_files: files };
}

/**
 * Which tables to snapshot. Descriptor-driven when the descriptor declares `outputs.writes`;
 * the `--tables=` arg is the fallback for steps that have no descriptor yet. Pure.
 * @returns {{tables: string[], source: 'descriptor'|'arg'|'none'}}
 */
function resolveTables({ descriptor, tablesArg }) {
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes)
    ? descriptor.outputs.writes : null;
  let tables;
  let source;
  if (writes && writes.length > 0) {
    tables = writes.map((w) => w.table);
    source = 'descriptor';
  } else if (tablesArg) {
    tables = String(tablesArg).split(',').map((t) => t.trim()).filter(Boolean);
    source = 'arg';
  } else {
    return { tables: [], source: 'none' };
  }
  for (const t of tables) {
    if (!TABLE_NAME_RE.test(t)) throw new Error(`invalid table name ${JSON.stringify(t)} (expected ${TABLE_NAME_RE})`);
  }
  return { tables: [...new Set(tables)].sort(), source };
}

/**
 * The ceiling decision, separated from the queries so it is lockable without a DB.
 * The ceiling is judged on the UNPROJECTED row count; a projection in force bypasses it (A-4).
 * @returns {{hash: boolean, record: object}} — `record` is the partial table-state entry
 */
function tableStateDecision({ table, row_count, ceiling, projected = false }) {
  if (row_count > ceiling && !projected) {
    return { hash: false, record: { table, row_count, skipped_reason: 'over_ceiling', ceiling } };
  }
  const record = { table, row_count };
  if (row_count > ceiling) record.ceiling_bypassed = 'projected';
  return { hash: true, record };
}

const COLUMN_NAME_RE = TABLE_NAME_RE;
function quoteIdent(c) {
  if (!COLUMN_NAME_RE.test(c)) throw new Error(`invalid column name ${JSON.stringify(c)} (expected ${COLUMN_NAME_RE})`);
  return `"${c}"`;
}

/**
 * Parse `--table-columns` / `--table-order`: `t1:a,b;t2:c` → `{t1: ['a','b'], t2: ['c']}`. Pure.
 * Identifiers are validated against the same `[a-z_][a-z0-9_]*` rule as table names (no quoting games).
 */
function parseTableColumnSpec(raw, flag) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`${flag} needs <table>:<col,col>[;<table>:…]`);
  const out = {};
  for (const part of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf(':');
    if (i <= 0) throw new Error(`${flag}: entry ${JSON.stringify(part)} is not <table>:<col,col>`);
    const table = part.slice(0, i).trim();
    if (!TABLE_NAME_RE.test(table)) throw new Error(`invalid table name ${JSON.stringify(table)} (expected ${TABLE_NAME_RE})`);
    const cols = part.slice(i + 1).split(',').map((c) => c.trim()).filter(Boolean);
    if (cols.length === 0) throw new Error(`${flag}: ${table} lists no columns`);
    for (const c of cols) if (!COLUMN_NAME_RE.test(c)) throw new Error(`invalid column name ${JSON.stringify(c)} (expected ${COLUMN_NAME_RE})`);
    if (out[table]) throw new Error(`${flag}: table ${table} given twice`);
    out[table] = [...new Set(cols)];
  }
  return out;
}

/**
 * Derive per-table projection + order from a descriptor's `outputs.writes[]` (Fold B item 5).
 * order = the FIRST entry's `key` for that table (string | string[]); projection = key ∪ every
 * same-table entry's `columns[].name` minus `written: "db_default"` (serial ids, DDL defaults).
 * Returns `{columns: {table: [...]}, order: {table: [...]}}`; empty objects when nothing derives. Pure.
 */
function deriveTableSpecs(descriptor) {
  const writes = descriptor && descriptor.outputs && Array.isArray(descriptor.outputs.writes)
    ? descriptor.outputs.writes : [];
  const columns = {};
  const order = {};
  for (const w of writes) {
    if (!w || !w.table) continue;
    const key = w.key === undefined ? [] : (Array.isArray(w.key) ? w.key : [w.key]);
    if (key.length > 0 && !order[w.table]) order[w.table] = [...key];
    const names = (Array.isArray(w.columns) ? w.columns : [])
      .filter((c) => c && typeof c.name === 'string' && c.written !== 'db_default')
      .map((c) => c.name);
    const set = new Set([...(columns[w.table] ?? []), ...key, ...names]);
    if (set.size > 0) columns[w.table] = [...set];
  }
  return { columns, order };
}

/** Resolve one table's projection + ordering: explicit CLI value wins over the descriptor derivation. Pure. */
function resolveTableSpec({ table, argColumns, argOrder, derived }) {
  const columns = argColumns[table] ?? derived.columns[table] ?? null;
  const order = argOrder[table] ?? derived.order[table] ?? null;
  return {
    columns,
    columns_source: argColumns[table] ? 'arg' : (derived.columns[table] ? 'descriptor' : 'none'),
    order,
    order_source: argOrder[table] ? 'arg' : (derived.order[table] ? 'descriptor' : 'none'),
  };
}

/** Build the ORDER BY clause: explicit columns first, else pk columns, else every column. */
function orderByClause({ orderColumns = null, pkColumns, allColumns }) {
  const cols = orderColumns && orderColumns.length > 0 ? orderColumns : (pkColumns.length > 0 ? pkColumns : allColumns);
  if (cols.length === 0) throw new Error('cannot build ORDER BY: table has no columns');
  return cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
}

/** The row-text expression that is hashed: the whole row, or `ROW(<projection>)`. Pure. */
function rowTextExpr(columns) {
  return columns && columns.length > 0 ? `ROW(${columns.map(quoteIdent).join(', ')})::text` : 't::text';
}

const PK_SQL = `SELECT a.attname
                  FROM pg_index i
                  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                 WHERE i.indrelid = $1::regclass AND i.indisprimary
                 ORDER BY array_position(i.indkey, a.attnum)`;
const COLS_SQL = `SELECT column_name FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`;

async function captureTableState(pool, table, ceiling, spec = { columns: null, order: null }) {
  const q = `"${table}"`;
  const cnt = await pool.query(`SELECT count(*)::bigint AS n FROM ${q}`);
  const row_count = Number(cnt.rows[0].n);
  const projected = Boolean(spec.columns && spec.columns.length > 0);
  const decision = tableStateDecision({ table, row_count, ceiling, projected });
  if (!decision.hash) return { record: decision.record, hash_ms: null };
  const [pk, cols] = await Promise.all([pool.query(PK_SQL, [table]), pool.query(COLS_SQL, [table])]);
  const pkColumns = pk.rows.map((r) => r.attname);
  const allColumns = cols.rows.map((r) => r.column_name);
  for (const c of [...(spec.columns ?? []), ...(spec.order ?? [])]) {
    if (!allColumns.includes(c)) throw new Error(`table ${table} has no column ${JSON.stringify(c)} (have ${allColumns.join(',')})`);
  }
  const orderBy = orderByClause({ orderColumns: spec.order, pkColumns, allColumns });
  const orderCols = spec.order && spec.order.length > 0 ? spec.order : (pkColumns.length > 0 ? pkColumns : allColumns);
  const width = projected ? spec.columns.length : allColumns.length;
  const wide = isWideTable({ row_count, width });
  const t0 = Date.now();
  // WIDE path: hash each row first (fixed 32-byte width), then string_agg+md5 the per-row
  // hashes — bounded intermediate memory. NARROW path (every table below the threshold,
  // including all 8 already-converted pilots' goldens): UNCHANGED single-pass query, so their
  // committed content_hash values are reproduced byte-for-byte. Column lists are pre-joined
  // into PLAIN strings (no nested template literals inside the SQL literal below) — a nested
  // backtick would split the naive `` /`SELECT...`/ `` source scan test #173 relies on.
  const subOrderBy = orderCols.map((c) => 'sub.' + quoteIdent(c)).join(', ');
  const subSelectCols = orderCols.map((c) => 't.' + quoteIdent(c)).join(', ');
  const h = wide
    ? await pool.query(
        `SELECT md5(string_agg(sub.rh, '|' ORDER BY ${subOrderBy})) AS h
           FROM (SELECT ${subSelectCols}, md5(${rowTextExpr(spec.columns)}) AS rh FROM ${q} t) sub`,
      )
    : await pool.query(`SELECT md5(string_agg(${rowTextExpr(spec.columns)}, '|' ORDER BY ${orderBy})) AS h FROM ${q} t`);
  const hash_ms = Date.now() - t0;
  console.log(`[capture-step-golden] hashed ${table}: ${row_count} rows in ${hash_ms} ms ` +
    `(columns ${projected ? spec.columns.join(',') : '<all>'}; order by ${orderBy}; method ${wide ? 'row_hash' : 'concat'})`);
  const record = {
    ...decision.record,
    content_hash: h.rows[0].h, // null when the table is empty (string_agg over 0 rows)
    order_by: spec.order && spec.order.length > 0 ? 'explicit' : (pkColumns.length > 0 ? 'pk' : 'all_columns'),
  };
  if (spec.order && spec.order.length > 0) record.order_columns = [...spec.order];
  if (projected) record.columns = [...spec.columns];
  if (wide) record.hash_method = 'row_hash_then_concat';
  return { record, hash_ms };
}

// ── Invariants (f) ────────────────────────────────────────────────────────────
/** Validate an invariants document: a non-empty array of unique `{name, sql}`. Pure; returns it. */
function validateInvariantSpec(doc) {
  if (!Array.isArray(doc) || doc.length === 0) throw new Error('invariants file must be a non-empty JSON array');
  const seen = new Set();
  doc.forEach((inv, i) => {
    if (!inv || typeof inv.name !== 'string' || !inv.name || typeof inv.sql !== 'string' || !inv.sql.trim()) {
      throw new Error(`invariants[${i}] must be {name: string, sql: string}`);
    }
    if (seen.has(inv.name)) throw new Error(`duplicate invariant name ${JSON.stringify(inv.name)}`);
    seen.add(inv.name);
  });
  return doc;
}

/**
 * R-T addendum (Fold A-4c, commit 3) — once a step migrates its golden
 * `invariants.json` into the descriptor's own `invariants[]`/`plausibility[]`
 * categories, THAT is the source of truth, not a separate `--invariants=`
 * file. Derives a `{name, sql}` spec from BOTH categories (ANY declared
 * frequency — this offline capture tool snapshots every declared value for
 * the regression record; the every_run/validate_only split governs the LIVE
 * run-end hook, not this harness). Returns `null` when the descriptor
 * declares neither (or declares them as "none"), so the caller falls back
 * to its existing `--invariants=<file>`/no-invariants behavior unchanged.
 */
function deriveInvariantSpecFromDescriptor(descriptor) {
  if (!descriptor) return null;
  const entries = [
    ...(Array.isArray(descriptor.invariants) ? descriptor.invariants : []),
    ...(Array.isArray(descriptor.plausibility) ? descriptor.plausibility : []),
  ];
  if (entries.length === 0) return null;
  return validateInvariantSpec(entries.map((e) => ({ name: e.id, sql: e.sql })));
}

/** Shape one query result into the recorded `{name, value}` — exactly one row, one column. Pure. */
function invariantResult(name, rows) {
  if (rows.length !== 1) throw new Error(`invariant ${name}: expected 1 row, got ${rows.length}`);
  const keys = Object.keys(rows[0]);
  if (keys.length !== 1) throw new Error(`invariant ${name}: expected 1 column, got ${keys.length} (${keys.join(',')})`);
  const v = rows[0][keys[0]];
  return { name, value: v === null ? null : String(v) };
}

async function captureInvariants(pool, spec) {
  const out = [];
  for (const inv of spec) {
    const r = await pool.query(inv.sql);
    out.push(invariantResult(inv.name, r.rows));
  }
  return out;
}

// ── Parsing of the child's stdout ─────────────────────────────────────────────
/**
 * Extract the parsed LAST PIPELINE_SUMMARY and ALL PIPELINE_META payloads from raw stdout.
 * Mirrors run-chain.js: `matchAll(/PIPELINE_SUMMARY:(.+)/g)` → last element.
 * @param {string} stdout
 * @returns {{summary: object|null, summary_count: number, meta: object[], parse_errors: string[]}}
 */
function parseMarkers(stdout) {
  const parse_errors = [];
  const summaries = [];
  const meta = [];
  for (const line of stdout.split('\n')) {
    const si = line.indexOf(SUMMARY_MARKER);
    const mi = line.indexOf(META_MARKER);
    try {
      if (si >= 0) summaries.push(JSON.parse(line.slice(si + SUMMARY_MARKER.length)));
      else if (mi >= 0) meta.push(JSON.parse(line.slice(mi + META_MARKER.length)));
    } catch (err) {
      parse_errors.push(`${line.slice(0, 80)}… — ${err.message}`);
    }
  }
  return {
    summary: summaries.length > 0 ? summaries[summaries.length - 1] : null,
    summary_count: summaries.length,
    meta,
    parse_errors,
  };
}

// ── Normaliser ────────────────────────────────────────────────────────────────
function maskString(s, hits) {
  let out = s;
  for (const p of VOLATILE_PATTERNS) {
    const before = out;
    out = out.replace(p.re, p.mask);
    if (out !== before) hits.add(`pattern:${p.name}`);
  }
  return out;
}

/**
 * Recursively drop VOLATILE_KEYS, drop `sys_*` audit rows, and mask volatile string patterns.
 * Records what it stripped into `hits`. Pure; never mutates its input.
 */
function scrub(value, hits, keyPath) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        const isVolatileRow =
          item && typeof item === 'object' && typeof item.metric === 'string' &&
          VOLATILE_METRIC_PREFIXES.some((p) => item.metric.startsWith(p));
        if (isVolatileRow) hits.add(`row:${item.metric}`);
        return !isVolatileRow;
      })
      .map((item, i) => scrub(item, hits, `${keyPath}[${i}]`));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (VOLATILE_KEYS.includes(k)) {
        hits.add(`key:${keyPath ? keyPath + '.' : ''}${k}`);
        continue;
      }
      out[k] = scrub(value[k], hits, keyPath ? `${keyPath}.${k}` : k);
    }
    return out;
  }
  if (typeof value === 'string') return maskString(value, hits);
  return value;
}

/** Key-sorted deep copy with NO masking — table hashes / invariant values are deterministic by construction. */
function stableCopy(value) {
  if (Array.isArray(value)) return value.map(stableCopy);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = stableCopy(value[k]);
    return out;
  }
  return value;
}

/**
 * Normalise a raw capture into its deterministic form + a non-determinism inventory.
 * @param {object} capture - a raw capture object (see buildCapture)
 * @returns {{normalised: object, nondeterminism: string[]}}
 */
function normalise(capture) {
  const hits = new Set();
  const stdoutLines = capture.stdout
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '')
    // structured markers are represented by the parsed forms below, not as text
    .filter((l) => !l.includes(SUMMARY_MARKER) && !l.includes(META_MARKER))
    // JSON log entries from pipeline.log carry no timestamp but may carry volatile context
    .map((l) => {
      if (l.startsWith('{') && l.endsWith('}')) {
        try { return JSON.stringify(scrub(JSON.parse(l), hits, 'log')); } catch (err) {
          hits.add(`unparsed_json_log_line:${err.message.slice(0, 40)}`);
          return maskString(l, hits);
        }
      }
      return maskString(l, hits);
    });
  const normalised = {
    step: capture.step,
    chain: capture.chain,
    exit_code: capture.exit_code,
    summary: scrub(capture.summary, hits, 'summary'),
    summary_count: capture.summary_count,
    meta: scrub(capture.meta, hits, 'meta'),
    parse_errors: capture.parse_errors,
    pipeline_runs: scrub(capture.pipeline_runs, hits, 'pipeline_runs'),
    stdout_lines: stdoutLines,
    // (e)/(f) — must-match-exactly: no key is stripped, no pattern masked
    table_state: stableCopy(capture.table_state ?? []),
    invariants: stableCopy(capture.invariants ?? []),
  };
  return { normalised, nondeterminism: [...hits].sort() };
}

// ── Compare ───────────────────────────────────────────────────────────────────
/**
 * Deep-diff two normalised captures. Returns a list of `{path, a, b}` records; empty = identical.
 */
function diffNormalised(a, b, basePath = '') {
  const diffs = [];
  const isObj = (v) => v && typeof v === 'object';
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i >= a.length || i >= b.length) diffs.push({ path: `${basePath}[${i}]`, a: a[i], b: b[i] });
      else diffs.push(...diffNormalised(a[i], b[i], `${basePath}[${i}]`));
    }
    return diffs;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const p = basePath ? `${basePath}.${k}` : k;
      if (!(k in a) || !(k in b)) diffs.push({ path: p, a: a[k], b: b[k] });
      else diffs.push(...diffNormalised(a[k], b[k], p));
    }
    return diffs;
  }
  if (a !== b) diffs.push({ path: basePath || '(root)', a, b });
  return diffs;
}

function formatDiff(diffs) {
  return diffs
    .map((d) => `  ${d.path}\n    - ${JSON.stringify(d.a)}\n    + ${JSON.stringify(d.b)}`)
    .join('\n');
}

// ── Child spawn (mirrors run-chain.js#spawnStepChild) ─────────────────────────
function runtimeFor(scriptPath) {
  return scriptPath.endsWith('.py')
    ? (process.platform === 'win32' ? 'python' : 'python3')
    : 'node';
}

/**
 * Spawn the step as run-chain does; buffer stdout FULLY (not just marker lines — the golden
 * master wants the whole surface) while teeing it to the console. stderr is captured too so a
 * network failure is recorded in the capture rather than lost.
 */
function spawnStep({ scriptPath, args, env }) {
  return new Promise((resolveSpawn, rejectSpawn) => {
    const runtime = runtimeFor(scriptPath);
    const child = spawn(runtime, [scriptPath, ...args], { env, stdio: ['inherit', 'pipe', 'pipe'] });
    const outDec = new StringDecoder('utf8');
    const errDec = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { const c = outDec.write(d); process.stdout.write(c); stdout += c; });
    child.stderr.on('data', (d) => { const c = errDec.write(d); process.stderr.write(c); stderr += c; });
    child.on('close', (code, signal) => {
      stdout += outDec.end();
      stderr += errDec.end();
      resolveSpawn({ runtime, exit_code: code, signal, stdout, stderr });
    });
    child.on('error', rejectSpawn);
  });
}

// ── Capture ───────────────────────────────────────────────────────────────────
async function capture({ step, chain, args, tables, tablesSource, ceiling, tableSpecs = {}, invariantSpec, invariantsFile }) {
  const pool = createResolvedPool({ label: 'capture-step-golden' });
  // Print the target BEFORE running (lessons.md) — assertDbTarget logs database + migrations on
  // the first checkout below; this line names the host even if that first checkout fails.
  console.log(`[capture-step-golden] db target: ${pool.buildoTarget.description} (source ${pool.buildoTarget.source})`);
  try {
    const beforeRes = await pool.query('SELECT COALESCE(max(id), 0)::int AS max_id FROM pipeline_runs');
    const maxIdBefore = beforeRes.rows[0].max_id;

    const env = { ...process.env };
    if (chain === 'none') delete env.PIPELINE_CHAIN; else env.PIPELINE_CHAIN = chain;
    console.log(`[capture-step-golden] spawning: ${runtimeFor(step)} ${step} ${args.join(' ')} ` +
      `(PIPELINE_CHAIN=${chain === 'none' ? '<unset>' : chain}; pipeline_runs max(id) before = ${maxIdBefore})`);

    const child = await spawnStep({ scriptPath: step, args, env });

    const rowsRes = await pool.query(
      `SELECT id, pipeline, status, started_at, completed_at, duration_ms,
              records_total, records_new, records_updated, records_meta, error_message
         FROM pipeline_runs WHERE id > $1 ORDER BY id`,
      [maxIdBefore],
    );
    const table_state = [];
    const table_timing = {};
    for (const t of tables) {
      const { record, hash_ms } = await captureTableState(pool, t, ceiling, tableSpecs[t] ?? { columns: null, order: null });
      table_state.push(record);
      table_timing[t] = hash_ms;
    }
    const invariants = invariantSpec ? await captureInvariants(pool, invariantSpec) : [];
    const markers = parseMarkers(child.stdout);
    const raw = {
      step,
      chain,
      args,
      runtime: child.runtime,
      db_target: pool.buildoTarget.description,
      pipeline_runs_max_id_before: maxIdBefore,
      exit_code: child.exit_code,
      signal: child.signal,
      stdout: child.stdout,
      stderr: child.stderr,
      ...markers,
      pipeline_runs: rowsRes.rows,
      table_state,
      table_timing, // volatile (ms) — recorded at the top level only, never in the normalised form
      table_specs: tableSpecs,
      tables_source: tablesSource,
      table_row_ceiling: ceiling,
      invariants,
      invariants_file: invariantsFile ?? null,
    };
    return raw;
  } finally {
    await pool.end();
  }
}

function buildCapture(raw) {
  const { normalised, nondeterminism } = normalise(raw);
  const verdict = raw.summary?.records_meta?.audit_table?.verdict ?? null;
  return {
    harness: 'scripts/analysis/capture-step-golden.js',
    spec: 'docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.3',
    step: raw.step,
    chain: raw.chain,
    git_head: gitHead(),
    // (a) exit code
    exit_code: raw.exit_code,
    signal: raw.signal,
    // (b) stdout + parsed markers
    summary: raw.summary,
    summary_count: raw.summary_count,
    meta: raw.meta,
    parse_errors: raw.parse_errors,
    verdict,
    ledger_status: raw.pipeline_runs.map((r) => r.status),
    stdout: raw.stdout,
    stderr: raw.stderr,
    // (c) ledger rows
    pipeline_runs: raw.pipeline_runs,
    pipeline_runs_max_id_before: raw.pipeline_runs_max_id_before,
    // (e) table state + (f) invariants
    table_state: raw.table_state ?? [],
    tables_source: raw.tables_source ?? 'none',
    table_row_ceiling: raw.table_row_ceiling ?? DEFAULT_TABLE_ROW_CEILING,
    table_timing: raw.table_timing ?? {},
    table_specs: raw.table_specs ?? {},
    invariants: raw.invariants ?? [],
    invariants_file: raw.invariants_file ?? null,
    db_target: raw.db_target,
    runtime: raw.runtime,
    args: raw.args,
    // (d) normalised form + inventory
    nondeterminism,
    normalised,
  };
}

/**
 * WF3 enrich_parcels stall incident (2026-09-07) — the "VRD-SKIP conflation" memory gotcha,
 * closed structurally. Before this, a capture whose child process SELF-SKIPPED (advisory lock
 * held elsewhere, ledger-gated no-op, etc — `records_meta.skipped:true`) or CRASHED (non-zero
 * exit) was written to `--out` exactly like a genuine completed run: no real enrichment work
 * happened, yet the file would silently become the new reference state for every future
 * `--compare`/G8 diff. Measured live: a golden-capture attempt that raced an orphaned, still-lock-
 * holding backend produced a `pipeline_runs` row with `status:"self_skipped"`,
 * `records_meta.skipped:true`, `reason:"advisory_lock_held_elsewhere"` — the harness wrote it to
 * `docs/reports/golden/enrich_parcels/post/sources_run1.json` anyway. Refuses now, loudly,
 * BEFORE any write — pure, throws, never logs/writes itself (the caller decides how to surface
 * the throw).
 * @param {object} doc - buildCapture's return value
 * @throws {Error} when the capture is not a genuine, completed run
 */
function assertCaptureIsValid(doc) {
  if (doc.exit_code !== 0) {
    throw new Error(
      `capture-step-golden: REFUSING to write a golden capture — the invocation exited ${doc.exit_code} ` +
        '(non-zero, signal=' + JSON.stringify(doc.signal) + '). A crashed run is not a valid reference ' +
        'state for a golden diff.',
    );
  }
  if (doc.summary?.records_meta?.skipped === true) {
    const reason = doc.summary?.records_meta?.reason ?? '(no reason given)';
    throw new Error(
      'capture-step-golden: REFUSING to write a golden capture — the invocation SELF-SKIPPED ' +
        `(records_meta.skipped:true, reason:"${reason}"). A skip is not a valid reference state for a ` +
        'golden diff (the "VRD-SKIP conflation" this check exists to close) — re-run once the blocking ' +
        'condition (e.g. an advisory lock held elsewhere) clears.',
    );
  }
}

/**
 * RULING R-C (2026-08-28): `git_head` unresolvable THROWS (the capture exits non-zero) —
 * never "unknown". A lockfile whose provenance field can silently degrade to a string is
 * not a lockfile: a capture with no resolvable commit records NOTHING about what code
 * produced it, and "unknown" would have looked like a successful capture to every
 * downstream reader (the golden-fingerprint gate included).
 */
function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.compare) {
    const [fa, fb] = String(opts.compare).split(',');
    if (!fa || !fb) throw new Error('--compare needs two comma-separated capture paths');
    const load = (f) => {
      const doc = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
      // accept either a full capture (has .normalised) or a bare normalised object
      return doc.normalised ?? doc;
    };
    const diffs = diffNormalised(load(fa), load(fb));
    if (diffs.length === 0) {
      console.log(`[capture-step-golden] IDENTICAL (normalised): ${fa} == ${fb}`);
      return;
    }
    console.log(`[capture-step-golden] ${diffs.length} difference(s): ${fa} vs ${fb}\n${formatDiff(diffs)}`);
    process.exitCode = 1;
    return;
  }

  if (!opts.step || !opts.chain) {
    throw new Error('usage: --step=<script> --chain=<chainId|none> [--out=<file>] [--overwrite] [--args=a,b]  |  --compare=<a>,<b>');
  }
  const step = String(opts.step);
  if (!fs.existsSync(step)) throw new Error(`step script not found: ${step}`);
  const args = opts.args ? String(opts.args).split(',').filter(Boolean) : [];

  // Overwrite guard runs BEFORE the child step is spawned (a refused capture
  // must cost seconds, not the step's full runtime — enrich_parcels --full is
  // 45+ minutes). Same decision is re-checked at the write site below, so a
  // file that appears DURING the run is still caught.
  if (opts.out) {
    const decision = overwriteDecision({ ...captureGitState(opts.out), overwriteFlag: opts.overwrite === true });
    if (!decision.allow) {
      throw new Error(`[capture-step-golden] refusing --out=${opts.out}: ${decision.reason}. Remedy: ${decision.remedy}`);
    }
  }

  const descriptorPath = descriptorPathFor(step);
  const descriptor = fs.existsSync(descriptorPath) ? JSON.parse(fs.readFileSync(descriptorPath, 'utf8')) : null;
  const { tables, source: tablesSource } = resolveTables({ descriptor, tablesArg: opts.tables });
  const ceiling = parseRowCeiling(opts['table-row-ceiling']);
  const argColumns = parseTableColumnSpec(opts['table-columns'], '--table-columns');
  const argOrder = parseTableColumnSpec(opts['table-order'], '--table-order');
  const derived = deriveTableSpecs(descriptor);
  const tableSpecs = {};
  for (const t of tables) tableSpecs[t] = resolveTableSpec({ table: t, argColumns, argOrder, derived });
  for (const t of Object.keys({ ...argColumns, ...argOrder })) {
    if (!tables.includes(t)) throw new Error(`--table-columns/--table-order names ${t}, which is not a snapshotted table [${tables.join(',')}]`);
  }
  // R-T addendum (Fold A-4c) — explicit --invariants=<file> still wins (an
  // operator override); otherwise derive from the descriptor's OWN
  // invariants[]/plausibility[] once a step has migrated them (one source of
  // truth per migrated step, not two) — falls back to `null` (today's
  // no-invariants behavior) for a step that has migrated neither.
  const invariantsFile = opts.invariants ? String(opts.invariants) : null;
  const derivedInvariantSpec = invariantsFile ? null : deriveInvariantSpecFromDescriptor(descriptor);
  const invariantSpec = invariantsFile
    ? validateInvariantSpec(JSON.parse(fs.readFileSync(path.resolve(invariantsFile), 'utf8')))
    : derivedInvariantSpec;
  const invariantsSource = invariantsFile ? invariantsFile : (derivedInvariantSpec ? 'descriptor' : null);
  console.log(`[capture-step-golden] tables=[${tables.join(',')}] (source ${tablesSource}; ceiling ${ceiling}) ` +
    `invariants=${invariantSpec ? `${invariantSpec.length} from ${invariantsSource}` : '(none)'}`);
  for (const t of tables) {
    const s = tableSpecs[t];
    console.log(`[capture-step-golden]   ${t}: columns=${s.columns ? s.columns.join(',') : '<all>'} (${s.columns_source}) ` +
      `order=${s.order ? s.order.join(',') : '<pk>'} (${s.order_source})`);
  }

  const raw = await capture({ step, chain: String(opts.chain), args, tables, tablesSource, ceiling, tableSpecs, invariantSpec, invariantsFile });
  const doc = buildCapture(raw);
  assertCaptureIsValid(doc);

  // R-C — the LOCKFILE stamp. Computed after the run (not before): the fields it hashes
  // (step file, descriptor, notes, compute module) are exactly what could have changed
  // BETWEEN this capture and the one it will later be compared against.
  // GAP found by executing (pilot 4, 2026-08-28): R-C's own text scopes the fingerprint
  // check to "docs/reports/golden/<slug>/post/*.json" — a PRE capture (taken before the
  // step's own descriptor exists, e.g. commit 5 of the Spec 123 nine-commit ledger) has no
  // descriptor to fingerprint. Mirror the SAME existence check `descriptor` above already
  // uses (fs.existsSync(descriptorPath) ? ... : null) rather than throwing — a capture with
  // no descriptor yet is legitimately un-fingerprintable, not a lockfile violation.
  let fp = null;
  if (fs.existsSync(descriptorPath)) {
    fp = computeSourceFingerprint({
      step,
      descriptorPath,
      notesPath: notesPathFor(descriptor, descriptorPath),
      computePath: computePathFor(step),
    });
    doc.source_fingerprint = fp.source_fingerprint;
    doc.fingerprint_files = fp.fingerprint_files;
    console.log(`[capture-step-golden] source_fingerprint=${fp.source_fingerprint} ` +
      `over [${fp.fingerprint_files.join(', ')}]`);
  } else {
    doc.source_fingerprint = null;
    doc.fingerprint_files = [];
    doc.fingerprint_skipped_reason = 'no_descriptor_yet';
    console.log(`[capture-step-golden] source_fingerprint SKIPPED — ${descriptorPath} does not exist yet (pre-conversion capture)`);
  }

  const tableLine = doc.table_state
    .map((t) => `${t.table}:${t.row_count}/${t.skipped_reason ?? String(t.content_hash).slice(0, 8)}` +
      (doc.table_timing[t.table] != null ? ` (${doc.table_timing[t.table]} ms)` : ''))
    .join(' ');
  const invLine = doc.invariants.map((i) => `${i.name}=${i.value}`).join(' ');
  const line = `[capture-step-golden] ${step} chain=${doc.chain} exit=${doc.exit_code} ` +
    `verdict=${doc.verdict} ledger=[${doc.ledger_status.join(',')}] ` +
    `summaries=${doc.summary_count} meta=${doc.meta.length} nondeterminism=${doc.nondeterminism.length}` +
    `\n[capture-step-golden] table_state: ${tableLine || '(none)'}` +
    `\n[capture-step-golden] invariants: ${invLine || '(none)'}`;
  if (opts.out) {
    const outPath = path.resolve(String(opts.out));
    const decision = overwriteDecision({ ...captureGitState(outPath), overwriteFlag: opts.overwrite === true });
    if (!decision.allow) {
      throw new Error(`[capture-step-golden] refusing --out=${opts.out} at write time: ${decision.reason}. Remedy: ${decision.remedy}`);
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
    console.log(`${line}\n[capture-step-golden] wrote ${outPath}`);
  } else {
    console.log(line);
    console.log(JSON.stringify(doc.normalised, null, 2));
  }
  console.log(`[capture-step-golden] nondeterminism: ${doc.nondeterminism.join(', ') || '(none)'}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[capture-step-golden] ${err.stack || err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  VOLATILE_KEYS,
  VOLATILE_METRIC_PREFIXES,
  VOLATILE_PATTERNS,
  SUMMARY_MARKER,
  META_MARKER,
  WIDE_TABLE_CELL_THRESHOLD,
  isWideTable,
  captureTableState,
  parseArgs,
  parseMarkers,
  normalise,
  diffNormalised,
  formatDiff,
  buildCapture,
  assertCaptureIsValid,
  DEFAULT_TABLE_ROW_CEILING,
  parseRowCeiling,
  descriptorPathFor,
  resolveTables,
  tableStateDecision,
  orderByClause,
  rowTextExpr,
  parseTableColumnSpec,
  deriveTableSpecs,
  resolveTableSpec,
  validateInvariantSpec,
  deriveInvariantSpecFromDescriptor,
  invariantResult,
  computeSourceFingerprint,
  stripLastMeasuredForFingerprint,
  computePathFor,
  notesPathFor,
  gitHead,
  captureGitState,
  overwriteDecision,
};
