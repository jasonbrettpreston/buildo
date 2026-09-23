#!/usr/bin/env node
'use strict';
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7.2 A5
// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (Rule 10 — verdict row-derived)
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6 (row-derived audit table)
//
// READ-ONLY — this script never writes to the database.
//
// CLOUD-PRE — the pre-dispatch cloud-state checklist (batch-2 row 3.1 prerequisite 0d,
//        2026-09-21). Spec 123 §7.2 A5 names the pre-dispatch checklist as an item; until
//        this file existed the only mechanism enforcing it was hand-editing
//        `programme-items.json` CLOUD-PRE `gate.blocks[]` to drop each slug as it
//        converted (review_followups.md HIGH, 2026-09-18) — the registry invariant passed
//        by REMOVING the check rather than by any slug clearing a real checklist. This is
//        that checklist.
//
// RUN (cloud — the one that matters):
//   DATABASE_URL=$SUPABASE_DATABASE_URL SUPABASE_CA_CERT_PATH=scripts/certs/supabase-ca.pem \
//     node -r dotenv/config scripts/analysis/cloud-pre-dispatch.mjs
// or `npm run cloud:pre` (the alias already passes `-r dotenv/config`).
//
// Six checks, six audit rows, ONE verdict. Every check is a pure function over query
// results (or over a descriptor corpus loaded from disk) — the ONLY DB access is inside
// the check functions below, each of which is handed the pool — so a duck-typed fake pool
// drives the whole set (src/tests/cloud-pre-dispatch.logic.test.ts):
//
//   1. stranded_running_rows   — runbook §3b's own query. A stranded row makes every
//                                dispatch skip BEFORE reconcile-runs.js can reap it.
//   2. migrations_missing      — every NNN_*.sql in migrations/ absent from
//                                schema_migrations (keyed by FILENAME, never by version —
//                                resolve-db.js's file header explains why a version is
//                                unparseable: the sequence has GAPS).
//   3. declared_guards_present — every converted descriptor's guards.requires[] index/
//                                extension/function/column probed with the RUNNER'S OWN
//                                probe (probeRequirement, extracted from index.js).
//   4. table_floors            — COUNT(*) for every converted outputs.writes[].table,
//                                against `sources_<table>_floor` when one is seeded.
//   5. seed_rows_present       — every converted config.logic_variables[].name must have a
//                                logic_variables row. This is the LM-D15 cloud hole: the
//                                runtime throw is per-step and fires mid-run, AFTER the
//                                dispatch has already been spent.
//   6. sharing_chain_running   — isChainRunning('sources'). Dispatch while the chain is up
//                                is a wasted dispatch, not a queued one.
//
// The verdict is `deriveVerdict(rows)` (Rule 10 — the ONLY place a verdict is computed in
// this repo, scripts/lib/step/verdict.js). Exit 1 on FAIL, 0 otherwise, 0 on --dry.
//
// Writes (unless --dry):
//   docs/reports/pipeline-validation/cloud-pre/<YYYY-MM-DDTHH-mm-ssZ>.json
//   docs/reports/pipeline-validation/cloud-pre/<YYYY-MM-DDTHH-mm-ssZ>.md
// (same content: target database name from assertDbTarget, the rows, the verdict).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_DIR = path.join(REPO_ROOT, 'docs/reports/pipeline-validation/cloud-pre');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'migrations');

const seam = require(path.join(REPO_ROOT, 'scripts/lib/step/seam.js'));
const { deriveVerdict } = require(path.join(REPO_ROOT, 'scripts/lib/step/verdict.js'));
const { probeRequirement } = require(path.join(REPO_ROOT, 'scripts/lib/step/index.js'));
const { isChainRunning } = require(path.join(REPO_ROOT, 'scripts/lib/chain-concurrency.js'));

