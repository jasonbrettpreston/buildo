/**
 * SPEC LINK: docs/specs/01-pipeline/55_source_parcels.md (the source producer contract)
 * SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (load_parcels step, position 5)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5, §5.1
 * SPEC LINK: docs/specs/01-pipeline/124_step_opt_policy.md Rule 2, Rule 3, Rule 5, Rule 10, R-AZ
 * SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (this row's procedure)
 *
 * Toronto Property Parcels (~498K rows, ~224 MB CSV, GeoJSON `geometry` column) into
 * `parcels` — THE DOMAIN LOGIC ONLY (Spec 122 §5.5, Rule 2).
 *
 * ⚠️ WHAT THIS FILE IS NOT. The library owns the whole acquire → validate → write
 * pipeline (`scripts/lib/step/{acquire,write,index}.js`). What is left here is what a
 * compute is FOR: the pure CSV→column mapping, the pure helpers the runner calls by
 * name, and one observer per declared check.
 *
 * The result arrives on the ctx:
 *   · `ctx.acquired` — what the source yielded: header drift, counts, shaped_skipped
 *   · `ctx.written`  — what the class-A guarded upsert did: inserted / updated
 *   · `ctx.config`   — every threshold, never a literal here (§1.2a P4)
 *
 * ⚠️ §5.5 SHAPE, enforced by scripts/ast-grep-rules/compute-shape.yml:
 *   1. ONE NAMED FUNCTION PER DECLARED CHECK, `fn.name === check.id`, gathered in the
 *      CHECKS dispatch at the bottom in DESCRIPTOR ORDER.
 *   2. `compute(ctx)` iterates `ctx.checks` and does nothing else.
 *   3. Every observation goes through `ctx.report(<checkId>, …)`. No `console.*`.
 *   4. Every seam is injected: `ctx.clock`, `ctx.config`, `ctx.log`. No `fs`, no `pg`,
 *      no `process.env`, no bare wall clock, no literal threshold.
 *
 * ⚠️ THE VERDICT IS NOT COMPUTED HERE. `scripts/lib/step/verdict.js` derives it from
 * the rows. A compute that decided its own verdict could disagree with its own table.
 *
 * ⚠️ THE STATEMENT IS NOT AUTHORED HERE (plan D1 REVISED, operator ruling 2026-09-24 —
 * standardized/observable/scalable/simple: compute-authored SQL for the whole target
 * is exactly what the ruling rejects for an INGESTOR). The legacy UPSERT's five
 * `COALESCE(NULLIF(EXCLUDED.x,''), parcels.x)` address preservations, its weaker
 * `date_effective` COALESCE, and its three DEC-FENCE2 `CASE … THEN NULL ELSE … END`
 * lineage-stamp arms are reproduced by TWO DECLARED axes the shared codegen
 * (`scripts/lib/step/write.js`) executes: `columns[].on_empty:"preserve"|"preserve_null"`
 * (prerequisites 0m/0m-follow-on) and `outputs.invalidates[].set_null_on_change_of`
 * (prerequisite 0l). `src/tests/step-library.logic.test.ts` T5/T7 prove the codegen
 * reproduces the legacy statement byte-for-byte (whitespace-normalised) from those
 * declared axes alone. This file never touches a pool, and never authors SQL text.
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
  buildNullAddressAuditRow,
} = require('../parcels-csv-drift');

/**
 * The published source geometry type contract (Spec 55 §2's "WKT" wording is doc-rot —
 * the live CKAN resource ships a GeoJSON `geometry` column; row 3.7 ① reconciliation).
 */
const SOURCE_CRS = 4326;

/**
 * The two rows-with-a-null-address readers. The `parcels_null_address_pct` audit row is
 * built by the shared drift lib, never forked here (its 0.10 boundary is that library's
 * own literal and is assert-schema's fingerprint input — plan D4 / PR-D2).
 */
function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

