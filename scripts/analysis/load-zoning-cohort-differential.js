#!/usr/bin/env node
/**
 * load-zoning-cohort-differential — the batch-2 row 3.3 R-AS committed perturbation
 * cohort for the TEN zoning write targets (one base layer + nine overlays), the zoning
 * analogue of scripts/analysis/load-heritage-cohort-differential.js (row 3.4) and
 * scripts/analysis/ingestor-forced-cohort.js.
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md R-AS;
 *            docs/specs/01-pipeline/58_source_zoning_bylaw.md §9, §12
 *
 * WHY AN INSTRUMENT IS OWED. Spec 124 R-AS's LITERAL trigger does NOT apply here: it fires
 * only when the write target's `IS DISTINCT FROM` guard includes the lineage/version stamp
 * the step itself writes, and zoning's guard EXCLUDES `source_dataset_version` (LZ-D2;
 * descriptor `outputs.writes[].write_discipline.guard_columns`; legacy
 * src/tests/steps/load_zoning/fixtures/legacy-load-zoning.js.txt:504) while INCLUDING
 * `geometry` (H5). The underlying PROBLEM R-AS names still applies, measured 2026-10-02
 * (re-grounding §A A2): a forced reload of UNCHANGED data writes 0 rows on 3 targets
 * (policy_road, priority_retail, queenstw_eat) and 121 geom-only GEOS-drift rows on the
 * other 7 — but only ONCE (the 121 converge after the first forced load). So no forced
 * FULL can show nonzero per-target writes on all 10 in BOTH PRE and POST, and the only
 * instrument that proves value equivalence is a COMMITTED PERTURBATION COHORT: perturb a
 * declared, disjoint row set, run the REAL step, and demand the step put it back — under
 * an UNCONDITIONAL restore bracket so a failed run cannot leave the dev DB corrupted.
 *
 * THE ARMS (re-grounding §D), per table, carved from the ASCENDING key list with a FIXED
 * STRIDE (never randomly — a re-derive on an unchanged table must reproduce the file),
 * pairwise disjoint and exhaustive together with the negative control:
 *   U (guard heal)      `geometry = geometry || '{"r_as":1}'::jsonb` — the guard INCLUDES
 *                       `geometry` (H5), so the upsert must heal it ⇒ `updated`.
 *   A (guard witness)   `source_dataset_version = '2000-01-01'` — the version stamp is
 *                       OUTSIDE the guard (LZ-D2), so NEITHER path heals it; only the
 *                       restore does. This is the LZ-D2 guard-composition witness and the
 *                       INVERSE of heritage's A arm (which perturbs a non-guard column).
 *   D (insert path)     the rows are DELETEd (full-row before-image dumped to disk first)
 *                       so the step's upsert has to re-INSERT them.
 *   P (departure path)  ONE PHANTOM row = a copy of the first negative-control row with
 *                       `source_id` = max(key) + 100000 (absent from the source), so the
 *                       NOT-EXISTS-guarded departure DELETE removes it. ONLY where
 *                       `1/(n+1) <= 0.5 %`, i.e. SKIPPED on building_setback_overlay and
 *                       queenstw_eat_overlay (4 rows ⇒ 1/5 = 20 % ⇒ `orphanStatus` FAIL ⇒
 *                       verdict FAIL): P = [] there, and `deleted == |P|` is 0 == 0.
 *   X (pre-existing)    the measured GEOS-drift rows (2026-10-02, re-grounding §A A2:
 *                       10/37/16/4/10/0/21/23/0/0 in TABLES order) — NOT perturbed by this
 *                       instrument, but DECLARED, so `loaded − unchanged = |U|+|D|+|X|`.
 *   negative_control    the remainder — must be byte-identical after either path runs.
 * building_setback_overlay has 4 rows and ALL 4 are in X, so no negative control is
 * possible there — DECLARED, exactly as heritage declared the same for its small table.
 *
 * SAFETY PROPERTIES.
 *   - Loopback-only target: `assertLocalTarget` runs on the RESOLVED description BEFORE any
 *     query, so a cloud/shared target (e.g. a set SUPABASE_DATABASE_URL) can never be
 *     perturbed — the descriptor's `expectDatabase` pin alone is satisfied by both DBs.
 *   - A VERIFIED before-image on disk BEFORE any perturb: written, re-read from disk, and
 *     its key set checked against the cohort (`verifyBeforeImage`).
 *   - Cohort-scoped restore in a `finally`, so a failed run cannot leave the dev DB
 *     perturbed; `perturbed` is latched BEFORE the perturbation COMMIT, so the restore runs
 *     whenever a write MAY have landed and never when none could have.
 *   - SIGINT/SIGTERM are a FENCE (they set a flag; `abortIfInterrupted` throws at the two
 *     write boundaries), never a torn-down process mid-write.
 *   - The bracket takes `pipeline.withAdvisoryLock(COHORT_LOCK_ID)`, a six-digit id in the
 *     unused 90xxxx band (902001 enrich-centreline, 902002 ingestor-forced-cohort taken), and
 *     the CONSUMER lock 65 (enrich_parcels) — NEVER the step's own 58, which the step takes
 *     itself and which would make every run self-skip.
 *   - Every refusal happens BEFORE any DB connect; `--self-test` exercises every pure helper
 *     with no DB and no fs writes.
 *
 * Usage (LOCAL dev DB only — never a shared/cloud target):
 *   node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --help
 *   node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --self-test
 *   node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --derive
 *   node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --run --side=pre \
 *     --legacy-ref=<ref> --chain=sources --out=docs/reports/golden/load_zoning/differential/pre-sources.json
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createResolvedPool } = require('../lib/resolve-db');
const pipeline = require('../lib/pipeline');
const { POLYGON, LINESTRING, geomColumnSql } = require('../lib/geometry-validator');

const REPO_ROOT = path.resolve(__dirname, '../..');
const COHORT_PATH = path.join(REPO_ROOT, 'docs/reports/golden/load_zoning/differential/cohort.json');

// The ten write targets, in legacy `LAYERS` order (base first, then the nine overlays as the
// legacy loader declares them) — the SAME order the GEOS-drift counts below are quoted in.
const TABLES = [
  'zoning_bylaw_areas',
  'zoning_height_overlay',
  'zoning_lot_coverage_overlay',
  'zoning_building_setback_overlay',
  'zoning_policy_area_overlay',
  'zoning_policy_road_overlay',
  'zoning_rooming_house_overlay',
  'zoning_parking_zone_overlay',
  'zoning_priority_retail_overlay',
  'zoning_queenstw_eat_overlay',
];
// The cohort key: `source_id` is `INTEGER UNIQUE NOT NULL` on all ten tables
// (migrations/164_zoning_bylaw_tables.sql), so it is the only stable row identity.
const KEY = 'source_id';

// The legacy metric prefix per table (`m()` at legacy-load-zoning.js.txt:403): the BASE layer
// reads `zoning_areas`, an overlay its own key — identical to the converted compute's
// `metricPrefix` (scripts/lib/compute/load-zoning.js:384).
const METRIC_PREFIX = {
  zoning_bylaw_areas: 'zoning_areas',
  zoning_height_overlay: 'height_overlay',
  zoning_lot_coverage_overlay: 'lot_coverage_overlay',
  zoning_building_setback_overlay: 'building_setback_overlay',
  zoning_policy_area_overlay: 'policy_area_overlay',
  zoning_policy_road_overlay: 'policy_road_overlay',
  zoning_rooming_house_overlay: 'rooming_house_overlay',
  zoning_parking_zone_overlay: 'parking_zone_overlay',
  zoning_priority_retail_overlay: 'priority_retail_overlay',
  zoning_queenstw_eat_overlay: 'queenstw_eat_overlay',
};

// The geometry kind per table (spec §3 F-M9): the two road-like overlays are LINESTRINGs,
// every other target is a POLYGON. Drives `geomColumnSql`'s ST_CollectionExtract type arg.
const GEOM_KIND = {
  zoning_bylaw_areas: POLYGON,
  zoning_height_overlay: POLYGON,
  zoning_lot_coverage_overlay: POLYGON,
  zoning_building_setback_overlay: POLYGON,
  zoning_policy_area_overlay: POLYGON,
  zoning_policy_road_overlay: LINESTRING,
  zoning_rooming_house_overlay: POLYGON,
  zoning_parking_zone_overlay: POLYGON,
  zoning_priority_retail_overlay: LINESTRING,
  zoning_queenstw_eat_overlay: POLYGON,
};

// The projection per table = `['source_id', ...<legacy LAYERS data cols>, 'geometry', 'geom',
// 'source_dataset_version']`. `id` (SERIAL) and `created_at` are NEVER projected: a serial burn
// and a clock column are not value equivalence.
const PROJ = {
  zoning_bylaw_areas: [
    'source_id', 'gen_zone', 'zn_zone', 'zn_string', 'zn_holding', 'holding_id', 'frontage_min_m',
    'area_min_sqm', 'units_max', 'density_max', 'coverage_max_pct', 'fsi_max', 'pct_commercial_max',
    'pct_residential_max', 'pct_employment_max', 'pct_office_max', 'exception_number',
    'exception_text', 'bylaw_chapter', 'bylaw_section', 'bylaw_exception_ref', 'standard_setback',
    'zone_status', 'area_units', 'geometry', 'geom', 'source_dataset_version',
  ],
  zoning_height_overlay: [
    'source_id', 'ht_stories', 'ht_string', 'height_max_m', 'geometry', 'geom', 'source_dataset_version',
  ],
  zoning_lot_coverage_overlay: [
    'source_id', 'coverage_max_pct_override', 'geometry', 'geom', 'source_dataset_version',
  ],
  zoning_building_setback_overlay: [
    'source_id', 'objectid', 'zn_string', 'ch600_area_type', 'bylaw_section_link', 'geometry', 'geom',
    'source_dataset_version',
  ],
  zoning_policy_area_overlay: [
    'source_id', 'policy_id', 'chapter_200_ref', 'exception_link', 'geometry', 'geom',
    'source_dataset_version',
  ],
  zoning_policy_road_overlay: [
    'source_id', 'road_name', 'geometry', 'geom', 'source_dataset_version',
  ],
  zoning_rooming_house_overlay: [
    'source_id', 'rmh_area', 'rmg_hs_no', 'rmg_string', 'chapter_150_25_ref', 'geometry', 'geom',
    'source_dataset_version',
  ],
  zoning_parking_zone_overlay: [
    'source_id', 'objectid', 'zn_parkzone', 'geometry', 'geom', 'source_dataset_version',
  ],
  zoning_priority_retail_overlay: [
    'source_id', 'objectid', 'zn_string', 'ch600_line_type', 'linear_name_full_legal',
    'bylaw_section_link', 'geometry', 'geom', 'source_dataset_version',
  ],
  zoning_queenstw_eat_overlay: [
    'source_id', 'objectid', 'zn_string', 'ch600_area_type', 'bylaw_section_link', 'geometry', 'geom',
    'source_dataset_version',
  ],
};

// One map for every table: a shared column name has ONE type in every table that carries it.
// `geom` is deliberately ABSENT — it always binds through `GEOM_BIND` (WKB hex), never a cast.
const COLUMN_TYPE = {
  source_id: 'integer', gen_zone: 'integer', holding_id: 'integer', area_min_sqm: 'integer',
  units_max: 'integer', exception_number: 'integer', zone_status: 'integer', ht_stories: 'integer',
  objectid: 'integer', ch600_area_type: 'integer', rmg_hs_no: 'integer', ch600_line_type: 'integer',
  frontage_min_m: 'numeric', density_max: 'numeric', coverage_max_pct: 'numeric', fsi_max: 'numeric',
  pct_commercial_max: 'numeric', pct_residential_max: 'numeric', pct_employment_max: 'numeric',
  pct_office_max: 'numeric', standard_setback: 'numeric', area_units: 'numeric',
  height_max_m: 'numeric', coverage_max_pct_override: 'numeric',
  zn_zone: 'text', zn_string: 'text', zn_holding: 'text', exception_text: 'text',
  bylaw_chapter: 'text', bylaw_section: 'text', bylaw_exception_ref: 'text', ht_string: 'text',
  bylaw_section_link: 'text', policy_id: 'text', chapter_200_ref: 'text', exception_link: 'text',
  road_name: 'text', rmh_area: 'text', rmg_string: 'text', chapter_150_25_ref: 'text',
  zn_parkzone: 'text', linear_name_full_legal: 'text',
  geometry: 'jsonb', source_dataset_version: 'timestamptz',
};

// The declared arm sizes. building_setback (4 rows, all X) carries no arm at all; queenstw_eat
// (4 rows, no X) carries one row per U/D/A arm but no phantom — see the per-table notes.
const SIZES = {
  zoning_bylaw_areas: { U: 5, D: 5, A: 5, P: 1 },
  zoning_height_overlay: { U: 5, D: 5, A: 5, P: 1 },
  zoning_lot_coverage_overlay: { U: 5, D: 5, A: 5, P: 1 },
  // 4 rows, ALL of them GEOS-drift (X) ⇒ no negative control and no room for a cohort.
  zoning_building_setback_overlay: { U: 0, D: 0, A: 0, P: 0 },
  zoning_policy_area_overlay: { U: 3, D: 3, A: 3, P: 1 },
  zoning_policy_road_overlay: { U: 5, D: 5, A: 5, P: 1 },
  zoning_rooming_house_overlay: { U: 3, D: 3, A: 3, P: 1 },
  zoning_parking_zone_overlay: { U: 3, D: 3, A: 3, P: 1 },
  zoning_priority_retail_overlay: { U: 3, D: 3, A: 3, P: 1 },
  // 4 rows ⇒ 1/(4+1) = 20 % orphan band ⇒ verdict FAIL, so NO phantom is inserted here.
  zoning_queenstw_eat_overlay: { U: 1, D: 1, A: 1, P: 0 },
};

// The X arm: the measured GEOS-drift row counts (re-grounding §A A2, 2026-10-02). INFORMATIONAL
// ONLY — `--derive` never reads it; the live carve of X re-measures it from the DB.
const EXPECTED_X = {
  zoning_bylaw_areas: 10,
  zoning_height_overlay: 37,
  zoning_lot_coverage_overlay: 16,
  zoning_building_setback_overlay: 4,
  zoning_policy_area_overlay: 10,
  zoning_policy_road_overlay: 0,
  zoning_rooming_house_overlay: 21,
  zoning_parking_zone_overlay: 23,
  zoning_priority_retail_overlay: 0,
  zoning_queenstw_eat_overlay: 0,
};

const A_SENTINEL = '2000-01-01';
const U_PATCH = '{"r_as":1}';
const PHANTOM_OFFSET = 100000;
const FORCE_ENV = 'ZONING_FORCE_RELOAD';
const STEP_REL = 'scripts/load-zoning.js';
// The bracket's own advisory lock: a six-digit id in the 90xxxx band. 902001 lives in
// .cursor/ref/enrich-centreline-cohort-differential.js and 902002 in ingestor-forced-cohort.js.
// It is NOT the step's own lock (58) — holding that would make the spawn self-skip.
const COHORT_LOCK_ID = 902003;
// The consumer that reads these tables (enrich_parcels) holds 65; the bracket holds the
// CONSUMER lock, never the step's 58, so the step under test can still take its own.
const CONSUMER_LOCK_ID = 65;
// The ONE hostnames a perturb-and-restore bracket may ever connect to. The resolved description
// has two shapes — a connection string (`postgresql://postgres:fakepw@127.0.0.1:54322/postgres`, so
// `@host:`) and a discrete PG_* form (`127.0.0.1:54322/postgres`, so `host:port/`); hence `(^|@)`,
// without which the discrete local form would be refused.
const LOCAL_HOST_RE = /(^|@)(127\.0\.0\.1|localhost)[:\/]/;
// The ONE geometry bind, used by the phantom INSERT and the restore: it decodes the projected
// WKB hex (`encode(ST_AsEWKB(geom), 'hex')` on the read side) so a row round-trips byte-identically.
const GEOM_BIND = (n) => `ST_GeomFromEWKB(decode($${n}, 'hex'))`;

/**
 * Deterministic stride sampling from an ASCENDING key list. PURE.
 * @param {number[]} ascendingKeys
 * @param {number} count
 * @param {number} offset  starting index (so two arms from the same list interleave, never collide)
 * @param {number} stride
 * @returns {number[]}
 */
