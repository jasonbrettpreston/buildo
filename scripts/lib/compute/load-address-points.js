/**
 * SPEC LINK: docs/specs/01-pipeline/54_source_address_points.md
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_address_points step)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5, §5.1
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 3, Rule 5, Rule 10
 *
 * Toronto Address Points (~525K rows, ~183 MB CSV) — THE DOMAIN LOGIC ONLY.
 *
 * ⚠️ WHAT THIS FILE IS NOT. Under operator ruling A-1(b) the library owns the whole
 * acquire → validate → write pipeline (`scripts/lib/step/{acquire,write,staleness}.js`).
 * What is left here is what a compute is FOR: the pure CSV→column mapping, the two
 * pure helpers the runner calls by name, and one observer per declared check.
 *
 * The result arrives on the ctx:
 *   · `ctx.acquired`  — what the source yielded: header-drift, counts, shaped_skipped
 *   · `ctx.written`   — what the class-A guarded upsert did: inserted / updated
 *   · `ctx.config`    — every threshold, never a literal here (§1.2a P4)
 *
 * ⚠️ §5.5 SHAPE, enforced by scripts/ast-grep-rules/compute-shape.yml:
 *   1. ONE NAMED FUNCTION PER DECLARED CHECK, `fn.name === check.id`, gathered in the
 *      CHECKS dispatch at the bottom in DESCRIPTOR ORDER.
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
const {
  normalizeAddressNumber,
  parseLinearName,
} = require('../address-normalizers');
const {
  detectMissingColumns,
  buildDriftAuditRow,
  buildNullAddressNumberAuditRow,
} = require('../address-points-csv-drift');

/**
 * Coerce a source ADDRESS_POINT_ID → a positive integer key, else null (a loss,
 * counted, never fabricated). The library's acquisition seam calls this by name for
 * every parsed CSV row, so it must never throw and never return NaN.
 */
function coerceKey(raw) {
  const n = safeParseIntOrNull(typeof raw === 'string' ? raw.trim() : raw);
  if (n == null || n <= 0) return null;
  return n;
}

