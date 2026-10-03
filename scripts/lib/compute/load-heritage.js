/**
 * SPEC LINK: docs/specs/01-pipeline/61_source_heritage_properties.md §3, §9 (frozen heritage_load contract), §12.3a
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_heritage step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5 · 122a §A18 (0x multi-primary)
 *
 * Toronto Heritage Register + Heritage Conservation Districts — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ WHAT THIS FILE IS NOT. The library owns acquire → validate → write for BOTH
 * datasets (0x, RE-FREEZE #29: `ingestPrimaries` runs one narrowed `runIngestPhase`
 * per declared primary, one transaction per target). What is left here is pure domain
 * arithmetic — the L25 vocabulary, the key/date/address coercions, the §9 producer
 * block — and one observer per declared check.
 *
 * ⚠️ TWO CTX SHAPES (0x). The pre_write gate calls `compute` ONCE PER PRIMARY with
 * `ctx.primary = <external id>`, `ctx.acquired` = that primary's own acquired block and
 * `ctx.prior` = its own prior sub-block. The final pass has no `ctx.primary`:
 * `ctx.acquired.primaries[id]` / `ctx.prior[id]` / `ctx.written.by_target[table]`.
 * `lanes(ctx)` folds both into one list, so every observer reads one shape.
 *
 * ⚠️ §5.5 SHAPE (scripts/ast-grep-rules/compute-shape.yml): one named function per
 * declared check in descriptor order; `compute(ctx)` iterates `ctx.checks`; every seam
 * is injected (`ctx.clock`, `ctx.config`, `ctx.log`); no literal threshold — every
 * bound is a `checks[].limit_from_config` resolved by the library; the verdict is
 * `scripts/lib/step/verdict.js`'s, never this file's.
 */
'use strict';

const { safeParseIntOrNull } = require('../safe-math');
const { MS_PER_DAY, DAYS_PER_JULIAN_YEAR } = require('../units');
// The descriptor ships beside the shell; read once at require() time (neighbourhoods precedent).
const DESCRIPTOR = require('../../load-heritage.descriptor.json');

/** The consumer's exact-match pin (enrich_heritage halts on anything but '1.1'). */
const SPEC_VERSION = DESCRIPTOR.identity.spec_version;
/** The frozen §9 emit: its key and the per-dataset skeletons (the zero form, LH-D8 (b)). */
const EMIT = DESCRIPTOR.emits[0];
/** The declared primaries in declared order — id = the §9 sub-block name, target = its table. */
const LANES = DESCRIPTOR.inputs.reads.externals.map((e) => ({ id: e.id, target: e.target }));
/** ArcGIS's null-date sentinel in DESIGNATED / HCD_DESDAT (vocabulary, notes.json). */
const ARCGIS_NULL_DATE = '1899-11-30';
/**
 * L25 vocabulary per dataset: the shapeRecord skip reasons and the §9 field names they
 * are frozen under (the legacy specSub rename, scripts/load-heritage.js:654-657).
 */
const LANE_VOCAB = {
  heritage_register: {
    filteredReason: 'filtered_listed', unknownReason: 'unknown_status',
    filteredKey: 'filtered_out_listed', unknownKey: 'unknown_status_count',
  },
  heritage_districts: {
    filteredReason: 'filtered_appeal_study', unknownReason: 'unknown_hcd_type',
    filteredKey: 'filtered_out_appeal_study', unknownKey: 'unknown_hcd_type_count',
  },
};

// ===========================================================================
// Pure helpers — ported VERBATIM from the pre-conversion loader's exports
// (src/tests/load-heritage.logic.test.ts locks each one).
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

/** F-C1 (L15): suppress the departure DELETE when the parsed set is empty. */
function shouldSkipDelete(sourceIds) {
  return !Array.isArray(sourceIds) || sourceIds.length === 0;
}

/** §3.5 status → counter deltas (the library's validateGeometries calls it). */
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

/** Dedupe by source_id, keep first — ON CONFLICT cannot affect a row twice in one statement. */
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