function strideSample(ascendingKeys, count, offset, stride) {
  const n = ascendingKeys.length;
  const out = [];
  for (let i = 0; i < count; i++) out.push(ascendingKeys[(offset + i * stride) % n]);
  return out;
}

/**
 * Carve the disjoint arm cohort for EVERY table from its own ascending key list. PURE.
 *
 * Order independence is the contract: the input is sorted here, so a caller that handed in an
 * unsorted (or shuffled) list gets the identical cohort. Determinism is the point — a re-derive
 * on an unchanged table must reproduce the committed cohort.json.
 *
 * @param {Record<string, number[]>} keysByTable   the ascending `source_id` list per table
 * @param {Record<string, number[]>} xKeysByTable  the pre-existing GEOS-drift key list per table
 * @returns {Record<string, {U:number[],D:number[],A:number[],P:number[],X:number[],negative_control:number[]}>}
 */
function deriveCohort(keysByTable, xKeysByTable) {
  const out = {};
  for (const table of TABLES) {
    const raw = keysByTable[table];
    if (!Array.isArray(raw)) {
      throw new Error(`deriveCohort: ${table} was not given a key list — refusing to derive`);
    }
    const rawX = xKeysByTable[table];
    if (!Array.isArray(rawX)) {
      throw new Error(`deriveCohort: ${table} was not given an X key list — refusing to derive`);
    }
    const ascending = raw.slice().sort((a, b) => a - b);
    const xSorted = rawX.slice().sort((a, b) => a - b);
    const keySet = new Set(ascending);
    // An X key that is not a live key would make `nonX = keys − X` blind to it — refuse.
    for (const k of xSorted) {
      if (!keySet.has(k)) {
        throw new Error(`deriveCohort: ${table} X key ${JSON.stringify(k)} is not in the key list — refusing`);
      }
    }
    const xSet = new Set(xSorted);
    const nonX = ascending.filter((k) => !xSet.has(k));
    const size = SIZES[table];
    const need = size.U + size.D + size.A;
    // `need === 0` ⇒ every arm is empty, so the negative control IS the whole non-X remainder.
    if (need > 0 && nonX.length < need + 1) {
      throw new Error(
        `deriveCohort: ${table} has ${nonX.length} non-X key(s) but the cohort needs at least `
        + `${need + 1} (U ${size.U} + D ${size.D} + A ${size.A} + negative_control 1) — `
        + 'refusing to derive a non-exhaustive cohort',
      );
    }
    // One fixed stride for every arm of a table. Each arm occupies a CONTIGUOUS WINDOW of the
    // same stride walk, so the walk must advance by `count * stride` (not `count`) — advancing by
    // the count alone makes arm k's last index equal arm k+1's first whenever `stride > 1`.
    const stride = 3;
    let offset = 0;
    const U = strideSample(nonX, size.U, offset, stride);
    offset += size.U * stride;
    const D = strideSample(nonX, size.D, offset, stride);
    offset += size.D * stride;
    const A = strideSample(nonX, size.A, offset, stride);
    const claimed = new Set([...U, ...D, ...A]);
    if (claimed.size !== need) {
      throw new Error(`deriveCohort: ${table} arms overlap (stride ${stride} collided) — refusing`);
    }
    const negativeControl = nonX.filter((k) => !claimed.has(k));
    out[table] = {
      U,
      D,
      A,
      // The phantom key sits above the whole key space, so it can collide with no real row.
      P: size.P === 1 ? [ascending[ascending.length - 1] + PHANTOM_OFFSET] : [],
      X: xSorted,
      negative_control: negativeControl,
    };
  }
  return out;
}

/**
 * One metric's value out of a run's audit-row list. PURE.
 * @param {Array<{metric: string, value: unknown}>} auditRows
 * @param {string} metric
 * @returns {number|undefined} the first matching row's `Number(value)`, else `undefined`
 */
function metricValue(auditRows, metric) {
  const row = (auditRows || []).find((r) => r && r.metric === metric);
  return row ? Number(row.value) : undefined;
}

/**
 * Judge one run's R-AS claims. PURE — `[]` = PASS. The rows are the run's
 * `records_meta.audit_table.rows`: legacy emits per-layer counters ONLY as audit rows (its
 * `summary` counters are base-only, P-C1) and `unchanged = max(0, loaded−inserted−updated)`
 * (LZ-D1), so `loaded − unchanged = inserted + updated`. The converted compute renders the
 * same three rows from `written.by_target.<table>` (`rows_scanned`, `unchanged`, `deleted` —
 * scripts/lib/compute/load-zoning.js `loadedRows`/`obsUnchanged`/`obsOrphans`), so ONE judge
 * reads both sides.
 *
 * @param {{cohort: object, auditRows: Array<object>, hashes: object, baselineExceptAX: object}} input
 *   `hashes` = `{ <table>: { afterExceptAX, aPerturbedStill } }`; `baselineExceptAX` =
 *   `{ <table>: hash }`, the baseline taken with the same `<> ALL(A ∪ X)` WHERE clause.
 * @returns {string[]} the failed claim ids, each naming its table
 */
function judge({ cohort, auditRows, hashes, baselineExceptAX }) {
  const failures = [];
  for (const table of TABLES) {
    const arm = (cohort || {})[table];
    if (!arm) {
      failures.push(`cohort:${table}`);
      continue;
    }
    const p = METRIC_PREFIX[table];
    const loaded = metricValue(auditRows, `${p}_loaded_count`);
    const unchanged = metricValue(auditRows, `${p}_unchanged_skipped`);
    const orphans = metricValue(auditRows, `${p}_orphans_removed_count`);
    // U + D are healed/re-inserted by the upsert; X are the pre-existing GEOS-drift rows the
    // legacy `geom` expression re-derives, so a forced reload updates them too.
    const expectWritten = arm.U.length + arm.D.length + arm.X.length;
    const written = loaded - unchanged;
    if (!(Number.isFinite(written) && written === expectWritten)) {
      failures.push(`written:${table} (${p}_loaded_count ${loaded} - ${p}_unchanged_skipped ${unchanged} != |U|+|D|+|X| ${expectWritten})`);
    }
    if (orphans !== arm.P.length) {
      failures.push(`deleted:${table} (${p}_orphans_removed_count ${orphans} != |P| ${arm.P.length})`);
    }
    const h = (hashes || {})[table] || {};
    const baseExceptAX = (baselineExceptAX || {})[table];
    if (h.afterExceptAX !== baseExceptAX) {
      failures.push(`hash:${table} (afterExceptAX ${h.afterExceptAX} != baselineExceptAX ${baseExceptAX})`);
    }
    // LZ-D2 guard-composition witness — ONLY where the table carries an A arm. The version
    // stamp is OUTSIDE the guard, so NEITHER path may heal it; a healed row means the guard
    // picked up the version stamp, and the "guard = the legacy set, stamp excluded" pin is broken.
    if (arm.A.length > 0 && h.aPerturbedStill !== true) {
      failures.push(`guard_composition:${table} (A arm (source_dataset_version) was healed — the version stamp must stay OUTSIDE the guard, LZ-D2)`);
    }
  }
  return failures;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`load-zoning-cohort-differential: ${name} is not set — refusing to guess a database target`);
  return v;
}

/**
 * PURE: throw unless the RESOLVED TARGET DESCRIPTION names a loopback host. The descriptor's
 * `expectDatabase` pin alone is satisfied by BOTH the cloud DB and the local stack (both are
 * named `postgres`), so a machine with only SUPABASE_DATABASE_URL set would perturb PRODUCTION.
 * The argument is `pool.buildoTarget.description` (resolve-db already redacts the password).
 * Returns the description on success so a caller can log it.
 */
function assertLocalTarget(description) {
  if (typeof description !== 'string' || !LOCAL_HOST_RE.test(description)) {
    throw new Error(
      `load-zoning-cohort-differential: REFUSING: the resolved DB target ${JSON.stringify(description)}`
      + ` is not a loopback host (${LOCAL_HOST_RE}). This bracket PERTURBS and RESTORES real rows and is`
      + ' a LOCAL dev instrument only — a cloud/shared target (e.g. SUPABASE_DATABASE_URL) is NOT'
      + ' acceptable, even though both databases are named "postgres". Point DATABASE_URL at'
      + ' 127.0.0.1:54322 and re-run, or run without the cloud var set.',
    );
  }
  return description;
}

/** The ONE converted-shape witness: `module.exports = pipeline.step(...)`. PURE. */
function isConvertedShim(text) {
  return String(text).includes('pipeline.step(');
}

/**
 * CRLF-normalised equality, so a Windows checkout (or a `core.autocrlf` smudge) is not a false
 * refusal. PURE — only line endings are normalised; every other byte must match.
 */
function sameSource(a, b) {
  return String(a).replace(/\r\n/g, '\n') === String(b).replace(/\r\n/g, '\n');
}

/**
 * The abort seam. `state.interrupted` is set by the SIGINT/SIGTERM handlers; this is called
 * immediately before the perturbation BEGIN and immediately before the step spawn, so a Ctrl-C
 * lands BETWEEN writes rather than mid-write. PURE (throws; never exits).
 */
function abortIfInterrupted(state) {
  if (state && state.interrupted) {
    throw new Error('interrupted (SIGINT/SIGTERM) — aborting before the next write');
  }
}

/**
 * Parse the argv list. PURE. Exactly one mode may be named (`--derive`, `--run`, `--self-test`),
 * and `--side=pre` requires `--legacy-ref` AT PARSE TIME, before any DB connect.
 */
function parseArgs(argv) {
  const out = {
    derive: false, run: false, selfTest: false, restore: null, side: null, chain: 'sources',
    out: null, legacyRef: null,
  };
  for (const a of argv) {
    if (a === '--derive') out.derive = true;
    else if (a === '--run') out.run = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a.startsWith('--restore=')) {
      out.restore = a.slice('--restore='.length);
      // The path is REQUIRED and non-empty: `--restore=` (or `--restore` with no `=`) would
      // resolve to REPO_ROOT and refuse at read time — refuse HERE, before any DB connect.
      if (out.restore.length === 0) throw new Error('--restore requires a journal path (e.g. --restore=/tmp/load-zoning-cohort-before-post-1234.json)');
    }
    else if (a.startsWith('--side=')) out.side = a.slice('--side='.length);
    else if (a.startsWith('--chain=')) out.chain = a.slice('--chain='.length);
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
    else if (a.startsWith('--legacy-ref=')) out.legacyRef = a.slice('--legacy-ref='.length);
    else throw new Error(`unknown argument ${JSON.stringify(a)} (try --help)`);
  }
  // Mode-count refusal: `--derive --run` in one argv silently ran derive only — a no-op for the
  // differential the operator thought they asked for. Exactly one mode, or neither.
  const modes = [out.derive, out.run, out.selfTest, out.restore !== null].filter(Boolean).length;
  if (modes > 1) {
    throw new Error('refusing to parse: pass exactly one of --derive, --run, --self-test or --restore=<journal>, not more than one (they do different things)');
  }
  // The PRE gate is required AT PARSE TIME, before any DB connect, so a missing --legacy-ref can
  // never reach the pool. scripts/load-zoning.js in this tree is the CONVERTED shim.
  if (out.side === 'pre' && !out.legacyRef) {
    throw new Error('--side=pre requires --legacy-ref=<ref>: scripts/load-zoning.js in this tree is the CONVERTED shim, so PRE would record converted output as the legacy golden — pass the legacy commit/ref to read the legacy source from');
  }
  return out;
}

/** Resolve a repo-relative path against REPO_ROOT (absolute paths pass through). PURE. */
function resolveRepoPath(p) {
  return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}

/**
 * Read a blob out of git WITHOUT a shell: `execFileSync('git', ['show', `${ref}:${path}`])`.
 * The ref is REJECTED when it starts with `-` (a leading dash is parsed as a git OPTION, not a
 * revision — `--upload-pack=…` and friends are exactly the injection this refuses).
 */
