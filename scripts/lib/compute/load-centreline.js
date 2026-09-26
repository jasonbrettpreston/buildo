/**
 * SPEC LINK: docs/specs/01-pipeline/62_source_centreline.md §3, §9
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_centreline step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5
 *
 * Toronto Centreline (TCL) street-network LineStrings — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ WHAT THIS FILE IS NOT. Under operator ruling A-1(b) the library owns the whole
 * acquire → validate → write pipeline (`scripts/lib/step/{acquire,write,staleness}.js`).
 * What is left here is what a compute is FOR: the pure DBF→row mapping, the two pure
 * helpers the runner calls by name, and one observer per declared check.
 *
 * The result arrives on the ctx:
 *   · `ctx.acquired`  — what the source yielded: validators, hash, counts, shaped rows
 *   · `ctx.written`   — what the class-C staging full replace did: inserted / deleted
 *   · `ctx.prior`     — the prior COMPLETED run's `centreline_load` block: the baseline
 *                       every drift ratio is taken against. Null means no baseline, and
 *                       every ratio is then 0 BY DEFINITION, not by measurement
 *   · `ctx.overrides` — the resolved `override.accept_anomaly[]` flags
 *   · `ctx.config`    — every threshold, never a literal here (§1.2a P4)
 *   · `ctx.clock`     — the injected clock; never a wall-clock read (§5.5 (4))
 *
 * ⚠️ §5.5 SHAPE, enforced by scripts/ast-grep-rules/compute-shape.yml:
 *   1. ONE NAMED FUNCTION PER DECLARED CHECK, `fn.name === check.id`, gathered in
 *      the CHECKS dispatch at the bottom in DESCRIPTOR ORDER.
 *   2. `compute(ctx)` iterates `ctx.checks` and does nothing else.
 *   3. Every observation goes through `ctx.report(<checkId>, …)`. No `console.*`.
 *   4. Every seam is injected: `ctx.clock`, `ctx.config`, `ctx.log`. No `fs`, no
 *      `pg`, no `process.env`, no wall clock, no SQL, no literal threshold.
 *
 * ⚠️ THE VERDICT IS NOT COMPUTED HERE. `scripts/lib/step/verdict.js` derives it from
 * the rows. A compute that decided its own verdict could disagree with its own table.
 */
'use strict';

const { safeParseIntOrNull } = require('../safe-math');

/** Milliseconds per day. */
const MS_PER_DAY = 86400000;
/** Display precision of the ratio values in the audit rows; never compared against anything. */
const ROUND_SCALE = 1000;
/**
 * LC-D15 — how many dropped source ids ONE audit row carries in its detail.
 *
 * Structural, not a P4 tunable: it is a display bound, compared against nothing. The
 * bound that decides pass/fail is `load_centreline_invalid_geometry_fail_pct`, and it is
 * computed from the FULL skipped count, never from the truncated list. (The ravines
 * LR-D1 shape.)
 */
const MAX_DETAIL_KEYS = 50;

// ===========================================================================
// L25 feature-type + jurisdiction filter sets (all lowercase; values normalized
// via .trim().toLowerCase() before membership — F-S10 + F14 CKAN-whitespace hardening).
// CODE structure, NOT operator knobs: no descriptor logic_variable carries these.
// ===========================================================================
const STREET_CLASS_INCLUDE = new Set([
  'local', 'collector', 'major arterial', 'minor arterial',
  'laneway', 'expressway', 'expressway ramp',
  'major arterial ramp', 'collector ramp', 'other ramp',
  'access road', 'busway',
]);
const STREET_CLASS_EXCLUDE = new Set([
  'trail', 'river', 'hydro line', 'major railway', 'minor railway',
  'walkway', 'major shoreline', 'minor shoreline (land locked)',
  'creek/tributary', 'ferry route', 'geostatistical line',
  'pending', 'other',
]);
const UNKNOWN_FEATURE_SENTINEL = 'unknown_operator_review';