/** Days between now (ms) and an HTTP date string; null if unparseable. */
function ageDaysFrom(nowMs, versionStr) {
  if (!versionStr) return null;
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / MS_PER_DAY);
}

/** L9 staleness: WARN once older than thresholdYears (kept for the legacy lock). */
function datasetAgeStatus(ageDays, thresholdYears) {
  if (ageDays == null) return 'INFO';
  return ageDays > thresholdYears * DAYS_PER_JULIAN_YEAR ? 'WARN' : 'INFO';
}

/** Folder_Row / HCD_NO → positive integer source_id, else null (a bad-key count, never fabricated). */
function coerceSourceId(raw) {
  const n = safeParseIntOrNull(raw);
  if (n == null || n <= 0) return null;
  return n;
}

/** L2: DESIGNATED / HCD_DESDAT (Date or ISO string) → 'YYYY-MM-DD'; the ArcGIS sentinel → null. */
function normalizeDesignatedDate(raw) {
  if (raw == null || raw === '') return null;
  let iso = null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    iso = raw.toISOString().slice(0, 10);
  } else {
    const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    iso = m[1];
  }
  return iso === ARCGIS_NULL_DATE ? null : iso;
}

/** DEC-M: a source address → non-null trimmed string; flags coerced-empty. */
function coerceAddress(raw) {
  if (raw == null) return { value: '', coerced: true };
  const s = String(raw).trim();
  return s === '' ? { value: '', coerced: true } : { value: s, coerced: false };
}

/** L25 + H-v1.1.2: case-insensitive STATUS → target status, or a filter/unknown signal. */
function classifyRegisterStatus(rawStatus) {
  const s = (rawStatus || '').toLowerCase().trim();
  if (s === 'listed') return { drop: 'filtered_listed' };
  if (s === 'part iv') return { status: 'part_iv' };
  if (s === 'part v') return { status: 'part_v_member' };
  return { drop: 'unknown_status' };
}

/** L25 + H-v1.1.2: case-insensitive HCD_TYPE → keep designated, or filter/unknown. */
function classifyHcdType(rawType) {
  const t = (rawType || '').toLowerCase().trim();
  if (t === 'under appeal' || t === 'under study') return { drop: 'filtered_appeal_study' };
  if (t === 'designated district') return { hcdType: 'designated_district' };
  return { drop: 'unknown_hcd_type' };
}

// ===========================================================================
// The runner seams — coerceKey (acquire.js parseShapefile) and shapeRecord
// (index.js runIngestPhase, AFTER the key coercion and the null-geometry drop).
// ===========================================================================

/** The key seam: both primaries key on a positive integer (Folder_Row #426 / HCD_NO). */
function coerceKey(raw) {
  return coerceSourceId(raw);
}

/**
 * ONE shapeRecord serves BOTH primaries (① decision 5): the seam carries no external id
 * (`{geojson, config, run_at, tag}`), so a district is told from a register point by its
 * own DBF fields. Returns the column values the write plan binds, or a skip-reason string
 * (0p `shaped_skipped_by_reason`). LH-D11: the library has already dropped a bad key /
 * null geometry before this runs; the legacy classified first.
 */
function shapeRecord(record, seam) {
  const p = record || {};
  const s = seam || {};
  const own = (k) => Object.prototype.hasOwnProperty.call(p, k);
  return own('HCD_TYPE') || own('HCD_NO') ? shapeDistrict(p, s) : shapeRegister(p, s);
}

function textOrNull(v) {
  return v != null ? String(v) : null;
}