function gitShow(ref, relPath) {
  if (typeof ref !== 'string' || ref.length === 0 || ref.startsWith('-')) {
    throw new Error(`refusing to read a git ref that starts with "-" (${JSON.stringify(ref)}) — that is an option, not a revision`);
  }
  return execFileSync('git', ['show', `${ref}:${relPath}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * The table hash over the projection — `md5(string_agg(ROW(<cols>)::text, '|' ORDER BY source_id))`.
 * A shared WHERE clause makes the two sides of `judge`'s hash claim the same measurement.
 */
function hashSql(table, where) {
  return `SELECT md5(string_agg(ROW(${PROJ[table].join(', ')})::text, '|' ORDER BY ${KEY})) AS h`
    + ` FROM ${table} ${where || ''}`;
}

/**
 * The X arm's key list: the legacy upsert's OWN `geom` expression re-derived from the stored
 * `geometry` — exactly the guard's `geom IS DISTINCT FROM EXCLUDED.geom` arm (re-grounding §A A2),
 * so it selects precisely the rows a forced reload would rewrite for vertex-order reasons.
 */
function xDriftSql(table) {
  return `SELECT ${KEY} FROM ${table} WHERE geom IS DISTINCT FROM ${geomColumnSql('geometry::text', GEOM_KIND[table])} ORDER BY ${KEY}`;
}

/**
 * The full-row before-image SELECT. Every projected column except `geom` is cast to text so it
 * round-trips EXACTLY: a `timestamptz` keeps its microseconds, a `numeric` keeps its scale and a
 * `jsonb` keeps its byte form — a JS Date or a parsed jsonb double would not. `geom` travels as
 * WKB hex so it can be written back byte-identically by `GEOM_BIND`.
 */
function beforeImageSelectSql(table) {
  const cols = PROJ[table].filter((c) => c !== 'geom').map((c) => `${c}::text AS ${c}`);
  return `SELECT ${cols.join(', ')}, encode(ST_AsEWKB(geom), 'hex') AS geom_hex`
    + ` FROM ${table} WHERE ${KEY} = ANY($1::integer[]) ORDER BY ${KEY}`;
}

/**
 * The three perturbations, as prepared statements. PURE — the self-test pins both literal
 * fragments, and the run executes their output.
 *   U  the guard column `geometry` gains a key (H5: the guard INCLUDES geometry).
 *   A  the version stamp is REPLACED (LZ-D2: it is OUTSIDE the guard, so nobody heals it).
 *   D  the rows are deleted, so the upsert must re-insert them from the before-image.
 */
function perturbationSql(table) {
  return {
    U: `UPDATE ${table} SET geometry = geometry || '${U_PATCH}'::jsonb WHERE ${KEY} = ANY($1::integer[])`,
    A: `UPDATE ${table} SET source_dataset_version = '${A_SENTINEL}'::timestamptz WHERE ${KEY} = ANY($1::integer[])`,
    D: `DELETE FROM ${table} WHERE ${KEY} = ANY($1::integer[])`,
  };
}

/**
 * The phantom arm's INSERT: a faithful byte copy of its template row (modelled on heritage's
 * builder). The column list is MADE of the table's projection, so `id`/`created_at` are never
 * named (their DDL defaults apply) and every named column MUST have a real `COLUMN_TYPE` — a
 * missing entry would emit `$n::undefined` and Postgres would reject the whole perturbation.
 * @param {string} table
 * @param {string[]} columns  the projected column list for that table (i.e. PROJ[table])
 * @returns {{text: string, typesUsed: string[]}}
 */
function buildPhantomInsertSql(table, columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`buildPhantomInsertSql: ${table} was given no columns — refusing to build an empty INSERT`);
  }
  const named = (c) => c === 'id' || c === 'created_at';
  if (columns.some(named)) {
    throw new Error(`buildPhantomInsertSql: ${table} column list names id/created_at — those DDL defaults must apply`);
  }
  const typesUsed = [];
  const placeholders = columns.map((c, i) => {
    const n = i + 1;
    if (c === 'geom') {
      typesUsed.push('geometry');
      return GEOM_BIND(n);
    }
    const type = COLUMN_TYPE[c];
    if (!type) {
      // The throw NAMES the offending column: a silent `$n::undefined` cast is the defect this refuses.
      throw new Error(`buildPhantomInsertSql: ${table} column ${c} has no COLUMN_TYPE entry — refusing to build a $${n}::undefined bind`);
    }
    typesUsed.push(type);
    return `$${n}::${type}`;
  });
  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    typesUsed,
  };
}

/**
 * The restore's DELETE of the step-reinserted / phantom rows, addressed by the COHORT key
 * (`source_id`) — never by the serial `id` a projection-without-id before-image cannot carry.
 * @param {string} table
 * @param {number[]} keys  the keys that are currently present and must go
 * @returns {{text: string, params: Array<number[]>}}
 */
function buildRestoreDeleteSql(table, keys) {
  const ks = (keys || []).map(Number);
  const bad = ks.filter((k) => !Number.isSafeInteger(k));
  if (bad.length !== 0) {
    throw new Error(`buildRestoreDeleteSql: ${table} got ${bad.length} non-integer ${KEY} value(s) (e.g. ${JSON.stringify(bad[0])}) — a NaN key is a restore defect`);
  }
  return {
    text: `DELETE FROM ${table} WHERE ${KEY} = ANY($1::integer[])`,
    params: [ks],
  };
}

/** The restore's full-row re-INSERT, used only when the step did NOT put a D key back. PURE. */
function buildRestoreInsertSql(table) {
  const cols = PROJ[table];
  const placeholders = cols.map((c, i) => {
    const n = i + 1;
    if (c === 'geom') return GEOM_BIND(n);
    const type = COLUMN_TYPE[c];
    if (!type) throw new Error(`buildRestoreInsertSql: ${table} column ${c} has no COLUMN_TYPE entry`);
    return `$${n}::${type}`;
  });
  return { text: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})` };
}

/**
 * The restore's full-row UPDATE, every projected column except `source_id` (which is the WHERE
 * key, `$1`). PURE. Mirrors the round-trip cast rule of the before-image SELECT.
 */
function buildRestoreUpdateSql(table) {
  const cols = PROJ[table].filter((c) => c !== KEY);
  const setClause = cols.map((c, i) => {
    const n = i + 2;
    if (c === 'geom') return `geom = ${GEOM_BIND(n)}`;
    const type = COLUMN_TYPE[c];
    if (!type) throw new Error(`buildRestoreUpdateSql: ${table} column ${c} has no COLUMN_TYPE entry`);
    return `${c} = $${n}::${type}`;
  });
  return { text: `UPDATE ${table} SET ${setClause.join(', ')} WHERE ${KEY} = $1::integer` };
}

/**
 * The restore bind values for one before-image row. PURE. `mode` is `insert` (the projection's
 * own order) or `update` (the key first, then the projection without it); `geom` always binds
 * the row's `geom_hex`, never a parsed value.
 */
function restoreParams(table, row, mode) {
  const bind = (c) => (c === 'geom' ? row.geom_hex : row[c]);
  if (mode === 'insert') return PROJ[table].map(bind);
  if (mode === 'update') return [row[KEY], ...PROJ[table].filter((c) => c !== KEY).map(bind)];
  throw new Error(`restoreParams: unknown mode ${JSON.stringify(mode)}`);
}

/**
 * Verify the before-image document BEFORE any perturb. PURE. `{ ok: true }` or
 * `{ ok: false, reason }` — it never throws, so the caller can print a recovery hint.
 * @param {{rows: Array<object>}} doc
 * @param {object} cohort
 */
function verifyBeforeImage(doc, cohort) {
  if (!doc || !Array.isArray(doc.rows)) return { ok: false, reason: 'doc.rows is not an array' };
  const seen = new Set();
  for (const row of doc.rows) {
    const table = row && row.__table;
    if (!TABLES.includes(table)) return { ok: false, reason: `row carries an unknown __table ${JSON.stringify(table)}` };
    const id = Number(row[KEY]);
    const dup = `${table}:${id}`;
    if (seen.has(dup)) return { ok: false, reason: `duplicate (table, ${KEY}) ${dup}` };
    seen.add(dup);
    // Every projected column except `geom` must be PRESENT as a key (null is fine — a nullable
    // source column is a real value and must round-trip as null).
    for (const c of PROJ[table].filter((x) => x !== 'geom')) {
      if (!(c in row)) return { ok: false, reason: `${table} ${KEY} ${id} is missing projected column ${c}` };
    }
    if (typeof row.geom_hex !== 'string' || row.geom_hex.length === 0) {
      return { ok: false, reason: `${table} ${KEY} ${id} has no non-empty geom_hex` };
    }
  }
  // The key set must be EXACTLY U ∪ D ∪ A ∪ X — a missing key means a perturb target was not
  // backed up, and an extra key means the file names a row no arm will touch.
  for (const table of TABLES) {
    const arm = (cohort || {})[table];
    const expected = new Set([...arm.U, ...arm.D, ...arm.A, ...arm.X].map(Number));
    const actual = new Set(doc.rows.filter((r) => r.__table === table).map((r) => Number(r[KEY])));
    for (const k of expected) {
      if (!actual.has(k)) return { ok: false, reason: `${table} before-image is missing perturbed key ${k}` };
    }
    for (const k of actual) {
      if (!expected.has(k)) return { ok: false, reason: `${table} before-image carries an unexpected key ${k} (not in U ∪ D ∪ A ∪ X)` };
    }
  }
  return { ok: true };
}

/**
 * Gate a restore journal before a single write. PURE — `{ ok: true }` or `{ ok: false, reason }`,
 * and it NEVER throws. It is the `--restore` counterpart of the before-image verification the
 * `--run` body performs, and it answers the two questions a replayed journal must answer:
 *   1. was this journal taken against the SAME cohort.json (so the `--restore` is a replay of the
 *      arms the perturbation actually applied)? Any table whose `cohort_baseline` differs is a
 *      different cohort — a restore against it could write the wrong rows; and
 *   2. is the journal's `rows` still a COMPLETE, well-formed before-image for that cohort
 *      (`verifyBeforeImage`), passed through verbatim when it fails.
 * @param {{cohort_baseline?: object, rows?: Array<object>}} doc
 * @param {object} cohort
 * @returns {{ok: boolean, reason?: string}}
 */
function checkJournal(doc, cohort) {
  try {
    if (!doc || typeof doc !== 'object') return { ok: false, reason: 'journal is not an object' };
    const baseline = cohort && cohort.baseline;
    const journalBaseline = doc.cohort_baseline;
    if (!journalBaseline || typeof journalBaseline !== 'object') {
      return { ok: false, reason: 'journal carries no cohort_baseline — cannot tell which cohort it was taken against' };
    }
    for (const table of TABLES) {
      if (!baseline || typeof baseline !== 'object') {
        return { ok: false, reason: `${table}: journal was taken against a different cohort (the loaded cohort has no baseline)` };
      }
      if (journalBaseline[table] !== baseline[table]) {
        return {
          ok: false,
          reason: `${table}: journal was taken against a different cohort`
            + ` (journal cohort_baseline.${table} ${JSON.stringify(journalBaseline[table])}`
            + ` !== cohort.baseline.${table} ${JSON.stringify(baseline[table])})`,
        };
      }
    }
    const v = verifyBeforeImage(doc, cohort);
    if (!v.ok) return { ok: false, reason: v.reason };
    return { ok: true };
  } catch (e) {
    // It never throws: an unexpected shape is a refusal, not a crashed restore.
    return { ok: false, reason: `journal check threw: ${e && e.message ? e.message : e}` };
  }
}

/**
 * F2: re-measure the X arm LIVE before the perturbation and REFUSE when it moved since `--derive`.
 * PURE (throws; never exits). The cohort baseline hash matches as long as the DATA is unchanged,
 * but a PostGIS/GEOS upgrade between `--derive` and `--run` can change which rows the re-derived
 * `geom` expression considers drifted (the X set). The forced step then rewrites drift rows
 * OUTSIDE `cohort.X`, which are NOT in the before-image — so the restore cannot put them back,
 * `verifyBaseline` reports MISMATCH, the run exits 2, and the DB is left changed. Refusing BEFORE
 * the perturbation (and before the before-image export) turns that into exit 1 with no write.
 * @param {string} table
 * @param {number[]} cohortX  the X key list from cohort.json
 * @param {number[]} liveX    the live key list from `xDriftSql(table)`
 */
function assertXUnchanged(table, cohortX, liveX) {
  const a = new Set((cohortX || []).map(Number));
  const b = new Set((liveX || []).map(Number));
  let same = a.size === b.size;
  if (same) {
    for (const k of a) {
      if (!b.has(k)) { same = false; break; }
    }
  }
  if (same) return;
  throw new Error(
    `${table}: X drifted since --derive (cohort |X| ${a.size} != live |X| ${b.size})`
    + ' — the re-derived GEOS-drift set is a property of the installed PostGIS/GEOS, so a'
    + ' PostGIS/GEOS change between --derive and --run moves it; re-derive the cohort on this'
    + ' stack, or run --restore=<journal> and re-derive before re-running',
  );
}

/**
 * F3: the derive-time leftover-perturbation probe. PURE. `--derive` must refuse when a table
 * already carries a perturbation (a `geometry` with an `'r_as'` key, the `A_SENTINEL` version
 * stamp, or a phantom `source_id` above `PHANTOM_OFFSET`) — re-deriving over a perturbed table
 * bakes that perturbation into the baseline. Names the table and its count.
 */
function leftoverPerturbationSql(table) {
  const uKey = Object.keys(JSON.parse(U_PATCH))[0]; // 'r_as' — the U arm's jsonb patch key
  return `SELECT count(*)::int AS n FROM ${table} WHERE`
    + ` geometry ? '${uKey}'`
    + ` OR source_dataset_version = '${A_SENTINEL}'::timestamptz`
    + ` OR ${KEY} >= ${PHANTOM_OFFSET}`;
}

// ── --self-test (no DB, no fs writes) ────────────────────────────────────────
/**
 * Exercises EVERY pure helper in this file — the argv contract, the cohort carve, the judge,
 * the SQL builders and the safety predicates. No DB, no fs writes: `node --check` plus
 * `--self-test` plus eslint is the whole pre-merge verification surface.
 */
function selfTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(`self-test FAILED: ${msg}`); };
  const throws = (fn, msg) => {
    let t = false;
    try { fn(); } catch { t = true; }
    assert(t, msg);
  };
  const sorted = (a) => a.slice().sort((x, y) => x - y);
  const disjointAndCover = (arm, all, msg) => {
    const parts = ['U', 'D', 'A', 'X', 'negative_control'];
    const union = [];
    for (const k of parts) union.push(...arm[k]);
    assert(new Set(union).size === union.length, `${msg}: arms are not pairwise disjoint`);
    assert(union.length === all.length, `${msg}: arms do not cover the key list`);
    assert(sorted(union).join(',') === sorted(all).join(','), `${msg}: union != the key list`);
  };

  // 40 synthetic keys per big table (2, 3, 4, …), 4 for the two small tables; X = the first 2
  // keys for the X-bearing tables, all 4 for building_setback, [] for the zero-drift tables.
  const keysFor = (t) => {
    const n = (t === 'zoning_building_setback_overlay' || t === 'zoning_queenstw_eat_overlay') ? 4 : 40;
    const out = [];
    for (let i = 1; i <= n; i++) out.push(i * 2); // strictly ascending, spaced by 2
    return out;
  };
  const xFor = (t) => {
    if (t === 'zoning_building_setback_overlay') return [2, 4, 6, 8];
    if (EXPECTED_X[t] === 0) return [];
    const keys = keysFor(t);
    return keys.slice(0, 2);
  };
  const keysByTable = {};
  const xKeysByTable = {};
  for (const t of TABLES) { keysByTable[t] = keysFor(t); xKeysByTable[t] = xFor(t); }

  const cohort = deriveCohort(keysByTable, xKeysByTable);
  for (const t of TABLES) {
    const arm = cohort[t];
    const all = keysFor(t);
    const nonXKeys = all.filter((k) => !arm.X.includes(k));
    disjointAndCover(arm, all, `deriveCohort ${t}`);
    // Sizes match SIZES exactly.
    assert(arm.U.length === SIZES[t].U, `${t}: |U| ${arm.U.length} != SIZES.U ${SIZES[t].U}`);
    assert(arm.D.length === SIZES[t].D, `${t}: |D| ${arm.D.length} != SIZES.D ${SIZES[t].D}`);
    assert(arm.A.length === SIZES[t].A, `${t}: |A| ${arm.A.length} != SIZES.A ${SIZES[t].A}`);
    assert(arm.P.length === SIZES[t].P, `${t}: |P| ${arm.P.length} != SIZES.P ${SIZES[t].P}`);
    assert(arm.X.length === arm.X.slice().sort((a, b) => a - b).length, `${t}: X not sorted`);
    if (SIZES[t].P === 1) {
      assert(arm.P[0] === Math.max(...all) + PHANTOM_OFFSET, `${t}: P key is not max + PHANTOM_OFFSET`);
    } else {
      assert(arm.P.length === 0, `${t}: P must be empty where SIZES.P === 0`);
    }
    // The arms never fall on an X key (X is declared, not perturbed).
    for (const k of [...arm.U, ...arm.D, ...arm.A, ...arm.negative_control]) {
      assert(!arm.X.includes(k), `${t}: key ${k} is both X and perturbed/NC`);
    }
    if (SIZES[t].U + SIZES[t].D + SIZES[t].A === 0) {
      assert(arm.negative_control.length === nonXKeys.length, `${t}: zero-arm table must have all non-X keys as NC`);
    }
  }

  // building_setback: 4 rows, all X ⇒ no NC, no arms (declared).
  assert(cohort.zoning_building_setback_overlay.negative_control.length === 0, 'building_setback must have no negative control');
  assert(cohort.zoning_building_setback_overlay.U.length === 0, 'building_setback must have no U arm');

  // Order independence: a shuffled key list yields the identical cohort.
  const shuffled = {};
  for (const t of TABLES) shuffled[t] = keysFor(t).slice().reverse();
  const cohort2 = deriveCohort(shuffled, xKeysByTable);
  for (const t of TABLES) {
    assert(JSON.stringify(cohort[t]) === JSON.stringify(cohort2[t]), `${t}: deriveCohort is not order-independent`);
  }

  // Refusals: a too-short non-X list names the table, and an X key outside the key list throws.
  throws(
    () => deriveCohort({ ...keysByTable, zoning_bylaw_areas: [2, 4] }, xKeysByTable),
    'deriveCohort accepted a too-short key list',
  );
  throws(
    () => { try { deriveCohort({ ...keysByTable, zoning_bylaw_areas: [2, 4] }, xKeysByTable); } catch (e) { if (!e.message.includes('zoning_bylaw_areas')) throw new Error('wrong table named'); throw e; } },
    'deriveCohort did not name the failing table',
  );
  throws(
    () => deriveCohort(keysByTable, { ...xKeysByTable, zoning_height_overlay: [999999] }),
    'deriveCohort accepted an X key outside the key list',
  );
  throws(
    () => deriveCohort({ ...keysByTable, zoning_height_overlay: undefined }, xKeysByTable),
    'deriveCohort accepted a missing key list',
  );

  // metricValue: absent ⇒ undefined, present ⇒ Number(value).
  assert(metricValue([{ metric: 'a', value: '7' }], 'a') === 7, 'metricValue lost the value');
  assert(metricValue([{ metric: 'a', value: 7 }], 'b') === undefined, 'metricValue must be undefined when absent');
  assert(metricValue([], 'a') === undefined, 'metricValue must be undefined on an empty list');

  // ── judge ──────────────────────────────────────────────────────────────────
  // A hand-built PASS: loaded − unchanged = |U|+|D|+|X|, orphans = |P|, hashes equal, and the
  // A witness true on every table that carries an A arm.
  const passAudit = [];
  const passHashes = {};
  const passBaselineExceptAX = {};
  for (const t of TABLES) {
    const arm = cohort[t];
    const p = METRIC_PREFIX[t];
    const written = arm.U.length + arm.D.length + arm.X.length;
    const unchanged = 5;
    passAudit.push({ metric: `${p}_loaded_count`, value: written + unchanged });
    passAudit.push({ metric: `${p}_unchanged_skipped`, value: unchanged });
    passAudit.push({ metric: `${p}_orphans_removed_count`, value: arm.P.length });
    passHashes[t] = { afterExceptAX: `h-${t}`, aPerturbedStill: arm.A.length > 0 };
    passBaselineExceptAX[t] = `h-${t}`;
  }
  const pass = judge({ cohort, auditRows: passAudit, hashes: passHashes, baselineExceptAX: passBaselineExceptAX });
  assert(pass.length === 0, `judge must PASS on a hand-built PASS input, got ${JSON.stringify(pass)}`);

  // A missing arm ⇒ `cohort:<table>`, alone.
  const noArm = { ...cohort };
  delete noArm.zoning_height_overlay;
  const missing = judge({ cohort: noArm, auditRows: passAudit, hashes: passHashes, baselineExceptAX: passBaselineExceptAX });
  assert(missing.length === 1 && missing[0] === 'cohort:zoning_height_overlay', `judge must report only cohort:<table>, got ${JSON.stringify(missing)}`);

  // written: corrupt ONE loaded_count (add 1) ⇒ exactly the `written:` claim for that table.
  const writtenIdx = passAudit.findIndex((r) => r.metric === 'policy_area_overlay_loaded_count');
  const badWritten = passAudit.map((r, i) => (i === writtenIdx ? { ...r, value: Number(r.value) + 1 } : r));
  const fWritten = judge({ cohort, auditRows: badWritten, hashes: passHashes, baselineExceptAX: passBaselineExceptAX });
  assert(fWritten.length === 1 && fWritten[0].startsWith('written:zoning_policy_area_overlay'), `judge must name written:<table>, got ${JSON.stringify(fWritten)}`);

  // deleted: corrupt ONE orphans_removed_count ⇒ exactly the `deleted:` claim.
  const orphanIdx = passAudit.findIndex((r) => r.metric === 'zoning_areas_orphans_removed_count');
  const badDeleted = passAudit.map((r, i) => (i === orphanIdx ? { ...r, value: Number(r.value) + 1 } : r));
  const fDeleted = judge({ cohort, auditRows: badDeleted, hashes: passHashes, baselineExceptAX: passBaselineExceptAX });
  assert(fDeleted.length === 1 && fDeleted[0].startsWith('deleted:zoning_bylaw_areas'), `judge must name deleted:<table>, got ${JSON.stringify(fDeleted)}`);

  // hash: corrupt ONE afterExceptAX ⇒ exactly the `hash:` claim.
  const badHash = { ...passHashes, zoning_parking_zone_overlay: { afterExceptAX: 'drifted', aPerturbedStill: true } };
  const fHash = judge({ cohort, auditRows: passAudit, hashes: badHash, baselineExceptAX: passBaselineExceptAX });
  assert(fHash.length === 1 && fHash[0].startsWith('hash:zoning_parking_zone_overlay'), `judge must name hash:<table>, got ${JSON.stringify(fHash)}`);

  // guard_composition: the A witness false on a table WITH an A arm ⇒ exactly that claim.
  const badWitness = { ...passHashes, zoning_rooming_house_overlay: { afterExceptAX: 'h-zoning_rooming_house_overlay', aPerturbedStill: false } };
  const fWitness = judge({ cohort, auditRows: passAudit, hashes: badWitness, baselineExceptAX: passBaselineExceptAX });
  assert(fWitness.length === 1 && fWitness[0].startsWith('guard_composition:zoning_rooming_house_overlay'), `judge must name guard_composition:<table>, got ${JSON.stringify(fWitness)}`);

  // …and NO guard_composition claim for building_setback even with a false witness (|A| === 0).
  const bsWitness = { ...passHashes, zoning_building_setback_overlay: { afterExceptAX: 'h-zoning_building_setback_overlay', aPerturbedStill: false } };
  const fBs = judge({ cohort, auditRows: passAudit, hashes: bsWitness, baselineExceptAX: passBaselineExceptAX });
  assert(fBs.length === 0, `judge must not claim guard_composition for an empty A arm, got ${JSON.stringify(fBs)}`);

  // ── perturbationSql / xDriftSql ────────────────────────────────────────────
  for (const t of TABLES) {
    const sql = perturbationSql(t);
    assert(sql.U.includes('geometry || \'{"r_as":1}\'::jsonb'), `${t}: U SQL lost the jsonb patch`);
    assert(sql.A.includes("'2000-01-01'::timestamptz"), `${t}: A SQL lost the sentinel stamp`);
    assert(sql.U.includes(`WHERE ${KEY} = ANY($1::integer[])`), `${t}: U SQL lost the key predicate`);
    assert(sql.D.startsWith('DELETE FROM '), `${t}: D SQL is not a DELETE`);
    const x = xDriftSql(t);
    assert(x.includes('ST_GeomFromGeoJSON(geometry::text)'), `${t}: xDriftSql lost the re-derived geometry expression`);
    assert(x.includes('IS DISTINCT FROM'), `${t}: xDriftSql lost the IS DISTINCT FROM comparison`);
  }

  // No builder may ever emit a `::undefined` cast, and the phantom refuses id/created_at.
  for (const t of TABLES) {
    assert(!buildPhantomInsertSql(t, PROJ[t]).text.includes('::undefined'), `${t}: phantom INSERT has a ::undefined cast`);
    assert(!buildRestoreInsertSql(t).text.includes('::undefined'), `${t}: restore INSERT has a ::undefined cast`);
    assert(!buildRestoreUpdateSql(t).text.includes('::undefined'), `${t}: restore UPDATE has a ::undefined cast`);
    assert(buildPhantomInsertSql(t, PROJ[t]).text.includes(GEOM_BIND(PROJ[t].indexOf('geom') + 1)),`${t}: phantom INSERT must bind geom with GEOM_BIND`);
  }
  throws(() => buildPhantomInsertSql('zoning_bylaw_areas', ['id']), 'buildPhantomInsertSql accepted an id column');
  throws(() => buildPhantomInsertSql('zoning_bylaw_areas', []), 'buildPhantomInsertSql accepted an empty column list');
  throws(() => buildRestoreDeleteSql('zoning_bylaw_areas', [Number.NaN]), 'buildRestoreDeleteSql accepted a NaN key');
  assert(buildRestoreDeleteSql('zoning_bylaw_areas', [3, 4]).params[0].length === 2, 'buildRestoreDeleteSql lost a key');

  // beforeImageSelectSql: text casts keep microseconds/scale/jsonb bytes, geom travels as WKB hex.
  const bi = beforeImageSelectSql('zoning_bylaw_areas');
  assert(bi.includes('source_dataset_version::text'), 'beforeImageSelectSql must cast source_dataset_version to text');
  assert(bi.includes('geom_hex'), 'beforeImageSelectSql must export geom_hex');
  assert(bi.includes(`WHERE ${KEY} = ANY($1::integer[]) ORDER BY ${KEY}`), 'beforeImageSelectSql lost the key predicate/order');
  assert(!bi.includes('geom::text'), 'beforeImageSelectSql must not text-cast geom (it would not round-trip)');

  // restoreParams: insert binds the projection order, update puts the key first.
  const row = { source_id: 7, geom_hex: 'AB', gen_zone: 3 };
  const ins = restoreParams('zoning_height_overlay', row, 'insert');
  const upd = restoreParams('zoning_height_overlay', row, 'update');
  assert(ins.length === PROJ.zoning_height_overlay.length, 'restoreParams(insert) lost a column');
  assert(upd[0] === 7 && upd.length === PROJ.zoning_height_overlay.length, 'restoreParams(update) lost the key or a column');
  assert(ins[PROJ.zoning_height_overlay.indexOf('geom')] === 'AB', 'restoreParams(insert) did not bind geom_hex');
  assert(upd[PROJ.zoning_height_overlay.filter((c) => c !== KEY).indexOf('geom') + 1] === 'AB', 'restoreParams(update) did not bind geom_hex');
  throws(() => restoreParams('zoning_height_overlay', row, 'nope'), 'restoreParams accepted an unknown mode');

  // ── verifyBeforeImage ──────────────────────────────────────────────────────
  // A COMPLETE doc for one table (height overlay: U/D/A/X all backed up) must verify.
  const mkRow = (t, id) => {
    const r = { __table: t, geom_hex: 'AABB' };
    for (const c of PROJ[t]) if (c !== 'geom' && c !== 'geom_hex') r[c] = (c === KEY ? id : null);
    return r;
  };
  const okRows = [];
  for (const t of TABLES) {
    for (const k of [...cohort[t].U, ...cohort[t].D, ...cohort[t].A, ...cohort[t].X]) okRows.push(mkRow(t, k));
  }
  assert(verifyBeforeImage({ rows: okRows }, cohort).ok === true, 'verifyBeforeImage rejected a complete doc');

  // A dropped row (one U key missing) ⇒ NOT ok.
  const dropped = okRows.filter((r) => !(r.__table === 'zoning_height_overlay' && r[KEY] === cohort.zoning_height_overlay.U[0]));
  assert(verifyBeforeImage({ rows: dropped }, cohort).ok === false, 'verifyBeforeImage accepted a doc with a dropped row');

  // An EXTRA key that is not in the arms ⇒ NOT ok.
  const extra = okRows.concat([mkRow('zoning_height_overlay', 999999)]);
  assert(verifyBeforeImage({ rows: extra }, cohort).ok === false, 'verifyBeforeImage accepted a doc with an extra key');

  // A missing geom_hex ⇒ NOT ok.
  const noGeom = okRows.map((r, i) => (i === 0 ? { ...r, geom_hex: '' } : r));
  assert(verifyBeforeImage({ rows: noGeom }, cohort).ok === false, 'verifyBeforeImage accepted a doc with an empty geom_hex');

  // A duplicate (table, key) ⇒ NOT ok, and a non-array ⇒ NOT ok.
  assert(verifyBeforeImage({ rows: okRows.concat([okRows[0]]) }, cohort).ok === false, 'verifyBeforeImage accepted a duplicate row');
  assert(verifyBeforeImage({ rows: 'nope' }, cohort).ok === false, 'verifyBeforeImage accepted a non-array rows');

  // ── safety predicates / argv contract ──────────────────────────────────────
  assertLocalTarget('postgresql://postgres:fakepw@127.0.0.1:54322/postgres');
  assertLocalTarget('127.0.0.1:54322/postgres');
  assertLocalTarget('postgresql://postgres:fakepw@localhost:5433/postgres');
  throws(() => assertLocalTarget('postgresql://postgres:fakepw@db.abcdefgh.supabase.co:5432/postgres'), 'assertLocalTarget accepted a *.supabase.co host');
  throws(() => assertLocalTarget('10.0.0.5:5432/postgres'), 'assertLocalTarget accepted a non-loopback IP');
  throws(() => assertLocalTarget(''), 'assertLocalTarget accepted an empty description');
  throws(() => assertLocalTarget(undefined), 'assertLocalTarget accepted undefined');

  throws(() => parseArgs(['--derive', '--run']), 'parseArgs accepted --derive with --run');
  throws(() => parseArgs(['--self-test', '--derive']), 'parseArgs accepted --self-test with --derive');
  throws(() => parseArgs(['--side=pre']), 'parseArgs accepted --side=pre without --legacy-ref');
  throws(() => parseArgs(['--nope']), 'parseArgs accepted an unknown flag');
  const parsed = parseArgs(['--run', '--side=post', '--chain=none', '--out=p/q/R.json']);
  assert(parsed.run === true && parsed.side === 'post' && parsed.chain === 'none' && parsed.out === 'p/q/R.json', 'parseArgs dropped a scalar flag');
  assert(parseArgs(['--self-test']).selfTest === true, 'parseArgs dropped --self-test');
  assert(parseArgs(['--side=pre', '--legacy-ref=abc']).legacyRef === 'abc', 'parseArgs dropped --legacy-ref');

  assert(sameSource('a\r\nb', 'a\nb'), 'sameSource must treat CRLF as LF');
  assert(!sameSource('a\nb', 'a\nc'), 'sameSource must not ignore a content difference');
  assert(isConvertedShim('module.exports = pipeline.step(d, c);') === true, 'isConvertedShim missed a converted shim');
  assert(isConvertedShim('// legacy loader') === false, 'isConvertedShim misclassified legacy source');
  abortIfInterrupted({ interrupted: false }); // must not throw
  throws(() => abortIfInterrupted({ interrupted: true }), 'abortIfInterrupted must throw once a signal arrived');
  assert(resolveRepoPath('/abs/p') === '/abs/p', 'resolveRepoPath mangled an absolute path');
  assert(resolveRepoPath('a/b').endsWith(path.join('a', 'b')) && path.isAbsolute(resolveRepoPath('a/b')), 'resolveRepoPath did not anchor a relative path');

  // The lock ids: the bracket's own is unused, and it is none of the step's / the consumer's.
  assert(![902001, 902002, 58, 65].includes(COHORT_LOCK_ID), 'COHORT_LOCK_ID collides with a taken lock id');
  assert(COHORT_LOCK_ID === 902003, 'COHORT_LOCK_ID drifted from the pinned 902003');

  // ── zc-p2: --restore mode, checkJournal, assertXUnchanged, leftoverPerturbationSql ──
  // (1) The --restore argv contract: a path is recorded, counts as a fourth mode, and an empty
  //     `--restore=` refuses at PARSE time with the journal-path message.
  assert(parseArgs(['--restore=/tmp/j.json']).restore === '/tmp/j.json', 'parseArgs dropped --restore');
  throws(() => parseArgs(['--restore=/tmp/j.json', '--run']), 'parseArgs accepted --restore with --run');
  throws(
    () => {
      try { parseArgs(['--restore=']); } catch (e) { if (!e.message.includes('--restore requires a journal path')) throw new Error('wrong refusal text'); throw e; }
    },
    'parseArgs accepted --restore= without a journal path',
  );

  // (2) checkJournal: a complete journal whose cohort_baseline deep-equals cohort.baseline and
  //     whose rows verify is ok; a differing baseline names the table; a verifyBeforeImage
  //     failure is passed through; and it NEVER throws.
  const journalBaseline = {};
  for (const t of TABLES) journalBaseline[t] = `base-${t}`;
  const cohortWithBaseline = { ...cohort, baseline: journalBaseline };
  const journalRows = [];
  for (const t of TABLES) {
    for (const k of [...cohort[t].U, ...cohort[t].D, ...cohort[t].A, ...cohort[t].X]) journalRows.push(mkRow(t, k));
  }
  const goodDoc = { cohort_baseline: { ...journalBaseline }, rows: journalRows };
  assert(checkJournal(goodDoc, cohortWithBaseline).ok === true, 'checkJournal rejected a complete journal');
  const badBaselineDoc = { cohort_baseline: { ...journalBaseline, zoning_height_overlay: 'other' }, rows: journalRows };
  const badBaseline = checkJournal(badBaselineDoc, cohortWithBaseline);
  assert(badBaseline.ok === false && badBaseline.reason.includes('zoning_height_overlay'), 'checkJournal did not name the differing-baseline table');
  assert(badBaseline.reason.includes('journal was taken against a different cohort'), 'checkJournal did not name the different-cohort reason');
  const droppedJournalRows = journalRows.filter((r) => !(r.__table === 'zoning_height_overlay' && r[KEY] === cohort.zoning_height_overlay.U[0]));
  const badRows = checkJournal({ cohort_baseline: { ...journalBaseline }, rows: droppedJournalRows }, cohortWithBaseline);
  assert(badRows.ok === false && badRows.reason.includes('zoning_height_overlay'), 'checkJournal did not pass through the before-image reason');
  assert(checkJournal(null, cohortWithBaseline).ok === false, 'checkJournal(null) must be a refusal, not a throw');
  assert(checkJournal({}, cohortWithBaseline).ok === false, 'checkJournal({}) must be a refusal, not a throw');

  // (3) assertXUnchanged: equal sets (any order) pass; one extra or one missing live key throws
  //     with the table, both counts and the drift words.
  assertXUnchanged('zoning_bylaw_areas', [3, 1, 2], [2, 3, 1]); // must not throw
  throws(
    () => {
      try { assertXUnchanged('zoning_height_overlay', [1, 2], [1, 2, 3]); } catch (e) {
        if (!(e.message.includes('zoning_height_overlay') && e.message.includes('X drifted since --derive'))) throw new Error('wrong X-drift message');
        throw e;
      }
    },
    'assertXUnchanged accepted an extra live key',
  );
  throws(
    () => {
      try { assertXUnchanged('zoning_parking_zone_overlay', [1, 2, 3], [1, 2]); } catch (e) {
        if (!(e.message.includes('zoning_parking_zone_overlay') && e.message.includes('X drifted since --derive'))) throw new Error('wrong X-drift message');
        throw e;
      }
    },
    'assertXUnchanged accepted a missing live key',
  );

  // (4) leftoverPerturbationSql names the table and pins the three perturbation markers.
  for (const t of TABLES) {
    const sql = leftoverPerturbationSql(t);
    assert(sql.startsWith(`SELECT count(*)::int AS n FROM ${t} WHERE`), `${t}: leftoverPerturbationSql lost the header`);
    assert(sql.includes(`geometry ? 'r_as'`), `${t}: leftoverPerturbationSql lost the r_as probe`);
    assert(sql.includes(`source_dataset_version = '${A_SENTINEL}'::timestamptz`), `${t}: leftoverPerturbationSql lost the A sentinel probe`);
    assert(sql.includes(`${KEY} >= ${PHANTOM_OFFSET}`), `${t}: leftoverPerturbationSql lost the phantom probe`);
  }

  console.log('self-test PASSED');
}

