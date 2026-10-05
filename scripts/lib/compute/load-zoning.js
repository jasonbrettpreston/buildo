/**
 * SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3, §9 (frozen zoning contract), §11
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_zoning step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §4.1, §5.1, §5.5 · 122a §A18 (0x), §A19 (0y)
 *
 * Toronto Zoning By-law 569-2013 — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ WHAT THIS FILE IS NOT. The library owns the package_show gate, the paged
 * datastore_search acquisition, the reject-all dedupe call site, the geometry
 * validation and the per-layer class-B write for all ten layers (0x multi-primary +
 * 0y all-primaries skip: `ingestPrimaries` runs one narrowed `runIngestPhase` per
 * declared primary, one transaction per target). What is left here: the column
 * vocabulary (`LAYER_COLUMNS`, the migration-164 CHECK mirror), the coercions, the
 * frozen §9 producer block, and one observer per declared check.
 *
 * ⚠️ TWO CTX SHAPES (0x). The pre_write gate calls `compute` ONCE PER PRIMARY with
 * `ctx.primary = <layer key>` and `ctx.acquired` = that layer's own acquired block.
 * The final pass has no `ctx.primary`: `ctx.acquired.primaries[id]` /
 * `ctx.written.by_target[table]`, and `ctx.prior` is the whole prior records_meta
 * (0y all-primaries: one prior for the step). `lanes(ctx)` folds both shapes.
 *
 * ⚠️ §5.5 SHAPE: one named function per declared check, in descriptor order (built
 * from the declared check ids and asserted at require time); no literal threshold —
 * every bound is a `checks[].limit_from_config` / `warn_limit_from_config` the library
 * resolves; the verdict is `scripts/lib/step/verdict.js`'s, never this file's.
 */
'use strict';

const { MS_PER_DAY } = require('../units');
const { checkAttrDrift } = require('../zoning-attr-drift');
// The descriptor ships beside the shell; read once at require() time (heritage precedent).
const DESCRIPTOR = require('../../load-zoning.descriptor.json');

/** The declared primaries in declared order: id = the legacy layer key, target = its table. */
const LANES = DESCRIPTOR.inputs.reads.externals.map((e) => ({ id: e.id, target: e.target, resourceId: e.ckan.resource_id }));
const BASE = LANES[0].id;
const LICENSE_URL = DESCRIPTOR.inputs.reads.externals[0].license;
const GEOM_KIND = Object.fromEntries(DESCRIPTOR.outputs.writes.map((w) => [w.table, w.geometry_kind]));

const NUM = 'num';
const INT = 'int';
const TEXT = 'text';
const HEIGHT_LABEL = 'height_label';

/**
 * The column vocabulary per layer (Spec 58 §2 sub-layer map; ported VERBATIM from the
 * legacy LAYERS registry, src/tests/steps/load_zoning/fixtures/legacy-load-zoning.js.txt:66-174).
 * `src` = the CKAN DataStore field, `col` = the target column, `min`/`max`/`maxLen` =
 * the migration-164 CHECK mirror (domain schema facts, not tunables). `nullTrack` /
 * `distribution` name the base columns the §3 observability rows read.
 */
