#!/usr/bin/env node
/**
 * supabase-load-gates — the G10 gate runner: compares SOURCE (Docker dev DB)
 * vs TARGET (Supabase local stack or cloud project) and emits a PASS/FAIL
 * table. Generalized as a reusable library (Spec 112 §4.3) so both
 * `scripts/restore-db.js` (Phase 0.5/4.0 loads) and any future restore call
 * the exact same gates — never a bespoke one-off comparison.
 *
 * Gates implemented (per `.cursor/active_task.md` G10 + Spec 113 §13):
 *   (a) per-table exact row counts, every public table both sides
 *   (b) invalid-geometry ID-SET diff for parcels/building_footprints
 *       (matching COUNT with a different ID SET is a genuine drift signal,
 *       not a pass — Spec 113 §13 GEOS-version drift)
 *   (c) sequence last_value comparison (pg_depend-derived ownership, not a
 *       `<table>_id_seq` naming-convention guess)
 *   (d) mv_monthly_permit_stats row count; ALWAYS REFRESH before comparing,
 *       not just when empty (matviews are NOT populated by a data-only
 *       restore, and a non-empty-but-stale matview is a false pass otherwise)
 *   (e) postgis_full_version() recorded both sides
 *   (f) exact pinned-baseline assertions (G10: parcels/permits/coa/footprints)
 *   (g) double-precision epsilon check for parcels.ravine_distance_m on a
 *       1000-row keyed sample (relative epsilon 1e-9); a source-populated/
 *       target-null (or vice versa) mismatch is reported explicitly as a
 *       `nullMismatch`, distinct from a genuinely missing id
 *
 * Every gate is scope-aware: when `restore-db.js --tables=t1,t2` loads only a
 * subset (e.g. the Phase 0.5 smoke test), gates whose table isn't in scope
 * report SKIP rather than a false FAIL/PASS on data that was never loaded.
 *
 * CLI usage:
 *   node scripts/validation/supabase-load-gates.js [--target=local|cloud] [--tables=t1,t2]
 *
 * Exit code: non-zero if any gate reports FAIL.
 *
 * SPEC LINK: docs/specs/00-architecture/112_backup_recovery.md §4.3
 * SPEC LINK: docs/specs/00-architecture/113_supabase_infrastructure.md §9, §13
 * SPEC LINK: .cursor/active_task.md (Ground truth G10)
 */
'use strict';

const { Pool } = require('pg');
const { resolveSslConfig, isLocalMode } = require('../lib/ssl-config');

// ---------------------------------------------------------------------------
// Constants — G10 pinned baseline (live dev DB, 2026-07-18 Reality-Check)
// ---------------------------------------------------------------------------

const LOCAL_TARGET_DEFAULT = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Tables never diffed/loaded — see scripts/restore-db.js header for the
// logic_variables decision (deliberately NOT excluded here).
const EXCLUDED_TABLES = ['schema_migrations', 'spatial_ref_sys'];

const G10_ROW_COUNT_BASELINE = {
  permits: 254082,
  parcels: 486530,
  coa_applications: 33400,
  building_footprints: 427077,
};

const G10_INVALID_GEOM_EXPECTED_COUNT = {
  parcels: 16,
  building_footprints: 17,
};

const G10_MATVIEW_EXPECTED_ROWS = {
  mv_monthly_permit_stats: 4190,
};

const RAVINE_EPSILON_SAMPLE_SIZE = 1000;
const RAVINE_RELATIVE_EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// Pure logic — table-scoping, identifier safety, comparison functions.
// Exported individually so src/tests/restore-db.logic.test.ts can exercise
// each without a live DB.
// ---------------------------------------------------------------------------

/**
 * Compute the eligible/loadable table list: tables present in BOTH source and
 * target, minus EXCLUDED_TABLES, optionally further restricted+validated
 * against an operator-supplied `requested` subset (restore-db.js --tables).
 *
 * @param {{ sourceTables: string[], targetTables: string[], excluded?: string[], requested?: string[]|null }} args
 * @returns {string[]} sorted table names
 */