/** A register point → heritage_properties columns (legacy parseRegister, :316-353). */
function shapeRegister(p, s) {
  const cls = classifyRegisterStatus(p.STATUS);
  if (cls.drop) return cls.drop;
  const addr = coerceAddress(p.ADDRESS);
  if (addr.coerced && typeof s.tag === 'function') s.tag('address_coerced_empty');
  return {
    geojson: s.geojson,
    status: cls.status,
    designated_date: normalizeDesignatedDate(p.DESIGNATED),
    bylaw_no: textOrNull(p.BYLAW_NO),
    htg_conser_name: textOrNull(p.HTG_CONSER),
    building_type: textOrNull(p.BUILDING_T),
    reason: textOrNull(p.REASON),
    address_text: addr.value,
    construction_year: safeParseIntOrNull(p.CONSTRUCTI),
  };
}

/** A district polygon → heritage_districts columns (legacy parseHcd, :356-384). */
function shapeDistrict(p, s) {
  const cls = classifyHcdType(p.HCD_TYPE);
  if (cls.drop) return cls.drop;
  return {
    geojson: s.geojson,
    name: p.HCD_NAME != null ? String(p.HCD_NAME) : '',
    hcd_type: cls.hcdType,
    designated_date: normalizeDesignatedDate(p.HCD_DESDAT),
    bylaw_no: textOrNull(p.HCD_BYLAWN),
    wards: textOrNull(p.HCD_WARDS),
  };
}

// ===========================================================================
// Lanes — one entry per declared primary, whichever ctx shape arrived
// ===========================================================================

/** Outcomes that reached the pre_write gate (acquired, shaped, validated). */
const GATED = new Set(['gating', 'loaded', 'write_skipped']);

function lanes(ctx) {
  if (ctx.primary) {
    const lane = LANES.find((l) => l.id === ctx.primary) || { id: ctx.primary, target: null };
    return [{ ...lane, outcome: 'gating', acquired: ctx.acquired || {}, prior: ctx.prior || null, written: null }];
  }
  const primaries = (ctx.acquired && ctx.acquired.primaries) || {};
  const priors = ctx.prior && typeof ctx.prior === 'object' ? ctx.prior : {};
  const byTarget = (ctx.written && ctx.written.by_target) || {};
  return LANES.map((l) => {
    const a = primaries[l.id] || {};
    const prior = priors[l.id] && typeof priors[l.id] === 'object' ? priors[l.id] : null;
    return { ...l, outcome: a.outcome || 'not_reached', acquired: a, prior, written: byTarget[l.target] || null };
  });
}

function laneById(ctx, id) {
  return lanes(ctx).find((l) => l.id === id) || { id, outcome: 'not_reached', acquired: {}, prior: null, written: null };
}

/** The prior COMPLETED sub-block's feature_count, or null when there is no baseline. */
function priorFeatureCount(lane) {
  return lane.prior ? safeParseIntOrNull(lane.prior.feature_count) : null;
}

function reasonCount(lane, reason) {
  const r = lane.acquired.shaped_skipped_by_reason || {};
  return Number(r[reason]) || 0;
}

function countDriftOf(lane) {
  return computeCountDeltaPct(lane.acquired.feature_count, priorFeatureCount(lane));
}

function round3(ctx, n) {
  const scale = ctx.config && ctx.config.load_heritage_round_scale;
  if (!Number.isFinite(scale)) throw new Error('load_heritage_round_scale is not a resolved number');
  return Math.round(n * scale) / scale;
}

/** The worst (max) of fn over the lanes that pass `keep`, 0 when none does (legacy Math.max(... || 0)). */
function worst(ctx, keep, fn) {
  return lanes(ctx).filter(keep).reduce((m, l) => Math.max(m, fn(l)), 0);
}

// ===========================================================================
// Checks — one function per declared check, in descriptor order, name === id
// ===========================================================================

function dataset_source_license(ctx) {
  const urls = lanes(ctx).map((l) => l.acquired.license_url).filter(Boolean);
  ctx.report('dataset_source_license', { violations: urls.length ? 0 : 1, detail: urls[0] || null });
}

function heritage_override_feature_count_drift_present(ctx) {
  const standing = (ctx.overrides || {}).accept_feature_count_drift === true;
  ctx.report('heritage_override_feature_count_drift_present', { violations: standing ? 1 : 0, detail: standing });
}

