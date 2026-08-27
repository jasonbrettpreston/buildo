/**
 * SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §3, §9
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_ravines step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5, §1.2a
 *
 * Ravine + Natural Feature Protection (Chapter 658) — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ WHAT THIS FILE IS NOT. Under operator ruling A-1(b) the library owns the whole
 * acquire → validate → write pipeline (`scripts/lib/step/{acquire,write,staleness}.js`),
 * because a LOADER's real work is filesystem and socket work that a compute is
 * forbidden to touch (`scripts/ast-grep-rules/compute-shape.yml`). What is left here
 * is what a compute is FOR: pure domain arithmetic, and one observer per declared
 * check reading the result the library already produced.
 *
 * The result arrives on the ctx, and the four fields below are the whole contract:
 *   · `ctx.acquired`  — what the source yielded: validators, hash, counts, licence
 *   · `ctx.written`   — what the class-B write did: inserted / updated / deleted,
 *                       rows_scanned / rows_changed, the empty-set guard, the
 *                       measured RLS privilege
 *   · `ctx.prior`     — the prior COMPLETED run's `ravine_load` block: the baseline
 *                       every drift ratio is taken against. Null means no baseline,
 *                       and every ratio is then 0 BY DEFINITION, not by measurement
 *   · `ctx.overrides` — the resolved `override.accept_anomaly[]` flags + `force_run`
 *
 * ⚠️ §5.5 SHAPE, enforced by scripts/ast-grep-rules/compute-shape.yml:
 *   1. ONE NAMED FUNCTION PER DECLARED CHECK, `fn.name === check.id`, gathered in
 *      the CHECKS dispatch at the bottom in DESCRIPTOR ORDER.
 *   2. `compute(ctx)` iterates `ctx.checks` and does nothing else.
 *   3. Every observation goes through `ctx.report(<checkId>, …)`. No `console.*`.
 *   4. Every seam is injected: `ctx.clock`, `ctx.config`, `ctx.log`. No `fs`, no
 *      `pg`, no `process.env`, no wall clock, no SQL, no literal threshold.
 *
 * ⚠️ THE VERDICT IS NOT COMPUTED HERE. The pre-conversion file carried its own
 * three-way cascade; it is retired knowingly to `scripts/lib/step/verdict.js`
 * `deriveVerdict`, which reads it off the rows. A step that decides its own verdict
 * can disagree with its own audit table.
 *
 * ⚠️ THE PCT CHECKS REPORT A RATIO, NOT A VIOLATION COUNT. Their declared limits are
 * the `pct <= <n>` form and their bound is `checks[].limit_from_config`, so the
 * number the audit row shows in `threshold` is the operator-editable value in force
 * (§1.2a P4 / ruling A-4). Nothing here knows what the bound is except where the
 * frozen §9 producer block demands a pass/fail boolean of its own.
 */
'use strict';

const { safeParseIntOrNull } = require('../safe-math');

/** Julian year — leap years included, which is why it is not 365. */
const DAYS_PER_JULIAN_YEAR = 365.25;
/** Milliseconds per day. */
const MS_PER_DAY = 86400000;
/** Display precision of the ratio values in the audit rows; never compared against anything. */
const ROUND_SCALE = 1000;
/**
 * LR-D1 — how many dropped source ids ONE audit row carries in its detail.
 *
 * Pre-conversion the ids were pushed as one WARN row EACH (`:441`), so the audit table's
 * row count was bounded only by the feature count: 854 dropped polygons meant 854 rows in
 * `pipeline_runs.records_meta`. Collapsing them into one row's detail fixes the ROW count
 * but not the row's SIZE, so the list is capped and the FULL count travels beside it —
 * `dropped_count` is always exact, `dropped_source_ids` may be a prefix, and
 * `dropped_ids_truncated` says which. A reader is never misled about how much was lost.
 *
 * Structural, not a P4 tunable (plan S5): it is a display bound, compared against nothing.
 * The bound that decides pass/fail is `load_ravines_invalid_geometry_fail_pct`, and it is
 * computed from `dropped_count`, never from the truncated list.
 */
const MAX_DETAIL_KEYS = 50;

// ===========================================================================
// Pure helpers — ported VERBATIM from the pre-conversion step's named exports.
// src/tests/load-ravines.logic.test.ts locks each one.
// ===========================================================================