function computeTableList({ sourceTables, targetTables, excluded = EXCLUDED_TABLES, requested = null }) {
  const targetSet = new Set(targetTables);
  const excludedSet = new Set(excluded);
  const eligible = sourceTables.filter((t) => targetSet.has(t) && !excludedSet.has(t)).sort();
  if (!requested || requested.length === 0) return eligible;
  const eligibleSet = new Set(eligible);
  const invalid = requested.filter((t) => !eligibleSet.has(t));
  if (invalid.length > 0) {
    throw new Error(
      `--tables requested table(s) not eligible for load (missing on target, excluded, or absent on source): ${invalid.join(', ')}`
    );
  }
  return requested.slice().sort();
}

/** Strict identifier validator — refuses anything that isn't a bare SQL identifier. */
function quoteIdent(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to quote unsafe identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

/**
 * Auth-linked auto-exclusion decision (P4-F0 fold C2, Integration MED —
 * reproduced live). Pure; the DB half is getAuthLinkedTables below.
 *
 * On a REMOTE (non-loopback) target, public tables carrying an FK into
 * auth.users are never source-comparable: greenfield-empty at load time
 * (their dev rows reference dev auth.users uuids absent on cloud), and
 * holding REAL user rows that diverge from the dev source after launch. An
 * UNSCOPED run against such a target must exclude them — the F0 session's
 * hand-typed 68-table CLI list, codified. Two carve-outs:
 *   - a LOCAL target keeps them (the D13 full-load flow loads and verifies
 *     user tables against the local stack's own auth.users);
 *   - an explicit `--tables` scope wins verbatim (operator override — the
 *     request already passed computeTableList validation).
 *
 * @param {{ tables: string[], authLinkedTables: string[], requested?: string[]|null, targetIsLocal: boolean }} args
 * @returns {{ tables: string[], excluded: string[] }}
 */
function applyAuthLinkedExclusion({ tables, authLinkedTables, requested = null, targetIsLocal }) {
  if (targetIsLocal || (requested && requested.length > 0)) {
    return { tables, excluded: [] };
  }
  const authSet = new Set(authLinkedTables || []);
  const excluded = tables.filter((t) => authSet.has(t));
  if (excluded.length === 0) return { tables, excluded };
  return { tables: tables.filter((t) => !authSet.has(t)), excluded };
}

/**
 * Compare per-table row counts. counts are { [table]: number } maps.
 * @returns {{table: string, source: number, target: number, status: 'PASS'|'FAIL'}[]}
 */
function compareRowCounts(sourceCounts, targetCounts) {
  const tables = Object.keys(sourceCounts).sort();
  return tables.map((table) => {
    const source = sourceCounts[table];
    const target = targetCounts[table];
    return { table, source, target, status: source === target ? 'PASS' : 'FAIL' };
  });
}

/**
 * Compare invalid-geometry ID sets (not just counts — a matching count with a
 * DIFFERENT id set is a genuine GEOS-version drift signal, Spec 113 §13).
 * @param {number[]} sourceIds
 * @param {number[]} targetIds
 * @param {number} expectedCount
 */
function compareIdSets(sourceIds, targetIds, expectedCount) {
  const sourceSet = new Set(sourceIds);
  const targetSet = new Set(targetIds);
  const missingInTarget = sourceIds.filter((id) => !targetSet.has(id)).sort((a, b) => a - b);
  const extraInTarget = targetIds.filter((id) => !sourceSet.has(id)).sort((a, b) => a - b);
  const idSetMatches = missingInTarget.length === 0 && extraInTarget.length === 0;
  const sourceCountMatchesExpected = sourceIds.length === expectedCount;
  const status = idSetMatches && sourceCountMatchesExpected ? 'PASS' : 'FAIL';
  return {
    status,
    sourceCount: sourceIds.length,
    targetCount: targetIds.length,
    expectedCount,
    idSetMatches,
    missingInTarget,
    extraInTarget,
  };
}

/**
 * Compare sequence last_value across source/target for a given set of
 * sequences (already scoped to sequences owned by in-scope tables).
 * @param {{sequence_name: string, last_value: number|null}[]} sourceSeqs
 * @param {{sequence_name: string, last_value: number|null}[]} targetSeqs
 */
function compareSequences(sourceSeqs, targetSeqs) {
  const targetMap = new Map(targetSeqs.map((s) => [s.sequence_name, s.last_value]));
  return sourceSeqs
    .map((s) => {
      const targetVal = targetMap.has(s.sequence_name) ? targetMap.get(s.sequence_name) : undefined;
      const status = targetMap.has(s.sequence_name) && targetVal === s.last_value ? 'PASS' : 'FAIL';
      return { sequence: s.sequence_name, source: s.last_value, target: targetVal ?? null, status };
    })
    .sort((a, b) => a.sequence.localeCompare(b.sequence));
}

/**
 * G10 exact pinned-baseline assertions — only meaningful for tables actually
 * in scope for this run (full load vs a smoke-test subset).
 * @param {{[table: string]: number}} counts - the TARGET's row counts
 * @param {string[]} scopedTables
 */
function checkBaselineAssertions(counts, scopedTables) {
  const scopedSet = new Set(scopedTables);
  return Object.entries(G10_ROW_COUNT_BASELINE).map(([table, expected]) => {
    if (!scopedSet.has(table)) {
      return { table, expected, actual: null, status: 'SKIP' };
    }
    const actual = counts[table];
    return { table, expected, actual, status: actual === expected ? 'PASS' : 'FAIL' };
  });
}

/**
 * Sample-based double-precision epsilon comparison (Spec 113 §12's systematic
 * float rule for the 0.5 gate). Rows are `{ id, value }` keyed on the same PK
 * both sides (a data-only restore never renumbers PKs).
 *
 * Null handling: a row present on both sides with `value: null` on both is
 * fine (nothing to compare, not a failure). A row where exactly ONE side is
 * null — source populated but target null, or vice versa — is a
 * `nullMismatch`: a genuine drift signal (the value did not survive whatever
 * produced the target side) that must be reported explicitly rather than
 * folded into `missingKeys` (a different failure mode: the id itself absent
 * from the target sample) or silently treated as a 0-vs-value numeric diff
 * (which the old `value ?? 0` coalescing did — masking a null as a real
 * epsilon-scale value of exactly 0, passing by coincidence unless the other
 * side was also near 0).
 *
 * @param {{id: number, value: number|null}[]} sourceRows
 * @param {{id: number, value: number|null}[]} targetRows
 * @param {{ relEpsilon?: number }} [opts]
 */
function compareRavineEpsilonSample(sourceRows, targetRows, opts = {}) {
  const relEpsilon = opts.relEpsilon ?? RAVINE_RELATIVE_EPSILON;
  const targetMap = new Map(targetRows.map((r) => [r.id, r.value]));
  let count = 0;
  let sourceSum = 0;
  let targetSum = 0;
  let maxAbsDiff = 0;
  const missingKeys = [];
  const nullMismatches = [];
  for (const { id, value } of sourceRows) {
    if (!targetMap.has(id)) {
      missingKeys.push(id);
      continue;
    }
    const targetValue = targetMap.get(id);
    const sourceIsNull = value === null || value === undefined;
    const targetIsNull = targetValue === null || targetValue === undefined;
    if (sourceIsNull !== targetIsNull) {
      nullMismatches.push({ id, source: value, target: targetValue });
      continue;
    }
    count += 1;
    if (sourceIsNull && targetIsNull) continue; // both null — matched, nothing numeric to compare
    sourceSum += value ?? 0;
    targetSum += targetValue ?? 0;
    const absDiff = Math.abs((value ?? 0) - (targetValue ?? 0));
    if (absDiff > maxAbsDiff) maxAbsDiff = absDiff;
  }
  const sumAbsDiff = Math.abs(sourceSum - targetSum);
  const sumRelDiff = sourceSum !== 0 ? sumAbsDiff / Math.abs(sourceSum) : sumAbsDiff;
  const status =
    missingKeys.length === 0 && nullMismatches.length === 0 && sumRelDiff <= relEpsilon ? 'PASS' : 'FAIL';
  return {
    status,
    count,
    sourceSum,
    targetSum,
    sumAbsDiff,
    sumRelDiff,
    maxAbsDiff,
    missingKeys,
    nullMismatches,
    relEpsilon,
  };
}

/** Roll a list of gate rows (each with a `.status`) up into an overall verdict — row-derived, never a parallel boolean. */
function rollUpVerdict(rows) {
  const statuses = rows.map((r) => r.status);
  if (statuses.some((s) => s === 'FAIL')) return 'FAIL';
  if (statuses.some((s) => s === 'WARN')) return 'WARN';
  return 'PASS';
}

// ---------------------------------------------------------------------------
// DB-touching helpers
// ---------------------------------------------------------------------------

async function getBaseTables(pool) {
  const res = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  return res.rows.map((r) => r.table_name);
}

/**
 * The DB half of the C2 auth-linked exclusion: derive, from the TARGET's own
 * pg_constraint, every public table with a direct FK into auth.users. Returns
 * [] when the auth schema / auth.users doesn't exist (the Docker dev source,
 * a plain-Postgres target) — the join against the auth-side pg_namespace
 * simply matches nothing, no error. Derived at runtime so the list can never
 * go stale as migrations add user-linked tables (Integration's live query,
 * codified verbatim).
 * @param {import('pg').Pool} pool
 * @returns {Promise<string[]>} sorted public table names
 */
async function getAuthLinkedTables(pool) {
  const res = await pool.query(`
    SELECT DISTINCT rel.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class rel  ON rel.oid  = con.conrelid
    JOIN pg_namespace reln ON reln.oid = rel.relnamespace
    JOIN pg_class ref  ON ref.oid  = con.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE con.contype = 'f'
      AND reln.nspname = 'public'
      AND refn.nspname = 'auth'
      AND ref.relname  = 'users'
    ORDER BY 1
  `);
  return res.rows.map((r) => r.table_name);
}

async function getRowCounts(pool, tables) {
  const counts = {};
  for (const t of tables) {
    const res = await pool.query(`SELECT count(*)::bigint AS n FROM public.${quoteIdent(t)}`);
    counts[t] = Number(res.rows[0].n);
  }
  return counts;
}

async function getInvalidGeomIds(pool, table) {
  const res = await pool.query(
    `SELECT id FROM public.${quoteIdent(table)} WHERE geom IS NOT NULL AND NOT ST_IsValid(geom) ORDER BY id`
  );
  return res.rows.map((r) => r.id);
}

/** Sequence ownership via pg_depend — robust to non-`<table>_id_seq` names, unlike a naming-convention guess. */
async function getSequenceOwnership(pool) {
  const res = await pool.query(`
    SELECT s.relname AS sequence_name, t.relname AS owner_table
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
    JOIN pg_class t ON d.refobjid = t.oid
    WHERE s.relkind = 'S' AND s.relnamespace = 'public'::regnamespace
    ORDER BY 1
  `);
  return res.rows;
}

async function getSequenceValues(pool) {
  const res = await pool.query(
    `SELECT sequencename AS sequence_name, last_value FROM pg_sequences WHERE schemaname = 'public' ORDER BY 1`
  );
  return res.rows.map((r) => ({
    sequence_name: r.sequence_name,
    last_value: r.last_value === null ? null : Number(r.last_value),
  }));
}

async function getMatviewCount(pool, viewName) {
  const res = await pool.query(`SELECT count(*)::bigint AS n FROM public.${quoteIdent(viewName)}`);
  return Number(res.rows[0].n);
}

async function refreshMatview(pool, viewName) {
  await pool.query(`REFRESH MATERIALIZED VIEW public.${quoteIdent(viewName)}`);
}

async function getPostgisVersion(pool) {
  const res = await pool.query('SELECT postgis_full_version() AS v');
  return res.rows[0].v;
}

/** SOURCE sample — the population of interest (rows source claims a ravine value for). */
async function getRavineSample(pool, sampleSize = RAVINE_EPSILON_SAMPLE_SIZE) {
  const res = await pool.query(
    `SELECT id, ravine_distance_m AS value FROM public.parcels
     WHERE ravine_distance_m IS NOT NULL ORDER BY id LIMIT $1`,
    [sampleSize]
  );
  return res.rows.map((r) => ({ id: r.id, value: r.value === null ? null : Number(r.value) }));
}

/**
 * TARGET sample for a fixed id list — deliberately NOT filtered by
 * `IS NOT NULL` (unlike getRavineSample). Fetching the target's value for
 * exactly the SOURCE's non-null-sample ids, whatever that value is (real
 * number or null), is what lets compareRavineEpsilonSample detect a
 * source-populated/target-null XOR mismatch — the old design queried both
 * sides independently with the same `IS NOT NULL` filter, so a value that
 * went missing on the target (restore/computation dropped it) never showed
 * up in the target's own sample at all and was folded into the generic
 * `missingKeys` bucket instead of being flagged as the null-drift it is. An
 * id absent from the target table entirely also resolves to `value: null`
 * here (same observable outcome — the value did not survive).
 * @param {import('pg').Pool} pool
 * @param {number[]} ids
 */
async function getRavineSampleForIds(pool, ids) {
  if (!ids || ids.length === 0) return [];
  const res = await pool.query(
    `SELECT id, ravine_distance_m AS value FROM public.parcels WHERE id = ANY($1::int[])`,
    [ids]
  );
  const byId = new Map(res.rows.map((r) => [r.id, r.value === null ? null : Number(r.value)]));
  return ids.map((id) => ({ id, value: byId.has(id) ? byId.get(id) : null }));
}

// ---------------------------------------------------------------------------
// Connection resolution — shared by the CLI entry and restore-db.js
// ---------------------------------------------------------------------------

/** Source is always the Docker dev DB (PG_* env vars), per Phase 0.5's `.env` contract. */
function resolveSourcePool() {
  const host = process.env.PG_HOST || 'localhost';
  return new Pool({
    host,
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: process.env.PG_DATABASE || 'buildo',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    ssl: resolveSslConfig({ host }),
  });
}

/**
 * Target per Spec 113 §3 D14 env contract: local stack reads `DATABASE_URL`
 * (falling back to the CLI-printed default local Supabase URL when unset —
 * Phase 0.5 runs before the canonical dev `.env` DATABASE_URL is repointed at
 * D13 cutover, so an unset var here is the expected pre-cutover state, not an
 * error); cloud project reads `SUPABASE_DATABASE_URL`.
 */
function resolveTargetConnectionString(target) {
  if (target === 'cloud') {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error('SUPABASE_DATABASE_URL is not set — required for --target=cloud');
    return url;
  }
  if (target !== 'local') throw new Error(`Unknown --target=${target} — must be "local" or "cloud"`);
  return process.env.DATABASE_URL || LOCAL_TARGET_DEFAULT;
}

function resolveTargetPool(target) {
  const connectionString = resolveTargetConnectionString(target);
  return new Pool({ connectionString, ssl: resolveSslConfig({ connectionString }) });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run every applicable gate and return a report. Gates whose relevant table
 * is outside `tables` scope report SKIP, not a false PASS/FAIL.
 *
 * @param {{ sourcePool: import('pg').Pool, targetPool: import('pg').Pool, tables: string[] }} args
 */
async function runAllGates({ sourcePool, targetPool, tables }) {
  const rows = [];
  const scopedSet = new Set(tables);

  // (a) per-table row counts
  const sourceCounts = await getRowCounts(sourcePool, tables);
  const targetCounts = await getRowCounts(targetPool, tables);
  const rowCountRows = compareRowCounts(sourceCounts, targetCounts);
  for (const r of rowCountRows) {
    rows.push({ gate: 'row_count', metric: r.table, source: r.source, target: r.target, status: r.status });
  }

  // (b) invalid-geometry id-set diff (parcels, building_footprints)
  const geomResults = {};
  for (const table of Object.keys(G10_INVALID_GEOM_EXPECTED_COUNT)) {
    if (!scopedSet.has(table)) {
      rows.push({ gate: 'invalid_geom_idset', metric: table, source: null, target: null, status: 'SKIP' });
      continue;
    }
    const [sourceIds, targetIds] = await Promise.all([
      getInvalidGeomIds(sourcePool, table),
      getInvalidGeomIds(targetPool, table),
    ]);
    const cmp = compareIdSets(sourceIds, targetIds, G10_INVALID_GEOM_EXPECTED_COUNT[table]);
    geomResults[table] = cmp;
    rows.push({
      gate: 'invalid_geom_idset',
      metric: table,
      source: cmp.sourceCount,
      target: cmp.targetCount,
      status: cmp.status,
      detail: cmp.idSetMatches ? undefined : { missingInTarget: cmp.missingInTarget, extraInTarget: cmp.extraInTarget },
    });
  }

  // (c) sequence last_value comparison, scoped to sequences owned by in-scope tables
  const [sourceOwnership, sourceSeqValues, targetSeqValues] = await Promise.all([
    getSequenceOwnership(sourcePool),
    getSequenceValues(sourcePool),
    getSequenceValues(targetPool),
  ]);
  const ownerByName = new Map(sourceOwnership.map((r) => [r.sequence_name, r.owner_table]));
  const scopedSourceSeqs = sourceSeqValues.filter((s) => scopedSet.has(ownerByName.get(s.sequence_name)));
  const seqComparisons = compareSequences(scopedSourceSeqs, targetSeqValues);
  for (const s of seqComparisons) {
    rows.push({ gate: 'sequence_last_value', metric: s.sequence, source: s.source, target: s.target, status: s.status });
  }

  // (d) mv_monthly_permit_stats — matviews are NOT populated by data-only
  // restore. mv_monthly_permit_stats isn't a base table, so it's never
  // literally "in `tables`" (computeTableList is base-table-only) — gate it
  // whenever `permits` (its backing data) is in scope.
  const matviewName = 'mv_monthly_permit_stats';
  if (scopedSet.has('permits')) {
    // ALWAYS refresh before comparing (Spec 112 §4.3 matview verify-or-
    // refresh gate) — an empty-only refresh (the old behavior) compares
    // STALE contents whenever the target matview is non-empty but outdated:
    // e.g. a --tables-scoped restore that reloaded `permits` without
    // touching the matview leaves row-count>0 but content stale relative to
    // the freshly restored base data, and the old `if (targetMvCount === 0)`
    // guard would silently accept that stale snapshot as a pass.
    await refreshMatview(targetPool, matviewName);
    const targetMvCount = await getMatviewCount(targetPool, matviewName);
    // Ground truth is the SOURCE's LIVE defining query, not its stored
    // snapshot: the source matview may be stale relative to its base tables
    // (2026-07-18 first full load: snapshot 4,190 vs live 4,239 — the target,
    // refreshed post-load, matched LIVE; comparing against the snapshot or the
    // pinned G10 constant would spuriously FAIL a correct load).
    const defRes = await sourcePool.query(
      `SELECT pg_get_viewdef($1::regclass, true) AS def`, [matviewName]
    );
    const liveRes = await sourcePool.query(
      `SELECT count(*)::int AS c FROM (${defRes.rows[0].def.replace(/;\s*$/, '')}) q`
    );
    const sourceLive = liveRes.rows[0].c;
    const sourceSnapshot = await getMatviewCount(sourcePool, matviewName);
    rows.push({
      gate: 'matview_row_count',
      metric: matviewName,
      source: sourceLive,
      target: targetMvCount,
      status: targetMvCount === sourceLive ? 'PASS' : 'FAIL',
      detail: {
        source_snapshot: sourceSnapshot,
        pinned_baseline: G10_MATVIEW_EXPECTED_ROWS[matviewName],
        ...(sourceSnapshot !== sourceLive
          ? { note: 'source matview snapshot is stale vs its live defining query — comparison uses LIVE' }
          : {}),
        refreshed: 'target matview REFRESH MATERIALIZED VIEW run before comparison (always, not just when empty — Spec 112 §4.3)',
      },
    });
  } else {
    rows.push({ gate: 'matview_row_count', metric: matviewName, source: null, target: null, status: 'SKIP' });
  }

  // (e) postgis_full_version() both sides — recorded, not pass/failed (a
  // version delta is a flagged finding per Spec 113 §6, not silently ignored,
  // but isn't itself grounds to fail the load — GEOS drift is caught by (b)).
  const [sourcePostgis, targetPostgis] = await Promise.all([getPostgisVersion(sourcePool), getPostgisVersion(targetPool)]);
  rows.push({
    gate: 'postgis_full_version',
    metric: 'postgis_full_version()',
    source: sourcePostgis,
    target: targetPostgis,
    status: 'INFO',
    detail: sourcePostgis === targetPostgis ? undefined : { note: 'version delta between source and target — expected during the Phase 0-3 coexistence window (Spec 113 §12); the invalid-geom id-set gate is the actual drift detector' },
  });

  // (f) G10 exact pinned-baseline assertions
  const baselineRows = checkBaselineAssertions(targetCounts, tables);
  for (const b of baselineRows) {
    rows.push({ gate: 'g10_baseline', metric: b.table, source: b.expected, target: b.actual, status: b.status });
  }

  // (g) ravine_distance_m double-precision epsilon check
  if (scopedSet.has('parcels')) {
    // SOURCE sample anchors the population (its non-null ravine rows); the
    // TARGET side is fetched for those SAME ids, unfiltered, so a value that
    // went null on the target is visible as a null-mismatch rather than
    // silently disappearing into a same-shaped "missing" bucket (see
    // getRavineSampleForIds's doc comment).
    const sourceSample = await getRavineSample(sourcePool);
    const targetSample = await getRavineSampleForIds(targetPool, sourceSample.map((r) => r.id));
    const epsilonResult = compareRavineEpsilonSample(sourceSample, targetSample);
    rows.push({
      gate: 'ravine_distance_m_epsilon',
      metric: `sample n=${epsilonResult.count}`,
      source: epsilonResult.sourceSum,
      target: epsilonResult.targetSum,
      status: epsilonResult.status,
      detail: {
        sumRelDiff: epsilonResult.sumRelDiff,
        maxAbsDiff: epsilonResult.maxAbsDiff,
        missingKeys: epsilonResult.missingKeys.length,
        nullMismatches: epsilonResult.nullMismatches,
      },
    });
  } else {
    rows.push({ gate: 'ravine_distance_m_epsilon', metric: 'sample', source: null, target: null, status: 'SKIP' });
  }

  const verdict = rollUpVerdict(rows.filter((r) => r.status !== 'INFO' && r.status !== 'SKIP'));
  return { verdict, rows, geomResults };
}

function printReport(report) {
  console.log('');
  console.log('=== Supabase Load Gates (G10) ===');
  console.log('');
  const widths = { gate: 26, metric: 34, source: 16, target: 16, status: 6 };
  const header = ['GATE', 'METRIC', 'SOURCE', 'TARGET', 'STATUS'];
  console.log(
    header[0].padEnd(widths.gate) + header[1].padEnd(widths.metric) + header[2].padEnd(widths.source) + header[3].padEnd(widths.target) + header[4]
  );
  console.log('-'.repeat(widths.gate + widths.metric + widths.source + widths.target + widths.status));
  for (const r of report.rows) {
    const src = r.source === null || r.source === undefined ? '-' : String(r.source).slice(0, widths.source - 1);
    const tgt = r.target === null || r.target === undefined ? '-' : String(r.target).slice(0, widths.target - 1);
    console.log(
      String(r.gate).padEnd(widths.gate) + String(r.metric).slice(0, widths.metric - 1).padEnd(widths.metric) + src.padEnd(widths.source) + tgt.padEnd(widths.target) + r.status
    );
    if (r.detail) {
      console.log('    detail: ' + JSON.stringify(r.detail));
    }
  }
  console.log('');
  console.log(`VERDICT: ${report.verdict}`);
  console.log('');
  // emitSummary-shaped JSON (Spec 112 §4.3 Output) — not an actual pipeline
  // emission (restore-db.js is not a pipeline.run step), just the same shape
  // for anyone scripting around this report.
  console.log(
    JSON.stringify({
      records_total: null,
      records_new: null,
      records_updated: null,
      records_meta: {
        audit_table: {
          phase: 112,
          name: 'Supabase Load Gates (G10)',
          verdict: report.verdict,
          rows: report.rows,
        },
      },
    })
  );
}

async function runCli() {
  const args = process.argv.slice(2);
  const targetArg = (args.find((a) => a.startsWith('--target=')) || '--target=local').split('=')[1];
  const tablesArg = args.find((a) => a.startsWith('--tables='));
  const requestedTables = tablesArg ? tablesArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;

  const sourcePool = resolveSourcePool();
  const targetPool = resolveTargetPool(targetArg);
  try {
    const [sourceTables, targetTables] = await Promise.all([getBaseTables(sourcePool), getBaseTables(targetPool)]);
    let tables = computeTableList({ sourceTables, targetTables, requested: requestedTables });

    // C2 — unscoped verify vs a remote target auto-excludes auth-linked
    // tables (see applyAuthLinkedExclusion; the false-FAIL Integration
    // reproduced live on the F0 cloud verify).
    const targetIsLocal = isLocalMode({ connectionString: resolveTargetConnectionString(targetArg) });
    const authLinkedTables = await getAuthLinkedTables(targetPool);
    const exclusion = applyAuthLinkedExclusion({ tables, authLinkedTables, requested: requestedTables, targetIsLocal });
    tables = exclusion.tables;
    if (exclusion.excluded.length > 0) {
      console.log(
        `[supabase-load-gates] auto-excluded ${exclusion.excluded.length} auth-linked table(s) ` +
          `(FK → auth.users, derived from target pg_constraint): ${exclusion.excluded.join(', ')}`
      );
    }

    const report = await runAllGates({ sourcePool, targetPool, tables });
    printReport(report);
    if (report.verdict === 'FAIL') process.exitCode = 1;
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error('[supabase-load-gates] FAILED:', err.message);
    process.exitCode = 1;
  });
}

module.exports = {
  // constants
  EXCLUDED_TABLES,
  G10_ROW_COUNT_BASELINE,
  G10_INVALID_GEOM_EXPECTED_COUNT,
  G10_MATVIEW_EXPECTED_ROWS,
  RAVINE_EPSILON_SAMPLE_SIZE,
  RAVINE_RELATIVE_EPSILON,
  LOCAL_TARGET_DEFAULT,
  // pure functions
  computeTableList,
  applyAuthLinkedExclusion,
  quoteIdent,
  compareRowCounts,
  compareIdSets,
  compareSequences,
  checkBaselineAssertions,
  compareRavineEpsilonSample,
  rollUpVerdict,
  // DB-touching functions
  getBaseTables,
  getAuthLinkedTables,
  getRowCounts,
  getInvalidGeomIds,
  getSequenceOwnership,
  getSequenceValues,
  getMatviewCount,
  refreshMatview,
  getPostgisVersion,
  getRavineSample,
  getRavineSampleForIds,
  resolveSourcePool,
  resolveTargetConnectionString,
  resolveTargetPool,
  runAllGates,
  printReport,
  runCli,
};