function heritage_override_mass_delete_present(ctx) {
  const standing = (ctx.overrides || {}).accept_mass_delete === true;
  ctx.report('heritage_override_mass_delete_present', { violations: standing ? 1 : 0, detail: standing });
}

function heritage_override_force_reload_present(ctx) {
  const standing = (ctx.overrides || {}).force_run === true;
  ctx.report('heritage_override_force_reload_present', { violations: standing ? 1 : 0, detail: standing });
}

function loadSkipped(ctx, id) {
  const lane = laneById(ctx, id);
  return { violations: 0, detail: lane.outcome === 'skipped' ? (lane.acquired.reason || null) : null };
}

function heritage_register_load_skipped(ctx) {
  ctx.report('heritage_register_load_skipped', loadSkipped(ctx, 'heritage_register'));
}

function heritage_districts_load_skipped(ctx) {
  ctx.report('heritage_districts_load_skipped', loadSkipped(ctx, 'heritage_districts'));
}

/**
 * L9 — the OLDER dataset's age. value = Julian years (the exact legacy comparison
 * ageDays > years x 365.25 under the declared `value_max` bound); detail = the legacy
 * whole-year floor. No parseable stamp on either dataset ⇒ inert (INFO), as legacy.
 */
function heritage_dataset_age_years(ctx) {
  const now = ctx.clock();
  const ages = lanes(ctx)
    .filter((l) => l.outcome !== 'failed' && l.outcome !== 'not_reached')
    .map((l) => ageDaysFrom(now, l.acquired.last_modified || (l.prior && l.prior.last_modified)))
    .filter((d) => d != null);
  if (ages.length === 0) {
    ctx.report('heritage_dataset_age_years', { value: 0, detail: null, inert: true });
    return;
  }
  const maxAgeDays = Math.max(...ages);
  ctx.report('heritage_dataset_age_years', {
    value: maxAgeDays / DAYS_PER_JULIAN_YEAR,
    detail: Math.floor(maxAgeDays / DAYS_PER_JULIAN_YEAR),
  });
}

/** L14 (pre_write): a dataset with no prior sub-block that acquired zero features. */
function heritage_zero_features_first_run(ctx) {
  const ids = lanes(ctx)
    .filter((l) => GATED.has(l.outcome) && !l.prior && Number(l.acquired.feature_count) === 0)
    .map((l) => l.id);
  ctx.report('heritage_zero_features_first_run', { violations: ids.length, detail: ids.length ? ids.join(', ') : null });
}

/** L7 (pre_write): reads acquired + prior only, so both passes agree. */
function heritage_count_drift_pct(ctx) {
  const pct = worst(ctx, (l) => GATED.has(l.outcome), countDriftOf);
  ctx.report('heritage_count_drift_pct', { value: pct, detail: round3(ctx, pct) });
}

/** L8 (pre_write): validation counters are read-only SQL, measured before the write. */
function heritage_geometry_skipped_pct(ctx) {
  const pct = worst(ctx, (l) => GATED.has(l.outcome), (l) => {
    const fc = Number(l.acquired.feature_count) || 0;
    return fc > 0 ? (Number(l.acquired.invalid_geometry_skipped) || 0) / fc : 0;
  });
  ctx.report('heritage_geometry_skipped_pct', { value: pct, detail: round3(ctx, pct) });
}

function heritage_register_feature_count(ctx) {
  ctx.report('heritage_register_feature_count', { violations: 0, detail: subFor(ctx, laneById(ctx, 'heritage_register')).feature_count });
}

function heritage_districts_feature_count(ctx) {
  ctx.report('heritage_districts_feature_count', { violations: 0, detail: subFor(ctx, laneById(ctx, 'heritage_districts')).feature_count });
}