// DBF attribute field names (10-char truncated; per Phase 0 fields.csv mapping, Q0.6).
// validateShapefileColumns asserts these exist post-parse (F13 — the #426 CKAN-rename lesson).
const DBF = {
  centreline_id: 'CENTREL2',
  linear_name_full: 'LINEAR_4',
  linear_name: 'LINEAR_26',
  linear_name_type: 'LINEAR_27',
  linear_name_dir: 'LINEAR_28',
  feature_code_desc: 'FEATURE36',
  jurisdiction: 'JURISDI37',
  from_intersection_id: 'FROM_IN31',
  to_intersection_id: 'TO_INTE32',
  lo_num_l: 'LO_NUM_10',
  hi_num_l: 'HI_NUM_11',
  lo_num_r: 'LO_NUM_12',
  hi_num_r: 'HI_NUM_13',
  parity_l: 'PARITY_8',
  parity_r: 'PARITY_9',
  oneway_dir_code_desc: 'ONEWAY_34',
};
// Fields whose absence breaks ingest (geometry + key/classification/topology fields).
const REQUIRED_DBF_FIELDS = [
  DBF.centreline_id, DBF.feature_code_desc, DBF.jurisdiction,
  DBF.linear_name, DBF.linear_name_full,
  DBF.from_intersection_id, DBF.to_intersection_id,
  DBF.lo_num_l, DBF.hi_num_l, DBF.lo_num_r, DBF.hi_num_r, DBF.parity_l, DBF.parity_r,
];

// ===========================================================================
// Pure helpers — ported VERBATIM from the pre-conversion step's named exports.
// src/tests/steps/load_centreline/*.test.ts locks each one.
// ===========================================================================

/** Coerce CENTRELINE_ID → positive integer source_id, else null (counted as skip). */
function coerceSourceId(raw) {
  const n = safeParseIntOrNull(raw);
  if (n == null || n <= 0) return null;
  return n;
}

/** Coerce an intersection node id → BIGINT or null (NULL is valid per schema). */
function coerceNodeId(raw) {
  const n = safeParseIntOrNull(raw);
  return n == null ? null : n;
}

/** Normalize a CKAN string field for Set membership: trim + lowercase (F14). */
function normCode(raw) {
  return (raw == null ? '' : String(raw)).trim().toLowerCase();
}

/**
 * L25 classification of a single feature's FEATURE_CODE_DESC + JURISDICTION.
 * Returns { drop, reason, featureCodeDesc, jurisdiction, unknownFeature, unknownJurisdiction }.
 * drop=true → excluded (non-street or FEDERAL). Otherwise featureCodeDesc is the raw value
 * (or the sentinel for unknowns) and jurisdiction is the raw value (or 'UNKNOWN').
 *
 * ⚠️ ORDER IS LOAD-BEARING: the EXCLUDE test runs BEFORE the federal test, so a
 * 'Trail'/FEDERAL record drops as 'non_street', never as 'federal' (fixture record 2).
 */
function classifyFeature(rawFeatureCode, rawJurisdiction) {
  const fc = normCode(rawFeatureCode);
  const ju = normCode(rawJurisdiction);

  if (STREET_CLASS_EXCLUDE.has(fc)) return { drop: true, reason: 'non_street' };
  if (ju === 'federal') return { drop: true, reason: 'federal' };

  let unknownFeature = false;
  let featureCodeDesc;
  if (STREET_CLASS_INCLUDE.has(fc)) {
    featureCodeDesc = rawFeatureCode == null ? '' : String(rawFeatureCode).trim();
  } else {
    featureCodeDesc = UNKNOWN_FEATURE_SENTINEL; // unknown → sentinel + tag
    unknownFeature = true;
  }

  const unknownJurisdiction = ju === 'unknown' || ju === '';
  const jurisdiction = rawJurisdiction == null || String(rawJurisdiction).trim() === ''
    ? 'UNKNOWN'
    : String(rawJurisdiction).trim();

  return { drop: false, featureCodeDesc, jurisdiction, unknownFeature, unknownJurisdiction };
}