const LAYER_COLUMNS = {
  base: {
    nullTrack: ['coverage_max_pct', 'fsi_max', 'frontage_min_m'],
    distribution: 'zn_zone',
    cols: [
      { col: 'gen_zone', src: 'GEN_ZONE', kind: INT },
      { col: 'zn_zone', src: 'ZN_ZONE', kind: TEXT, maxLen: 20 },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT, maxLen: 50 },
      { col: 'zn_holding', src: 'ZN_HOLDING', kind: TEXT },
      { col: 'holding_id', src: 'HOLDING_ID', kind: INT },
      { col: 'frontage_min_m', src: 'FRONTAGE', kind: NUM, min: 0 },
      { col: 'area_min_sqm', src: 'ZN_AREA', kind: INT, min: 0 },
      { col: 'units_max', src: 'UNITS', kind: INT, min: 0 },
      { col: 'density_max', src: 'DENSITY', kind: NUM, min: 0 },
      { col: 'coverage_max_pct', src: 'COVERAGE', kind: NUM, min: 0, max: 100 },
      { col: 'fsi_max', src: 'FSI_TOTAL', kind: NUM, min: 0 },
      { col: 'pct_commercial_max', src: 'PRCNT_COMM', kind: NUM, min: 0, max: 100 },
      { col: 'pct_residential_max', src: 'PRCNT_RES', kind: NUM, min: 0, max: 100 },
      { col: 'pct_employment_max', src: 'PRCNT_EMMP', kind: NUM, min: 0, max: 100 },
      { col: 'pct_office_max', src: 'PRCNT_OFFC', kind: NUM, min: 0, max: 100 },
      { col: 'exception_number', src: 'EXCPTN_NO', kind: INT },
      { col: 'exception_text', src: 'ZN_EXCPTN', kind: TEXT },
      { col: 'bylaw_chapter', src: 'ZBL_CHAPT', kind: TEXT },
      { col: 'bylaw_section', src: 'ZBL_SECTN', kind: TEXT },
      { col: 'bylaw_exception_ref', src: 'ZBL_EXCPTN', kind: TEXT },
      { col: 'standard_setback', src: 'STAND_SET', kind: NUM, min: 0 },
      { col: 'zone_status', src: 'ZN_STATUS', kind: INT },
      { col: 'area_units', src: 'AREA_UNITS', kind: NUM },
    ],
  },
  height_overlay: {
    cols: [
      { col: 'ht_stories', src: 'HT_STORIES', kind: INT, min: 0 },
      { col: 'ht_string', src: 'HT_STRING', kind: TEXT },
      { col: 'height_max_m', src: 'HT_LABEL', kind: HEIGHT_LABEL, min: 0 },
    ],
  },
  lot_coverage_overlay: {
    cols: [{ col: 'coverage_max_pct_override', src: 'PRCNT_CVER', kind: NUM, min: 0, max: 100 }],
  },
  building_setback_overlay: {
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT },
      { col: 'ch600_area_type', src: 'CH600_AREA_TYPE', kind: INT },
      { col: 'bylaw_section_link', src: 'BYLAW_SECTIONLINK', kind: TEXT },
    ],
  },
  policy_area_overlay: {
    cols: [
      { col: 'policy_id', src: 'POLICY_ID', kind: TEXT },
      { col: 'chapter_200_ref', src: 'CHAPT_200', kind: TEXT },
      { col: 'exception_link', src: 'EXCPTN_LK', kind: TEXT },
    ],
  },
  policy_road_overlay: {
    cols: [{ col: 'road_name', src: 'ROAD_NAME', kind: TEXT }],
  },
  rooming_house_overlay: {
    cols: [
      { col: 'rmh_area', src: 'RMH_AREA', kind: TEXT },
      { col: 'rmg_hs_no', src: 'RMG_HS_NO', kind: INT },
      { col: 'rmg_string', src: 'RMG_STRING', kind: TEXT },
      { col: 'chapter_150_25_ref', src: 'CHAP150_25', kind: TEXT },
    ],
  },
  parking_zone_overlay: {
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_parkzone', src: 'ZN_PARKZONE', kind: TEXT },
    ],
  },
  priority_retail_overlay: {
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT },
      { col: 'ch600_line_type', src: 'CH600_LINE_TYPE', kind: INT },
      { col: 'linear_name_full_legal', src: 'LINEAR_NAME_FULL_LEGAL', kind: TEXT },
      { col: 'bylaw_section_link', src: 'BYLAW_SECTIONLINK', kind: TEXT },
    ],
  },
  queenstw_eat_overlay: {
    cols: [
      { col: 'objectid', src: 'OBJECTID', kind: INT },
      { col: 'zn_string', src: 'ZN_STRING', kind: TEXT },
      { col: 'ch600_area_type', src: 'CH600_AREA_TYPE', kind: INT },
      { col: 'bylaw_section_link', src: 'BYLAW_SECTIONLINK', kind: TEXT },
    ],
  },
};