// <<ZC-DB-MODES>>
/**
 * The ONE pool factory for this bracket. `createResolvedPool` is synchronous and pool-less (it
 * wraps `pool.connect`), so the loopback check below runs on the RESOLVED target description
 * BEFORE the caller can issue a single query — a cloud/shared target (e.g. a set
 * SUPABASE_DATABASE_URL) can never be perturbed. The descriptor's `expectDatabase` pin alone is
 * satisfied by BOTH the cloud DB and the local stack (both are named `postgres`), which is
 * exactly why `assertLocalTarget` is not optional here.
 */
function makePool(label) {
  // Default migration floor (resolve-db): scripts/migrate.js is the ONE sanctioned floor
  // exemption (src/tests/resolve-db.logic.test.ts); this read/restore harness has no reason to
  // run below it.
  const pool = createResolvedPool({ label, expectDatabase: requireEnv('PG_DATABASE') });
  assertLocalTarget(pool.buildoTarget && pool.buildoTarget.description);
  return pool;
}

/**
 * The PRE/POST gate. `${STEP_REL}` is HARD-CODED and in this worktree that file is the CONVERTED
 * shim (`module.exports = pipeline.step(descriptor, compute)`), so a `--side=pre` run would spawn
 * the CONVERTED step and record its output as the LEGACY golden — the differential would read
 * green while proving nothing. `--legacy-ref=<ref>` is the gate: PRE reads the legacy blob out of
 * git and refuses unless the WORKING file is (a) not a converted shim and (b) byte-equal to it.
 * POST refuses unless it IS a converted shim. Refuses BEFORE any DB connect.
 */
