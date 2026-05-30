// 🔗 SPEC LINK: docs/specs/01-pipeline/58_source_zoning_bylaw.md §3 step 3 (F-M9, R2-18)
//
// Geometry validation + geom-column SQL for the zoning loader (scripts/load-zoning.js).
// The actual validity checks run in PostGIS (ST_*); this module centralises the
// VERIFIED SQL expressions + the pure-JS classification so the loader and the
// tests share one source of truth and the strings can be unit-tested without a DB.
//
// Verified against live PostGIS 18.2 (2026-05-30 probe):
//   - ST_GeomFromGeoJSON sets SRID 4326 (matches the typed geom columns) — no ST_SetSRID.
//   - ST_MakeValid repairs self-intersections (bowtie polygon → valid MultiPolygon).
//   - ST_CollectionExtract(g, 3) keeps polygons; (g, 2) keeps linestrings;
//     a GeometryCollection lacking the target type yields an EMPTY geometry,
//     which the loader must SKIP (the geom column is NOT NULL). [R2-18]
//   - ST_Multi normalises single-part inputs to the Multi* type the column requires.

'use strict';

const POLYGON = 'polygon';
const LINESTRING = 'linestring';

// ST_CollectionExtract type arg (R2-18): 1=point, 2=linestring, 3=polygon.
// Polygon layers extract type 3; the two LineString overlays extract type 2.
const COLLECTION_EXTRACT_TYPE = Object.freeze({ [POLYGON]: 3, [LINESTRING]: 2 });

function typeArgFor(geomKind) {
  const typeArg = COLLECTION_EXTRACT_TYPE[geomKind];
  if (typeArg == null) {
    throw new Error(`geometry-validator: unknown geomKind '${geomKind}' (expected '${POLYGON}' or '${LINESTRING}')`);
  }
  return typeArg;
}

/**
 * SQL expression that turns a GeoJSON-text bind parameter into a validated,
 * Multi-wrapped geometry matching the typed geom column.
 * Polygon layers → MULTIPOLYGON; LineString layers → MULTILINESTRING.
 *
 * @param {string} placeholder - the bind placeholder, e.g. '$5'
 * @param {'polygon'|'linestring'} geomKind
 * @returns {string} SQL fragment for the geom column value in an INSERT
 */
function geomColumnSql(placeholder, geomKind) {
  const typeArg = typeArgFor(geomKind);
  // MakeValid (repair) → CollectionExtract (drop non-target parts, incl.
  // GeometryCollection mixes) → Multi (normalise single-part to Multi*).
  return `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(${placeholder})), ${typeArg}))`;
}

/**
 * Per-batch validation query: classify each candidate GeoJSON BEFORE insert so
 * the loader can emit invalid/repaired/discarded counts (spec §3 audit rows) and
 * skip geometries that would resolve to EMPTY (NOT NULL geom column).
 *
 * Binds $1 = text[] of GeoJSON strings. Returns one row per input (aligned by
 * `ord`, 1-based) with: valid_before, empty_after, simple_ok.
 *
 * @param {'polygon'|'linestring'} geomKind
 * @returns {string} SQL
 */
function geometryValidationSql(geomKind) {
  const typeArg = typeArgFor(geomKind);
  // F-M9: LineString validity additionally requires positive length + simplicity.
  // Polygon layers have no extra simplicity requirement (simple_ok = TRUE).
  const simpleExpr = geomKind === LINESTRING
    ? '(ST_Length(g.geom::geography) > 0 AND ST_IsSimple(g.geom))'
    : 'TRUE';
  return `
    SELECT t.ord,
           ST_IsValid(g.geom)                                                    AS valid_before,
           ST_IsEmpty(ST_CollectionExtract(ST_MakeValid(g.geom), ${typeArg}))    AS empty_after,
           ${simpleExpr}                                                         AS simple_ok
      FROM unnest($1::text[]) WITH ORDINALITY AS t(gj, ord)
      CROSS JOIN LATERAL (SELECT ST_GeomFromGeoJSON(t.gj) AS geom) g`;
}

/**
 * Pure classifier from a validation row → ingest decision:
 *   'valid'     — geometry valid as-is
 *   'repaired'  — was invalid but ST_MakeValid produced a usable (non-empty) geom
 *   'discarded' — extract yielded EMPTY (no target-type part), or a LineString
 *                 failed the F-M9 length/simplicity check → skip + count
 *
 * @param {{valid_before:boolean, empty_after:boolean, simple_ok:boolean}} row
 * @returns {'valid'|'repaired'|'discarded'}
 */
function classifyGeometry(row) {
  if (row.empty_after || row.simple_ok === false) return 'discarded';
  if (row.valid_before) return 'valid';
  return 'repaired';
}

module.exports = {
  POLYGON,
  LINESTRING,
  COLLECTION_EXTRACT_TYPE,
  geomColumnSql,
  geometryValidationSql,
  classifyGeometry,
};