/** The legacy-shaped layer registry, derived (descriptor ids/tables/resources + the vocabulary above). */
const LAYERS = LANES.map((l) => ({
  key: l.id,
  table: l.target,
  resourceId: l.resourceId,
  geomKind: GEOM_KIND[l.target] === 'multiline' ? 'linestring' : 'polygon',
  isBase: l.id === BASE,
  cols: LAYER_COLUMNS[l.id].cols,
}));

/** F-H3: the frozen required field set of a layer (the legacy requiredAttrColumns). */
function requiredAttrColumns(layerKey) {
  return ['_id', 'geometry', ...LAYER_COLUMNS[layerKey].cols.map((c) => c.src)];
}

// ===========================================================================
// Pure helpers — ported VERBATIM from the pre-conversion loader's exports
// ===========================================================================

/** Non-throwing numeric parse (H1). */
function parseNum(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** R2-16: strict HT_LABEL parse; ranges/prose → null + unparseable (never fabricate). */
function parseHeightLabel(label) {
  if (label == null) return { value: null, unparseable: false };
  const s = String(label).trim();
  if (s === '') return { value: null, unparseable: false };
  const m = /^(\d+(?:\.\d+)?)\s*m?$/i.exec(s);
  if (!m) return { value: null, unparseable: true };
  return { value: Number(m[1]), unparseable: false };
}

/** F-M7: coerce CKAN `_id` to a positive integer (CKAN _id is 1-based), else null. */
function coerceSourceId(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null; // M4: reject 0
  return n;
}

/** D9: coerce per declared kind; an out-of-range numeric nulls the CELL (never the row). */
function coerceColumn(rawValue, colDef) {
  if (rawValue == null || rawValue === '') return { value: null, ok: true };
  if (colDef.kind === TEXT) {
    let v = String(rawValue);
    if (colDef.maxLen && v.length > colDef.maxLen) v = v.slice(0, colDef.maxLen);
    return { value: v, ok: true };
  }
  if (colDef.kind === HEIGHT_LABEL) {
    return { value: parseHeightLabel(rawValue).value, ok: true };
  }
  const num = parseNum(rawValue);
  if (num == null) return { value: null, ok: true };
  if ((colDef.min != null && num < colDef.min) || (colDef.max != null && num > colDef.max)) {
    return { value: null, ok: true, nulled: true };
  }
  return { value: colDef.kind === INT ? Math.trunc(num) : num, ok: true };
}

/** R2-17: reject ALL rows sharing a non-unique source_id (deterministic). */
function dedupeRejectAll(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.source_id, (counts.get(r.source_id) || 0) + 1);
  const kept = rows.filter((r) => counts.get(r.source_id) === 1);
  return { kept, duplicateCount: rows.length - kept.length };
}

/** Spec 47 §8.4 + P-M4: top-N from a `value → count` map, ties broken by value. */
function topNFromCounts(counts, n) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const top = sorted.slice(0, n).map(([zone, count]) => ({ zone, count }));
  const rest = sorted.slice(n);
  return { top, truncatedClassCount: rest.length, otherCount: rest.reduce((s, [, c]) => s + c, 0) };
}