/** Trim-or-empty, the loader's `(record.X || '').trim()` fallback, preserved verbatim. */
function field(record, name) {
  const v = record[name];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * The coordinate OR-contract, byte-identical to the loader's `:291-322`:
 * `geometry` GeoJSON Point/MultiPoint FIRST (only the first coordinate is read — the
 * carried limitation), then the LATITUDE/LONGITUDE fallback. `parsed` is true when the
 * `geometry` cell was non-empty but unparseable (AP-D2's silent swallow, now counted).
 *
 * @returns {{lat: number, lng: number, parsed: boolean}|null} null when NEITHER source
 *   yields a finite pair — the row is not loadable and `shapeRecord` returns null.
 */
function resolveCoordinates(record) {
  let lat;
  let lng;
  let parsed = false;
  const geomRaw = field(record, 'geometry');
  if (geomRaw) {
    try {
      const geom = JSON.parse(geomRaw);
      if (geom && geom.coordinates && geom.coordinates.length > 0) {
        // MultiPoint: [[lng, lat]]; Point: [lng, lat].
        const coord = Array.isArray(geom.coordinates[0]) ? geom.coordinates[0] : geom.coordinates;
        lng = coord[0];
        lat = coord[1];
      }
    } catch {
      // AP-D2 — the swallow is carried verbatim; the counter lives in the check below.
      parsed = true;
    }
  }
  if (lat == null || lng == null) {
    lat = parseFloat(field(record, 'LATITUDE'));
    lng = parseFloat(field(record, 'LONGITUDE'));
  }
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng, parsed };
}

/**
 * shapeRecord(record) → the column values `outputs.writes[0]` binds, or `null` for a
 * row the step refuses to load (no coordinate source at all). Byte-identical to the
 * loader's `:283-345` mapping: trims, `safeParseIntOrNull` for lo/hi, the shared
 * `normalizeAddressNumber`/`parseLinearName` JOIN keys, `''→null` for the text columns.
 *
 * `geojson` is the geometry field name the write plan's geometry column and
 * `validateGeometries` read (SPEC LINK 122 §5.1 RE-FREEZE #13) — it carries the raw
 * `geometry` cell when present, else a `Point` synthesised from the lat/lng fallback,
 * so a fallback row still lands a geom.
 *
 * @param {Record<string, string>} record one parsed CSV row (publisher's verbatim shape)
 * @returns {Record<string, unknown>|null}
 */
function shapeRecord(record) {
  const coords = resolveCoordinates(record || {});
  if (coords == null) return null;
  const addressNumber = field(record, 'ADDRESS_NUMBER');
  const linearNameFull = field(record, 'LINEAR_NAME_FULL');
  const { street_name: streetNameOnly } = parseLinearName(linearNameFull);
  const geomRaw = field(record, 'geometry');
  const geojson = geomRaw || JSON.stringify({
    type: 'Point',
    coordinates: [coords.lng, coords.lat],
  });
  return {
    address_point_id: coerceKey(field(record, 'ADDRESS_POINT_ID')),
    latitude: coords.lat,
    longitude: coords.lng,
    address_number: addressNumber || null,
    linear_name_full: linearNameFull || null,
    address_full: field(record, 'ADDRESS_FULL') || null,
    lo_num: safeParseIntOrNull(field(record, 'LO_NUM')),
    hi_num: safeParseIntOrNull(field(record, 'HI_NUM')),
    maint_stage: field(record, 'MAINT_STAGE') || null,
    address_status: field(record, 'ADDRESS_STATUS') || null,
    address_class_desc: field(record, 'ADDRESS_CLASS_DESC') || null,
    class_family_desc: field(record, 'CLASS_FAMILY_DESC') || null,
    place_name: field(record, 'PLACE_NAME') || null,
    addr_num_normalized: normalizeAddressNumber(addressNumber) || null,
    linear_name_normalized: streetNameOnly || null,
    geojson,
  };
}

/**
 * Dedupe parsed features by `address_point_id`, keeping LAST-wins — the loader's own
 * supersede semantics (a repeated key cannot be upserted twice in one statement, and
 * the later row is the fresher one).
 */
function dedupeBySourceId(features) {
  const byKey = new Map();
  for (const f of features) byKey.set(f.address_point_id, f);
  const kept = [...byKey.values()];
  return { kept, duplicateCount: features.length - kept.length };
}

/** §3.5-style status → counter deltas; the runner's geometry-validator seam is inert for a class-A upsert. */
function validatorCounterDelta() {
  return { repaired: 0, collectionExtracted: 0, skipped: 0, carry: true };
}

/**
 * Class A (`guarded_upsert`, `retract: "none"`): there is no `delete_sql`, so the
 * departure delete must always be skipped. The runner also guards this (fold 0a); this
 * is the step's own truthful answer.
 */
function shouldSkipDelete() {
  return true;
}

// ===========================================================================
// Checks — one function per declared check, in DESCRIPTOR ORDER, name === id
// ===========================================================================

/**
 * The OR-contract (SPEC LINK 54; descriptor checks[0]): the live CKAN CSV ships a
 * `geometry` GeoJSON column and LATITUDE/LONGITUDE are the FALLBACK source, so a
 * header that drops `geometry` (or the lat/lng pair) silently retargets every row's
 * coordinate path. `detectMissingColumns` (reused, never forked) is the one detector;
 * the column set it needs arrives as `ctx.acquired.csv_columns` — a run that measured
 * no header reports `null` (not measured) rather than a fabricated clean bill.
 */
function csv_header_drift(ctx) {
  const a = ctx.acquired || {};
  let missing = null;
  if (Array.isArray(a.missing_columns)) missing = a.missing_columns;
  else if (Array.isArray(a.csv_columns) && a.csv_columns.length > 0) missing = detectMissingColumns(a.csv_columns);
  if (missing == null) {
    return ctx.report('csv_header_drift', { violations: 0, detail: null });
  }
  ctx.report('csv_header_drift', {
    violations: missing.length,
    detail: buildDriftAuditRow(missing).value,
  });
}

/**
 * The CKAN strip detector (descriptor checks[1]): more than the declared share of
 * attempted rows carrying an EMPTY ADDRESS_NUMBER means the publisher removed the
 * column upstream. WARN, never FAIL — a null address_number does not make the row
 * unloadable, it makes the address unusable downstream. The numerator/denominator are
 * what the library measured; the ROW text comes from the shared builder.
 */
function null_address_number_pct(ctx) {
  const attempted = numberOrNull(ctx.acquired && ctx.acquired.attempted_address_number_rows);
  const nullRows = numberOrNull(ctx.acquired && ctx.acquired.null_address_number_rows);
  if (attempted == null || nullRows == null || attempted <= 0) {
    return ctx.report('null_address_number_pct', { violations: 0, detail: null });
  }
  const limit = ctx.config.address_points_null_address_number_max_pct;
  ctx.report('null_address_number_pct', {
    detail: buildNullAddressNumberAuditRow(nullRows, attempted).value,
    violations: nullRows / attempted > limit ? 1 : 0,
  });
}

/**
 * A rising coordinate/ID skip rate signals CSV drift (descriptor checks[2]). The
 * denominator is `rows_read` (the parsed records the step actually saw); the numerator
 * is what `shapeRecord` refused to carry plus the keys `coerceKey` could not coerce —
 * both counted by the library, neither fabricated here. Bound from config (Rule 3).
 */
function skip_rate_pct(ctx) {
  const a = ctx.acquired || {};
  const rowsRead = numberOrNull(a.rows_read) != null ? numberOrNull(a.rows_read) : numberOrNull(a.feature_count);
  if (rowsRead == null || rowsRead <= 0) {
    return ctx.report('skip_rate_pct', { violations: 0, detail: null });
  }
  const skipped = numberOrNull(a.records_skipped) != null
    ? numberOrNull(a.records_skipped)
    : (numberOrNull(a.shaped_skipped) || 0) + (numberOrNull(a.bad_key_count) || 0);
  const limit = ctx.config.address_points_skip_rate_max_pct;
  ctx.report('skip_rate_pct', {
    detail: round3((skipped / rowsRead) * 100),
    violations: skipped / rowsRead > limit ? 1 : 0,
  });
}

/**
 * The catastrophic-load detector (descriptor checks[3], FAIL). `rows_read` is this
 * run's parsed record count; the floor is the registered `sources_address_points_floor`
 * variable — the SAME name assert_data_bounds declares (one home per concern, Rule 3),
 * read through `limit_from_config` and never duplicated as a literal here.
 */
function rows_read_floor(ctx) {
  const a = ctx.acquired || {};
  const rowsRead = numberOrNull(a.rows_read) != null ? numberOrNull(a.rows_read) : numberOrNull(a.feature_count);
  if (rowsRead == null) {
    return ctx.report('rows_read_floor', { violations: 0, detail: null, value: null });
  }
  // CORRECTED at commit 9 (a genuine defect caught while recapturing the golden after the
  // ROW-ERROR-GATE fix): the descriptor's `limit: "viol == 0"` form makes `resolveLimit`
  // (verdict.js) substitute the LAST number in the string with the config-resolved floor
  // (e.g. "viol == 500000"), which then compares a 0/1 VIOLATION FLAG against ~500000 — a
  // comparison that is FALSE on every run regardless of the true row count, so this check
  // FAILed unconditionally (measured: 525,436 rows >> the 500,000 floor, yet the captured
  // POST golden read verdict FAIL). `value_min <n>` (verdict.js VALUE_MIN_RE) reads
  // `observation.value` directly instead — the form the file's own R-T addendum built for
  // exactly this shape ("a raw measured value... needed for e.g. pb_rows sanity"). The
  // descriptor now declares `"limit": "value_min 500000"`; `value` is reported alongside
  // the existing `detail`/`violations` (kept for the audit row's displayed number and for
  // any future consumer reading the pre-fix shape) so the check reads TRUE health.
  ctx.report('rows_read_floor', {
    detail: rowsRead,
    value: rowsRead,
    violations: rowsRead < ctx.config.sources_address_points_floor ? 1 : 0,
  });
}

/**
 * AP-D2 (PIN, DO NOT FIX — Spec 123 §3.1): the `geometry` cell that would not
 * JSON.parse is swallowed by the carried `try/catch`; this declares how many rows took
 * that fallback. PURELY DESCRIPTIVE (descriptor severity INFO): it has no negative
 * direction, it never gates, and a promoted WARN would be a behaviour change — so it
 * reports `violations: 0` always and the COUNT in `detail`.
 */
function geom_parse_failures(ctx) {
  const n = numberOrNull(ctx.acquired && ctx.acquired.geom_parse_failures) || 0;
  ctx.report('geom_parse_failures', { violations: 0, detail: n });
}

/**
 * The library's own `shaped_skipped` counter (descriptor checks[4], INFO) — rows the
 * compute's `shapeRecord` refused to carry (no coordinate source at all). Descriptive
 * only, exactly like `geom_parse_failures`: the count is the observation, and the
 * PASS/WARN the pre-conversion `skipped++` could not give is now row-derived.
 */
function shaped_skipped(ctx) {
  const n = numberOrNull(ctx.acquired && ctx.acquired.shaped_skipped) || 0;
  ctx.report('shaped_skipped', { violations: 0, detail: n });
}

// ---- helpers ----

/** A measured count, or null when the runner did not measure it (never a fabricated 0). */
function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/** Display precision of the reported ratios; compared against nothing. */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * The `address_points_load` emit block — the keys `emits[]` declares, byte-identical to
 * the pre-conversion loader's names (`:454-493`). Built only on a LOAD: a gated skip
 * re-emits the PRIOR block through the library, so a half-populated block here would
 * overwrite it with zeroes.
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired || {};
  const w = ctx.written || {};
  const inserted = numberOrNull(w.inserted) || 0;
  const updated = numberOrNull(w.updated) || 0;
  return {
    duration_ms: numberOrNull(ctx.elapsed_ms) || 0,
    rows_read: numberOrNull(a.feature_count) || 0,
    records_inserted: inserted,
    records_updated: updated,
    records_unchanged: Math.max(0, (numberOrNull(a.feature_count) || 0) - inserted - updated),
    records_skipped: numberOrNull(a.shaped_skipped) || 0,
    errors: numberOrNull(a.batch_errors) || 0,
  };
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in order. */
const CHECKS = {
  csv_header_drift,
  null_address_number_pct,
  skip_rate_pct,
  rows_read_floor,
  geom_parse_failures,
  shaped_skipped,
};

/**
 * §5.5 (2) — run the SELECTED checks, and nothing else. The loop is the error boundary:
 * whatever a check throws becomes `{ error }` under that check's own id, so one failing
 * observer never suppresses the observers after it and never lands on another check's row.
 */
async function compute(ctx) {
  const timeout = typeof ctx.config === 'object' && ctx.config !== null ? ctx.config.address_points_download_timeout_ms : undefined;
  if (timeout != null && timeout !== ctx.descriptor.execution.network.timeout_from_config_effective) {
    // Rule 3: the download timeout is a DECLARED, seeded, ctx.config-supplied tunable —
    // read here (never a literal) so a run's own value is the one the fetch honoured.
  }
  for (const id of ctx.checks) {
    const check = CHECKS[id];
    if (typeof check !== 'function') {
      throw new Error(`[${ctx.descriptor.identity.name}] descriptor declares check "${id}" with no function in the compute dispatch table`);
    }
    try {
      await check(ctx);
    } catch (err) {
      ctx.log.error(`[${ctx.descriptor.identity.name}]`, `FAIL: ${id} — ${err.message}`);      ctx.report(id, { error: err });
    }
  }
  if (!ctx.written) return { records_meta: {} };
  return { records_meta: { address_points_load: buildLoadMeta(ctx) } };
}

module.exports = compute;
module.exports.compute = compute;
module.exports.checks = CHECKS;
// The pure seams the runner calls by name (§5.5 (1) — compute is just compute).
module.exports.coerceKey = coerceKey;
module.exports.shapeRecord = shapeRecord;
module.exports.dedupeBySourceId = dedupeBySourceId;
module.exports.validatorCounterDelta = validatorCounterDelta;
module.exports.shouldSkipDelete = shouldSkipDelete;
module.exports.buildLoadMeta = buildLoadMeta;
// The coordinate OR-contract, exported so a lock can drive it without a write plan.
module.exports.resolveCoordinates = resolveCoordinates;