function assertStepSide(side, legacyRef) {
  const workingPath = resolveRepoPath(STEP_REL);
  let working;
  try {
    working = fs.readFileSync(workingPath, 'utf8');
  } catch (e) {
    throw new Error(`cannot read the working step ${STEP_REL}: ${e.message}`);
  }
  if (side === 'pre') {
    if (isConvertedShim(working)) {
      throw new Error(`refusing PRE: the working ${STEP_REL} is a CONVERTED shim (it calls pipeline.step( — first occurrence at byte ${working.indexOf('pipeline.step(')}). Run PRE from a worktree whose ${STEP_REL} is the legacy source, or use --side=post.`);
    }
    let legacy;
    try {
      legacy = gitShow(legacyRef, STEP_REL);
    } catch (e) {
      throw new Error(`refusing PRE: cannot read ${legacyRef}:${STEP_REL} from git: ${e.message}`);
    }
    if (!sameSource(working, legacy)) {
      throw new Error(`refusing PRE: the working ${STEP_REL} differs from ${legacyRef}:${STEP_REL} (CRLF-normalised) — the PRE golden would not be the legacy step named by --legacy-ref`);
    }
    console.log(`[differential:pre] step gate: ${STEP_REL} is the LEGACY source, byte-equal to ${legacyRef}:${STEP_REL}`);
    return;
  }
  if (!isConvertedShim(working)) {
    throw new Error(`refusing POST: the working ${STEP_REL} is NOT a converted shim (no pipeline.step( — POST would record a legacy run as the converted golden)`);
  }
  console.log(`[differential:post] step gate: ${STEP_REL} is the CONVERTED shim`);
}