/** Spec 47 §8.4 + P-M4: top-N distribution over raw class values (legacy signature). */
function topNDistribution(classValues, n) {
  const counts = new Map();
  for (const v of classValues) {
    if (v == null) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return topNFromCounts(counts, n);
}

/** Days between now (ms) and a CKAN version string; null if unparseable. */
function ageDaysFrom(nowMs, versionStr) {
  if (versionStr == null) return null;
  const v = Date.parse(versionStr);
  return Number.isNaN(v) ? null : Math.floor((nowMs - v) / MS_PER_DAY);
}

/**
 * C3: a prior run's metric value from its audit_table.rows (never flat keys). Accepts
 * the converted prior (records_meta itself) and the legacy row shape ({records_meta}).
 */
function priorMetricValue(prior, metric) {
  const meta = prior && prior.records_meta ? prior.records_meta : prior;
  const rows = meta && meta.audit_table && meta.audit_table.rows;
  if (!Array.isArray(rows)) return null;
  const hit = rows.find((r) => r.metric === metric);
  return hit ? hit.value : null;
}

// ===========================================================================
// The runner seams — coerceKey (acquire.js ckan arm) and shapeRecord
// (index.js runIngestPhase, AFTER the null-geometry drop and the key coercion)
// ===========================================================================

/** The key seam: CKAN `_id` → positive integer (F-M7). */
function coerceKey(raw) {
  return coerceSourceId(raw);
}

/**
 * Q1 (② decision): ONE shapeRecord serves all ten primaries — the seam carries no
 * external id (`{geojson, config, run_at, tag}`, index.js runIngestPhase), so a record's
 * layer is told by its own CKAN fields: the first layer (declared order) that has a
 * field no other column set carries. building_setback_overlay and queenstw_eat_overlay
 * have IDENTICAL field sets and column maps, so they share one signature and shape
 * identically. Derived once from LAYER_COLUMNS.
 */
const SIGNATURES = (() => {
  const groups = [];
  for (const l of LANES) {
    const key = JSON.stringify(LAYER_COLUMNS[l.id].cols);
    const g = groups.find((x) => x.key === key);
    if (g) g.layers.push(l.id);
    else groups.push({ key, layers: [l.id], srcs: LAYER_COLUMNS[l.id].cols.map((c) => c.src) });
  }
  return groups.map((g) => {
    const others = new Set(groups.filter((x) => x !== g).flatMap((x) => x.srcs));
    return { layer: g.layers[0], unique: g.srcs.filter((s) => !others.has(s)) };
  });
})();

function layerOf(record) {
  const own = (k) => Object.prototype.hasOwnProperty.call(record, k);
  const hit = SIGNATURES.find((s) => s.unique.some(own));
  return hit ? hit.layer : null;
}

/**
 * One CKAN record → the column values the layer's write binds, or a skip-reason string.
 * D9 cells are counted per cell (tag `out_of_range_nulled`), R2-16 labels per record
 * (tag `unparseable_height`), and the base zn_zone class per record (tag
 * `zn_zone:<value>`, the distribution row's input). `geometry` (JSONB) and `geojson`
 * (the validator's input, bound to `geom`) are the same GeoJSON string.
 */
function shapeRecord(record, seam) {
  const r = record || {};
  const s = seam || {};
  const tag = typeof s.tag === 'function' ? s.tag : () => {};
  const layer = layerOf(r);
  if (layer === null) return 'unroutable_record';
  const row = { geojson: s.geojson, geometry: s.geojson };
  for (const c of LAYER_COLUMNS[layer].cols) {
    const { value, nulled } = coerceColumn(r[c.src], c);
    if (nulled) tag('out_of_range_nulled');
    if (c.kind === HEIGHT_LABEL && parseHeightLabel(r[c.src]).unparseable) tag('unparseable_height');
    row[c.col] = value;
  }
  const dist = LAYER_COLUMNS[layer].distribution;
  if (dist && row[dist] != null) tag(`zn_zone:${row[dist]}`);
  return row;
}

/** The dedupe seam: R2-17 reject-ALL, never keep-first. */
function dedupeBySourceId(features) {
  return dedupeRejectAll(features);
}

/**
 * §3.5 status → counter deltas (write.validateGeometries). The legacy classification:
 * an empty-after-extract, unsupported or degenerate-line geometry is DISCARDED; an
 * invalid source geometry that repairs (including through a GeometryCollection,
 * `carry: true`) is REPAIRED and stored.
 */
function validatorCounterDelta(status, isValidOriginal) {
  switch (status) {
    case 'accepted':
      return { repaired: isValidOriginal ? 0 : 1, collectionExtracted: 0, skipped: 0, carry: true };
    case 'collection_extracted':
      return { repaired: isValidOriginal ? 0 : 1, collectionExtracted: 1, skipped: 0, carry: true };
    default: // skipped_null | skipped_unsupported_type | skipped_degenerate_line
      return { repaired: 0, collectionExtracted: 0, skipped: 1, carry: false };
  }
}

/** F-C1: suppress the departure DELETE when the layer carried no rows. */
function shouldSkipDelete(sourceIds) {
  return !Array.isArray(sourceIds) || sourceIds.length === 0;
}

// ===========================================================================
// Lanes — one entry per declared primary, whichever ctx shape arrived
// ===========================================================================

/** Outcomes whose acquired block reached the pre_write gate (acquired, shaped, validated). */
const GATED = new Set(['gating', 'loaded', 'write_skipped']);

function lanes(ctx) {
  if (ctx.primary) {
    const lane = LANES.find((l) => l.id === ctx.primary) || { id: ctx.primary, target: null };
    return [{ ...lane, outcome: 'gating', acquired: ctx.acquired || {}, written: null }];
  }
  const primaries = (ctx.acquired && ctx.acquired.primaries) || {};
  const byTarget = (ctx.written && ctx.written.by_target) || {};
  return LANES.map((l) => {
    const a = primaries[l.id] || {};
    return { ...l, outcome: a.outcome || 'not_reached', acquired: a, written: byTarget[l.target] || null };
  });
}

function laneById(ctx, id) {
  return lanes(ctx).find((l) => l.id === id) || { id, outcome: 'not_reached', acquired: {}, written: null };
}

const num = (v) => Number(v) || 0;
const tagCount = (lane, name) => num((lane.acquired.shaped_tags || {})[name]);

/** Rows the layer's write carries: measured after the write, derived at the gate. */
function loadedRows(lane) {
  if (lane.outcome === 'loaded' && lane.written) return num(lane.written.rows_scanned);
  if (GATED.has(lane.outcome)) return num(lane.acquired.feature_count) - num(lane.acquired.invalid_geometry_skipped);
  return 0;
}

/** F-H3 drift of a gated lane's first raw record (LZ-D3); null when the source was empty. */
function driftOf(lane) {
  const fields = lane.acquired.record_fields;
  if (!GATED.has(lane.outcome) || !Array.isArray(fields)) return null;
  return checkAttrDrift(fields, requiredAttrColumns(lane.id));
}

const INERT = { value: 0, detail: null, inert: true };

/** A metric's legacy row prefix: the base layer reads `zoning_areas`, an overlay its key. */
const metricPrefix = (id) => (id === BASE ? 'zoning_areas' : id);

// ===========================================================================
// Observers — the per-check functions, by family (named + dispatched below)
// ===========================================================================

function obsLicense() {
  return { violations: LICENSE_URL ? 0 : 1, detail: LICENSE_URL || null };
}

function obsForce(ctx) {
  const standing = (ctx.overrides || {}).force_run === true;
  return { violations: standing ? 1 : 0, detail: standing };
}

function obsNoOp(ctx) {
  return { violations: 0, detail: (ctx.gate || {}).skipped === true };
}

/** F-H10: the base resource version on a load, the stored version on a skip (legacy :615, :691). */
function obsAge(ctx) {
  const skipped = (ctx.gate || {}).skipped === true;
  const version = skipped
    ? (ctx.prior && ctx.prior.source_dataset_version)
    : laneById(ctx, BASE).acquired.source_dataset_version;
  const days = ageDaysFrom(ctx.clock(), version);
  return days == null ? INERT : { value: days, detail: days };
}

function obsDuration(ctx) {
  const elapsed = num(ctx.elapsed_ms);
  const prior = Number(priorMetricValue(ctx.prior, 'zoning_duration_ms'));
  if (!Number.isFinite(prior) || prior <= 0) return { ...INERT, detail: elapsed };
  return { value: elapsed / prior, detail: elapsed };
}

function obsUnparseableHeight(ctx) {
  const lane = laneById(ctx, 'height_overlay');
  const n = GATED.has(lane.outcome) ? tagCount(lane, 'unparseable_height') : 0;
  return { violations: n, detail: n };
}

function obsBaseDrift(ctx) {
  const d = driftOf(laneById(ctx, BASE));
  if (!d) return { violations: 0, detail: null };
  const drifted = d.missingRequired.length > 0 || d.extraColumns.length > 0;
  return { violations: d.missingRequired.length, detail: drifted ? { missing: d.missingRequired, extra: d.extraColumns } : null };
}

function obsOverlayDrift(ctx) {
  const byLayer = {};
  for (const lane of lanes(ctx)) {
    if (lane.id === BASE) continue;
    const d = driftOf(lane);
    if (d && d.missingRequired.length > 0) byLayer[lane.id] = d.missingRequired;
  }
  const n = Object.keys(byLayer).length;
  return { violations: n, detail: n ? byLayer : null };
}

function obsExtraColumns(ctx) {
  const byLayer = {};
  for (const lane of lanes(ctx)) {
    const d = driftOf(lane);
    if (d && d.extraColumns.length > 0) byLayer[lane.id] = d.extraColumns;
  }
  const n = Object.keys(byLayer).length;
  return { violations: n, detail: n ? byLayer : null };
}

/** One acquired counter summed over the gated lanes (filter keeps the base/overlays split). */
function sumCounter(ctx, field, keep) {
  const byLayer = {};
  let total = 0;
  for (const lane of lanes(ctx)) {
    if (!keep(lane) || !GATED.has(lane.outcome)) continue;
    const n = num(lane.acquired[field]);
    if (n > 0) byLayer[lane.id] = n;
    total += n;
  }
  return { violations: total, detail: total ? byLayer : 0 };
}

const anyLane = () => true;
const overlayLane = (lane) => lane.id !== BASE;

function obsOrphanDeleteSkipped(ctx) {
  const ids = lanes(ctx).filter((l) => l.written && l.written.delete_skipped_empty_guard === true).map((l) => l.id);
  return { violations: 0, detail: ids.length ? ids : null };
}

function obsBaseLoadedCount(ctx) {
  const lane = laneById(ctx, BASE);
  if (!GATED.has(lane.outcome)) return { violations: 0, detail: null, inert: true };
  const n = loadedRows(lane);
  return { violations: n === 0 ? 1 : 0, detail: n };
}

function obsOverlayLoadedCount(ctx, id) {
  const lane = laneById(ctx, id);
  return { violations: 0, detail: GATED.has(lane.outcome) ? loadedRows(lane) : null };
}

function obsOutOfRange(ctx, id) {
  const lane = laneById(ctx, id);
  return { violations: 0, detail: GATED.has(lane.outcome) ? tagCount(lane, 'out_of_range_nulled') : null };
}

function obsBaseDuplicates(ctx) {
  const lane = laneById(ctx, BASE);
  const n = GATED.has(lane.outcome) ? num(lane.acquired.duplicate_key_count) : 0;
  return { violations: n, detail: n };
}

function obsInvalidCount(ctx, id) {
  const lane = laneById(ctx, id);
  const n = GATED.has(lane.outcome) ? num(lane.acquired.invalid_geometry_skipped) : 0;
  return { violations: n, detail: n };
}

function obsBaseInvalidPct(ctx) {
  const lane = laneById(ctx, BASE);
  const kept = num(lane.acquired.feature_count);
  if (!GATED.has(lane.outcome) || kept === 0) return { value: 0, detail: 0 };
  const pct = (num(lane.acquired.invalid_geometry_skipped) * 100) / kept;
  return { value: pct, detail: pct };
}

function obsRepaired(ctx, id) {
  const lane = laneById(ctx, id);
  return { violations: 0, detail: GATED.has(lane.outcome) ? num(lane.acquired.invalid_geometry_repaired) : null };
}

/** F-H1: departed rows over the PRE-delete count (= updated + unchanged + deleted). */
function obsOrphans(ctx, id) {
  const lane = laneById(ctx, id);
  if (lane.outcome !== 'loaded' || !lane.written) return { ...INERT, detail: 0 };
  const w = lane.written;
  const deleted = num(w.deleted);
  const preDelete = num(w.updated) + num(w.unchanged) + deleted;
  if (preDelete <= 0) return { ...INERT, detail: deleted };
  return { value: (deleted * 100) / preDelete, detail: deleted };
}

function obsUnchanged(ctx, id) {
  const lane = laneById(ctx, id);
  return { violations: 0, detail: lane.written ? num(lane.written.unchanged) : null };
}

/** F-H11: loaded vs the prior run's loaded_count row; one-decimal detail (legacy :257). */
function obsLoadedPct(ctx, id) {
  const lane = laneById(ctx, id);
  const baseline = Number(priorMetricValue(ctx.prior, `${metricPrefix(id)}_loaded_count`));
  if (!GATED.has(lane.outcome) || !Number.isFinite(baseline) || baseline <= 0) return INERT;
  const pct = (loadedRows(lane) * 100) / baseline;
  return { value: pct, detail: Math.round(pct * 10) / 10 };
}

/** F-H13: rows carrying an exception_number vs the prior row's count. */
function obsWithExceptions(ctx) {
  const lane = laneById(ctx, BASE);
  if (!GATED.has(lane.outcome)) return INERT;
  const nulls = num((lane.acquired.column_nulls || {}).exception_number);
  const current = loadedRows(lane) - nulls;
  const prior = Number(priorMetricValue(ctx.prior, 'zoning_areas_with_exceptions_count'));
  if (!Number.isFinite(prior) || prior <= 0) return { ...INERT, detail: current };
  return { value: (current * 100) / prior, detail: current };
}

/** Spec 47 §8.4: the top-N zn_zone classes; the truncation counters ride a context row. */
function obsDistribution(ctx) {
  const lane = laneById(ctx, BASE);
  const counts = new Map();
  for (const [name, n] of Object.entries(lane.acquired.shaped_tags || {})) {
    if (name.startsWith('zn_zone:')) counts.set(name.slice('zn_zone:'.length), n);
  }
  const d = topNFromCounts(counts, ctx.config.load_zoning_distribution_top_n);
  if (typeof ctx.contextRow === 'function') {
    ctx.contextRow({
      metric: 'zoning_areas_distribution_top20_truncation',
      value: { truncated_class_count: d.truncatedClassCount, other_count: d.otherCount },
      threshold: null,
      status: 'INFO',
    });
  }
  return { violations: d.top.length === 0 && loadedRows(lane) > 0 ? 1 : 0, detail: d.top };
}

/** F-M5: the NULL count's percentage above the prior row's (a zero baseline with nulls is unbounded). */
function obsNullCount(ctx, column) {
  const lane = laneById(ctx, BASE);
  if (!GATED.has(lane.outcome)) return INERT;
  const current = num((lane.acquired.column_nulls || {})[column]);
  const raw = priorMetricValue(ctx.prior, `${column}_null_count`);
  const prior = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(prior)) return { ...INERT, detail: current };
  if (prior === 0) return { value: current > 0 ? Number.MAX_SAFE_INTEGER : 0, detail: current };
  return { value: ((current - prior) * 100) / prior, detail: current };
}