/** Display precision of the reported skip ratio; compared against nothing here. */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Coerce a source `PARCELID` → a trimmed non-empty string key, else null (a loss,
 * counted, never fabricated). The library's acquisition seam calls this by name for
 * every parsed CSV row, so it must never throw and never return an empty string.
 * Byte-identical to the loader's `:499` — `(record.PARCELID || '').trim()`, with an
 * empty cell taking the `skipped++; continue;` path rather than being carried.
 *
 * @param {unknown} raw the publisher's PARCELID cell
 * @returns {string|null}
 */
function coerceKey(raw) {
  const s = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
  return s ? s : null;
}

/** Trim-or-empty, the loader's `(record.X || '').trim()` fallback, preserved verbatim. */
function field(record, name) {
  const v = record[name];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * `parseStatedArea` (loader :48-55, verbatim): `STATEDAREA` is a display string
 * ("300.00 sq.m"). Anything that is not a positive `sq.m` figure is NULL — never a
 * fallback to the polygon area. `lot_size_sqm` is EXCLUSIVELY this function's output.
 */
function parseStatedArea(raw) {
  if (!raw || !raw.trim()) return null;
  const match = raw.trim().match(/^([\d.]+)\s*sq\.m/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (Number.isNaN(value) || value <= 0) return null;
  return value;
}

/** `extractRing` (loader :58-63, verbatim): Polygon → its first ring; MultiPolygon → its first part's first ring. */
function extractRing(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || null;
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates[0] && geometry.coordinates[0][0] ? geometry.coordinates[0][0] : null;
  }
  return null;
}

/**
 * `minimumBoundingRect` (loader :65-96, verbatim): the ring is projected to metres at
 * its centroid latitude, then rotated through every edge to find the least-area
 * enclosing rectangle. Returns `{ width, height }` (width = the SHORTER side), or null
 * when the ring cannot form a rectangle.
 */
function minimumBoundingRect(ring) {
  if (!ring || ring.length < 4) return null;
  const n = ring.length - 1;
  let cLat = 0, cLng = 0;
  for (let i = 0; i < n; i++) { cLng += ring[i][0]; cLat += ring[i][1]; }
  cLat /= n; cLng /= n;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;
  const points = [];
  for (let i = 0; i < n; i++) {
    points.push([(ring[i][0] - cLng) * mPerDegLng, (ring[i][1] - cLat) * mPerDegLat]);
  }
  let minArea = Infinity, bestW = 0, bestH = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j][0] - points[i][0];
    const dy = points[j][1] - points[i][1];
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(-angle), sin = Math.sin(-angle);
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    for (const [px, py] of points) {
      const rx = px * cos - py * sin, ry = px * sin + py * cos;
      if (rx < mnX) mnX = rx; if (rx > mxX) mxX = rx;
      if (ry < mnY) mnY = ry; if (ry > mxY) mxY = ry;
    }
    const w = mxX - mnX, h = mxY - mnY, area = w * h;
    if (area < minArea) { minArea = area; bestW = Math.min(w, h); bestH = Math.max(w, h); }
  }
  if (bestW <= 0 || bestH <= 0) return null;
  return { width: bestW, height: bestH };
}

/** `shoelaceArea` (loader :100-119, verbatim): the ring's true area in square metres. */
function shoelaceArea(ring) {
  if (!ring || ring.length < 4) return null;
  const n = ring.length - 1;
  if (n < 3) return null;
  let cLat = 0, cLng = 0;
  for (let i = 0; i < n; i++) { cLng += ring[i][0]; cLat += ring[i][1]; }
  cLat /= n; cLng /= n;
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * cosLat;
  const points = [];
  for (let i = 0; i < n; i++) {
    points.push([(ring[i][0] - cLng) * mPerDegLng, (ring[i][1] - cLat) * mPerDegLat]);
  }
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  return Math.abs(sum) / 2;
}

/**
 * `rectangularityRatio` (loader :121-128, verbatim): `polyArea / mbrArea`, clamped at
 * 1.0. Used only by the checker's own test to understand `is_irregular`; it takes no
 * part in the write path (the loader's inline ratio at :146 IS the write path).
 */
function rectangularityRatio(ring) {
  const polyArea = shoelaceArea(ring);
  if (polyArea == null || polyArea <= 0) return null;
  const mbr = minimumBoundingRect(ring);
  if (!mbr) return null;
  const mbrArea = mbr.width * mbr.height;
  if (mbrArea <= 0) return null;
  return Math.min(polyArea / mbrArea, 1.0);
}