// ── --derive ─────────────────────────────────────────────────────────────────
async function derive() {
  const pool = makePool('load-zoning-cohort-differential:derive');
  // F3: ONE dedicated client for the WHOLE derive, inside a single
  // `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` txn — the key lists, the X lists and the
  // baselines must all be read from the SAME snapshot. (Previously each query opened its own
  // `BEGIN READ ONLY` txn, so the lists could come from three different snapshots.) A READ ONLY
  // txn provably cannot write; it is ROLLBACKed in the `finally`, which also releases the client.
  let client = null;
  let txnOpen = false;
  try {
    console.log(`[differential] db target: ${pool.buildoTarget.description}`);
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    txnOpen = true;

    // 1. The ascending key list per table. Nothing else is read: the arms are index-sampled, so
    //    --derive needs no row contents at all.
    const keysByTable = {};
    for (const table of TABLES) {
      const rows = (await client.query(`SELECT ${KEY} FROM ${table} ORDER BY ${KEY}`)).rows;
      const keys = rows.map((r) => Number(r[KEY]));
      // A numeric key is a premise of the phantom arm (max + 100000) and of the hash's
      // ORDER BY; refuse rather than derive an instrument that cannot be applied.
      const bad = keys.filter((k) => !Number.isSafeInteger(k));
      if (bad.length !== 0) {
        throw new Error(`refusing to derive: ${table} has ${bad.length} non-integer ${KEY} value(s) (e.g. ${JSON.stringify(bad[0])}) — the phantom arm and the ordered hash need integer keys`);
      }
      keysByTable[table] = keys;
    }

    // 1b (F3). Refuse if a table still carries a LEFTOVER perturbation (a `geometry` with an
    //     `'r_as'` key, the `A_SENTINEL` version stamp, or a phantom key). A crashed `--run` can
    //     leave one behind, and re-deriving over it would carve the arms around the perturbed
    //     rows AND bake the perturbation into the baseline — so every later `--run` would compare
    //     against a corrupted baseline. Refuse, naming the table and its remedy.
    for (const table of TABLES) {
      const n = Number((await client.query(leftoverPerturbationSql(table))).rows[0].n);
      if (n > 0) {
        throw new Error(
          `refusing to derive: ${table} has ${n} row(s) carrying a leftover perturbation — `
          + `leftover perturbation found: restore it (--restore=<journal>) before re-deriving — `
          + 'a derive over a perturbed table bakes it into the baseline',
        );
      }
      console.log(`[differential] leftover-perturbation pre-flight ${table}: 0 row(s)`);
    }

    // 2. The X arm's key list per table: the legacy upsert's OWN `geom` expression re-derived
    //    from the stored `geometry` (re-grounding §A A2). Same snapshot as (1).
    const xKeysByTable = {};
    for (const table of TABLES) {
      const rows = (await client.query(xDriftSql(table))).rows;
      xKeysByTable[table] = rows.map((r) => Number(r[KEY]));
    }

    // 3. Carve the cohort. deriveCohort names the failing table in its own refusal.
    const cohort = deriveCohort(keysByTable, xKeysByTable);

    // 4. Belt and braces — the carve must be exhaustive and disjoint per table, re-checked on
    //    the DERIVED result so a stride collision can never slip into the committed artifact.
    for (const table of TABLES) {
      const arm = cohort[table];
      const union = new Set([...arm.U, ...arm.D, ...arm.A, ...arm.X, ...arm.negative_control]);
      if (union.size !== keysByTable[table].length) {
        throw new Error(`refusing to derive: ${table} arms cover ${union.size} distinct key(s) of ${keysByTable[table].length} — the carve must be exhaustive and disjoint`);
      }
      if (arm.P.some((k) => union.has(k))) {
        throw new Error(`refusing to derive: ${table} phantom key ${arm.P[0]} collides with a real key — the P arm would delete a live row`);
      }
    }

    // 5. The X count is INFORMATIONAL (it is a property of the installed PostGIS/GEOS, not a
    //    defect) — re-grounding A2. A drift is a log line, NEVER a refusal.
    for (const table of TABLES) {
      const derived = cohort[table].X.length;
      if (derived !== EXPECTED_X[table]) {
        console.warn(`[differential]   ${table}: X = ${derived} but the 2026-10-02 measurement was ${EXPECTED_X[table]} (informational: X is a property of the installed PostGIS/GEOS, re-grounding A2)`);
      }
    }

    // 6. The baseline hashes (whole table, projection, ORDER BY source_id). Same snapshot.
    const baseline = {};
    for (const table of TABLES) {
      baseline[table] = (await client.query(hashSql(table))).rows[0].h;
    }

    const doc = {
      generated_at: new Date().toISOString(),
      sizes: SIZES,
      x_measured_2026_10_02: EXPECTED_X,
      perturbations: {
        U: `geometry = geometry || '${U_PATCH}'::jsonb — geometry IS a guard column (H5), so both paths must heal it`,
        A: `source_dataset_version = '${A_SENTINEL}' — the version stamp is written but is NOT a guard column (LZ-D2), so NEITHER path heals it; only the restore does`,
        D: 'the rows are DELETEd (before-image on disk first), so the upsert must re-INSERT them',
        P: `one phantom row = a copy of the first negative-control row with ${KEY} = max(key) + ${PHANTOM_OFFSET} (only where 1/(n+1) <= 0.5 %), so the F-C1-guarded departure DELETE removes it`,
        X: 'the pre-existing GEOS vertex-order drift rows (geom IS DISTINCT FROM the legacy expression over the stored geometry, re-grounding A2) — not perturbed; the step updates them, the restore puts them back',
        negative_control: 'untouched — byte-identical after either path',
      },
      baseline,
    };
    for (const table of TABLES) doc[table] = cohort[table];
    fs.mkdirSync(path.dirname(COHORT_PATH), { recursive: true });
    fs.writeFileSync(COHORT_PATH, JSON.stringify(doc, null, 2) + '\n');
    console.log(`[differential] cohort written: ${COHORT_PATH}`);
    for (const table of TABLES) {
      const arm = cohort[table];
      console.log(`[differential]   ${table}: U=${arm.U.length} D=${arm.D.length} A=${arm.A.length} P=${arm.P.length} X=${arm.X.length} negative_control=${arm.negative_control.length}`);
      console.log(`[differential]   ${table}: P key = ${arm.P[0]}  baseline = ${baseline[table]}`);
    }
  } finally {
    // F3: ROLLBACK the READ ONLY txn (it wrote nothing, but this ends it cleanly) and release the
    // dedicated client under its own logged catch, exactly as `run`'s cleanup does.
    if (client) {
      if (txnOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (err) {
          console.error(`[differential] cleanup: derive ROLLBACK failed — ${err && err.message ? err.message : err}`);
        }
      }
      client.release();
    }
    await pool.end();
  }
}
// ── --run ──
async function run(args) {
  if (args.side !== 'pre' && args.side !== 'post') {
    throw new Error(`--side must be one of pre|post, got ${JSON.stringify(args.side)}`);
  }
  if (args.chain !== 'sources' && args.chain !== 'none') {
    throw new Error(`--chain must be one of sources|none, got ${JSON.stringify(args.chain)}`);
  }
  if (!args.out) throw new Error('--run requires --out=<golden path>');

  const side = args.side;

  // zc3 (1): the PRE/POST source gate runs BEFORE any DB connect, so a wrong-side invocation
  // (PRE against the converted shim) can never reach `makePool`/`pool.connect()`.
  assertStepSide(side, args.legacyRef);

  const pool = makePool(`load-zoning-cohort-differential:${side}`);
  console.log(`[differential:${side}] db target: ${pool.buildoTarget.description}`);

  // zc3 (2): the abort seam. SIGINT/SIGTERM set the flag and do NOT tear the process down
  // mid-write; `abortIfInterrupted` is called immediately before the perturbation BEGIN and
  // immediately before the step spawn, so a Ctrl-C lands BETWEEN writes. Removed in `finally`.
  const sig = { interrupted: false };
  const onSignal = (name) => {
    sig.interrupted = true;
    console.error(`[differential:${side}] received ${name} — aborting before the next write`);
  };
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  let cohort = null;
  let before = [];
  let beforePath = null;
  let asserted = false;
  let restoreFailed = false;
  // zc3 (3): `perturbed` is set immediately BEFORE the perturbation COMMIT, so `finally`
  // restores ONLY when a perturbation may actually have landed. A refusal before any write
  // (stale cohort, missing cohort file) or a throw during the before-image export must not
  // run the restore, whose empty/partial `before` would name unperturbed rows.
  let perturbed = false;
  const negativeTemplate = {};
  const hashes = {};
  const baselineExceptAX = {};
  try {
    cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
    console.log(`[differential:${side}] cohort loaded (generated_at ${cohort.generated_at})`);
    for (const table of TABLES) {
      const arm = cohort[table];
      console.log(`[differential:${side}]   ${table}: U=${arm.U.length} D=${arm.D.length} A=${arm.A.length} P=${arm.P.length} X=${arm.X.length} negative_control=${arm.negative_control.length}`);
    }

    // 1. Quiescence pre-flight, with `pool.query` and BEFORE any lock is taken: the lock clients
    //    below sit "idle in transaction" while the bracket runs and would otherwise count
    //    THEMSELVES as busy backends.
    const busy = await pool.query(
      `SELECT pid, application_name, state FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND backend_type = 'client backend'
          AND state <> 'idle'`,
    );
    if (busy.rows.length !== 0) {
      throw new Error(`refusing to run: ${busy.rows.length} client backend(s) active on ${requireEnv('PG_DATABASE')} — e.g. pid ${busy.rows[0].pid} ${JSON.stringify(busy.rows[0].application_name)} state=${busy.rows[0].state}`);
    }
    console.log(`[differential:${side}] quiescence pre-flight: 0 other active client backend(s)`);

    // 2. The lock bracket. BOTH locks are TRANSACTION-level via the sanctioned
    //    `pipeline.withAdvisoryLock` helper (SIGKILL-safe: released with the txn on COMMIT,
    //    ROLLBACK or a dead backend, so no zombie lock can form). COHORT_LOCK_ID (902003)
    //    excludes every OTHER bracket and CONSUMER_LOCK_ID (65, enrich_parcels — the zoning
    //    consumer) keeps the consumer out for the run + restore. The step's OWN lock 58 is
    //    NEVER held here: holding it would make the spawned step's own try fail and the run
    //    would SKIP its real work. `{ skipEmit: false }` so a REFUSED lock emits no
    //    PIPELINE_SUMMARY of its own.
    const outer = await pipeline.withAdvisoryLock(pool, COHORT_LOCK_ID, async () => {
      const inner = await pipeline.withAdvisoryLock(pool, CONSUMER_LOCK_ID, async () => {
        // <BODY>
        try {
          // 3. Refuse unless the committed cohort still describes every table. The A∪X-excluded
          //    baseline is taken HERE, with the SAME WHERE clause the after-hash uses
          //    (`KEY <> ALL(A ∪ X)`), so the two sides of `judge`'s hash claim are the same
          //    measurement — comparing an A∪X-excluded after-hash against the WHOLE-table
          //    baseline can never pass. Captured BEFORE the perturbation, so it is a genuine
          //    before-image.
          for (const table of TABLES) {
            const nowHash = (await pool.query(hashSql(table))).rows[0].h;
            if (nowHash !== cohort.baseline[table]) {
              throw new Error(
                `refusing to run: current ${table} hash ${nowHash} !== cohort.baseline.${table} ${cohort.baseline[table]}`
                + ' — check for leftover perturbation first (a geometry carrying an \'r_as\' key,'
                + ` source_dataset_version = ${A_SENTINEL}, phantom ${KEY}s above the max live ${KEY})`
                + ' — re-deriving over a perturbed table bakes it into the baseline',
              );
            }
            baselineExceptAX[table] = (
              await pool.query(hashSql(table, `WHERE ${KEY} <> ALL($1::integer[])`), [[...cohort[table].A, ...cohort[table].X]])
            ).rows[0].h;
            hashes[table] = { afterExceptAX: null, aPerturbedStill: null };
            console.log(`[differential:${side}] BASELINE confirmed ${table}: ${nowHash} (except-A∪X ${baselineExceptAX[table]})`);
          }

          // 3b (F2). The X arm must still be the SAME set the cohort derived. A PostGIS/GEOS upgrade
          //     between --derive and --run changes which rows `xDriftSql` selects while the
          //     WHOLE-table baseline hash above still matches (the DATA is unchanged) — and the
          //     forced step would then rewrite those OUTSIDE-cohort drift rows, which are not in
          //     the before-image, so the restore could not put them back (verifyBaseline MISMATCH,
          //     exit 2, DB left changed). Refuse HERE, before the before-image export and before
          //     any write: the throw is caught by the body catch, `perturbed` stays false, exit 1.
          for (const table of TABLES) {
            const liveX = (await pool.query(xDriftSql(table))).rows.map((r) => Number(r[KEY]));
            assertXUnchanged(table, cohort[table].X, liveX);
            console.log(`[differential:${side}] X re-check ${table}: ${liveX.length} == cohort`);
          }

          // 4. Before-image templates, exported FIRST: the first negative-control row is the
          //    P phantom's template. Only the tables that CARRY a phantom arm need one.
          for (const table of TABLES) {
            if (cohort[table].P.length === 0) continue;
            const nc = cohort[table].negative_control;
            if (nc.length === 0) {
              throw new Error(`refusing to run: ${table} has a P arm but no negative-control row to copy for the phantom`);
            }
            const tmplRows = (await pool.query(beforeImageSelectSql(table), [[nc[0]]])).rows;
            if (tmplRows.length !== 1) {
              throw new Error(`refusing to run: ${table} negative-control key ${nc[0]} resolved to ${tmplRows.length} row(s)`);
            }
            negativeTemplate[table] = tmplRows[0];
          }

          // 5. The full-row before-image for U ∪ D ∪ A ∪ X — full replacement material. Every
          //    projected column travels as text (microseconds/scale/jsonb bytes round-trip) and
          //    `geom` as WKB hex, so a geometry column can be made byte-identical again.
          for (const table of TABLES) {
            const keys = [...cohort[table].U, ...cohort[table].D, ...cohort[table].A, ...cohort[table].X];
            const rows = (await pool.query(beforeImageSelectSql(table), [keys])).rows;
            for (const r of rows) before.push({ __table: table, ...r });
          }
          beforePath = path.join(os.tmpdir(), `load-zoning-cohort-before-${side}-${Date.now()}.json`);
          fs.writeFileSync(
            beforePath,
            JSON.stringify({ cohort_baseline: cohort.baseline, negative_template: negativeTemplate, rows: before }, null, 2) + '\n',
          );
          // VERIFY the file ON DISK, not the in-memory array: a write that silently truncated
          // (or a serializer that dropped a key) is exactly the failure this must catch BEFORE
          // any perturb. The RE-READ rows are used from here on, so the restore writes back
          // exactly what the recovery file holds.
          const parsed = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
          const v = verifyBeforeImage(parsed, cohort);
          if (!v.ok) {
            throw new Error(`refusing to perturb: the before-image ${beforePath} did not verify — ${v.reason}`);
          }
          before = parsed.rows;
          console.log(`[differential:${side}] before-image: ${before.length} row(s) written to ${beforePath} and verified (re-read, key set == U ∪ D ∪ A ∪ X)`);

          // 6. FK HALT, by NAME, BEFORE any perturbation is attempted. Any FK whose TARGET
          //    (confrelid) is one of the ten tables is fatal here: a DELETE under the
          //    perturbation could fire an ON DELETE action. Remedy is an operator decision
          //    (drop the FK, or extend the restore to recognise it) — never a silent DELETE.
          for (const table of TABLES) {
            const fkCount = Number(
              (await pool.query('SELECT count(*)::int AS n FROM pg_constraint WHERE confrelid = $1::regclass', [table])).rows[0].n,
            );
            if (fkCount !== 0) {
              const names = (await pool.query(
                'SELECT conname FROM pg_constraint WHERE confrelid = $1::regclass ORDER BY conname',
                [table],
              )).rows.map((r) => r.conname);
              throw new Error(
                `refusing to run: ${fkCount} constraint(s) reference ${table} (${names.join(', ')})`
                + ' — the perturbation DELETEs on this table could fire an ON DELETE action; resolve the'
                + ' FK (or extend the restore to recognise it) before re-running',
              );
            }
            console.log(`[differential:${side}] fk pre-flight ${table}: 0 constraint(s) target it (safe to perturb)`);
          }
          // 7. Perturb in ONE committed txn on a fresh client.
          {
            // zc3 (2): the last instant before the first write of the run.
            abortIfInterrupted(sig);
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              for (const table of TABLES) {
                const arm = cohort[table];
                const sql = perturbationSql(table);
                if (arm.U.length > 0) await client.query(sql.U, [arm.U]);
                if (arm.A.length > 0) await client.query(sql.A, [arm.A]);
                if (arm.D.length > 0) await client.query(sql.D, [arm.D]);
                // The P phantom is a byte copy of its negative-control template with the key
                // swapped. The column list is the table's PROJECTION — `id`/`created_at` are
                // never named (their DDL defaults apply), so a template can no longer smuggle a
                // clock column into a `$n::undefined` bind. Built by the pure, tested builder.
                if (arm.P.length > 0) {
                  const cols = PROJ[table];
                  const tmpl = negativeTemplate[table];
                  const params = cols.map((c) => (c === KEY ? arm.P[0] : c === 'geom' ? tmpl.geom_hex : tmpl[c]));
                  const { text } = buildPhantomInsertSql(table, cols);
                  await client.query(text, params);
                }
              }
              // zc3 (3): the flag is set BEFORE the COMMIT. Once COMMIT is issued the
              // perturbation may land even if the client then throws, so `finally` must restore
              // from here on — and the recovery path is printed in case this run cannot finish.
              console.log(`[differential:${side}] perturbation about to COMMIT — if this run cannot finish, the before-image is ${beforePath}`);
              perturbed = true;
              await client.query('COMMIT');
            } catch (err) {
              try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
              throw err;
            } finally {
              client.release();
            }
          }
          // 8. The perturbation must have MOVED the table — a no-op perturb would make every
          //    subsequent claim vacuous (a "void differential").
          for (const table of TABLES) {
            const arm = cohort[table];
            if (arm.U.length + arm.D.length + arm.A.length + arm.P.length === 0) continue;
            const nowHash = (await pool.query(hashSql(table))).rows[0].h;
            if (nowHash === cohort.baseline[table]) {
              throw new Error(`perturbation did not change the ${table} hash — void differential`);
            }
            console.log(`[differential:${side}] PERTURBED ${table}: ${nowHash}`);
          }

          // 9. Spawn the REAL step through the capture harness, exactly as the PRE/POST goldens
          //    are taken. `--tables=` is REQUIRED and the tables are separated with `;`, not `,`.
          const columnsArg = TABLES.map((t) => `${t}:${PROJ[t].join(',')}`).join(';');
          const orderArg = TABLES.map((t) => `${t}:${KEY}`).join(';');
          const argv = [
            '-r', 'dotenv/config', 'scripts/analysis/capture-step-golden.js',
            `--step=${STEP_REL}`, `--chain=${args.chain}`, '--overwrite',
            `--out=${resolveRepoPath(args.out)}`,
            `--tables=${TABLES.join(',')}`,
            `--table-columns=${columnsArg}`,
            `--table-order=${orderArg}`,
          ];
          const env = { ...process.env, [FORCE_ENV]: '1' };
          if (args.chain === 'sources') env.PIPELINE_CHAIN = 'sources';
          else delete env.PIPELINE_CHAIN;
          console.log(`[differential:${side}] running the real step: node ${argv.join(' ')} (env ${FORCE_ENV}=1${args.chain === 'sources' ? ', PIPELINE_CHAIN=sources' : ''})`);
          // zc3 (2): do not spawn the step if a signal arrived while the perturbation landed.
          abortIfInterrupted(sig);
          const out = execFileSync('node', argv, {
            cwd: REPO_ROOT,
            env,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 64,
            stdio: ['ignore', 'pipe', 'inherit'],
            // zc3 (5): 2 hours. Without a timeout a hung step would hold the perturbation open
            // indefinitely (and the abort bracket could never run).
            timeout: 2 * 60 * 60 * 1000,
          });
          // The FIRST summary is the run under test. A POST capture path makes the harness run
          // the step a SECOND time (the two-run zero-writes proof), whose summary reads 0/0 by
          // design; `.pop()` would read that second run and fail a genuine forced run.
          const summaryLine = out.split('\n').find((l) => l.startsWith('PIPELINE_SUMMARY:'));
          if (!summaryLine) throw new Error('no PIPELINE_SUMMARY line in the harness output');
          const summary = JSON.parse(summaryLine.slice('PIPELINE_SUMMARY:'.length));
          const auditRows = ((summary.records_meta || {}).audit_table || {}).rows || [];
          console.log(`[differential:${side}] RUN records_total=${summary.records_total} records_new=${summary.records_new} records_updated=${summary.records_updated}`);
          for (const table of TABLES) {
            const p = METRIC_PREFIX[table];
            console.log(`[differential:${side}]   ${p}: loaded_count=${metricValue(auditRows, `${p}_loaded_count`)} unchanged_skipped=${metricValue(auditRows, `${p}_unchanged_skipped`)} orphans_removed_count=${metricValue(auditRows, `${p}_orphans_removed_count`)}`);
          }

          // 10. After-hashes. `afterExceptAX` is the whole table minus A and X. X is EXCLUDED
          //     because the legacy `geom` expression re-derives those rows (they are the declared
          //     GEOS drift — the step rewrites them, so they must stay out of the equality), and
          //     A because its perturbation may not be healed by either path, so leaving it in
          //     would mask a drifted non-A/non-X row. The A witness asks the complementary
          //     question directly: does the stamp still carry the sentinel, or did a path heal it?
          for (const table of TABLES) {
            const arm = cohort[table];
            hashes[table].afterExceptAX = (
              await pool.query(hashSql(table, `WHERE ${KEY} <> ALL($1::integer[])`), [[...arm.A, ...arm.X]])
            ).rows[0].h;
            let stillPerturbed = 0;
            if (arm.A.length > 0) {
              stillPerturbed = Number(
                (
                  await pool.query(
                    `SELECT count(*)::int AS n FROM ${table}`
                    + ` WHERE ${KEY} = ANY($1::integer[]) AND source_dataset_version = '${A_SENTINEL}'::timestamptz`,
                    [arm.A],
                  )
                ).rows[0].n,
              );
            }
            hashes[table].aPerturbedStill = stillPerturbed === arm.A.length;
            console.log(`[differential:${side}] witness A ${table}: ${stillPerturbed}/${arm.A.length} still carry the sentinel (expect ${arm.A.length} — LZ-D2)`);
            console.log(`[differential:${side}] witness afterExceptAX ${table}: ${hashes[table].afterExceptAX} ${hashes[table].afterExceptAX === baselineExceptAX[table] ? '(back to baseline except-A∪X)' : '(DRIFTED)'}`);
          }

          // 11. The negative control must be byte-identical (its own projected hash is unchanged).
          for (const table of TABLES) {
            const nc = cohort[table].negative_control;
            if (nc.length === 0) continue;
            const negAfter = (await pool.query(hashSql(table, `WHERE ${KEY} = ANY($1::integer[])`), [nc])).rows[0].h;
            console.log(`[differential:${side}] witness negative_control ${table}: ${nc.length} row(s) hashed ${String(negAfter).slice(0, 8)}…`);
          }

          const failures = judge({ cohort, auditRows, hashes, baselineExceptAX });
          if (failures.length === 0) {
            console.log(`[differential:${side}] judge: PASS`);
          } else {
            console.error(`[differential:${side}] judge: ${failures.length} FAILED claim(s):`);
            for (const f of failures) console.error(`[differential:${side}]   - ${f}`);
          }
          asserted = failures.length === 0;
          console.log(asserted ? '[differential] PASS' : '[differential] FAIL');
        } catch (err) {
          console.error(`[differential:${side}] ERROR: ${err.message}`);
        } finally {
          // zc3 (4): the restore runs INSIDE the lock bracket (BOTH advisory locks still held),
          // and ONLY when a perturbation may have landed. A refusal before any write (stale
          // cohort, missing cohort file) or a throw during the before-image export leaves
          // `perturbed` false, and running the restore then would mutate unperturbed tables.
          // The CALL is wrapped: `restoreAndVerify` is documented "never throws", but this is the
          // ONE path that can leave the DEV DB perturbed, so an unexpected throw must still be
          // reported AS a restore failure WITH the recovery file path — never escape the
          // `finally` and mask the exit code and the pool shutdown.
          if (perturbed) {
            try {
              const restored = await restoreAndVerify({ pool, cohort, before, beforePath, side });
              console.log(`[differential:${side}] restored: ${restored}`);
              if (!restored) restoreFailed = true;
            } catch (err) {
              restoreFailed = true;
              console.error(`[differential:${side}] RESTORE FAILED: threw ${err && err.message ? err.message : err} — restore with: node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --restore=${beforePath}`);
            }
          } else {
            console.log(`[differential:${side}] restore skipped: nothing was perturbed (no write landed)`);
          }
        }
      }, { skipEmit: false });
      if (!inner.acquired) {
        throw new Error(`refusing to run: advisory lock ${CONSUMER_LOCK_ID} (enrich_parcels, the zoning consumer) is held elsewhere`);
      }
      return inner.result;
    }, { skipEmit: false });
    if (!outer.acquired) {
      throw new Error(`refusing to run: another cohort bracket holds advisory lock ${COHORT_LOCK_ID}`);
    }
  } catch (err) {
    console.error(`[differential:${side}] ERROR: ${err.message}`);
  } finally {
    // zc3 (4): a failed restore and a failed assertion are different failures — the assertion
    // says the step disagrees with the cohort, the restore says the DEV DB may still be
    // perturbed. Exit 2 is reserved for the latter; a refusal before any write exits 1.
    if (!asserted) process.exitCode = 1;
    if (restoreFailed) process.exitCode = 2;
    try {
      await pool.end();
    } catch (err) {
      console.error(`[differential:${side}] cleanup: pool.end() failed — ${err && err.message ? err.message : err}`);
    }
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }
}