// ===========================================================================
// The frozen §9 producer block (enrich_parcels reads zoning_layers_loaded /
// zoning_partial_load; the next run's gate reads zoning_layer_versions)
// ===========================================================================

function buildLoadMeta(ctx) {
  const all = lanes(ctx);
  const base = all.find((l) => l.id === BASE);
  const loaded = (l) => l.outcome === 'loaded';
  const missing = all.filter((l) => l.id !== BASE && !loaded(l)).map((l) => l.id);
  return {
    zoning_layers_loaded: Object.fromEntries(all.map((l) => [l.id, loaded(l)])),
    zoning_partial_load: missing.length ? { missing_layers: missing } : false,
    source_dataset_version: base.acquired.source_dataset_version || null,
    // LZ-D12 PIN (write_skipped path): an acquired-but-not-written layer still records its version.
    zoning_layer_versions: Object.fromEntries(all.map((l) => [l.id, l.acquired.source_dataset_version || null])),
    base_layer_committed_after_overlays_failed: loaded(base) && missing.length > 0,
  };
}

// ===========================================================================
// Dispatch — one NAMED function per declared check, in descriptor order
// ===========================================================================

const named = (id, fn) => ({ [id]: function (ctx) { ctx.report(id, fn(ctx)); } })[id];

function observerFor(id) {
  const fixed = {
    dataset_source_license: obsLicense,
    zoning_override_force_reload_present: obsForce,
    no_op_refresh: obsNoOp,
    dataset_version_age_days: obsAge,
    zoning_duration_ms: obsDuration,
    zoning_height_overlay_unparseable_label_count: obsUnparseableHeight,
    zoning_areas_attr_drift: obsBaseDrift,
    zoning_overlay_attr_drift: obsOverlayDrift,
    zoning_attr_drift_extra_columns: obsExtraColumns,
    zoning_non_integer_source_id_count: (ctx) => sumCounter(ctx, 'bad_key_count', anyLane),
    zoning_null_geometry_count: (ctx) => sumCounter(ctx, 'null_geometry_count', anyLane),
    zoning_overlay_duplicate_source_id_count: (ctx) => sumCounter(ctx, 'duplicate_key_count', overlayLane),
    zoning_orphan_delete_skipped: obsOrphanDeleteSkipped,
    zoning_areas_loaded_count: obsBaseLoadedCount,
    zoning_areas_duplicate_source_id_count: obsBaseDuplicates,
    zoning_areas_invalid_polygon_pct: obsBaseInvalidPct,
    zoning_areas_with_exceptions_count: obsWithExceptions,
    zoning_areas_distribution_top20: obsDistribution,
  };
  if (fixed[id]) return fixed[id];
  const nullCol = LAYER_COLUMNS[BASE].nullTrack.find((c) => id === `${c}_null_count`);
  if (nullCol) return (ctx) => obsNullCount(ctx, nullCol);
  const family = {
    out_of_range_nulled_count: obsOutOfRange,
    invalid_polygon_count: obsInvalidCount,
    repaired_polygon_count: obsRepaired,
    orphans_removed_count: obsOrphans,
    unchanged_skipped: obsUnchanged,
    loaded_count: obsOverlayLoadedCount,
    loaded_pct: obsLoadedPct,
  };
  for (const lane of LANES) {
    const p = `${metricPrefix(lane.id)}_`;
    if (!id.startsWith(p)) continue;
    const fn = family[id.slice(p.length)];
    if (fn) return (ctx) => fn(ctx, lane.id);
  }
  return null;
}

/** §5.5 (1) — the dispatch table: keys are exactly the descriptor's check ids, in DESCRIPTOR ORDER. */
const CHECKS = {};
for (const c of DESCRIPTOR.checks) {
  const fn = observerFor(c.id);
  if (!fn) throw new Error(`load-zoning compute: descriptor check "${c.id}" has no observer`);
  CHECKS[c.id] = named(c.id, fn);
}
for (const [id, fn] of Object.entries(CHECKS)) {
  if (fn.name !== id) throw new Error(`load-zoning compute: checks.${id} is bound to a function named "${fn.name}"`);
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
module.exports.LAYERS = LAYERS;
module.exports.LAYER_COLUMNS = LAYER_COLUMNS;
module.exports.requiredAttrColumns = requiredAttrColumns;
module.exports.parseNum = parseNum;
module.exports.parseHeightLabel = parseHeightLabel;
module.exports.coerceSourceId = coerceSourceId;
module.exports.coerceColumn = coerceColumn;
module.exports.dedupeRejectAll = dedupeRejectAll;
module.exports.topNDistribution = topNDistribution;
module.exports.ageDaysFrom = ageDaysFrom;
module.exports.priorMetricValue = priorMetricValue;
module.exports.layerOf = layerOf;