/**
 * `estimateLotDimensions` (loader :130-156, verbatim): frontage/depth from the MBR,
 * SCALED by `sqrt(trueArea / mbrArea)` so the rectangle matches the parcel's real area.
 * `trueArea` is the stated area when present, else the polygon's own shoelace area —
 * this fallback is why a stated-area-less row STILL gets frontage/depth while its
 * `lot_size_sqm` stays NULL (the two must not be conflated).
 *
 * `is_irregular` is `polyArea / mbrArea < parcels_irregularity_threshold` (Rule 3: the
 * loader's legacy module-level literal is now `ctx.config.parcels_irregularity_threshold`
 * — see scripts/load-parcels.notes.json's `constants` block for the carried value —
 * passed in as `irregularityThreshold`) and defaults FALSE when either area is unusable.
 *
 * @param {object|null} geometry the parsed GeoJSON, or null for an unparsable/absent cell
 * @param {number|null} statedAreaSqm `parseStatedArea`'s output (null when absent)
 * @param {number} irregularityThreshold `ctx.config.parcels_irregularity_threshold`
 * @returns {{frontage_m: number, depth_m: number, is_irregular: boolean}|null}
 */
function estimateLotDimensions(geometry, statedAreaSqm, irregularityThreshold) {
  if (!geometry) return null;
  const ring = extractRing(geometry);
  if (!ring) return null;
  const mbr = minimumBoundingRect(ring);
  if (!mbr) return null;
  if (mbr.width < 1 || mbr.height < 1) return null;

  const mbrArea = mbr.width * mbr.height;
  const polygonArea = shoelaceArea(ring);

  const trueArea = (statedAreaSqm && statedAreaSqm > 0) ? statedAreaSqm : polygonArea;
  const scale = (trueArea && trueArea > 0 && mbrArea > 0)
    ? Math.sqrt(trueArea / mbrArea) : 1;

  const isIrregular = (polygonArea != null && polygonArea > 0 && mbrArea > 0)
    ? (polygonArea / mbrArea) < irregularityThreshold : false;

  return {
    frontage_m: Math.round(mbr.width * scale * 100) / 100,
    depth_m: Math.round(mbr.height * scale * 100) / 100,
    is_irregular: isIrregular,
  };
}

/**
 * The civil (Y-M-D) calendar date for a day count since the 1970-01-01 UTC epoch —
 * Howard Hinnant's `civil_from_days` algorithm, pure integer arithmetic. Exists so
 * `parseDate` below can reformat a `Date.parse()` timestamp back to `YYYY-MM-DD`
 * WITHOUT constructing a `Date` object: compute-shape.yml's `compute-no-wall-clock`
 * rule bans `new Date($$$)` unconditionally (any argument, not just a bare clock
 * read), so `new Date(ms).toISOString().slice(0, 10)` trips it even though `ms` came
 * from parsing a SOURCE STRING, never the wall clock. Verified equivalent to that
 * `toISOString().slice(0, 10)` form across ISO/verbal/leap-year/epoch-boundary inputs.
 */
function civilFromEpochDay(days) {
  const z = days + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d };
}

/**
 * `parseDate` (loader :158-171, verbatim): an ISO `YYYY-MM-DD` prefix wins outright
 * (no timezone round-trip); otherwise `Date.parse`, rendered back to `YYYY-MM-DD` via
 * `civilFromEpochDay` (never `new Date(...)` — compute-shape's wall-clock ban, above).
 * The clock is NOT read here — the expiry filter below is the one place a date is
 * compared against "today", and it takes that value from `ctx.clock` (via shapeRecord's
 * caller), never from a bare `new Date()`.
 */