/** L7: |loaded - prior| / prior. First run / missing prior → 0 (no drift). */
function computeCountDeltaPct(loaded, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return Math.abs(loaded - prior) / prior;
}

/** L7b: updated / prior. First run / missing prior → 0. */
function computeGeometryUpdatePct(updated, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return updated / prior;
}

/** L7c: deleted / prior. First run / missing prior → 0. */
function computeMassDeletePct(deleted, prior) {
  if (prior == null || !Number.isFinite(prior) || prior <= 0) return 0;
  return deleted / prior;
}

/** F-C1 (L15): suppress the departure delete when the parsed set is empty. */
function shouldSkipDelete(sourceIds) {
  return !Array.isArray(sourceIds) || sourceIds.length === 0;
}

/** §3.5 status → counter deltas. Pure, so the classifier is unit-lockable. */
function validatorCounterDelta(status, isValidOriginal) {
  switch (status) {
    case 'accepted':
      return { repaired: isValidOriginal ? 0 : 1, collectionExtracted: 0, skipped: 0, carry: true };
    case 'collection_extracted':
      return { repaired: 1, collectionExtracted: 1, skipped: 0, carry: true };
    default: // skipped_null | skipped_unsupported_type
      return { repaired: 0, collectionExtracted: 0, skipped: 1, carry: false };
  }
}

/** Dedupe parsed features by source_id (keep first) — a repeated key cannot be upserted twice in one statement. */
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

/** Days between a millisecond instant and an HTTP date string; null if unparseable (avoid NaN → spurious WARN). */
function ageDaysFrom(nowMs, versionStr) {
  if (!versionStr) return null;
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / MS_PER_DAY);
}

/** L9 staleness: WARN once the dataset is older than thresholdYears. */
function datasetAgeStatus(ageDays, thresholdYears) {
  if (ageDays == null) return 'INFO';
  return ageDays > thresholdYears * DAYS_PER_JULIAN_YEAR ? 'WARN' : 'INFO';
}