/** Register raw = kept + Listed + unknown-status; a skipped/failed register reads 0 (legacy). */
function heritage_filtered_listed_pct(ctx) {
  const lane = laneById(ctx, 'heritage_register');
  const gated = GATED.has(lane.outcome);
  const filtered = gated ? reasonCount(lane, 'filtered_listed') : 0;
  const unknown = gated ? reasonCount(lane, 'unknown_status') : 0;
  const raw = subFor(ctx, lane).feature_count + filtered + unknown;
  ctx.report('heritage_filtered_listed_pct', { violations: 0, detail: raw > 0 ? round3(ctx, filtered / raw) : 0 });
}

function gatedReason(ctx, id, reason) {
  const lane = laneById(ctx, id);
  return GATED.has(lane.outcome) ? reasonCount(lane, reason) : 0;
}

function heritage_unknown_status_count(ctx) {
  const n = gatedReason(ctx, 'heritage_register', 'unknown_status');
  ctx.report('heritage_unknown_status_count', { violations: n, detail: n });
}

function heritage_unknown_hcd_type_count(ctx) {
  const n = gatedReason(ctx, 'heritage_districts', 'unknown_hcd_type');
  ctx.report('heritage_unknown_hcd_type_count', { violations: n, detail: n });
}

function heritage_address_coerced_empty_count(ctx) {
  const lane = laneById(ctx, 'heritage_register');
  const tags = GATED.has(lane.outcome) ? (lane.acquired.shaped_tags || {}) : {};
  const n = Number(tags.address_coerced_empty) || 0;
  ctx.report('heritage_address_coerced_empty_count', { violations: n, detail: n });
}

/** Legacy reported a bad key only for a dataset that reached its write (:618, :736-737). */
function badKeyCount(ctx, id) {
  const lane = laneById(ctx, id);
  const n = lane.outcome === 'loaded' ? (Number(lane.acquired.bad_key_count) || 0) : 0;
  return { violations: n, detail: n };
}

function heritage_register_bad_source_id_count(ctx) {
  ctx.report('heritage_register_bad_source_id_count', badKeyCount(ctx, 'heritage_register'));
}

function heritage_districts_bad_source_id_count(ctx) {
  ctx.report('heritage_districts_bad_source_id_count', badKeyCount(ctx, 'heritage_districts'));
}

function duplicateCount(ctx, id) {
  const lane = laneById(ctx, id);
  const n = GATED.has(lane.outcome) ? (Number(lane.acquired.duplicate_key_count) || 0) : 0;
  return { violations: n, detail: n };
}

function heritage_register_duplicate_source_id_count(ctx) {
  ctx.report('heritage_register_duplicate_source_id_count', duplicateCount(ctx, 'heritage_register'));
}

function heritage_districts_duplicate_source_id_count(ctx) {
  ctx.report('heritage_districts_duplicate_source_id_count', duplicateCount(ctx, 'heritage_districts'));
}

/** L7c (post, LH-D1 PIN): per-TABLE written.by_target, never the summed written.*. */
function heritage_mass_delete_pct(ctx) {
  const pct = worst(ctx, (l) => l.outcome === 'loaded' && l.written,
    (l) => computeMassDeletePct(Number(l.written.deleted) || 0, priorFeatureCount(l)));
  ctx.report('heritage_mass_delete_pct', { value: pct, detail: round3(ctx, pct) });
}

/** L7b (post, LH-D2 PIN): counts version-stamp rewrites too. */
function heritage_geometry_update_pct(ctx) {
  const pct = worst(ctx, (l) => l.outcome === 'loaded' && l.written,
    (l) => computeGeometryUpdatePct(Number(l.written.updated) || 0, priorFeatureCount(l)));
  ctx.report('heritage_geometry_update_pct', { value: pct, detail: round3(ctx, pct) });
}

/** "Not written": acquisition threw (outcome failed) or its pre_write gate refused it. */
function loadFailed(ctx, id) {
  const lane = laneById(ctx, id);
  if (lane.outcome === 'failed') return { violations: 1, detail: `failed: ${lane.acquired.error}` };
  if (lane.outcome === 'write_skipped') {
    const refused = Array.isArray(lane.acquired.failed_pre_write) ? lane.acquired.failed_pre_write.join(', ') : 'pre_write';
    return { violations: 1, detail: `pre_write refused: ${refused}` };
  }
  return { violations: 0, detail: null };
}