/** F13: assert the expected DBF attribute fields are present on the parsed feature props. */
function validateShapefileColumns(props) {
  if (!props || typeof props !== 'object') {
    throw new Error('[load-centreline] shapefile produced no feature properties — cannot validate columns');
  }
  const missing = REQUIRED_DBF_FIELDS.filter((f) => !(f in props));
  if (missing.length > 0) {
    throw new Error(
      `[load-centreline] shapefile missing expected attribute field(s): ${missing.join(', ')}. ` +
      `CKAN may have renamed columns (cf. #426 Heritage OBJECTID drop) — update the DBF map in load-centreline.js.`,
    );
  }
}

/** L7 count-delta. First run / missing prior → 0 (no drift). */
function computeCountDeltaPct(loaded, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return Math.abs(loaded - prior) / prior;
}

/** Dedupe parsed features by source_id (keep first); UNIQUE(source_id) duplicate-detection guard. */
function dedupeBySourceId(features) {
  const seen = new Set();
  const kept = [];
  for (const f of features) {
    if (seen.has(f.source_id)) continue;
    seen.add(f.source_id);
    kept.push(f);
  }
  return { kept, duplicateCount: features.length - kept.length };
}

/** Days between a millisecond instant and an HTTP date string; null if unparseable. */
function ageDaysFrom(nowMs, versionStr) {
  if (!versionStr) return null;
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / MS_PER_DAY);
}

/**
 * L9 staleness: WARN once the dataset is older than thresholdDays (daily-publish
 * cadence, ported VERBATIM from the legacy `datasetAgeStatus(ageDays, thresholdDays)`
 * — plain days, NOT years. Unlike load_ravines's own `datasetAgeStatus` (which
 * genuinely compares against a year-scale threshold), centreline is republished
 * daily and `load_centreline_dataset_age_warn_days` (seed 7) is a DAYS knob; a
 * `* DAYS_PER_JULIAN_YEAR` conversion here would be a behaviour-change bug, not a
 * port (Spec 121 §4.3 zero-behaviour-change).
 */
function datasetAgeStatus(ageDays, thresholdDays) {
  if (ageDays == null) return 'INFO';
  return ageDays > thresholdDays ? 'WARN' : 'INFO';
}

function round3(n) {
  return Math.round(n * ROUND_SCALE) / ROUND_SCALE;
}

// ===========================================================================
// The runner's named seams — called directly by scripts/lib/step/index.js
// ===========================================================================

/**
 * The library's generic acquisition seam asks the step how to coerce ITS key
 * (`acquire.js` `parseShapefile` → `coerceKey(props[keyProperty])`). The second
 * argument the 0s rung introduced (`{ geojson }`, the string built ONCE and reused)
 * is IGNORED here: centreline's key is pure arithmetic on CENTREL2, and the row's
 * `geojson` arrives on the ctx of `shapeRecord` below, unchanged.
 */
function coerceKey(raw) {
  return coerceSourceId(raw);
}

/**
 * §3.5 status → the FOUR-key counter delta. Called by `write.validateGeometries` via
 * the runner's `classify` seam, which SUMS `d.repaired` / `d.collectionExtracted` /
 * `d.skipped` into its counters [READ scripts/lib/step/write.js `const d = classify(`]
 * — a missing key would make that sum NaN, so all four keys are always present.
 *
 * ⚠️ LC-D8: the legacy `validatorCounterDelta(status)` carried ONLY `accepted`, so any
 * non-LineString `ST_MakeValid` residue (a single-member MultiLineString) was silently
 * SKIPPED. The converted delta is explicit: `collection_extracted` is counted AND
 * still not carried — carrying a Multi into a `GEOMETRY(LineString)` column is a write
 * error, and the target rejects it anyway. The residue is now OBSERVABLE instead of
 * silent; it is still a pinned DEFECT, not a carry.
 */
function validatorCounterDelta(status, isValidOriginal) {
  switch (status) {
    case 'accepted':
      return { repaired: isValidOriginal ? 0 : 1, collectionExtracted: 0, skipped: 0, carry: true };
    case 'collection_extracted':
      return { repaired: 0, collectionExtracted: 1, skipped: 1, carry: false };
    default: // skipped_null | skipped_unsupported_type
      return { repaired: 0, collectionExtracted: 0, skipped: 1, carry: false };
  }
}