function parseDate(v) {
  if (!v || String(v).trim() === '') return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  const { year, month, day } = civilFromEpochDay(Math.floor(ms / 86400000));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * `parseGeoJSON` (loader :173-180, verbatim): a non-empty `geometry` cell that will not
 * JSON.parse is SWALLOWED to null — the row is NOT skipped. The count of rows that took
 * this path is reported by the `geom_parse_failures` check; the function returns
 * `{ geometry, parsed }` so the caller can count without repeating the parse.
 */
function parseGeoJSON(raw) {
  if (!raw || !raw.trim()) return { geometry: null, parsed: false };
  try {
    return { geometry: JSON.parse(raw), parsed: false };
  } catch {
    return { geometry: null, parsed: true };
  }
}

/**
 * The run clock's calendar date (Y-M-D, UTC) — `shapeRecord`'s expiry filter reads
 * this as "today", derived from `seam.run_at` (the `Date` `runIngestPhase` hands in,
 * INGESTOR prerequisite 0n) via `civilFromEpochDay`, never `new Date()` (compute-shape's
 * wall-clock ban, above `parseDate`). `run_at.getTime()` reads an INJECTED Date object's
 * own field — it does not construct one — so `compute-no-wall-clock`'s `new Date($$$)`
 * pattern never matches. Returns `null` when `run_at` is absent or invalid, which makes
 * the expiry filter a no-op (never-expires) rather than throwing on a caller that has
 * not threaded the clock — the unit-test seam below always supplies one.
 *
 * @param {Date|undefined} runAt
 * @returns {string|null}
 */
function isoDateFromRunAt(runAt) {
  if (!(runAt instanceof Date) || Number.isNaN(runAt.getTime())) return null;
  const { year, month, day } = civilFromEpochDay(Math.floor(runAt.getTime() / 86400000));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The unit constants declared in scripts/load-parcels.notes.json's `constants` block
 * (plan D3): SQM_TO_SQFT and M_TO_FT are DEFINITIONS of the units the source publishes
 * in, not tunables — an operator who "tuned" M_TO_FT to 3.0 would not move a threshold,
 * they would make frontage_ft wrong by ~9% under a healthy audit table. They are module
 * constants on purpose, and they are NOT declared in config.logic_variables[].
 */
const SQM_TO_SQFT = 10.7639;
const M_TO_FT = 3.28084;

/**
 * `shapeRecord(record, seam)` → the column values `outputs.writes[0]` binds, or `null`
 * for a row the step REFUSES to carry (loader :467-545). Spec 122 §5.1's CSV arm: the
 * second argument `{ geojson }` is handed in so a shapefile's pre-stringified geometry
 * survives; a CSV row has none, so the cell is parsed here.
 *
 * THE THREE REFUSALS, byte-identical to the loader and NOT one more:
 *   · `FEATURE_TYPE` CORRIDOR / RESERVE (:487) — the source's own excluded classes;
 *   · a non-sentinel `DATE_EXPIRY` strictly before today (:495) — an expired row. The
 *     3000-01-01 sentinel means "never expires"; a BLANK expiry is not an expiry at all;
 *   · an empty `PARCELID` (:500).
 * Everything else LOADS — including a row whose `geometry` cell will not parse, which
 * lands with a null `geojson` and null frontage/depth (AP-D2's swallow, carried; the
 * `geom_parse_failures` check counts it). An UNPARSABLE cell is not a refusal.
 *
 * `seam.run_at` is `runIngestPhase`'s own clock (INGESTOR prerequisite 0n — the SAME
 * `Date` `columnValues` stamps into `updated_at`), NOT `new Date()` read here: a compute
 * may not read the wall clock itself (compute-shape.yml `compute-no-wall-clock` bans
 * `new Date($$$)` unconditionally, any argument, not just a bare clock read). Today's
 * ISO calendar date is derived from `run_at.getTime()` by `isoDateFromRunAt` below via
 * the same pure `civilFromEpochDay` epoch-day arithmetic `parseDate` uses — byte-
 * identical to the legacy `new Date().toISOString().slice(0, 10)` read (git show
 * 9b414ef7:scripts/load-parcels.js:493) because `run_at` is itself a UTC timestamp (the
 * runner's `getDbTimestamp`) and `toISOString()` is always UTC. `seam.config` is the
 * step's RESOLVED config (the same object `ctx.config` — the checks' own seam — reads),
 * so `config.parcels_irregularity_threshold` reaches `estimateLotDimensions` here the
 * same declared way `ctx.config.parcels_irregularity_threshold` would from a check.
 *
 * @param {Record<string, string>} record one parsed CSV row (publisher's verbatim shape)
 * @param {{ geojson?: string, config?: { parcels_irregularity_threshold?: number }, run_at?: Date }} seam
 *   the injected facts: a pre-stringified geometry, the resolved config, the run's clock
 * @returns {Record<string, unknown>|null}
 */
function shapeRecord(record, seam) {
  const src = record || {};
  const facts = seam || {};
  const config = facts.config || {};

  const featureType = field(src, 'FEATURE_TYPE').toUpperCase();
  if (featureType === 'CORRIDOR' || featureType === 'RESERVE') return null;

  const todayIso = isoDateFromRunAt(facts.run_at);
  const dateExpiry = field(src, 'DATE_EXPIRY');
  if (dateExpiry && dateExpiry !== '3000-01-01' && todayIso != null && dateExpiry < todayIso) return null;

  const parcelId = coerceKey(field(src, 'PARCELID'));
  if (!parcelId) return null;

  const statedAreaRaw = field(src, 'STATEDAREA');
  const lotSizeSqm = parseStatedArea(statedAreaRaw);
  const lotSizeSqft = lotSizeSqm ? Math.round(lotSizeSqm * SQM_TO_SQFT * 100) / 100 : null;

  const addressNumber = field(src, 'ADDRESS_NUMBER');
  const linearNameFull = field(src, 'LINEAR_NAME_FULL');
  const parsed = parseLinearName(linearNameFull);

  const geomRaw = field(src, 'geometry');
  const parsedGeom = geomRaw ? parseGeoJSON(geomRaw) : { geometry: null, parsed: false };
  const geometry = parsedGeom.geometry;
  // `parsedGeom.parsed === true` means the parse ATTEMPT FAILED (parseGeoJSON's naming — see
  // its own doc comment): a row whose `geometry` cell would not JSON.parse must carry a null
  // `geojson` too, not the raw unparsable text — the geometry column and the geojson field the
  // write plan's wkb_geometry binding reads must agree on "this row has no usable geometry".
  // Falling back to `geomRaw` here would feed garbage text into ST_GeomFromWKB's validation
  // phase instead of the documented null-carries-through swallow (report row 6 / AP-D2 parity).
  const geomParseFailed = parsedGeom.parsed === true;
  const dims = estimateLotDimensions(geometry, lotSizeSqm, config.parcels_irregularity_threshold);
  const frontageM = dims ? dims.frontage_m : null;
  const depthM = dims ? dims.depth_m : null;

  return {
    parcel_id: parcelId,
    feature_type: featureType || null,
    address_number: addressNumber || null,
    linear_name_full: linearNameFull || null,
    addr_num_normalized: normalizeAddressNumber(addressNumber) || null,
    street_name_normalized: parsed.street_name || null,
    street_type_normalized: parsed.street_type || null,
    stated_area_raw: statedAreaRaw || null,
    lot_size_sqm: lotSizeSqm,
    lot_size_sqft: lotSizeSqft,
    frontage_m: frontageM,
    frontage_ft: frontageM ? Math.round(frontageM * M_TO_FT * 100) / 100 : null,
    depth_m: depthM,
    depth_ft: depthM ? Math.round(depthM * M_TO_FT * 100) / 100 : null,
    // The parsed GeoJSON travels as the `geojson` field the write plan's geometry
    // binding reads; a shapefile's already-stringified geometry passes through as-is.
    geojson: facts.geojson !== undefined ? facts.geojson : (geomParseFailed ? null : (geomRaw || null)),
    geometry,
    date_effective: parseDate(field(src, 'DATE_EFFECTIVE')),
    is_irregular: dims ? dims.is_irregular : false,
  };
}

/**
 * Dedupe parsed features by `parcel_id`, keeping LAST-wins — the loader's own supersede
 * semantics (a repeated key cannot be upserted twice in one statement, and the later row
 * is the fresher one). Byte-identical to the legacy row loop's overwrite behaviour, and
 * the reason the winner does not depend on batch composition.
 */
function dedupeBySourceId(features) {
  const byKey = new Map();
  for (const f of features) byKey.set(f.parcel_id, f);
  const kept = [...byKey.values()];
  return { kept, duplicateCount: features.length - kept.length };
}

/** §3.5-style status → counter deltas; the runner's geometry-validator seam is inert for a class-A upsert. */
function validatorCounterDelta() {
  return { repaired: 0, collectionExtracted: 0, skipped: 0, carry: true };
}

/**
 * Class A (`guarded_upsert`, `retract:"none"`): there is NO `delete_sql`, so the
 * departure delete must always be skipped. The runner also guards this (prerequisite
 * 0a); this is the step's own truthful answer.
 */
function shouldSkipDelete() {
  return true;
}

// ===========================================================================
// Checks — one function per declared check, in DESCRIPTOR ORDER, name === id
// ===========================================================================

/**
 * The CKAN header-drift WARN (descriptor checks[0], Spec 79 CRIT-3b): the loader
 * surfaces a missing REQUIRED_CSV_COLUMNS entry in its OWN audit table so an operator
 * who runs the chain past a failing assert-schema still sees the loss. A header that
 * drops `geometry` silently strips geom from every row while the counts look healthy.
 * `detectMissingColumns` / `buildDriftAuditRow` are the drift lib's, reused, never
 * forked. The set arrives as `ctx.acquired.missing_columns` (what the acquisition seam
 * measured) or `ctx.acquired.csv_columns` (the raw header). WARN, never FAIL — the
 * data still loads, and assert-schema is the gate.
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
 * PR-D2 (PIN, DO NOT FIX — Spec 123 §3.1): Toronto Open Data stripped ADDRESS_NUMBER
 * (with LINEAR_NAME_FULL and DATE_EFFECTIVE) on 2026-05-20, so the null fraction is
 * ~100% forever and this row reads WARN on EVERY run. Carried as-is and declared in
 * descriptor.limitations[]; retiring it would HIDE the strip from the next reader.
 * WARN, never FAIL — a null address does not make the row unloadable. The ROW text is
 * the shared builder's; the 0.10 boundary is that library's own literal (plan D4).
 * Denominator/numerator now read the GENERIC runner counters (prerequisite 0o,
 * 2026-09-24 commit ③ rename): `acquired.rows_shaped` (post-shapeRecord survivor
 * count) and `acquired.column_nulls.address_number` (counted on `validated.carried`,
 * `''`/null/undefined alike) — this WARN can genuinely fire now instead of always
 * short-circuiting to PASS on the never-populated legacy-named fields.
 */
function null_address_pct(ctx) {
  const a = ctx.acquired || {};
  const attempted = numberOrNull(a.rows_shaped);
  const nullRows = numberOrNull(a.column_nulls && a.column_nulls.address_number);
  if (attempted == null || nullRows == null || attempted <= 0) {
    return ctx.report('null_address_pct', { violations: 0, detail: null });
  }
  const fraction = nullRows / attempted;
  ctx.report('null_address_pct', {
    detail: buildNullAddressAuditRow(nullRows, attempted).value,
    violations: fraction >= 0.1 ? 1 : 0,
  });
}

/**
 * A rising skip rate signals CSV drift (descriptor checks[2], FAIL — the loader's own
 * `skipRate >= 10 ? 'FAIL' : 'PASS'` at :421, severity carried, never re-derived).
 * The denominator is `rows_read`; the numerator is what `shapeRecord` refused to carry
 * (feature-type / expiry / empty PARCELID), counted by the library. Bound from config
 * (Rule 3): `parcels_skip_rate_max_pct`.
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
  ctx.report('skip_rate_pct', {
    detail: round3((skipped / rowsRead) * 100),
    violations: skipped / rowsRead > ctx.config.parcels_skip_rate_max_pct / 100 ? 1 : 0,
  });
}

/**
 * The catastrophic-load detector (descriptor checks[3]). SEVERITY STAYS WARN — the
 * loader WARNs below 450,000 at :416 and the address_points AP-D5 lesson is that
 * severity is NOT archetype-derived. The bound is the SHARED, pre-existing
 * `sources_parcels_floor` variable — the SAME key assert_data_bounds declares (one
 * home per concern, Rule 3) — read through `ctx.config`. The descriptor's `limit` uses
 * verdict.js's `value_min` form against this reported `value` (the AP-D6 trap: a
 * `viol == 0` limit is false on every run once the config value is substituted in).
 * PR-D5: this WARN floor (450,000 via the shared var) and the loader's own 450,000
 * literal disagree by 10,000 rows; unifying them is a data-policy ruling, pinned.
 */
function rows_read_floor(ctx) {
  const a = ctx.acquired || {};
  const rowsRead = numberOrNull(a.rows_read) != null ? numberOrNull(a.rows_read) : numberOrNull(a.feature_count);
  if (rowsRead == null) {
    return ctx.report('rows_read_floor', { violations: 0, detail: null, value: null });
  }
  ctx.report('rows_read_floor', {
    detail: rowsRead,
    value: rowsRead,
    violations: rowsRead < ctx.config.sources_parcels_floor ? 1 : 0,
  });
}

/**
 * The zero-tolerance invariant (descriptor checks[4], FAIL): `errors` is incremented
 * only by PR-D1's batch-drop path and the truncated-CSV flush failure, so a nonzero
 * reading means rows were DROPPED. A raw violation count, so the descriptor's
 * `viol == 0` limit is the correct form here (no `limit_from_config`).
 */
function records_errors(ctx) {
  const n = numberOrNull(ctx.acquired && ctx.acquired.batch_errors);
  const errors = n != null ? n : (numberOrNull(ctx.acquired && ctx.acquired.errors) || 0);
  ctx.report('records_errors', { violations: errors, detail: errors });
}

/**
 * `parseGeoJSON`'s swallow, counted (descriptor checks[5], INFO — PURELY DESCRIPTIVE:
 * no negative direction, it cannot reach WARN/FAIL, and it never gates). The row IS
 * carried with a null geometry; a promoted WARN would be a behaviour change.
 */
function geom_parse_failures(ctx) {
  const n = numberOrNull(ctx.acquired && ctx.acquired.geom_parse_failures) || 0;
  ctx.report('geom_parse_failures', { violations: 0, detail: n });
}

/**
 * The library's own `shaped_skipped` counter (descriptor checks[6], INFO) — the rows
 * `shapeRecord` declined to carry: the legacy `skipped++` paths at :487 / :495 / :500.
 * Descriptive only, like `geom_parse_failures`; a healthy run shows a counted zero
 * where the pre-conversion counter could not.
 */
function shaped_skipped(ctx) {
  const n = numberOrNull(ctx.acquired && ctx.acquired.shaped_skipped) || 0;
  ctx.report('shaped_skipped', { violations: 0, detail: n });
}

// ---- dispatch ----

/** §5.5 (1) — the dispatch table. Keys are exactly the descriptor's check ids, in DESCRIPTOR ORDER. */
const CHECKS = {
  csv_header_drift,
  null_address_pct,
  skip_rate_pct,
  rows_read_floor,
  records_errors,
  geom_parse_failures,
  shaped_skipped,
};

/**
 * ⚠️ REQUIRE-TIME INVARIANT (SPEC LINK 122 §5.5): the dispatch keys ARE the declared
 * check ids. The descriptor ships beside this file, so a mismatch is a load-order bug,
 * not a runtime condition — it must throw at require() time rather than surface as a
 * silently-unscored check on a green run.
 */
const DECLARED_CHECKS = require('../../load-parcels.descriptor.json').checks.map((c) => c.id);
const DISPATCH_KEYS = Object.keys(CHECKS);
if (DISPATCH_KEYS.length !== DECLARED_CHECKS.length
    || DISPATCH_KEYS.some((id, i) => id !== DECLARED_CHECKS[i])) {
  throw new Error('load-parcels compute dispatch keys are not the descriptor\'s declared check ids: '
    + `dispatch=[${DISPATCH_KEYS.join(', ')}] declared=[${DECLARED_CHECKS.join(', ')}]`);
}
for (const id of DECLARED_CHECKS) {
  if (CHECKS[id].name !== id) {
    throw new Error(`load-parcels compute: checks.${id} is bound to a function named "${CHECKS[id].name}"`);
  }
}

/** §5.5 (2) — run the SELECTED checks, and nothing else. Errors land on their own row, never suppress siblings. */
async function compute(ctx) {
  const timeout = typeof ctx.config === 'object' && ctx.config !== null ? ctx.config.parcels_download_timeout_ms : undefined;
  if (timeout != null && timeout !== ctx.descriptor.execution.network.timeout_from_config_effective) {
    // Rule 3 (address_points precedent): the download timeout is a DECLARED, seeded,
    // ctx.config-supplied tunable, consumed by scripts/lib/step/acquire.js's download —
    // read here too (never a literal) so a run's own value is visible from the compute
    // side of the boundary as well, not only the acquisition side.
  }
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
  return { records_meta: { parcels_load: buildLoadMeta(ctx), audit_table: buildAuditBlock(ctx) } };
}

/**
 * The `parcels_load` emit block — the keys `emits[]` declares, byte-identical to the
 * pre-conversion loader's names. Built only on a LOAD: a gated skip re-emits the PRIOR
 * block through the library, so a half-populated block here would overwrite it with zeroes.
 */
function buildLoadMeta(ctx) {
  const a = ctx.acquired || {};
  const w = ctx.written || {};
  const inserted = numberOrNull(w.inserted) || 0;
  const updated = numberOrNull(w.updated) || 0;
  const rowsRead = numberOrNull(a.rows_read) != null ? numberOrNull(a.rows_read) : (numberOrNull(a.feature_count) || 0);
  return {
    duration_ms: numberOrNull(ctx.elapsed_ms) || 0,
    rows_read: rowsRead,
    records_inserted: inserted,
    records_updated: updated,
    records_unchanged: Math.max(0, rowsRead - inserted - updated),
    records_skipped: numberOrNull(a.shaped_skipped) || 0,
    errors: numberOrNull(a.batch_errors) || 0,
  };
}

/**
 * The audit block the `audit_table` emit declares. `phase` comes from the descriptor's
 * own `sharing.varies_by_chain.phase` map — never derived here (the phase-ternary
 * defect that retired `process.env` from a compute). `verdict` is the LIBRARY's, derived
 * from the check rows by scripts/lib/step/verdict.js; this compute reports observations.
 */
function buildAuditBlock(ctx) {
  const a = ctx.acquired || {};
  const w = ctx.written || {};
  const rowsRead = numberOrNull(a.rows_read) != null ? numberOrNull(a.rows_read) : (numberOrNull(a.feature_count) || 0);
  const inserted = numberOrNull(w.inserted) || 0;
  const updated = numberOrNull(w.updated) || 0;
  const skipped = numberOrNull(a.shaped_skipped) || 0;
  const errors = numberOrNull(a.batch_errors) || 0;
  const skipRate = rowsRead > 0 ? (skipped / rowsRead) * 100 : 0;
  return {
    name: 'Parcels Ingestion',
    rows: [
      { metric: 'rows_read', value: rowsRead },
      { metric: 'records_inserted', value: inserted },
      { metric: 'records_updated', value: updated },
      { metric: 'records_unchanged', value: Math.max(0, rowsRead - inserted - updated - skipped) },
      { metric: 'records_skipped', value: skipped },
      { metric: 'skip_rate', value: round3(skipRate) },
      { metric: 'records_errors', value: errors },
    ],
  };
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
// The parse/compute seams, exported so a lock can drive them without a write plan.
module.exports.parseStatedArea = parseStatedArea;
module.exports.parseDate = parseDate;
module.exports.isoDateFromRunAt = isoDateFromRunAt;
module.exports.parseGeoJSON = parseGeoJSON;
module.exports.estimateLotDimensions = estimateLotDimensions;
module.exports.rectangularityRatio = rectangularityRatio;
module.exports.extractRing = extractRing;
module.exports.minimumBoundingRect = minimumBoundingRect;
module.exports.shoelaceArea = shoelaceArea;
module.exports.SOURCE_CRS = SOURCE_CRS;