// ─────────────────────────────────────────────────────────────────────────────
// Row construction. Six checks, ONE row shape: {id, severity, value, limit, why}.
// Rules 12's "truthful crash" sibling — a row is built by the check that measured
// it, and the three severities are the only values any check may return.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build one audit row. `severity` is the check's DECLARED roll-up: FAIL turns the
 * verdict (deriveVerdict), WARN reddens it without blocking, INFO never drives it
 * (verdict.js's own SEVERITY_RANK: INFO and PASS are both rank 0).
 *
 * @param {string} id
 * @param {'FAIL'|'WARN'|'INFO'} severity
 * @param {*} value - what was measured (ids, names, counts, booleans) — never prose
 * @param {string} limit - the bound/deliverable this was measured against
 * @param {string} why - why the bound exists, in the reader's terms
 */
function row(id, severity, value, limit, why) {
  return { id, severity, value, limit, why };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. stranded_running_rows — runbook §3b's query.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `pipeline_runs` rows still `running`. Any one of them is a FAIL: per runbook §3b a
 * stranded row makes every dispatch skip BEFORE `scripts/reconcile-runs.js` can reap
 * it, so the dispatch is silently wasted — the exact failure the pre-checks exist to
 * catch. There is no threshold here: zero is the only acceptable count.
 *
 * @param {import('pg').Pool|{query: Function}} pool
 * @returns {Promise<Array<{id: number, pipeline: string, started_at: *}>>}
 */
async function queryStrandedRunningRows(pool) {
  const res = await pool.query(
    "SELECT id, pipeline, started_at FROM pipeline_runs WHERE status = 'running' ORDER BY id",
  );
  return res.rows;
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<ReturnType<typeof row>>}
 */
export async function checkStrandedRunningRows(pool) {
  const rows = await queryStrandedRunningRows(pool);
  const ids = rows.map((r) => r.id);
  return row(
    'stranded_running_rows',
    rows.length > 0 ? 'FAIL' : 'INFO',
    rows.length > 0 ? rows.map((r) => ({ id: r.id, pipeline: r.pipeline, started_at: r.started_at })) : ids,
    '0 running rows',
    'A stranded `running` row makes every dispatch SKIP before reconcile-runs.js can reap it (runbook §3b) — the dispatch is spent and nothing runs. Clear it by hand per §3b, never by re-dispatching.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. migrations_missing — filename-keyed, never version-keyed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every `NNN_*.sql` filename in `migrations/` absent from `schema_migrations`.
 *
 * Keyed by FILENAME, never by a parsed version: `schema_migrations` has no `version`
 * column (scripts/migrate.js's own TRACKING_TABLE_SQL — `filename` is the PRIMARY
 * KEY) and the sequence has GAPS (no 043/049/050/158/…), so a MAX(version) or a
 * parsed leading integer is not a count of anything (resolve-db.js's file header).
 *
 * @param {{query: Function}} pool
 * @param {{listMigrations?: () => string[]}} [deps] - injectable for tests
 * @returns {Promise<string[]>} the missing filenames, sorted
 */
export async function queryMigrationsMissing(pool, deps = {}) {
  const listMigrations = deps.listMigrations || defaultListMigrations;
  const res = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(res.rows.map((r) => r.filename));
  return listMigrations().filter((f) => !applied.has(f));
}

/** All `NNN_*.sql` filenames in the repo's `migrations/` dir, sorted for stability. */
function defaultListMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
}

/**
 * @param {import('pg').Pool} pool
 * @param {{listMigrations?: () => string[]}} [deps]
 * @returns {Promise<ReturnType<typeof row>>}
 */
export async function checkMigrationsMissing(pool, deps = {}) {
  const missing = await queryMigrationsMissing(pool, deps);
  return row(
    'migrations_missing',
    missing.length > 0 ? 'FAIL' : 'INFO',
    missing.length > 0 ? missing : [],
    'every migrations/*.sql filename present in schema_migrations',
    'A migration absent from schema_migrations was never applied to THIS database — the schema the descriptors were validated against is not the schema the dispatch would run against. Keyed by filename: schema_migrations has no version column and the sequence has gaps.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. declared_guards_present — the runner's OWN probe (probeRequirement).
// ─────────────────────────────────────────────────────────────────────────────

/** Requirement kinds this check probes — `rls_bypass_or_policy` is excluded by design
 * (it is measured by `write.assertWritePrivileges` in the runner, not by a catalog probe). */
const PROBED_KINDS = new Set(['index', 'extension', 'function', 'column']);

/**
 * Every declared `guards.requires[]` entry — across every converted descriptor — that
 * the target database does NOT satisfy, tagged with the descriptor's own `on_missing`.
 *
 * Probes with `probeRequirement` (scripts/lib/step/index.js), the SAME function the
 * runner's `assertRequirements` calls: a requirement the runner would refuse on is a
 * requirement this checklist refuses on, measured with one copy of the SQL.
 *
 * @param {{query: Function}} pool
 * @param {Record<string, {descriptor: object, slug: string}>} descriptorsByName
 * @returns {Promise<Array<{slug: string, name: string, kind: string, on_missing: string}>>}
 */
export async function queryMissingGuards(pool, descriptorsByName) {
  const missing = [];
  for (const [slug, { descriptor }] of Object.entries(descriptorsByName)) {
    const requires = (descriptor.guards && descriptor.guards.requires) || [];
    for (const r of requires) {
      if (!PROBED_KINDS.has(r.kind)) continue;
      const { present } = await probeRequirement(pool, r);
      if (!present) missing.push({ slug, name: r.name, kind: r.kind, on_missing: r.on_missing });
    }
  }
  return missing;
}

/**
 * FAIL when a missing requirement is declared `on_missing: "fail"` (the runner would
 * refuse the step); WARN otherwise (the runner logs and continues — a degraded run is
 * new information for the operator, not this checklist's call to block on).
 *
 * @param {import('pg').Pool} pool
 * @param {Record<string, {descriptor: object, slug: string}>} descriptorsByName
 * @returns {Promise<ReturnType<typeof row>>}
 */
export async function checkDeclaredGuardsPresent(pool, descriptorsByName) {
  const missing = await queryMissingGuards(pool, descriptorsByName);
  const failing = missing.filter((m) => m.on_missing === 'fail');
  const severity = failing.length > 0 ? 'FAIL' : (missing.length > 0 ? 'WARN' : 'INFO');
  return row(
    'declared_guards_present',
    severity,
    missing.map((m) => `${m.slug}:${m.name}`),
    'every converted descriptor\'s guards.requires[] index/extension/function/column present',
    'guards.requires[] is THE preconditions, checked before the first read. A missing index is not a slower run, it is an unbounded one; a missing extension can silently switch the step to a second algorithm. on_missing:"fail" means the runner refuses outright — a dispatch would abort mid-chain.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. table_floors — COUNT(*) vs the sources_<table>_floor variables.
// ─────────────────────────────────────────────────────────────────────────────

/** `sources_<table>_floor` — the naming assert-data-bounds.descriptor.json seeds. */
function floorVariableName(table) {
  return `sources_${table}_floor`;
}

/** Every distinct `outputs.writes[].table` across every converted descriptor, sorted. */
export function convertedWriteTables(descriptorsByName) {
  const tables = new Set();
  for (const { descriptor } of Object.values(descriptorsByName)) {
    const writes = (descriptor.outputs && descriptor.outputs.writes) || [];
    for (const w of writes) if (w && w.table) tables.add(w.table);
  }
  return [...tables].sort();
}

/**
 * For every converted `outputs.writes[].table`: its `COUNT(*)`, and the
 * `sources_<table>_floor` value when one is seeded. FAIL below the floor; INFO
 * (count only) when no floor is declared — a table with no floor is not a failure,
 * it is a table nobody has set a bound for yet, and saying so is the honest report.
 *
 * @param {{query: Function}} pool
 * @param {Record<string, {descriptor: object}>} descriptorsByName
 * @returns {Promise<{tables: string[], results: Array<{table: string, count: number, floor: number|null, floor_variable: string}>, below: string[]}>}
 */
export async function queryTableFloors(pool, descriptorsByName) {
  const tables = convertedWriteTables(descriptorsByName);
  const floorNames = tables.map(floorVariableName);
  let floors = new Map();
  if (floorNames.length > 0) {
    const res = await pool.query(
      'SELECT variable_key, variable_value FROM logic_variables WHERE variable_key = ANY($1)',
      [floorNames],
    );
    floors = new Map(res.rows.map((r) => [r.variable_key, Number(r.variable_value)]));
  }
  const results = [];
  const below = [];
  for (const table of tables) {
    const cntRes = await pool.query(`SELECT COUNT(*)::int AS n FROM ${quoteIdent(table)}`);
    const count = cntRes.rows[0] ? cntRes.rows[0].n : 0;
    const floorVariable = floorVariableName(table);
    const floor = floors.has(floorVariable) && Number.isFinite(floors.get(floorVariable)) ? floors.get(floorVariable) : null;
    results.push({ table, count, floor, floor_variable: floorVariable });
    if (floor !== null && count < floor) below.push(table);
  }
  return { tables, results, below };
}

/** Minimal identifier quoting — table names come from checked-in descriptors, but an
 * interpolated identifier is still quoted rather than trusted (this is the ONE place
 * this file interpolates anything into SQL; every other query is parameterized). */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * @param {import('pg').Pool} pool
 * @param {Record<string, {descriptor: object}>} descriptorsByName
 * @returns {Promise<ReturnType<typeof row>>}
 */
export async function checkTableFloors(pool, descriptorsByName) {
  const { results, below } = await queryTableFloors(pool, descriptorsByName);
  return row(
    'table_floors',
    below.length > 0 ? 'FAIL' : 'INFO',
    results,
    'every converted outputs.writes[].table at or above its sources_<table>_floor',
    'A source table below its floor means the upstream load did not finish (or was never run) on THIS database — every downstream step would compute against a truncated population and still report a clean verdict. Tables with no declared floor are reported with their count only.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. seed_rows_present — the LM-D15 cloud hole.
// ─────────────────────────────────────────────────────────────────────────────

/** Every `config.logic_variables[].name` declared by every converted descriptor. */
export function declaredLogicVariables(descriptorsByName) {
  const names = new Set();
  for (const { descriptor } of Object.values(descriptorsByName)) {
    const vars = (descriptor.config && descriptor.config.logic_variables) || [];
    for (const v of vars) if (v && v.name) names.add(v.name);
  }
  return [...names].sort();
}

/**
 * Every declared logic variable with no `logic_variables` row (keyed on
 * `variable_key`).
 *
 * THIS IS THE LM-D15 CLOUD HOLE. A descriptor declaring a variable the cloud DB has
 * never seeded throws at `scripts/lib/step/config.js` — mid-run, at the point the
 * variable is first read, AFTER the dispatch has already been spent and after any
 * earlier step in the chain has already written. Checking it here costs one query and
 * converts a wasted multi-hour dispatch into a pre-dispatch FAIL.
 *
 * @param {{query: Function}} pool
 * @param {Record<string, {descriptor: object}>} descriptorsByName
 * @returns {Promise<string[]>} the missing variable names, sorted
 */
export async function queryMissingLogicVariables(pool, descriptorsByName) {
  const declared = declaredLogicVariables(descriptorsByName);
  if (declared.length === 0) return [];
  const res = await pool.query('SELECT variable_key FROM logic_variables WHERE variable_key = ANY($1)', [declared]);
  const seeded = new Set(res.rows.map((r) => r.variable_key));
  return declared.filter((n) => !seeded.has(n));
}

/**
 * @param {import('pg').Pool} pool
 * @param {Record<string, {descriptor: object}>} descriptorsByName
 * @returns {Promise<ReturnType<typeof row>>}
 */
export async function checkSeedRowsPresent(pool, descriptorsByName) {
  const missing = await queryMissingLogicVariables(pool, descriptorsByName);
  return row(
    'seed_rows_present',
    missing.length > 0 ? 'FAIL' : 'INFO',
    missing,
    'every converted config.logic_variables[].name has a logic_variables row',
    'LM-D15 — scripts/lib/step/config.js throws on an unseeded variable. On cloud that throw lands MID-RUN, after the dispatch is spent: this check is the same failure mode measured before dispatch instead of after.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. sharing_chain_running — isChainRunning for the sources chain.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `isChainRunning(pool, 'sources')` (scripts/lib/chain-concurrency.js — the ONE source
 * of the exact query Spec 113 §8.3 pins). A chain already up means the dispatch is
 * refused/skipped, not queued: wasted, not deferred.
 *
 * @param {import('pg').Pool} pool
 * @param {string} [chainId]
 * @returns {Promise<ReturnType<typeof row>>}
 */
export async function checkSharingChainRunning(pool, chainId = 'sources') {
  const { running, row: chainRow } = await isChainRunning(pool, chainId);
  return row(
    'sharing_chain_running',
    running ? 'FAIL' : 'INFO',
    { chain: chainId, running, row: chainRow },
    `no running chain_${chainId} row within the 12h TTL window`,
    'A chain already running means the dispatch is refused/skipped rather than queued (Spec 113 §8.3 12h TTL) — a spent dispatch with nothing to show for it. Wait for the terminal status of the chain instead of re-dispatching.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The checklist + the report.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all six checks against the target, in declaration order, and fold to ONE
 * report. The verdict is `deriveVerdict(rows)` — never a hand-rolled cascade, and
 * never derived from anything but the rows themselves (Rule 10).
 *
 * @param {import('pg').Pool} pool
 * @param {{descriptorsByName?: Record<string, {descriptor: object}>, database?: string, listMigrations?: () => string[]}} [opts]
 * @returns {Promise<{database: string|null, generated_at: string, rows: Array<object>, verdict: 'PASS'|'WARN'|'FAIL'}>}
 */
export async function buildReport(pool, opts = {}) {
  const descriptorsByName = opts.descriptorsByName || seam.loadConvertedDescriptors();
  const rows = [
    await checkStrandedRunningRows(pool),
    await checkMigrationsMissing(pool, { listMigrations: opts.listMigrations }),
    await checkDeclaredGuardsPresent(pool, descriptorsByName),
    await checkTableFloors(pool, descriptorsByName),
    await checkSeedRowsPresent(pool, descriptorsByName),
    await checkSharingChainRunning(pool, 'sources'),
  ];
  return {
    database: opts.database ?? null,
    generated_at: new Date().toISOString(),
    rows,
    // deriveVerdict (Rule 10) reads `.status` — the generic verdict-cascade field
    // name used everywhere else in scripts/lib/step/verdict.js. This checklist's
    // row shape is `{id, severity, value, limit, why}` (Spec 123 §7.2 A5's own
    // vocabulary: a FLEET-wide pre-dispatch row is not a per-descriptor CHECK
    // row), so the two field names are bridged here — the cascade itself is still
    // computed by deriveVerdict alone, never re-implemented.
    verdict: deriveVerdict(rows.map((r) => ({ status: r.severity }))),
  };
}

/** `2026-09-21T14-03-09Z` — filesystem-safe, UTC, sortable. */
export function reportStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

/** The audit table, rendered for a terminal — fixed-width columns, no colour. */
export function renderConsoleTable(rows) {
  const header = ['ID', 'SEVERITY', 'LIMIT', 'VALUE'];
  const body = rows.map((r) => [r.id, r.severity, r.limit, JSON.stringify(r.value)]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [line(header), line(header.map((_, i) => '-'.repeat(widths[i]))), ...body.map(line)].join('\n');
}

/** The same content as the JSON artifact, as markdown. */
export function renderMarkdown(report) {
  const rows = report.rows
    .map((r) => `| ${r.id} | ${r.severity} | ${r.limit} | \`${JSON.stringify(r.value)}\` |`)
    .join('\n');
  const why = report.rows.map((r) => `- **${r.id}** — ${r.why}`).join('\n');
  return `# CLOUD-PRE — pre-dispatch cloud-state checklist

**Verdict:** ${report.verdict} | **Database:** ${report.database ?? '(unknown)'} | **Generated:** ${report.generated_at}

Spec 123 §7.2 A5 pre-dispatch checklist · Spec 124 Rule 10 (verdict row-derived via \`deriveVerdict\`) · Spec 48 §3.6. **READ-ONLY — this script never writes to the database.** Exit 1 on FAIL.

| Check | Severity | Limit | Value |
|-------|----------|-------|-------|
${rows}

## Why each check exists

${why}
`;
}

/**
 * Write `<stamp>.json` + `<stamp>.md` under the report dir (same content).
 * @param {object} report
 * @param {string} [outDir]
 */
export function writeReport(report, outDir = REPORT_DIR) {
  mkdirSync(outDir, { recursive: true });
  const base = reportStamp(new Date(report.generated_at));
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  return { jsonPath, mdPath };
}

/** Usage text — printed by `--help`, which must succeed with no DB and no env. */
export function usage() {
  return [
    'Usage: node -r dotenv/config scripts/analysis/cloud-pre-dispatch.mjs [options]',
    '',
    'READ-ONLY pre-dispatch cloud-state checklist (Spec 123 §7.2 A5). Six checks, one',
    'verdict (deriveVerdict, Spec 124 Rule 10). Exit 1 on FAIL, 0 otherwise.',
    '',
    'Options:',
    '  --out=<dir>   write the report under <dir> instead of',
    '                docs/reports/pipeline-validation/cloud-pre/',
    '  --dry         run the checks and print, write NO files',
    '  --help, -h    print this usage and exit 0 (no DB, no env needed)',
    '',
    'Cloud run:',
    '  DATABASE_URL=$SUPABASE_DATABASE_URL SUPABASE_CA_CERT_PATH=scripts/certs/supabase-ca.pem \\',
    '    node -r dotenv/config scripts/analysis/cloud-pre-dispatch.mjs',
    '  (or `npm run cloud:pre`)',
  ].join('\n');
}

/** Parse argv the way this file documents: `--out=<dir>`, `--dry`, `--help`/`-h`. */
export function parseArgs(argv) {
  const opts = { out: null, dry: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--dry') opts.dry = true;
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length) || null;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return 0;
  }

  const { createResolvedPool } = require(path.join(REPO_ROOT, 'scripts/lib/resolve-db.js'));
  const pool = createResolvedPool({ label: 'cloud-pre-dispatch' });
  try {
    // The target's own identity — `assertDbTarget` logs it on the first checkout
    // (resolve-db.js contract (b)) and is re-read here so the report NAMES the
    // database it graded rather than leaving the reader to infer it from the log.
    const idRes = await pool.query('SELECT current_database() AS database');
    const database = idRes.rows[0] ? idRes.rows[0].database : null;

    const report = await buildReport(pool, { database });

    console.log(renderConsoleTable(report.rows));
    console.log(`\nverdict: ${report.verdict} (database: ${database ?? '(unknown)'})`);
    for (const r of report.rows) {
      if (r.severity === 'FAIL') console.log(`  FAIL ${r.id}: ${JSON.stringify(r.value)} — ${r.why}`);
    }

    if (opts.dry) {
      console.log('\n[dry] no report written');
    } else {
      const { jsonPath, mdPath } = writeReport(report, opts.out || REPORT_DIR);
      console.log(`[cloud-pre-dispatch] wrote ${jsonPath}`);
      console.log(`[cloud-pre-dispatch] wrote ${mdPath}`);
    }

    return report.verdict === 'FAIL' ? 1 : 0;
  } finally {
    await pool.end();
  }
}

// Guarded CLI entrypoint (mirrors chain-end-synthesis.mjs's ESM-shaped
// `require.main === module` guard): safe to `import` this file's pure functions from
// a test process without spawning a real DB pool as a side effect.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      console.error(`[cloud-pre-dispatch] ${err.stack || err.message}`);
      process.exit(1);
    });
}

export { row, quoteIdent, floorVariableName };