/** Coerce a source attribute → positive integer key, else null (counted as a loss, never fabricated). */
function coerceSourceId(raw) {
  const n = safeParseIntOrNull(raw);
  if (n == null || n <= 0) return null;
  return n;
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

function dataset_source_license(ctx) {
  const url = ctx.acquired.license_url;
  ctx.report('dataset_source_license', { violations: url ? 0 : 1, detail: url });
}

function ravine_load_skipped(ctx) {
  const gate = ctx.gate || {};
  ctx.report('ravine_load_skipped', { violations: 0, detail: gate.skipped ? gate.reason : null });
}

function ravine_no_cache_validators(ctx) {
  const present = [];
  if (ctx.acquired.last_modified) present.push('last-modified');
  if (ctx.acquired.etag) present.push('etag');
  ctx.report('ravine_no_cache_validators', {
    violations: present.length === 0 ? 1 : 0,
    detail: present.length === 0 ? 'neither last-modified nor etag' : present.join('+'),
  });
}

function ravine_dataset_age_years(ctx) {
  const stamped = ctx.acquired.last_modified_ms;
  const ageDays = Number.isFinite(stamped)
    ? Math.floor((ctx.clock() - stamped) / MS_PER_DAY)
    : ageDaysFrom(ctx.clock(), ctx.acquired.last_modified);
  const status = datasetAgeStatus(ageDays, ctx.config.load_ravines_dataset_age_warn_years);
  ctx.report('ravine_dataset_age_years', {
    violations: status === 'WARN' ? 1 : 0,
    detail: ageDays == null ? null : Math.floor(ageDays / DAYS_PER_JULIAN_YEAR),
  });
}

function ravine_override_feature_count_drift_present(ctx) {
  const standing = ctx.overrides.accept_feature_count_drift === true;
  ctx.report('ravine_override_feature_count_drift_present', { violations: standing ? 1 : 0, detail: standing });
}

function ravine_override_mass_delete_present(ctx) {
  const standing = ctx.overrides.accept_mass_delete === true;
  ctx.report('ravine_override_mass_delete_present', { violations: standing ? 1 : 0, detail: standing });
}

function ravine_feature_count(ctx) {
  ctx.report('ravine_feature_count', { violations: 0, detail: ctx.acquired.feature_count });
}

/**
 * L7 — scored at `when: "pre_write"` (Fold C / LR-D9). READS `ctx.acquired` AND
 * `ctx.prior` ONLY, and that is a contract, not a coincidence: the runner evaluates
 * this observer once BEFORE the write (to decide whether the write happens at all)
 * and once after, over the full selection. Reaching for `ctx.written` here would make
 * the two passes disagree — undefined at the gate, a real number in the audit table —
 * so the position is only sound while both inputs are write-independent.
 */
function ravine_count_drift_pct(ctx) {
  const pct = computeCountDeltaPct(ctx.acquired.feature_count, priorFeatureCount(ctx));
  ctx.report('ravine_count_drift_pct', { value: pct, detail: round3(pct) });
}

function ravine_geometry_repaired_pct(ctx) {
  const pct = ratioOfFeatures(ctx, ctx.acquired.invalid_geometry_repaired);
  ctx.report('ravine_geometry_repaired_pct', { violations: 0, detail: round3(pct) });
}

function ravine_geometry_collection_extracted(ctx) {
  ctx.report('ravine_geometry_collection_extracted', {
    violations: 0,
    detail: ctx.acquired.geometry_collection_extracted,
  });
}

/**
 * L8 — scored at `when: "pre_write"` (Fold C / LR-D9), same contract as L7 above: the
 * validation counters it reads (`invalid_geometry_skipped`, `skipped_keys`) are produced
 * by `write.validateGeometries`, which is read-only PostGIS SQL and runs before the
 * first write statement. Spec 59 L8 requires the abort to precede `withTransaction`;
 * this observer supplies the number that decision is made on. No `ctx.written`.
 */
function ravine_geometry_skipped_pct(ctx) {
  const pct = ratioOfFeatures(ctx, ctx.acquired.invalid_geometry_skipped);
  // LR-D1 — the dropped keys travel in ONE row's detail, capped, with the FULL count
  // beside them. Pre-conversion they were pushed as one WARN row EACH, so the audit
  // table's row count was bounded only by the feature count.
  const dropped = ctx.acquired.skipped_keys || [];
  ctx.report('ravine_geometry_skipped_pct', {
    value: pct,
    detail: dropped.length === 0 ? round3(pct) : {
      pct: round3(pct),
      dropped_count: dropped.length,
      dropped_source_ids: dropped.slice(0, MAX_DETAIL_KEYS),
      dropped_ids_truncated: dropped.length > MAX_DETAIL_KEYS,
    },
  });
}

function ravine_write_privilege(ctx) {
  const p = (ctx.written && ctx.written.privilege) || null;
  // `rls_enabled === false` is the "table is not protected at all" arm; otherwise the
  // role must bypass RLS or a policy must grant the write, or every statement below
  // affects zero rows and reports success.
  const writable = Boolean(p && (p.rls_enabled === false || p.bypassrls === true || p.policies > 0));
  ctx.report('ravine_write_privilege', {
    violations: writable ? 0 : 1,
    detail: p ? `bypassrls=${p.bypassrls === true} policies=${p.policies}` : 'not measured',
  });
}

function ravine_rows_changed_ratio(ctx) {
  const w = ctx.written || {};
  const ratio = w.rows_scanned > 0 ? w.rows_changed / w.rows_scanned : 0;
  ctx.report('ravine_rows_changed_ratio', { value: ratio, detail: round3(ratio) });
}

function ravine_geometry_update_pct(ctx) {
  const pct = computeGeometryUpdatePct((ctx.written || {}).updated, priorFeatureCount(ctx));
  ctx.report('ravine_geometry_update_pct', { value: pct, detail: round3(pct) });
}

function ravine_mass_delete_pct(ctx) {
  const pct = computeMassDeletePct((ctx.written || {}).deleted, priorFeatureCount(ctx));
  ctx.report('ravine_mass_delete_pct', { value: pct, detail: round3(pct) });
}

function ravine_delete_skipped_empty_guard(ctx) {
  const fired = Boolean((ctx.written || {}).delete_skipped_empty_guard);
  ctx.report('ravine_delete_skipped_empty_guard', { violations: 0, detail: fired });
}

// ---- helpers ----

/** The prior COMPLETED run's feature count, or null when there is no baseline. */
function priorFeatureCount(ctx) {
  if (!ctx.prior) return null;
  return safeParseIntOrNull(ctx.prior.feature_count);
}

/** A count as a fraction of this run's feature count; 0 when nothing was acquired. */
function ratioOfFeatures(ctx, count) {
  const total = ctx.acquired.feature_count;
  return total > 0 ? count / total : 0;
}

function round3(n) {
  return Math.round(n * ROUND_SCALE) / ROUND_SCALE;
}

/**
 * The frozen Spec 59 §9 producer block — 18 fields, byte-identical to the
 * pre-conversion shape, because `scripts/enrich-ravines.js` reads seven of them and
 * HALTs the sources chain on each. Built only on a LOAD: a gated skip re-emits the
 * PRIOR run's block through the library (skeleton ← prior ← pins), which is what
 * keeps a skipped run readable to a consumer that filters on completed rows.
 *
 * `drift_check_passed` and `mass_delete_check_passed` are the two places this file
 * legitimately compares against a bound: they are FIELDS OF THE CONTRACT, not
 * verdict logic, and the consumer gates on them independently of any audit row.
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired;
  const w = ctx.written;
  const prior = priorFeatureCount(ctx);
  const countDeltaPct = computeCountDeltaPct(a.feature_count, prior);
  const massDeletePct = computeMassDeletePct(w.deleted, prior);
  const geometryUpdatePct = computeGeometryUpdatePct(w.updated, prior);
  return {
    spec_version: ctx.descriptor.identity.spec_version,
    source_dataset_version: a.source_dataset_version,
    last_modified: a.last_modified,
    etag: a.etag,
    content_hash: a.content_hash,
    feature_count: a.feature_count,
    polygons_inserted: w.inserted,
    polygons_updated: w.updated,
    polygons_deleted: w.deleted,
    delete_skipped_empty_guard: w.delete_skipped_empty_guard,
    mass_delete_pct: round3(massDeletePct),
    invalid_geometry_repaired: a.invalid_geometry_repaired,
    invalid_geometry_skipped: a.invalid_geometry_skipped,
    geometry_collection_extracted: a.geometry_collection_extracted,
    drift_check_passed: countDeltaPct <= ctx.config.load_ravines_count_drift_fail_pct,
    mass_delete_check_passed: massDeletePct <= ctx.config.load_ravines_mass_delete_fail_pct,
    geometry_update_pct: round3(geometryUpdatePct),
    skipped_reason: null,
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  dataset_source_license,
  ravine_load_skipped,
  ravine_no_cache_validators,
  ravine_dataset_age_years,
  ravine_override_feature_count_drift_present,
  ravine_override_mass_delete_present,
  ravine_feature_count,
  ravine_count_drift_pct,
  ravine_geometry_repaired_pct,
  ravine_geometry_collection_extracted,
  ravine_geometry_skipped_pct,
  ravine_write_privilege,
  ravine_rows_changed_ratio,
  ravine_geometry_update_pct,
  ravine_mass_delete_pct,
  ravine_delete_skipped_empty_guard,
};

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else.
 *
 * ⚠️ CALLED TWICE ON A LOAD (Fold C / LR-D9). The runner invokes this once with
 * `ctx.checks` narrowed to the `when: "pre_write"` ids and `ctx.written === null`, to
 * decide whether the write may happen, and once with the full selection afterwards. The
 * loop below is already scoped to `ctx.checks`, so nothing here changes; what the second
 * invocation relies on is that a pre_write observer is a pure function of `ctx.acquired`
 * + `ctx.prior`, which the write does not touch, so both passes report identically.
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
  return { records_meta: { ravine_load: buildLoadMeta(ctx) } };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// The nine pure domain functions, still importable one at a time.
module.exports.computeCountDeltaPct = computeCountDeltaPct;
module.exports.computeGeometryUpdatePct = computeGeometryUpdatePct;
module.exports.computeMassDeletePct = computeMassDeletePct;
module.exports.shouldSkipDelete = shouldSkipDelete;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.ageDaysFrom = ageDaysFrom;
module.exports.datasetAgeStatus = datasetAgeStatus;
module.exports.coerceSourceId = coerceSourceId;
// The library's generic acquisition seam asks the step how to coerce ITS key.
module.exports.coerceKey = coerceSourceId;
module.exports.buildLoadMeta = buildLoadMeta;
// LR-D1's display bound, exported so its lock reads the real number rather than 50.
module.exports.MAX_DETAIL_KEYS = MAX_DETAIL_KEYS;