/**
 * shapeRecord(record, { geojson, tag }) → the row `outputs.writes[0]` binds, or a STRING
 * naming why the record was DROPPED. Shaped by the runner's own call site
 * `shapeRecord(f.record, { geojson, config, run_at, tag })` [READ scripts/lib/step/index.js].
 *
 * F13 runs PER RECORD. Every DBF record carries every header field, so this is
 * equivalent to the legacy's first-record check while additionally failing on a record
 * that is individually degenerate.
 *
 * The drop reason is RETURNED, not thrown: the runner counts it in `shaped_skipped` by
 * reason (`'non_street'` / `'federal'`, the 0p seam), and an unknown class or
 * jurisdiction is TAGGED (observability) and still KEPT — never dropped.
 *
 * `geojson` is the ctx string, unchanged: the acquisition seam built it once and the
 * legacy re-serialized nothing.
 */
function shapeRecord(record, { geojson, tag } = {}) {
  const props = record || {};
  validateShapefileColumns(props);

  const cls = classifyFeature(props[DBF.feature_code_desc], props[DBF.jurisdiction]);
  if (cls.drop) return cls.reason; // 'non_street' | 'federal'
  if (cls.unknownFeature && typeof tag === 'function') tag('unknown_feature_code');
  if (cls.unknownJurisdiction && typeof tag === 'function') tag('unknown_jurisdiction');

  // The loader's own `txt()` rule: null / whitespace-only → null, else trimmed.
  const txt = (k) => {
    const v = props[k];
    return v == null || String(v).trim() === '' ? null : String(v).trim();
  };

  return {
    source_id: coerceSourceId(props[DBF.centreline_id]),
    geojson,
    linear_name_full: txt(DBF.linear_name_full),
    linear_name: txt(DBF.linear_name),
    linear_name_type: txt(DBF.linear_name_type),
    linear_name_dir: txt(DBF.linear_name_dir),
    feature_code_desc: cls.featureCodeDesc,
    jurisdiction: cls.jurisdiction,
    from_intersection_id: coerceNodeId(props[DBF.from_intersection_id]),
    to_intersection_id: coerceNodeId(props[DBF.to_intersection_id]),
    lo_num_l: txt(DBF.lo_num_l),
    hi_num_l: txt(DBF.hi_num_l),
    lo_num_r: txt(DBF.lo_num_r),
    hi_num_r: txt(DBF.hi_num_r),
    parity_l: txt(DBF.parity_l),
    parity_r: txt(DBF.parity_r),
    oneway_dir_code_desc: txt(DBF.oneway_dir_code_desc),
  };
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

/**
 * The carried (written) feature count: everything the L25 classify kept and the
 * dedupe did not drop, MINUS the geometry the validator could not reduce to a
 * LineString. `invalid_geometry_skipped` is produced by `write.validateGeometries`
 * (read-only SQL, before the first write statement), so a pre_write observer can
 * read it — this is the F-C1 floor's numerator, and it is `0` when a source ships
 * an archive with no carryable street at all.
 */
function carried(a) {
  return (a.feature_count || 0) - (a.invalid_geometry_skipped || 0);
}

/** The prior COMPLETED run's post-filter feature count, or null when there is no baseline. */
function priorFiltered(ctx) {
  return ctx.prior ? safeParseIntOrNull(ctx.prior.feature_count_filtered) : null;
}

/**
 * This run's post-filter feature count. The runner's `acquired.feature_count` is
 * post-L25, post-dedupe (§ library `index.js`); the harness drives the checks with
 * the same number under its producer-block name `feature_count_filtered`, so both
 * are read and either resolves to the same count on a real run.
 */
function filteredCount(a) {
  const explicit = safeParseIntOrNull(a.feature_count_filtered);
  return explicit != null ? explicit : (a.feature_count || 0);
}

/** The carried count the F-C1 arms measure: the library's `carried_count`, else `carried(a)`. */
function carriedCount(a) {
  const explicit = safeParseIntOrNull(a.carried_count);
  return explicit != null ? explicit : carried(a);
}

function dataset_source_license(ctx) {
  const url = ctx.acquired.license_url;
  ctx.report('dataset_source_license', { violations: url ? 0 : 1, detail: url });
}

function centreline_load_skipped(ctx) {
  const gate = ctx.gate || {};
  ctx.report('centreline_load_skipped', { violations: 0, detail: gate.skipped ? gate.reason : null });
}

function centreline_override_feature_count_drift_present(ctx) {
  const standing = ctx.overrides.accept_feature_count_drift === true;
  ctx.report('centreline_override_feature_count_drift_present', {
    violations: standing ? 1 : 0,
    detail: standing,
  });
}

function centreline_no_cache_validators(ctx) {
  const present = [];
  if (ctx.acquired.last_modified) present.push('last-modified');
  if (ctx.acquired.etag) present.push('etag');
  ctx.report('centreline_no_cache_validators', {
    violations: present.length === 0 ? 1 : 0,
    detail: present.length === 0 ? 'neither last-modified nor etag' : present.join('+'),
  });
}

/**
 * LC-D13 / R-H standing-WARN posture. The age is taken from the acquired
 * `last_modified` (falling back to the prior run's stamped validator when the CDN
 * dropped it), evaluated against the INJECTED clock, and compared to the
 * operator-editable `load_centreline_dataset_age_warn_days` — never a literal.
 */
function centreline_dataset_age_days(ctx) {
  const a = ctx.acquired;
  const stamped = a.last_modified || (ctx.prior && ctx.prior.last_modified);
  const ageDays = ageDaysFrom(ctx.clock(), stamped);
  const status = datasetAgeStatus(ageDays, ctx.config.load_centreline_dataset_age_warn_days);
  ctx.report('centreline_dataset_age_days', {
    violations: status === 'WARN' ? 1 : 0,
    detail: ageDays,
  });
}

function centreline_feature_count_raw(ctx) {
  const n = ctx.acquired.rows_read || 0;
  ctx.report('centreline_feature_count_raw', { violations: 0, detail: n });
}

function centreline_bad_centreline_id_count(ctx) {
  const n = ctx.acquired.bad_key_count || 0;
  ctx.report('centreline_bad_centreline_id_count', { violations: n, detail: n });
}

function centreline_null_geometry_count(ctx) {
  const n = ctx.acquired.null_geometry_count || 0;
  ctx.report('centreline_null_geometry_count', { violations: n, detail: n });
}

function centreline_unknown_feature_code_count(ctx) {
  const n = (ctx.acquired.shaped_tags || {}).unknown_feature_code || 0;
  ctx.report('centreline_unknown_feature_code_count', { violations: n, detail: n });
}

function centreline_unknown_jurisdiction_count(ctx) {
  const n = (ctx.acquired.shaped_tags || {}).unknown_jurisdiction || 0;
  ctx.report('centreline_unknown_jurisdiction_count', { violations: n, detail: n });
}

function centreline_duplicate_centreline_id_count(ctx) {
  const n = ctx.acquired.duplicate_key_count || 0;
  ctx.report('centreline_duplicate_centreline_id_count', { violations: n, detail: n });
}

function centreline_feature_count_filtered(ctx) {
  ctx.report('centreline_feature_count_filtered', { violations: 0, detail: filteredCount(ctx.acquired) });
}

/**
 * L7 — scored at `when: "pre_write"` (Fold C / LR-D9). READS `ctx.acquired` AND
 * `ctx.prior` ONLY: the runner evaluates this observer once BEFORE the write (to
 * decide whether the write happens at all) and once after, and reaching for
 * `ctx.written` here would make the two passes disagree.
 */
function centreline_count_drift_pct(ctx) {
  const pct = computeCountDeltaPct(filteredCount(ctx.acquired), priorFiltered(ctx));
  ctx.report('centreline_count_drift_pct', { value: pct, detail: round3(pct) });
}

/**
 * L8 — scored at `when: "pre_write"`, same contract as L7 above: `invalid_geometry_skipped`
 * and `skipped_keys` are produced by `write.validateGeometries` (read-only SQL) before
 * the first write statement, and Spec 62 §3.5 requires the abort to precede
 * `withTransaction`. No `ctx.written`.
 */
function centreline_geometry_skipped_pct(ctx) {
  const a = ctx.acquired;
  const total = filteredCount(a);
  const pct = total > 0 ? (a.invalid_geometry_skipped || 0) / total : 0;
  // LC-D15 — the dropped keys travel in ONE row's detail, capped, with the FULL count
  // beside them (the ravines LR-D1 shape).
  const dropped = a.skipped_keys || [];
  ctx.report('centreline_geometry_skipped_pct', {
    value: pct,
    detail: dropped.length === 0 ? round3(pct) : {
      pct: round3(pct),
      dropped_count: dropped.length,
      dropped_source_ids: dropped.slice(0, MAX_DETAIL_KEYS),
      dropped_ids_truncated: dropped.length > MAX_DETAIL_KEYS,
    },
  });
}

/** Spec 62 §3.7 F-C1 FIRST-RUN arm: zero carried rows AND no prior run. */
function f_c1_empty_temp_guard_fired_first_run(ctx) {
  const fired = carriedCount(ctx.acquired) === 0 && !ctx.prior;
  ctx.report('f_c1_empty_temp_guard_fired_first_run', { violations: fired ? 1 : 0, detail: fired });
}

/** Spec 62 §3.7 F-C1 subsequent-run arm (LC-D14): zero carried rows AND a prior run exists. */
function f_c1_empty_temp_guard_fired(ctx) {
  const fired = carriedCount(ctx.acquired) === 0 && Boolean(ctx.prior);
  ctx.report('f_c1_empty_temp_guard_fired', { violations: fired ? 1 : 0, detail: fired });
}

function centreline_geometry_collection_extracted(ctx) {
  ctx.report('centreline_geometry_collection_extracted', {
    violations: 0,
    detail: ctx.acquired.geometry_collection_extracted,
  });
}

function centreline_delete_skipped_empty_guard(ctx) {
  const w = ctx.written || {};
  const fired = Boolean(w.write_skipped_pre_write_warn || w.replace_skipped_empty_guard);
  ctx.report('centreline_delete_skipped_empty_guard', { violations: 0, detail: fired });
}

function centreline_features_inserted(ctx) {
  ctx.report('centreline_features_inserted', { violations: 0, detail: (ctx.written || {}).inserted });
}

function centreline_features_deleted(ctx) {
  ctx.report('centreline_features_deleted', { violations: 0, detail: (ctx.written || {}).deleted });
}

// ===========================================================================
// The frozen §9 producer block — 18 keys, the legacy `skeletonLoadMeta()` shape
// ===========================================================================

/**
 * The legacy `function skeletonLoadMeta()` — the 18-key producer block in its
 * default posture. Named `sk` at each build site below; `spec_version` is a
 * PLACEHOLDER here and is re-pinned LAST (BUG-2) so no cascade or prior spread can
 * overwrite the identity pin.
 */
function skeletonLoadMeta(ctx) {
  return {
    spec_version: ctx.descriptor.identity.spec_version,
    source_dataset_version: null,
    last_modified: null,
    etag: null,
    content_hash: null,
    feature_count_raw: 0,
    feature_count_filtered: 0,
    filtered_out_non_street: 0,
    filtered_out_federal: 0,
    unknown_feature_code_count: 0,
    unknown_jurisdiction_count: 0,
    features_inserted: 0,
    features_updated: 0,
    features_deleted: 0,
    invalid_geometry_skipped: 0,
    delete_skipped_empty_guard: false,
    f_c1_empty_temp_guard_fired: false,
    drift_check_passed: true,
  };
}

/**
 * The prior run's block restricted to the 18 declared keys — the F-C1 PRESERVE
 * cascade's spread (LC-D14). Restricted, not a bare `...prior`, because a spread of
 * an unshaped object would GROW the frozen block and the consumer reads it by
 * fixed key (§9): a prior block may only ever contribute the keys this contract
 * already declares.
 */
function priorPickedToSkeletonKeys(ctx) {
  const prior = ctx.prior || {};
  const picked = {};
  for (const key of Object.keys(skeletonLoadMeta(ctx))) {
    if (key in prior) picked[key] = prior[key];
  }
  return picked;
}

/**
 * The frozen Spec 62 §9 producer block, built only on a LOAD. `drift_check_passed`
 * is a FIELD OF THE CONTRACT, not verdict logic — `scripts/enrich-centreline.js`
 * gates on it independently of any audit row. Three cascade shapes, in the legacy's
 * one true order:
 *   1. drift FAILED with no standing override → the early-return skeleton;
 *   2. geometry-skip PCT over the FAIL bound → that skeleton plus the skip count;
 *   3. F-C1 first run (zero carried, no prior) → the skeleton plus the guard flag.
 * `spec_version` is assigned LAST, after every spread (BUG-2).
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired;
  const w = ctx.written || {};
  const sk = skeletonLoadMeta(ctx);
  const raw = a.rows_read == null ? 0 : a.rows_read;
  const filtered = a.feature_count == null ? 0 : a.feature_count;
  const countDeltaPct = computeCountDeltaPct(filtered, priorFiltered(ctx));
  const driftPassed = countDeltaPct <= ctx.config.load_centreline_count_drift_fail_pct;
  const skippedPct = filtered > 0 ? (a.invalid_geometry_skipped || 0) / filtered : 0;

  // 1. Count-drift FAILED and the operator never accepted it → the pre-write abort's
  //    block. Nothing was written, so no write fields survive.
  if (!driftPassed && ctx.overrides.accept_feature_count_drift !== true) {
    return {
      ...sk,
      feature_count_raw: raw,
      feature_count_filtered: filtered,
      drift_check_passed: false,
      spec_version: ctx.descriptor.identity.spec_version,
    };
  }

  // 2. Geometry skipped beyond the FAIL bound → the same shape plus the skip count.
  if (skippedPct > ctx.config.load_centreline_invalid_geometry_fail_pct) {
    return {
      ...sk,
      feature_count_raw: raw,
      feature_count_filtered: filtered,
      invalid_geometry_skipped: a.invalid_geometry_skipped,
      drift_check_passed: driftPassed,
      spec_version: ctx.descriptor.identity.spec_version,
    };
  }

  // 3. F-C1 FIRST RUN — zero carried rows and no prior: the empty-archive arm.
  if (carried(a) === 0 && !ctx.prior) {
    return {
      ...sk,
      feature_count_raw: raw,
      feature_count_filtered: filtered,
      f_c1_empty_temp_guard_fired: true,
      drift_check_passed: driftPassed,
      spec_version: ctx.descriptor.identity.spec_version,
    };
  }

  // 4. F-C1 PRESERVE (LC-D14 PIN, flips ④b): either the pre_write WARN gate refused
  //    the write or the executor's own empty-temp guard did. The prior lineage
  //    survives byte for byte and every write counter is pinned at 0.
  if (w.write_skipped_pre_write_warn || w.replace_skipped_empty_guard) {
    return {
      ...sk,
      ...priorPickedToSkeletonKeys(ctx),
      feature_count_filtered: filtered,
      feature_count_raw: raw,
      features_inserted: 0,
      features_updated: 0,
      features_deleted: 0,
      delete_skipped_empty_guard: true,
      f_c1_empty_temp_guard_fired: true,
      drift_check_passed: driftPassed,
      spec_version: ctx.descriptor.identity.spec_version,
    };
  }

  // 5. THE LOAD — the legacy `const centrelineLoad = {` mapping.
  const picked = priorPickedToSkeletonKeys(ctx);
  return {
    ...sk,
    source_dataset_version: a.source_dataset_version == null ? picked.source_dataset_version : a.source_dataset_version,
    last_modified: a.last_modified == null ? null : a.last_modified,
    etag: a.etag == null ? null : a.etag,
    content_hash: a.content_hash == null ? picked.content_hash : a.content_hash,
    feature_count_raw: raw,
    feature_count_filtered: filtered,
    filtered_out_non_street: (a.shaped_skipped_by_reason || {}).non_street || 0,
    filtered_out_federal: (a.shaped_skipped_by_reason || {}).federal || 0,
    unknown_feature_code_count: (a.shaped_tags || {}).unknown_feature_code || 0,
    unknown_jurisdiction_count: (a.shaped_tags || {}).unknown_jurisdiction || 0,
    features_inserted: w.inserted,
    features_updated: 0, // staging-CTE full-replace — never UPDATE
    features_deleted: w.deleted,
    invalid_geometry_skipped: a.invalid_geometry_skipped || 0,
    delete_skipped_empty_guard: Boolean(w.replace_skipped_empty_guard),
    f_c1_empty_temp_guard_fired: false,
    drift_check_passed: driftPassed,
    spec_version: ctx.descriptor.identity.spec_version,
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  dataset_source_license,
  centreline_load_skipped,
  centreline_override_feature_count_drift_present,
  centreline_no_cache_validators,
  centreline_dataset_age_days,
  centreline_feature_count_raw,
  centreline_bad_centreline_id_count,
  centreline_null_geometry_count,
  centreline_unknown_feature_code_count,
  centreline_unknown_jurisdiction_count,
  centreline_duplicate_centreline_id_count,
  centreline_feature_count_filtered,
  centreline_count_drift_pct,
  centreline_geometry_skipped_pct,
  f_c1_empty_temp_guard_fired_first_run,
  f_c1_empty_temp_guard_fired,
  centreline_geometry_collection_extracted,
  centreline_delete_skipped_empty_guard,
  centreline_features_inserted,
  centreline_features_deleted,
};

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else.
 *
 * ⚠️ CALLED TWICE ON A LOAD (Fold C / LR-D9): once with `ctx.checks` narrowed to the
 * `when: "pre_write"` ids and `ctx.written === null` (the gate), once over the full
 * selection afterwards. The loop is already scoped to `ctx.checks`, so nothing here
 * changes; what the second invocation relies on is that a pre_write observer is a
 * pure function of `ctx.acquired` + `ctx.prior`, which the write does not touch.
 *
 * The loop is the error boundary: whatever a check throws becomes `{ error }` under
 * that check's own id, so one failing observer never suppresses the observers after
 * it and never lands on another check's row.
 */
async function compute(ctx) {
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);
      ctx.report(id, { error: err });
    }
  }
  // No write means a gated skip: the library re-emits the prior block, and building a
  // half-populated one here would overwrite it with zeroes.
  if (!ctx.written) return { records_meta: {} };
  return { records_meta: { centreline_load: buildLoadMeta(ctx) } };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.buildLoadMeta = buildLoadMeta;