function heritage_register_load_failed(ctx) {
  ctx.report('heritage_register_load_failed', loadFailed(ctx, 'heritage_register'));
}

function heritage_districts_load_failed(ctx) {
  ctx.report('heritage_districts_load_failed', loadFailed(ctx, 'heritage_districts'));
}

// ===========================================================================
// The frozen §9 producer block (enrich_heritage reads spec_version and each
// sub-block's feature_count / drift_check_passed / source_dataset_version).
// ===========================================================================

/**
 * One dataset's §9 sub-block, per outcome, in the legacy's own shapes:
 *   loaded        — the full block (legacy loadDataset ok path, :619-639)
 *   skipped       — skeleton ← prior ← pins (legacy :493); the library then re-emits
 *                   its own DS4 block over it (multiPrimarySkipEmit), so this copy
 *                   feeds only the records_total SUM (① decision 3)
 *   write_skipped — the legacy abort shapes, first match wins as legacy returned first:
 *                   L14 (:543), L7 unaccepted (:555), else L8 (:583)
 *   failed        — the zero skeleton (LH-D8 (b) PIN, fixed at ④b)
 */
function subFor(ctx, lane) {
  const v = LANE_VOCAB[lane.id];
  const skeleton = { ...EMIT.skeleton[lane.id] };
  const a = lane.acquired;
  const cfg = ctx.config || {};
  if (lane.outcome === 'skipped') {
    return {
      ...skeleton, ...(lane.prior || {}), spec_version: SPEC_VERSION,
      features_inserted: 0, features_updated: 0, features_deleted: 0,
      [v.filteredKey]: 0, [v.unknownKey]: 0, skipped_reason: a.reason || null,
    };
  }
  const versions = {
    source_dataset_version: a.source_dataset_version, last_modified: a.last_modified || null,
    etag: a.etag || null, content_hash: a.content_hash,
  };
  const featureCount = Number(a.feature_count) || 0;
  const driftBreached = !(countDriftOf(lane) <= cfg.load_heritage_count_drift_fail_pct);
  if (lane.outcome === 'write_skipped') {
    if (!lane.prior && featureCount === 0) return { ...skeleton, ...versions, feature_count: 0, drift_check_passed: false };
    if (driftBreached && (ctx.overrides || {}).accept_feature_count_drift !== true) {
      return { ...skeleton, ...versions, feature_count: featureCount, drift_check_passed: false };
    }
    return { ...skeleton, ...versions, feature_count: featureCount, invalid_geometry_skipped: a.invalid_geometry_skipped, drift_check_passed: !driftBreached };
  }
  if (lane.outcome !== 'loaded') return skeleton;
  const w = lane.written || {};
  const prior = priorFeatureCount(lane);
  const massDeletePct = computeMassDeletePct(Number(w.deleted) || 0, prior);
  return {
    spec_version: SPEC_VERSION,
    ...versions,
    feature_count: featureCount,
    features_inserted: Number(w.inserted) || 0,
    features_updated: Number(w.updated) || 0,
    features_deleted: Number(w.deleted) || 0,
    invalid_geometry_repaired: a.invalid_geometry_repaired,
    invalid_geometry_skipped: a.invalid_geometry_skipped,
    geometry_collection_extracted: a.geometry_collection_extracted,
    drift_check_passed: !driftBreached,
    mass_delete_check_passed: !(prior != null && massDeletePct > cfg.load_heritage_mass_delete_fail_pct),
    geometry_update_pct: round3(ctx, computeGeometryUpdatePct(Number(w.updated) || 0, prior)),
    delete_skipped_empty_guard: w.delete_skipped_empty_guard === true,
    skipped_reason: null,
    [v.filteredKey]: reasonCount(lane, v.filteredReason),
    [v.unknownKey]: reasonCount(lane, v.unknownReason),
  };
}