// ── restore ────────────────────────────────────────────────────────────────
// The DELETE-then-INSERT/UPDATE order below is REQUIRED by UNIQUE(source_id): a D-arm row was
// deleted and the step under test re-inserted it, so writing a before-image row back with a
// blind UPDATE could miss a row whose key moved and a blind INSERT would collide with the row
// the step already put back. So per table: DELETE any row the step RE-inserted that the
// before-image does not know, re-INSERT from the before-image ONLY when the key is absent, then
// UPDATE every before-image row in full — which is what puts the A arm's stamp, the U arm's
// `geometry` and an X row's pre-run `geom` back byte for byte. The serial burn (the `id`
// sequence advanced by the step's INSERTs) is NOT restored and is deliberately out of the
// projection, so it cannot affect the hash comparison below.
// Returns true only when every table is byte-equivalent to the cohort baseline; never throws.
async function restoreAndVerify({ pool, cohort, before, beforePath, side }) {
  if (!cohort) {
    console.error(`[differential:${side}] RESTORE SKIPPED: the cohort never loaded, so nothing was perturbed`);
    return false;
  }
  if (!Array.isArray(before) || before.length === 0) {
    // No before-image ⇒ the perturbation (which runs strictly after the export) never ran.
    // Mutating here would be unsafe: an empty selector would name the ORIGINAL rows. Verify only.
    console.log(`[differential:${side}]   restore: no before-image — nothing was perturbed; verify only`);
    return verifyBaseline({ pool, cohort, beforePath, side });
  }

  // zc3 (4): the connect lives INSIDE the try and `client` starts null, so a pool.connect()
  // failure (pool exhausted, server gone) is a RESTORE FAILURE — returned as false with the
  // recovery path named — instead of an exception escaping into the caller's `finally` past the
  // exit-code assignment. The `finally` release is null-guarded for the same reason.
  let client = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1. FK SAFETY, re-checked against the LIVE catalog rather than trusted from the pre-flight
    //    above (a FK could have appeared between the two probes). Discover every FK whose target
    //    is this table, then count referencing rows for every key we are about to delete. Zero
    //    today; the check is what makes that a fact instead of an assumption.
    for (const table of TABLES) {
      const delKeys = [...cohort[table].D, ...cohort[table].P];
      const fks = (
        await client.query(
          `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
             FROM pg_constraint c
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
            WHERE c.confrelid = $1::regclass AND c.contype = 'f'`,
          [table],
        )
      ).rows;
      for (const fk of fks) {
        // `tbl` is already rendered by regclass (hence correctly schema-quoted); the column name
        // is a raw catalog value, so it is quoted by hand.
        const n = Number(
          (await client.query(`SELECT count(*)::int AS n FROM ${fk.tbl} WHERE "${fk.col}" = ANY($1::integer[])`, [delKeys])).rows[0].n,
        );
        console.log(`[differential:${side}]   fk ${table} <- ${fk.tbl}.${fk.col}: ${n}`);
        if (n > 0) {
          await client.query('ROLLBACK');
          console.error(`[differential:${side}] HALT: FK reference to a cohort-inserted key — restore with: node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --restore=${beforePath}`);
          return false;
        }
      }
    }

    for (const table of TABLES) {
      const rows = before.filter((r) => r.__table === table);

      // 2. Any row present at a cohort-instrumented key the step RE-INSERTED (the D arm's rows,
      //    which the before-image knows) must be deleted so the before-image can be written back
      //    without a unique collision; the P phantom is always a to-delete row regardless of arm
      //    bookkeeping. Addressed by the COHORT key (`source_id`) — the before-image is projected
      //    WITHOUT `id`, so a `Number(r.id)` selector would be `{NaN}`. Built by the pure,
      //    tested builder, which also refuses a non-integer key.
      const reinsertedKeys = (
        await client.query(`SELECT ${KEY} FROM ${table} WHERE ${KEY} = ANY($1::integer[])`, [cohort[table].D])
      ).rows.map((r) => Number(r[KEY]));
      const phantomPresent = (
        await client.query(`SELECT ${KEY} FROM ${table} WHERE ${KEY} = ANY($1::integer[])`, [cohort[table].P])
      ).rows.map((r) => Number(r[KEY]));
      const toDeleteKeys = [...new Set([...reinsertedKeys, ...phantomPresent])];
      if (toDeleteKeys.length > 0) {
        const del = buildRestoreDeleteSql(table, toDeleteKeys);
        const res = await client.query(del.text, del.params);
        console.log(`[differential:${side}]   restore: deleted ${res.rowCount} step-inserted/phantom row(s) on ${table}`);
      } else {
        console.log(`[differential:${side}]   restore: no step-inserted/phantom row(s) to delete on ${table}`);
      }

      // 3. Re-INSERT from the before-image ONLY where the key is absent (a D-arm row the step did
      //    NOT put back — e.g. a skipped lane). A present key is handled by the full UPDATE below;
      //    X rows are always present, so their pre-run `geom` goes back byte for byte.
      let inserted = 0;
      let updated = 0;
      for (const r of rows) {
        const exists = Number(
          (await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${KEY} = $1::integer`, [Number(r[KEY])])).rows[0].n,
        );
        if (exists === 0) {
          // The omitted `id`/`created_at` fall back to their DDL defaults — neither is in the
          // projection, so neither can move the hash.
          const ins = buildRestoreInsertSql(table);
          const res = await client.query(ins.text, restoreParams(table, r, 'insert'));
          inserted += res.rowCount;
        } else {
          const upd = buildRestoreUpdateSql(table);
          const res = await client.query(upd.text, restoreParams(table, r, 'update'));
          updated += res.rowCount;
        }
      }
      console.log(`[differential:${side}]   restore: ${table} re-inserted ${inserted}/${rows.length}, updated ${updated}/${rows.length}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    // The `client` may be null (the connect itself failed) — guard the ROLLBACK attempt, and
    // still report the recovery path so the operator always has the before-image named.
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* the original error wins */ }
    }
    console.error(`[differential:${side}] RESTORE FAILED: ${err.message} — restore with: node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --restore=${beforePath}`);
    return false;
  } finally {
    if (client) client.release();
  }

  // 4. Verify on the pool, once the restore txn has committed.
  return verifyBaseline({ pool, cohort, beforePath, side });
}

/** Every table's hash against the cohort baseline; never throws. */
async function verifyBaseline({ pool, cohort, beforePath, side }) {
  try {
    let ok = true;
    for (const table of TABLES) {
      const h = (await pool.query(hashSql(table))).rows[0].h;
      const n = Number((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
      const hOk = h === cohort.baseline[table];
      if (!hOk) ok = false;
      console.log(`[differential:${side}]   verify ${table}: hash ${h} ${hOk ? '(OK)' : `(MISMATCH — baseline ${cohort.baseline[table]})`} count ${n}`);
    }
    return ok;
  } catch (err) {
    console.error(`[differential:${side}] RESTORE FAILED: verification query threw ${err.message} — restore with: node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --restore=${beforePath}`);
    return false;
  }
}

// ── --restore ─────────────────────────────────────────────────────────────────
/**
 * F1: the recovery path. `--run` writes its verified before-image journal to disk and prints the
 * journal path, but until now nothing APPLIED it — if the process died after the perturbation
 * COMMIT (terminal closed, host rebooted, Docker/WSL restarted) the operator had to hand-write
 * SQL from the JSON. This applies the journal: it runs the SAME quiescence pre-flight and the
 * SAME two-lock bracket `run` step 1-2 use, gates the journal with `checkJournal`, and then
 * calls `restoreAndVerify` with the journal's `rows` (not a fresh before-image — the DB may
 * already be perturbed, so there is nothing live to re-read).
 *
 * REPLAY-SAFE: run on an already-restored DB, the UPDATEs write the SAME values and the verify
 * passes, so the operator can run it twice without harm.
 *
 * Exit codes: 0 when the restore returns true, 2 when it returns false or throws, 1 when it
 * refuses before any write (journal check / quiescence / lock).
 */
async function restoreFromJournal(journalPath) {
  const side = 'restore';
  const pool = makePool('load-zoning-cohort-differential:restore');
  console.log(`[differential:${side}] db target: ${pool.buildoTarget.description}`);

  let cohort = null;
  let doc = null;
  let ok = false;
  let restoreFailed = false;
  let refused = false;
  try {
    // 0. Read the cohort and the journal. Both refusals happen BEFORE any lock and any write,
    //    so an unreadable or unparseable file is a refusal (exit 1), not a restore failure.
    refused = true;
    cohort = JSON.parse(fs.readFileSync(COHORT_PATH, 'utf8'));
    console.log(`[differential:${side}] cohort loaded (generated_at ${cohort.generated_at})`);
    doc = JSON.parse(fs.readFileSync(resolveRepoPath(journalPath), 'utf8'));
    refused = false;
    console.log(`[differential:${side}] journal loaded: ${resolveRepoPath(journalPath)} (${Array.isArray(doc.rows) ? doc.rows.length : '?'} row(s))`);

    // The journal MUST have been taken against THIS cohort — replaying a journal from a different
    // cohort would write rows the current arms do not name.
    const j = checkJournal(doc, cohort);
    if (!j.ok) {
      refused = true;
      throw new Error(`refusing to restore: the journal ${resolveRepoPath(journalPath)} did not check out — ${j.reason}`);
    }

    // 1. Quiescence pre-flight, with `pool.query` and BEFORE any lock is taken, exactly as `run`
    //    step 1 does.
    const busy = await pool.query(
      `SELECT pid, application_name, state FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND backend_type = 'client backend'
          AND state <> 'idle'`,
    );
    if (busy.rows.length !== 0) {
      refused = true;
      throw new Error(`refusing to restore: ${busy.rows.length} client backend(s) active on ${requireEnv('PG_DATABASE')} — e.g. pid ${busy.rows[0].pid} ${JSON.stringify(busy.rows[0].application_name)} state=${busy.rows[0].state}`);
    }
    console.log(`[differential:${side}] quiescence pre-flight: 0 other active client backend(s)`);

    // 2. The SAME two-lock bracket `run` takes (COHORT_LOCK_ID, then CONSUMER_LOCK_ID: both
    //    `{ skipEmit: false }`), so a restore can never race another bracket or the consumer.
    const outer = await pipeline.withAdvisoryLock(pool, COHORT_LOCK_ID, async () => {
      const inner = await pipeline.withAdvisoryLock(pool, CONSUMER_LOCK_ID, async () => {
        // The journal's rows are the before-image (already verified by `checkJournal`).
        const restored = await restoreAndVerify({
          pool, cohort, before: doc.rows, beforePath: resolveRepoPath(journalPath), side,
        });
        console.log(`[differential:${side}] restored: ${restored}`);
        if (!restored) restoreFailed = true;
        return restored;
      }, { skipEmit: false });
      if (!inner.acquired) {
        refused = true;
        throw new Error(`refusing to restore: advisory lock ${CONSUMER_LOCK_ID} (enrich_parcels, the zoning consumer) is held elsewhere`);
      }
      return inner.result;
    }, { skipEmit: false });
    if (!outer.acquired) {
      refused = true;
      throw new Error(`refusing to restore: another cohort bracket holds advisory lock ${COHORT_LOCK_ID}`);
    }
    ok = outer.result === true;
  } catch (err) {
    console.error(`[differential:${side}] ERROR: ${err.message}`);
  } finally {
    // Same shape as `run`: set the exit code BEFORE cleanup, and give each cleanup step its own
    // logged catch. 2 when the restore failed or threw after a write was possible, 1 when we
    // refused before any write, otherwise 0 when the restore verified (and 2 when it did not).
    if (restoreFailed) process.exitCode = 2;
    else if (refused) process.exitCode = 1;
    else if (!ok) process.exitCode = 2;
    try {
      await pool.end();
    } catch (err) {
      console.error(`[differential:${side}] cleanup: pool.end() failed — ${err && err.message ? err.message : err}`);
    }
  }
}


// ── CLI ──────────────────────────────────────────────────────────────────────
const HELP = `load-zoning-cohort-differential — the ten zoning write targets (batch-2 row 3.3) R-AS cohort differential

Usage:
  node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --self-test
  node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --derive
  node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --run --side=pre|post \\
      --legacy-ref=<ref> [--chain=sources|none] --out=<golden path>
  node -r dotenv/config scripts/analysis/load-zoning-cohort-differential.js --restore=<journal>

  --self-test
             Exercise EVERY pure helper (argv, cohort carve, judge, SQL builders, safety
             predicates). No DB, no fs writes.
  --derive   SELECT-only (ONE dedicated client in a single BEGIN ISOLATION LEVEL REPEATABLE READ
             READ ONLY txn, so the key lists, the X lists and the baselines share one snapshot).
             REFUSES if any table carries a leftover perturbation (a geometry with an 'r_as' key,
             source_dataset_version = ${A_SENTINEL}, or a phantom source_id >= ${PHANTOM_OFFSET})
             — restore it first (--restore=<journal>); a derive over a perturbed table bakes it
             into the baseline. Writes ${path.relative(REPO_ROOT, COHORT_PATH)}:
             per table a DISJOINT, EXHAUSTIVE carve of the ascending source_id list — U (guard
             heal: geometry jsonb patch), D (insert path: the rows are DELETEd), A (the
             guard-composition witness: source_dataset_version, OUTSIDE the guard, LZ-D2),
             P (one phantom row at max(key)+${PHANTOM_OFFSET}, only where 1/(n+1) <= 0.5 % —
             skipped on building_setback and queenstw_eat), X (the pre-existing GEOS-drift rows)
             and the negative_control remainder — plus the baseline hash per table.
  --run      Requires a committed cohort whose baseline still matches every table (else it
             refuses: check for a LEFTOVER PERTURBATION FIRST — re-deriving over a perturbed
             table bakes it into the baseline). Re-measures the X arm LIVE and refuses if it
             moved since --derive (a PostGIS/GEOS change would rewrite rows outside cohort.X that
             the before-image cannot restore). Applies the arms, spawns the REAL step
             (${STEP_REL}) through capture-step-golden.js with ${FORCE_ENV}=1, reads the
             FIRST PIPELINE_SUMMARY line's records_meta.audit_table.rows, computes the
             after-hashes, calls judge(), then RESTORES when (and only when) a perturbation
             landed and re-verifies. Exit 1 = a refusal before any write, or a claim failed;
             exit 2 = the restore failed.
  --restore=<journal>
             APPLY a before-image journal written by --run (the path --run prints). Runs the same
             quiescence pre-flight and the same two-lock bracket as --run, verifies the journal
             against the committed cohort (refusing a journal taken against a DIFFERENT cohort),
             then restores and re-verifies against the cohort baseline. REPLAY-SAFE: run on an
             already-restored DB, the UPDATEs write the SAME values and the verify passes, so it
             may be run more than once. Exit 0 = restored and verified; 2 = the restore failed or
             threw; 1 = a refusal before any write (journal check / quiescence / lock).
  --legacy-ref=<ref>
             REQUIRED for --side=pre. ${STEP_REL} is the CONVERTED shim in this tree, so PRE
             would record converted output as the legacy golden: PRE reads
             <ref>:${STEP_REL} out of git and refuses unless the WORKING file is NOT a
             converted shim AND is byte-equal to it (CRLF-normalised). POST refuses unless the
             working file IS a converted shim.
  --help     This text.
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  const args = parseArgs(argv);
  if (args.selfTest) return selfTest();
  if (args.derive) return derive();
  if (args.run) return run(args);
  if (args.restore) return restoreFromJournal(args.restore);
  throw new Error('nothing to do: pass --self-test, --derive, --run or --restore=<journal> (see --help)');
}

module.exports = {
  TABLES, KEY, METRIC_PREFIX, GEOM_KIND, PROJ, COLUMN_TYPE, SIZES, EXPECTED_X,
  A_SENTINEL, U_PATCH, PHANTOM_OFFSET, FORCE_ENV, STEP_REL, COHORT_LOCK_ID,
  CONSUMER_LOCK_ID, LOCAL_HOST_RE, GEOM_BIND, COHORT_PATH, REPO_ROOT,
  strideSample, deriveCohort, metricValue, judge,
  requireEnv, assertLocalTarget, isConvertedShim, sameSource, abortIfInterrupted,
  parseArgs, resolveRepoPath, gitShow,
  hashSql, xDriftSql, beforeImageSelectSql, perturbationSql,
  buildPhantomInsertSql, buildRestoreDeleteSql, buildRestoreInsertSql,
  buildRestoreUpdateSql, restoreParams, verifyBeforeImage,
  checkJournal, assertXUnchanged, leftoverPerturbationSql,
  restoreFromJournal,
  selfTest,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('[differential] ERROR:', err.message);
    process.exitCode = process.exitCode || 1;
  });
}