module.exports.skeletonLoadMeta = skeletonLoadMeta;
// The pure domain helpers, still importable one at a time (c2e re-points the legacy
// logic test at them).
module.exports.coerceSourceId = coerceSourceId;
module.exports.coerceNodeId = coerceNodeId;
module.exports.normCode = normCode;
module.exports.classifyFeature = classifyFeature;
module.exports.validateShapefileColumns = validateShapefileColumns;
module.exports.computeCountDeltaPct = computeCountDeltaPct;
module.exports.ageDaysFrom = ageDaysFrom;
module.exports.datasetAgeStatus = datasetAgeStatus;
module.exports.carried = carried;
module.exports.priorFiltered = priorFiltered;
// CODE structure, not operator knobs: exported so their locks read the real sets.
module.exports.STREET_CLASS_INCLUDE = STREET_CLASS_INCLUDE;
module.exports.STREET_CLASS_EXCLUDE = STREET_CLASS_EXCLUDE;
module.exports.UNKNOWN_FEATURE_SENTINEL = UNKNOWN_FEATURE_SENTINEL;
module.exports.DBF = DBF;
module.exports.REQUIRED_DBF_FIELDS = REQUIRED_DBF_FIELDS;
// LC-D15's display bound, exported so its lock reads the real number rather than 50.
module.exports.MAX_DETAIL_KEYS = MAX_DETAIL_KEYS;