/** `{ heritage_load: {spec_version, <each dataset>, geometry_update_pct, mass_delete_pct} }` — worst-of over loaded datasets. */
function buildLoadMeta(ctx) {
  const all = lanes(ctx);
  const loaded = (l) => l.outcome === 'loaded' && l.written;
  const geometryUpdatePct = worst(ctx, loaded, (l) => computeGeometryUpdatePct(Number(l.written.updated) || 0, priorFeatureCount(l)));
  const massDeletePct = worst(ctx, loaded, (l) => computeMassDeletePct(Number(l.written.deleted) || 0, priorFeatureCount(l)));
  return {
    [EMIT.key]: {
      spec_version: SPEC_VERSION,
      ...Object.fromEntries(all.map((l) => [l.id, subFor(ctx, l)])),
      geometry_update_pct: round3(ctx, geometryUpdatePct),
      mass_delete_pct: round3(ctx, massDeletePct),
    },
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in DESCRIPTOR ORDER. */
const CHECKS = {
  dataset_source_license,
  heritage_override_feature_count_drift_present,
  heritage_override_mass_delete_present,
  heritage_override_force_reload_present,
  heritage_register_load_skipped,
  heritage_districts_load_skipped,
  heritage_dataset_age_years,
  heritage_zero_features_first_run,
  heritage_count_drift_pct,
  heritage_geometry_skipped_pct,
  heritage_register_feature_count,
  heritage_districts_feature_count,
  heritage_filtered_listed_pct,
  heritage_unknown_status_count,
  heritage_unknown_hcd_type_count,
  heritage_address_coerced_empty_count,
  heritage_register_bad_source_id_count,
  heritage_districts_bad_source_id_count,
  heritage_register_duplicate_source_id_count,
  heritage_districts_duplicate_source_id_count,
  heritage_mass_delete_pct,
  heritage_geometry_update_pct,
  heritage_register_load_failed,
  heritage_districts_load_failed,
};

/** REQUIRE-TIME INVARIANT (§5.5): the dispatch keys ARE the declared check ids, in order. */
const DECLARED_CHECKS = DESCRIPTOR.checks.map((c) => c.id);
const DISPATCH_KEYS = Object.keys(CHECKS);
if (DISPATCH_KEYS.length !== DECLARED_CHECKS.length || DISPATCH_KEYS.some((id, i) => id !== DECLARED_CHECKS[i])) {
  throw new Error('load-heritage compute dispatch keys are not the descriptor\'s declared check ids: '
    + `dispatch=[${DISPATCH_KEYS.join(', ')}] declared=[${DECLARED_CHECKS.join(', ')}]`);
}
for (const id of DECLARED_CHECKS) {
  if (CHECKS[id].name !== id) throw new Error(`load-heritage compute: checks.${id} is bound to a function named "${CHECKS[id].name}"`);
}

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else. Called once per primary by the
 * pre_write gate (`ctx.written === null`, so no block is built) and once at the end.
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
  if (!ctx.written) return { records_meta: {} };
  return { records_meta: buildLoadMeta(ctx) };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// The runner seams (§5.5 (1)).
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.shouldSkipDelete = shouldSkipDelete;
module.exports.buildLoadMeta = buildLoadMeta;
// The pure domain functions, importable one at a time (the re-pointed legacy locks).
module.exports.computeCountDeltaPct = computeCountDeltaPct;
module.exports.computeGeometryUpdatePct = computeGeometryUpdatePct;
module.exports.computeMassDeletePct = computeMassDeletePct;
module.exports.ageDaysFrom = ageDaysFrom;
module.exports.datasetAgeStatus = datasetAgeStatus;
module.exports.coerceSourceId = coerceSourceId;
module.exports.normalizeDesignatedDate = normalizeDesignatedDate;
module.exports.coerceAddress = coerceAddress;
module.exports.classifyRegisterStatus = classifyRegisterStatus;
module.exports.classifyHcdType = classifyHcdType;
