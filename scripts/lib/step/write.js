/**
 * `write_discipline` → GENERATED SQL (Spec 122 §1.4, LG-1/LG-2).
 *
 * §1.4: "the class is not decoration — it SELECTS the generated SQL". Before this
 * file the class was a label: `deriveMeta` read `outputs.writes` for PIPELINE_META
 * and nothing else, every loader hand-wrote its own upsert, and a hand-written
 * `ON CONFLICT` in a compute was a lint rule with nothing to point at.
 *
 * WHAT THIS FILE OWNS, all four axes read from the descriptor and NONE inferred
 * from a class name (ruling V7 decoupled them):
 *   · class `upsert_scoped_departure_delete` — a keyed upsert followed, IN THE SAME
 *     TRANSACTION, by a scoped departure DELETE of every key the source no longer
 *     carries. Both statements or neither: a committed upsert with a rolled-back
 *     delete leaves rows the source retracted.
 *   · `guard: is_distinct_from` over `guard_columns` — the WHERE clause that makes a
 *     re-run of an unchanged source a genuine no-op instead of a full re-stamp.
 *   · `retract: departed` + the EMPTY-SET GUARD. `<key> <> ALL('{}')` is true for
 *     every row, so an empty parse would DELETE THE WHOLE TABLE. The guard
 *     suppresses the statement and says so in an audit row.
 *   · `expected_change_ratio` + `idempotent_rerun` — measured, not asserted-to.
 *     `rows_scanned` / `rows_changed` are counted from `RETURNING (xmax = 0)` and
 *     checked against the declared bound, so `idempotent_rerun: "zero_writes"`
 *     becomes a number a differential can read rather than a claim in a comment.
 *   · `columns[].on_empty: "preserve"` (prerequisite 0m, 2026-09-24) — an EMPTY
 *     incoming value ('' after trim) keeps the stored value on conflict, replacing a
 *     per-step compute-authored preservation with a DECLARED one the codegen executes.
 *     `"preserve_null"` (0m follow-on, 2026-09-24) is its NULL-form for a non-text
 *     column (no empty-string representation to NULLIF against) — an incoming NULL
 *     keeps the stored value instead, mirroring scripts/load-parcels.js's legacy
 *     `date_effective` arm.
 *   · `outputs.invalidates[].set_null_on_change_of` (prerequisite 0l, 2026-09-24) — a
 *     lineage-stamp CASE arm NULLed when a watched column changes, EXECUTED against the
 *     write target its own entry names (unlike the base {table,column,when} entry, which
 *     stays declarative-only for a DIFFERENT step's consumer to read).
 *
 * Both axes' founding case is `scripts/load-parcels.js`'s legacy UPSERT: five
 * `COALESCE(NULLIF(EXCLUDED.<col>, ''), parcels.<col>)` preservations and three
 * `<stamp> = CASE WHEN parcels.geometry::jsonb IS DISTINCT FROM EXCLUDED.geometry::jsonb
 * THEN NULL ELSE parcels.<stamp> END` arms (DEC-FENCE2, #418) — reproduced from these two
 * declared axes alone (`src/tests/step-library.logic.test.ts` T5).
 *
 * ⚠️ THE RLS PREFLIGHT IS NOT OPTIONAL, and it is why `guards.requires[].kind`
 * grew `rls_bypass_or_policy`. A class-B target with RLS ENABLED and ZERO policies
 * is writable only by a role that bypasses RLS. Under any other role the UPSERT and
 * the DELETE affect 0 rows WITH NO ERROR: `rows_changed` reads 0, the verdict reads
 * PASS, the ledger row reads `completed`, and the run is indistinguishable from an
 * unchanged source. The preflight runs BEFORE the transaction and fails loud.
 *
 * Nothing here names a step, a table or a column: the table comes from
 * `outputs.writes[].table`, the key from `.key`, the written columns from
 * `.columns[].written` (`step` | `insert_only` | `db_default`), the SRID from
 * `guards.srid`.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §8.2
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R9
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 1 (a new schema field carries an x-ruling)
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (no per-step escape hatches — geometry_kind is declared runner-wide)
 */
'use strict';

const pipeline = require('../pipeline');
const fs = require('fs');
const path = require('path');

/** Columns whose value the STEP supplies; anything else is declared-but-not-written. */
const WRITTEN_BY_STEP = 'step';

/**
 * Columns the step supplies on INSERT and that the DB-side recomputes afterwards, so
 * the conflict arm must NEVER rewrite them (Spec 122 §5.1, Spec 124 Rule 1, WF2 batch-2
 * prerequisite 0j, 2026-09-24).
 *
 * The pre-0j column model was BINARY: `step` went into BOTH the INSERT list and the
 * `DO UPDATE SET`, `db_default` into neither. That leaves no way to express a column the
 * step SEEDS and then ceases to own. Measured 2026-09-24 (WF2 batch-2 row 3.6 `massing`):
 * `footprint_area_sqm` / `footprint_area_sqft` are computed DB-side after load and are
 * INTENTIONALLY OMITTED from the legacy UPDATE SET (`scripts/load-massing.js`), so under
 * the binary model the only rungs were `step` (a reload NULLs them — or silently reverts
 * them to the raw source value — on every conflict) or `db_default` (the column leaves the
 * INSERT list too, so the seed value is never written at all). `insert_only` is the
 * third value.
 *
 * Semantics, byte-for-byte for the other two values: an `insert_only` column IS in the
 * `INSERT INTO (...)`, IS in the VALUES group and IS in `bindRow` — exactly like `step`
 * — and is absent from `update_columns` (the `DO UPDATE SET` clause) and from the
 * `IS DISTINCT FROM` guard (the guard compares only what the update can change).
 */
const WRITTEN_INSERT_ONLY = 'insert_only';

/** Default SQL type for the departure DELETE's key array cast. */
const DEFAULT_KEY_SQL_TYPE = 'BIGINT';

/**
 * `write_discipline.class` values whose generated statement is a scoped set-based UPDATE.
 *
 * `set_based_null_retract` (LG-16, MATCHER pilot 2026-08-28) joins this set deliberately:
 * codegen-identical to `set_based_scoped`/`set_based_unscoped` (a constant `SET` — here
 * always `null` — over a declared `scope`), so it costs nothing new in `buildWritePlan`.
 * It is declared under its OWN class, never reusing `set_based_scoped`, because a
 * retraction that only happens to share a code shape with a flag clear is not the same
 * MECHANIC: `set_based_scoped` never fires under `retract_when`, and a reviewer grepping
 * for "does this step ever retract wsib_registry" must find it by class name, not by
 * reading every `set_based_scoped` target's `scope` string.
 */
const SET_BASED_CLASSES = new Set(['set_based_scoped', 'set_based_unscoped', 'set_based_null_retract']);

/**
 * `write_discipline.class` value for LG-11 (MATCHER pilot 2026-08-28) — a scoped
 * `UPDATE ... FROM (<matched CTE>) m WHERE <table>.<key> = m.<key>`, where the CTE and
 * the SET clause's right-hand sides are AUTHORED BY THE COMPUTE (the domain join is not
 * expressible as declared columns[] the way a guarded upsert's row values are — see
 * `scripts/lib/compute/link-wsib.js buildTierSql`, ruling A-2 option 2, same shape as
 * link_massing's `buildMatchSql`). `buildWritePlan` for this class returns a DESCRIPTIVE
 * plan only (table/keys/scope/guard); the executable SQL text is handed to
 * `executeSetBasedJoinUpdate` directly by the runner, per tier, per statement.
 */
const JOIN_UPDATE_CLASS = 'set_based_join_update';

/**
 * `write_discipline.class` value for LG-18 (MATERIALIZER pilot 2026-08-29) — a single
 * server-side `INSERT INTO <table> (...) SELECT ... FROM ... JOIN ... ON <spatial
 * predicate> ON CONFLICT (<key>) DO NOTHING`, no `DO UPDATE` branch, no retraction. The
 * SELECT's join predicate is AUTHORED BY THE COMPUTE (`buildMaterializeSql`, mirroring
 * `buildTierSql`'s split) — the domain join is not expressible as declared `columns[]`
 * the way a guarded upsert's row values are. `buildWritePlan` for this class returns a
 * DESCRIPTIVE plan only; the executable SQL text is handed to
 * `executeInsertSelectNoRetract` directly by the runner, per batch.
 */
const INSERT_ONLY_NO_RETRACT_CLASS = 'insert_only_no_retraction';

/**
 * `write_discipline.class` value for LG-20 (BACKFILL pilot 6, 2026-08-29) — a single
 * conditional `UPDATE <table> SET <cols> = <server expression over the row> WHERE
 * <scope> [AND <key> > $1 ORDER BY <key> LIMIT $2]`, UPDATE-only, no INSERT/DELETE
 * token anywhere. The SET clause's right-hand sides are server-side expressions
 * over the row itself (`compute-centroids.js`'s `ST_Y(ST_Centroid(geom))`), not
 * bound row values the way a guarded upsert's SET clause is — the same reason
 * `JOIN_UPDATE_CLASS`/`INSERT_ONLY_NO_RETRACT_CLASS` are descriptive-only above.
 * `buildWritePlan` for this class returns a DESCRIPTIVE plan; the executable SQL
 * text is authored by the compute (`buildBackfillSql`) and handed to
 * `executeBackfillUpdate` directly by the runner (`runBackfillPhase`).
 *
 * Genuinely unimplemented before this pilot (Fold C B-1, 2026-08-29): `class`
 * `write_once_backfill` (letter E) was already a frozen enum member, but
 * `SET_BASED_CLASSES` excluded it and `sqlLiteral` refuses server-side
 * expressions — the codegen half of the label had no consumer.
 */
const WRITE_ONCE_BACKFILL_CLASS = 'write_once_backfill';

/**
 * `write_discipline.class` value for LG-27 (RECORDER pilot 8, `refresh_snapshot`,
 * 2026-08-31, Fold B RULING) — GAP-2's own prescribed class name for a keyed
 * `INSERT ... ON CONFLICT (<key>) DO UPDATE`, `set_source: "compute"` ESCAPE HATCH
 * (mirrors `SET_BASED_CLASSES`' own `set_source: "compute"` branch, LG-22): the
 * write is a single non-batched statement over 68 non-key columns, several of
 * which are derived across 8+ prior reads (JSON aggregation, a `CURRENT_DATE`
 * literal in the key position, not a bound value) — not expressible as declared
 * `columns[]` the way a simple guarded upsert's row values are, the SAME reason
 * `JOIN_UPDATE_CLASS`/`INSERT_ONLY_NO_RETRACT_CLASS`/`WRITE_ONCE_BACKFILL_CLASS`/
 * `LINK_FULL_RETRACTION_CLASS` went descriptive-only above. The DEFAULT (unnamed)
 * codegen path below — used by `link_massing`'s own `guarded_upsert` target — binds
 * EVERY declared column including the key as a parameterized value and unconditionally
 * appends an `IS DISTINCT FROM` guard clause; neither fits a `CURRENT_DATE`-keyed,
 * `guard:"none"` target, so this class is declared explicitly rather than silently
 * falling through to codegen that would produce malformed SQL. `buildWritePlan` for
 * this class returns a DESCRIPTIVE plan only; the executable SQL text is authored by
 * the compute (`buildWriteSql`) and handed to `executeRecorderUpsert` directly by the
 * runner (`runRecorderPhase`).
 */
const GUARDED_UPSERT_COMPUTE_CLASS = 'guarded_upsert';

/**
 * `write_discipline.class` value for LG-24 (LINK pilot 7, `link_parcels`, 2026-08-30) —
 * Spec 122 §1.4's own frozen enum letter F, "upsert + DELETE stale + DELETE
 * zero-match" — the class named for `link_parcels` (step 10) AND `link_massing`
 * (step 15) in the §1.4 table, but genuinely UNIMPLEMENTED before this pilot (Fold A
 * B-1): `link_massing` never uses the enum's own mechanic, it uses
 * `set_based_scoped`+`guarded_upsert` via an `is_primary` flag column
 * `permit_parcels` does not have. The DELETE-by-key statement (superseded rows a
 * batch's own upsert just relinked away from, or a permit that fell out of every
 * match this batch) is compute-authored (mirrors `JOIN_UPDATE_CLASS`'s own split) —
 * see `executeGuardedDeleteByKey` below.
 */
const LINK_FULL_RETRACTION_CLASS = 'link_full_retraction';

/** `retract_when` — the LINK-pilot qualifier on the frozen `retract` enum. Absent means "always". */
const RETRACT_ALWAYS = 'always';
const RETRACT_FULL_ONLY = 'full_only';

/**
 * The per-target key under which the runner files a write's counters: `written.e1`,
 * `written.e2`, … 1-based index into `outputs.writes[]`.
 *
 * §11 counter scoping needs a NAME for "what the second declared target did", because a
 * LINK writes more than one discipline to one table and `records_new` must mean the
 * upsert's inserts, not the clear's rewrites. Positional rather than invented so the
 * descriptor's `counters[].source` and the declared write order cannot drift: `e2` IS
 * `outputs.writes[1]`, by construction, and moving a target renames its counters.
 */
function targetKey(index) {
  return `e${index + 1}`;
}

/**
 * Batched geometry normalisation — ONE round-trip for the whole feature set.
 *
 * `$1` = the key array, `$2` = the ord-aligned GeoJSON array. `ST_MakeValid` repairs
 * self-intersections; `ST_CollectionExtract(…, 3)` rescues the polygon parts of a
 * GeometryCollection a repair can produce (3 is the PostGIS polygon type code, an
 * API constant, not a knob). The four statuses are the classifier's whole domain and
 * the reason this SQL is not `scripts/lib/geometry-validator.js`: that helper cannot
 * emit the collection-extracted counter a frozen producer contract may freeze.
 *
 * ⚠️ IT IS A BUILDER, NOT A CONSTANT, and the parameters are the two things in it that
 * are not API constants: `outputs.writes[].key_sql_type` and `outputs.writes[].geometry_kind`.
 * The literal `BIGINT[]` that used to sit here disagreed with the departure DELETE's cast
 * twelve lines below, which reads the DECLARED type — so a step declaring `TEXT` keys would
 * have had its keys cast to BIGINT on the way in and TEXT on the way out. Nothing in the
 * descriptor said which one won; today one source says both.
 *
 * ⚠️ `geometry_kind` (Spec 124 Rule 1, Spec 122 §5.1, batch-2 row 3.1 c0e) is the SECOND
 * such parameter. The SQL used to be POLYGON-ONLY by construction — `ST_Multi(…)` and an
 * accepted-type list of Polygon/MultiPolygon — so a Point target (address_points' `geom`)
 * had every row become a Multi geometry and crash on its first write with
 * `Geometry type (MultiPolygon) does not match column type (Point)`. `polygon` keeps the
 * pre-existing text BYTE-IDENTICAL (T2 pins it); `point` extracts type 1 with NO `ST_Multi`
 * and accepts only `ST_Point`. The four statuses are UNCHANGED — a polygon write receiving a
 * stray Point still scores it `skipped_unsupported_type`, and a MultiPoint a point write
 * cannot land scores the same way, never a silent coercion.
 *
 * ⚠️ `line` (0g, 2026-09-24) is the THIRD such family — extracts type 2 with the same
 * single-member-collapse shape as `point`, accepts only `ST_LineString`. Added for
 * `toronto_centreline.geom` (`GEOMETRY(LineString, 4326)`), whose consumer
 * `enrich-centreline.js` requires a true LineString and never a Multi.
 */
const GEOMETRY_KINDS = Object.freeze(['polygon', 'point', 'line']);

/** The declared geometry families and the ST_CollectionExtract type code each one keeps. */
const GEOMETRY_KIND_EXTRACT_TYPE = Object.freeze({ polygon: 3, point: 1, line: 2 });

/** The accepted ST_GeometryType() set per kind — a polygon target refuses a Point, and vice versa. */
const GEOMETRY_KIND_ACCEPTED_TYPES = Object.freeze({
  polygon: "('ST_Polygon','ST_MultiPolygon')",
  point: "('ST_Point')",
  line: "('ST_LineString')",
});

/** The repair/normalise expression per kind. Polygon = today's byte-identical text; point keeps 1. */
function geometryFinalExpr(geometryKind) {
  if (geometryKind === 'polygon') {
    return 'ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired))';
  }
  if (geometryKind === 'line') {
    // LineString: same single-member-collapse shape as point, over extract type 2. A
    // MultiLineString extract stays multi and is counted skipped_unsupported_type by the
    // accept arm — never silently merged into one LineString. toronto_centreline's
    // consumer (enrich-centreline.js) requires a true LineString, never a Multi.
    return "CASE WHEN ST_NumGeometries(ST_CollectionExtract(repaired, 2)) = 1 THEN ST_GeometryN(ST_CollectionExtract(repaired, 2), 1) ELSE ST_CollectionExtract(repaired, 2) END";
  }
  // Point: ST_CollectionExtract always returns a MULTI geometry, and a Point column rejects a
  // MultiPoint (measured 2026-09-23: "Geometry type (MultiPoint) does not match column type (Point)").
  // A single-member extract collapses back to its one Point; a multi-member one stays MultiPoint and
  // is counted skipped_unsupported_type by the accept arm — never silently narrowed to its first point.
  return "CASE WHEN ST_NumGeometries(ST_CollectionExtract(repaired, 1)) = 1 THEN ST_GeometryN(ST_CollectionExtract(repaired, 1), 1) ELSE ST_CollectionExtract(repaired, 1) END";
}

/**
 * A NAMED runtime backstop for a plan whose write declares a `wkb_geometry` bind but no
 * `geometry_kind` (Spec 124 Rule 1, Spec 122 §5.1). The schema's own if/then forbids the
 * combination, so reaching this is a descriptor that bypassed the loader, not a user error;
 * the throw keeps the validator from silently defaulting to the polygon arm.
 */
class MissingGeometryKindError extends Error {
  constructor(table) {
    super(`[write_discipline] ${table}: a column declares bind "wkb_geometry" but the write `
      + 'declares no geometry_kind. The geometry family selects the validator repair/accept '
      + 'path (polygon vs point vs line) and is DECLARED, never sniffed from the payload — declare '
      + '"geometry_kind": "polygon" | "point" | "line" on the write (scripts/steps/_schema/step.schema.json).');
    this.name = 'MissingGeometryKindError';
  }
}

/** Validate a DECLARED geometry_kind, throwing by name — never a silent polygon default. */
function assertGeometryKind(geometryKind, table) {
  if (geometryKind == null || geometryKind === '') throw new MissingGeometryKindError(table);
  if (!GEOMETRY_KINDS.includes(geometryKind)) {
    throw new Error(`[write_discipline] ${table}: unknown geometry_kind '${geometryKind}' `
      + `(expected ${GEOMETRY_KINDS.map((k) => `'${k}'`).join(' or ')}).`);
  }
  return geometryKind;
}

/**
 * A NAMED runtime backstop: an `outputs.writes[].geometry_srid` that is not a usable
 * SRID (Spec 124 Rule 1, Spec 122 §5.1, batch-2 Phase 3 prerequisite 0i). The schema
 * types it `integer, minimum 1`, so reaching this is a descriptor that bypassed the
 * loader — or, more to the point, a caller that built the SQL from an unvalidated
 * value. The SRID is interpolated into the statement TEXT (PostGIS will not take it as
 * a bind for `ST_SetSRID`'s argument in a way the planner keeps), so the builder refuses
 * anything but a positive integer and never renders a string.
 */
class InvalidGeometrySridError extends Error {
  constructor(value) {
    super(`[write_discipline] geometry_srid must be a positive integer (got ${JSON.stringify(value)}). `
      + 'It is the SRID the SOURCE geometry is actually in and is interpolated into '
      + '`ST_SetSRID(ST_GeomFromGeoJSON(g.geojson), <srid>)`, so it must be a number validated by the '
      + 'schema (scripts/steps/_schema/step.schema.json, "geometry_srid").');
    this.name = 'InvalidGeometrySridError';
  }
}

/**
 * A NAMED runtime backstop: the validator returned NO row for a key it was given
 * (Spec 124 Rule 1, Spec 122 §4.3/§11). `unnest($1::<key_sql_type>[]) WITH ORDINALITY`
 * joined to the ord-aligned GeoJSON array produces exactly ONE row per input key, so a
 * miss is not data — it is this library's own join breaking, and it must never be
 * counted as a `skipped` row and folded into a PASS verdict. The throw precedes
 * `executeWrite` (the only caller is `runIngestPhase`), so NOTHING is written.
 *
 * The message carries the miss COUNT and the FIRST missed key only — never a sample of
 * them (Spec 124 Rule 3): a 495,495-row miss must not render 495,495 names into an
 * audit message.
 */
class ValidationKeyMissError extends Error {
  constructor(table, missCount, firstMissedKey) {
    super(`[write_discipline] ${table}: ${missCount} key(s) returned no validation row — the first is `
      + `${JSON.stringify(firstMissedKey)}. The validator joins unnest($1::<key_sql_type>[]) WITH ORDINALITY `
      + 'to the ord-aligned GeoJSON array, so it returns ONE row per input key; a miss is this runner\'s '
      + 'key join breaking, NEVER a data condition to be counted skipped. No row was written.');
    this.name = 'ValidationKeyMissError';
  }
}

const geometryValidationSql = (keyType, geometryKind, geometrySrid) => {
  // The polygon arm is BYTE-IDENTICAL to the pre-geometry_kind text (pinned by T2 in
  // step-library.logic.test.ts). The geometry_kind param is additive: an unknown/absent
  // value is asserted before any text is built, so the polygon default is never silent.
  assertGeometryKind(geometryKind, 'geometryValidationSql');
  // `geometry_srid` (prerequisite 0i, 2026-09-24) is the FOURTH such parameter and the
  // second declared geometry fact. Absent or 4326 keeps the `input` CTE BYTE-IDENTICAL to
  // the pre-SRID text (pinned by T1): the source already IS 4326, so there is nothing to
  // do. A number != 4326 rebuilds the geom expression as
  // `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g.geojson), <srid>), 4326)` — the exact
  // shape the legacy loader used for the founding case (massing's CKAN shapefile is
  // labelled `_wgs84` and carries Web Mercator EPSG:3857 coordinates; measured
  // 2026-09-24, row 3.6 `massing` grounding). Validated as a positive integer and
  // interpolated numerically, never as a string.
  let geomExpr = 'ST_GeomFromGeoJSON(g.geojson)';
  if (geometrySrid != null) {
    if (!Number.isInteger(geometrySrid) || geometrySrid < 1) throw new InvalidGeometrySridError(geometrySrid);
    if (geometrySrid !== 4326) {
      geomExpr = `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g.geojson), ${geometrySrid}), 4326)`;
    }
  }
  const finalExpr = geometryFinalExpr(geometryKind);
  const accepted = GEOMETRY_KIND_ACCEPTED_TYPES[geometryKind];
  return `
WITH input AS (
  SELECT s.source_key, ${geomExpr} AS geom
    FROM unnest($1::${keyType}[]) WITH ORDINALITY AS s(source_key, ord)
    JOIN unnest($2::TEXT[])   WITH ORDINALITY AS g(geojson, ord)   ON s.ord = g.ord
),
validated AS (
  SELECT
    source_key,
    ST_GeometryType(repaired) AS repaired_type,
    ${finalExpr} AS geom_final,
    is_valid_original
  FROM (
    SELECT source_key,
           ST_IsValid(geom)   AS is_valid_original,
           ST_MakeValid(geom) AS repaired
      FROM input
  ) s
)
SELECT source_key,
       CASE
         WHEN ST_GeometryType(geom_final) IN ${accepted}
              AND NOT ST_IsEmpty(geom_final)
              AND repaired_type = 'ST_GeometryCollection'                       THEN 'collection_extracted'
         WHEN ST_GeometryType(geom_final) IN ${accepted}
              AND NOT ST_IsEmpty(geom_final)                                     THEN 'accepted'
         WHEN geom_final IS NULL OR ST_IsEmpty(geom_final)                       THEN 'skipped_null'
         ELSE 'skipped_unsupported_type'
       END AS status,
       ST_AsBinary(geom_final) AS geom_wkb,
       is_valid_original
  FROM validated;`;
};

/** The default-keyed instance, for a reader (and `load-ravines.notes.json`) that wants the shape. */
const GEOMETRY_VALIDATION_SQL = geometryValidationSql(DEFAULT_KEY_SQL_TYPE, 'polygon');

/** RLS preflight subject — one row per declared `rls_bypass_or_policy` requirement. */
const RLS_PROBE_SQL = `SELECT c.relrowsecurity AS rls_enabled,
       (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       (SELECT r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user) AS bypassrls
  FROM pg_class c
 WHERE c.oid = $1::regclass;`;

/** `all_declared` expands to every step-written column except the key. */
function resolveGuardColumns(writeSpec, stepColumns) {
  const declared = writeSpec.write_discipline.guard_columns;
  const keys = new Set(keyColumns(writeSpec));
  if (declared === 'all_declared') return stepColumns.filter((c) => !keys.has(c));
  return declared;
}

function keyColumns(writeSpec) {
  return Array.isArray(writeSpec.key) ? writeSpec.key : [writeSpec.key];
}

/**
 * A DECLARED constant (`columns[].set_value`) rendered as SQL, for the set-based
 * mechanic's `SET <col> = <literal>`.
 *
 * Deliberately tiny and deliberately CLOSED: booleans, finite numbers, null. A string
 * would be an injection surface and there is no measured need for one — a set-based
 * target writes a flag or a zero. Anything else throws at plan time rather than
 * producing a statement whose meaning depends on quoting.
 */
function sqlLiteral(value) {
  if (value === true || value === false || value === null) return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new Error('[write_discipline] columns[].set_value must be a boolean, a finite number or null for a '
    + `set-based mechanic (got ${JSON.stringify(value)}). A string constant is an injection surface and has `
    + 'no measured use; declare the value the generator can render safely.');
}

/**
 * Does this target's declared retraction fire in THIS run's mode? (`retract_when`.)
 *
 * The whole point of the field: `retract: "all"` + `retract_when: "full_only"` is
 * correct in a full rebuild and catastrophic in an incremental run, where it would
 * retract everything the scope covers and rebuild only the rows the incremental filter
 * selected. Before this the gate was an `if (FULL_MODE)` inside a hand-written step and
 * nothing declared it, so no differential could see it move.
 *
 * @param {object} plan - from buildWritePlan
 * @param {'full'|'incremental'} mode - the resolved staleness mode
 */
function retractionFires(plan, mode) {
  if (!plan.delete_sql) return false;
  if (plan.retract_when === RETRACT_FULL_ONLY) return mode === 'full';
  return true;
}

/**
 * THE GENERATOR. Everything the runner executes for one declared write target,
 * derived from the descriptor and nothing else.
 *
 * The returned SQL strings are the exact statements the runner issues, so a test
 * can PREPARE/EXPLAIN them without a pool and a reviewer can read the write in one
 * place instead of reconstructing it from a template loop.
 *
 * @param {object} writeSpec - one `outputs.writes[]` entry
 * @param {object} descriptor
 */
function buildWritePlan(writeSpec, descriptor) {
  const table = writeSpec.table;
  const keys = keyColumns(writeSpec);
  const retract = writeSpec.retract || 'none';
  // `retract_when` is the LINK pilot's C3 pre-pull: the `retract` enum is x-frozen, so
  // the qualifier is a sibling. Absent = "always", which is byte-for-byte the class-B
  // behaviour every pre-LINK descriptor already had.
  const retractWhen = writeSpec.retract_when || RETRACT_ALWAYS;
  const srid = descriptor.guards && descriptor.guards.srid !== 'none' ? descriptor.guards.srid : null;
  // ── THE THREE-VALUED COLUMN MODEL (`columns[].written`, prerequisite 0j) ────
  //   step         → INSERT list + bindRow + UPDATE SET + guard   (unchanged)
  //   insert_only  → INSERT list + bindRow, NEVER in the UPDATE SET or the guard
  //   db_default   → none of the four                              (unchanged)
  // `stepColumns` keeps its name and its meaning as "the columns the step BINDS", which
  // is exactly the INSERT column list and what `bindRow`/`valuesGroup` read — so an
  // `insert_only` column joins it without changing a byte of the INSERT text.
  // `updateColumns` is the NARROWER list the conflict arm may rewrite, and it is what
  // the `DO UPDATE SET` clause, the guard and any plan-shape summary are built from.
  const stepColumns = writeSpec.columns.filter(
    (c) => (c.written || WRITTEN_BY_STEP) === WRITTEN_BY_STEP
      || (c.written || WRITTEN_BY_STEP) === WRITTEN_INSERT_ONLY,
  );
  const defaulted = writeSpec.columns.filter((c) => (c.written || WRITTEN_BY_STEP) !== WRITTEN_BY_STEP
    && (c.written || WRITTEN_BY_STEP) !== WRITTEN_INSERT_ONLY);
  // Declared `insert_only` — seeded on INSERT, excluded from the SET/guard below.
  const insertOnly = writeSpec.columns.filter(
    (c) => (c.written || WRITTEN_BY_STEP) === WRITTEN_INSERT_ONLY,
  ).map((c) => c.name);
  const insertOnlySet = new Set(insertOnly);
  const stepColumnNames = stepColumns.map((c) => c.name);
  // The guard's default expansion is over the columns the update can CHANGE, so an
  // `insert_only` column can never be dragged into the WHERE by `all_declared` — the
  // D-5-shaped trap (a guard over a column the step does not own) becomes structurally
  // unreachable rather than a validator finding.
  const changeableStepColumnNames = stepColumnNames.filter((c) => !insertOnlySet.has(c));
  const guardColumns = resolveGuardColumns(writeSpec, changeableStepColumnNames);
  const updateColumns = changeableStepColumnNames.filter((c) => !keys.includes(c));
  const keyType = writeSpec.key_sql_type || DEFAULT_KEY_SQL_TYPE;
  const scope = writeSpec.write_discipline.scope !== 'none' ? writeSpec.write_discipline.scope : null;
  const geometryColumns = stepColumns.filter((c) => c.bind === 'wkb_geometry').map((c) => c.name);
  if (geometryColumns.length > 1) {
    throw new Error(`[write_discipline] ${table}: ${geometryColumns.length} columns declare bind "wkb_geometry" `
      + `(${geometryColumns.join(', ')}), and the validation phase writes its output under exactly one. `
      + 'A second geometry column would be bound NULL on every row; declare one, or extend validateGeometries first.');
  }
  // A DECLARED geometry family (Spec 124 Rule 1, Spec 122 §5.1, batch-2 row 3.1 c0e).
  //
  // ⚠️ THIS FUNCTION NEVER THROWS FOR A MISSING KIND. A `wkb_geometry` bind does NOT by
  // itself mean the validator runs: LINK / CASCADE / MATERIALIZER steps bind geometry from
  // a server-side SELECT (an UPDATE...FROM join, an INSERT...SELECT), so their plans are
  // built and executed with `validateGeometries` never in the call graph — an INGESTOR-only
  // requirement must not be enforced on them (measured: a throw here sent 0 write statements
  // through the LINK dry-run path, REDing LW-D15 and Fold D). The declared kind is therefore
  // CARRIED here (possibly `undefined` for a non-validating plan) and the named
  // `MissingGeometryKindError` is raised by `validateGeometries` — the ingest path, which is
  // the only caller whose SQL is selected by the kind. The schema's own INGESTOR `allOf`
  // requires the field at descriptor load, so reaching the validator's throw is a descriptor
  // that bypassed the loader, not a user error.
  const geometryKind = geometryColumns.length > 0 ? (writeSpec.geometry_kind ?? null) : null;
  // A DECLARED source SRID (prerequisite 0i, Spec 124 Rule 1, Spec 122 §5.1). Mirror of
  // `geometryKind` in every respect that matters here: OPTIONAL (absent ⇒ 4326, no
  // transform), CARRIED on the plan (a non-validating LINK/CASCADE plan never reads it),
  // and validated by the SCHEMA — but the builder asserts a bad value by name before it is
  // interpolated into statement text, because here an unvalidated value is a rendered
  // statement, not just a plan field.
  const geometrySrid = writeSpec.geometry_srid ?? null;
  if (geometrySrid != null && (!Number.isInteger(geometrySrid) || geometrySrid < 1)) {
    throw new InvalidGeometrySridError(geometrySrid);
  }
  // ⚠️ COMPOSITE KEYS: SUPPORTED FOR THE CONFLICT TARGET, STILL REFUSED WHERE THE
  // STATEMENT GENUINELY INDEXES keys[0] (LG-2, LINK pilot 2026-08-27).
  //
  // The blanket refusal that used to sit here read "composite keys are not supported by
  // the generated class-B write" and covered THREE unrelated statements at once. Two of
  // them really do index a single key — `retract: "departed"` casts ONE key array
  // (`<key> <> ALL($1::type[])`, which cannot express a tuple) and `validateGeometries`
  // joins the WKB back on ONE key column. The third, `ON CONFLICT (<keys>)`, has taken a
  // column LIST since Postgres 9.5 and needed nothing but `keys.join(', ')`.
  //
  // Narrowing the refusal to the two statements that mean it is what lets
  // `parcel_buildings`'s real conflict target `(parcel_id, building_id)` be declared at
  // all. Widening it silently would be the failure the original throw guarded against:
  // a scoped DELETE that retracts by half a key.
  if (keys.length > 1 && retract === 'departed') {
    throw new Error(`[write_discipline] ${table}: retract "departed" is not supported on a composite key `
      + `(declared key: ${keys.join(', ')}). The departure DELETE casts a SINGLE key array `
      + `(<key> <> ALL($1::${keyType}[])), which cannot express a tuple — it would retract by half a key. `
      + 'Declare a single-column key, or retract "all" with a write_discipline.scope, or extend write.js first.');
  }
  if (keys.length > 1 && geometryColumns.length > 0) {
    throw new Error(`[write_discipline] ${table}: a wkb_geometry column with a composite key `
      + `(${keys.join(', ')}) is not supported — validateGeometries joins its result back on ONE key column, `
      + 'so half the key would be dropped and every row would miss its own validation row.');
  }
  if (retract === 'all' && !scope) {
    throw new Error(`[write_discipline] ${table}: retract "all" with write_discipline.scope "none" would `
      + 'DELETE THE WHOLE TABLE. The scope is what makes a full retraction bounded to the rows this run '
      + 'rebuilds; declare it, or declare retract "none".');
  }

  // ── set_based_scoped / set_based_unscoped / set_based_null_retract: one UPDATE,
  //    constants only ──────────────────────────────────────────────────────────
  // No row values are bound: a set-based mechanic writes a DECLARED CONSTANT
  // (`columns[].set_value`) over the rows its scope selects. The scope carries its own
  // placeholders, so the caller binds those and nothing else.
  //
  // ⚠️ GUARD SUPPORT, ADDED AT THE MATCHER PILOT (2026-08-28, LG-11/LG-16 sibling work).
  // Before this, a set-based mechanic could only declare `guard: "none"` — nothing here
  // ever appended an IS DISTINCT FROM clause, so every set-based target was structurally
  // forced onto the x-banned-for-new "unguarded_write" rule (grandfathering required)
  // even when the write is genuinely idempotent-by-construction (a write-once column
  // whose scope already excludes a row once it is set). `guard: "is_distinct_from"` now
  // appends `AND (<col> IS DISTINCT FROM <its declared constant>)` per `guard_columns`,
  // which is a REAL predicate — it changes 0 rows on a second run over an unchanged
  // scope, same as the guarded-upsert's own guard, just against a constant rather than a
  // bound row value.
  // ⚠️ LG-22 (BACKFILL pilot 6 follow-on WF3, CC-D3, 2026-08-30) — `set_source:
  // "compute"` ESCAPE HATCH, DESCRIPTIVE ONLY, mirroring JOIN_UPDATE_CLASS /
  // INSERT_ONLY_NO_RETRACT_CLASS / WRITE_ONCE_BACKFILL_CLASS above. A set-based
  // mechanic's SET clause is normally a DECLARED CONSTANT (`columns[].set_value`,
  // rendered through `sqlLiteral`, which deliberately REFUSES anything but a
  // boolean/number/null — a string constant is an injection surface). Some
  // set-based targets need a SERVER-SIDE EXPRESSION over the row instead
  // (`compute_centroids`'s FULL-mode repair: `ST_Y(ST_Centroid(geom))`, not a
  // literal) — the same reason those three other classes went descriptive-only.
  // Widening `sqlLiteral` itself to accept a raw SQL fragment was REJECTED: it
  // would open every `set_based_scoped`/`set_based_unscoped`/`set_based_null_retract`
  // target (not just this one) to an injection surface for a single pilot's need.
  // `set_source: "compute"` keeps `sqlLiteral`'s lockdown intact for every
  // existing constant-SET target and only opts a target OUT of codegen when the
  // descriptor says so explicitly — the compute authors the real UPDATE text
  // (`buildFullRecomputeSql`) and the runner executes it via `executeGuardedUpdate`.
  if (SET_BASED_CLASSES.has(writeSpec.write_discipline.class) && writeSpec.write_discipline.set_source === 'compute') {
    return {
      table,
      keys,
      srid,
      mechanic: writeSpec.write_discipline.class,
      step_columns: stepColumnNames,
      update_columns: updateColumns,
      guard_columns: guardColumns,
      insert_only_columns: insertOnly,
      key_sql_type: keyType,
      scope,
      retract,
      retract_when: retractWhen,
      clear_sql: null,
      generated_by: 'compute',
    };
  }

  if (SET_BASED_CLASSES.has(writeSpec.write_discipline.class)) {
    const assignments = stepColumns.map((c) => `${c.name} = ${sqlLiteral(c.set_value)}`).join(', ');
    const guardClause = writeSpec.write_discipline.guard === 'is_distinct_from' && guardColumns.length > 0
      ? guardColumns.map((c) => {
        const col = stepColumns.find((sc) => sc.name === c);
        return `${c} IS DISTINCT FROM ${col ? sqlLiteral(col.set_value) : 'NULL'}`;
      }).join(' OR ')
      : null;
    const whereParts = [scope, guardClause ? `(${guardClause})` : null].filter(Boolean);
    return {
      table,
      keys,
      srid,
      mechanic: writeSpec.write_discipline.class,
      step_columns: stepColumnNames,
      update_columns: stepColumnNames,
      guard_columns: guardColumns,
      geometry_columns: geometryColumns,
      key_sql_type: keyType,
      scope,
      retract,
      retract_when: retractWhen,
      clear_sql: `UPDATE ${table} SET ${assignments}${whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : ''};`,
    };
  }

  // ── set_based_join_update (LG-11, MATCHER pilot 2026-08-28) — DESCRIPTIVE ONLY.
  // No statement is generated here: the SET clause's right-hand sides are per-row
  // values produced by a JOIN against a compute-authored `matched` CTE (buildTierSql,
  // ruling A-2 option 2 — the same split link_massing's `buildMatchSql` established for
  // the domain join). What the descriptor still buys, even with no generated SQL: the
  // declared columns/guard/scope are what the fence-lock detectors and the conformance
  // suite check the compute's AUTHORED text against, and `buildWritePlan`'s callers
  // (write.assertWritePrivileges, the RLS preflight) still work off `table`/`keys` alone.
  if (writeSpec.write_discipline.class === JOIN_UPDATE_CLASS) {
    return {
      table,
      keys,
      srid,
      mechanic: JOIN_UPDATE_CLASS,
      step_columns: stepColumnNames,
      update_columns: updateColumns,
      guard_columns: guardColumns,
      insert_only_columns: insertOnly,
      key_sql_type: keyType,
      scope,
      retract,
      retract_when: retractWhen,
      clear_sql: null,
      upsert_sql: null,
      delete_sql: null,
      generated_by: 'compute',
    };
  }

  // ── insert_only_no_retraction (LG-18, MATERIALIZER pilot 2026-08-29) — DESCRIPTIVE
  // ONLY. No statement is generated here: the whole INSERT...SELECT...JOIN...ON
  // CONFLICT DO NOTHING statement is authored by the compute (buildMaterializeSql),
  // exactly the same split JOIN_UPDATE_CLASS uses above. What the descriptor still
  // buys: the declared columns/scope are what the fence-lock detectors and the
  // conformance suite check the compute's AUTHORED text against, and buildWritePlan's
  // callers (write.assertWritePrivileges, the RLS preflight) still work off
  // `table`/`keys` alone.
  if (writeSpec.write_discipline.class === INSERT_ONLY_NO_RETRACT_CLASS) {
    return {
      table,
      keys,
      srid,
      mechanic: INSERT_ONLY_NO_RETRACT_CLASS,
      step_columns: stepColumnNames,
      update_columns: [],
      guard_columns: guardColumns,
      insert_only_columns: insertOnly,
      key_sql_type: keyType,
      scope,
      retract,
      retract_when: retractWhen,
      clear_sql: null,
      upsert_sql: null,
      delete_sql: null,
      generated_by: 'compute',
    };
  }

  // ── link_full_retraction (LG-24, LINK pilot 7, 2026-08-30) — DESCRIPTIVE ONLY.
  // No statement is generated here: the DELETE-by-key statement (the superseded-row
  // cleanup half of Spec 122 §1.4's frozen class F — "upsert + DELETE stale + DELETE
  // zero-match") is authored by the compute (buildDeleteByKeySql, mirroring
  // buildTierSql's own split), the same reason JOIN_UPDATE_CLASS/
  // INSERT_ONLY_NO_RETRACT_CLASS/WRITE_ONCE_BACKFILL_CLASS went descriptive-only
  // above. Class F was already a frozen enum member (Spec 122 §1.4/§8.2's own table
  // names `link_parcels` and `link_massing` under it) but had NO executor before this
  // pilot (Fold A B-1, 2026-08-30) — `link_massing` never actually used the enum's own
  // upsert+DELETE-stale+DELETE-zero-match mechanic; it uses `set_based_scoped` +
  // `guarded_upsert` via an `is_primary` flag column `permit_parcels` does not have.
  // The UPSERT HALF of class F reuses the EXISTING `guarded_upsert` codegen below
  // unmodified (a composite key `(permit_num, revision_num, parcel_id)` is already
  // generically supported by `keys.join(', ')` in the ON CONFLICT clause) — this
  // branch covers ONLY the second `outputs.writes[]` entry, the keyed DELETE of the
  // row(s) a batch's own upsert just superseded (a changed-match relink, or a
  // permit that fell out of every match this batch). What the descriptor still buys
  // for THIS entry: the declared columns/scope are what the fence-lock detectors and
  // the conformance suite check the compute's AUTHORED text against, and
  // buildWritePlan's callers (write.assertWritePrivileges, the RLS preflight) still
  // work off `table`/`keys` alone.
  if (writeSpec.write_discipline.class === LINK_FULL_RETRACTION_CLASS) {
    return {
      table,
      keys,
      srid,
      mechanic: LINK_FULL_RETRACTION_CLASS,
      step_columns: stepColumnNames,
      update_columns: [],
      guard_columns: guardColumns,
      insert_only_columns: insertOnly,
      key_sql_type: keyType,
      scope,
      retract,
      retract_when: retractWhen,
      clear_sql: null,
      upsert_sql: null,
      delete_sql: null,
      generated_by: 'compute',
    };
  }

  // ── guarded_upsert with set_source:"compute" (LG-27, RECORDER pilot 8,
  // 2026-08-31) — DESCRIPTIVE ONLY. No statement is generated here: the whole
  // INSERT...ON CONFLICT...DO UPDATE statement (including the CURRENT_DATE-literal
  // key value) is authored by the compute (buildWriteSql), the same split
  // JOIN_UPDATE_CLASS/INSERT_ONLY_NO_RETRACT_CLASS/WRITE_ONCE_BACKFILL_CLASS use
  // above. Checked BEFORE the default (unnamed) codegen path below, which would
  // otherwise match "guarded_upsert" and bind the key as a parameter + always
  // append an IS DISTINCT FROM guard — wrong on both counts for this target.
  if (writeSpec.write_discipline.class === GUARDED_UPSERT_COMPUTE_CLASS && writeSpec.write_discipline.set_source === 'compute') {
    // batch-2 Phase 3 prerequisite 0k (2026-09-24) — the INGESTOR arm of the
    // `set_source:"compute"` mechanism the RECORDER pilot already uses (LG-27). This
    // branch stays DESCRIPTIVE-ONLY (`upsert_sql: null`, no `upsertSqlFor`/`bindRow`):
    // the compute authors the whole INSERT...ON CONFLICT...DO UPDATE...WHERE text via
    // `buildWriteSql`, which the ingest runner calls and attaches to the plan. What it
    // ADDS over the RECORDER shape is the vocabulary `runIngestPhase` needs to call
    // `compute.buildWriteSql({ table, columns, keys, geometry_column, geometry_kind })`
    // and to keep `validateGeometries` + `executeWrite` untouched: `geometry_columns`,
    // `geometry_kind` and `columnsPerRow` (the bind-parameter stride `executeWrite`
    // reads to size its batches), plus `set_source` so a plan-shape summary names the
    // SQL source honestly rather than inferring it from `generated_by` alone.
    return {
      table,
      keys,
      srid,
      mechanic: GUARDED_UPSERT_COMPUTE_CLASS,
      set_source: 'compute',
      step_columns: stepColumnNames,
      update_columns: updateColumns,
      guard_columns: guardColumns,
      insert_only_columns: insertOnly,
      // The columns bound as WKB (ingest's contract with `validateGeometries`, which
      // reads `plan.geometry_columns[0]` and re-keys its output under that name). Carried
      // on the compute branch exactly as the default codegen carries it.
      geometry_columns: geometryColumns,
      // The DECLARED geometry family, so the runner can hand it to `buildWriteSql` (the
      // compute authors a kind-specific validator/SQL only when it needs to) without
      // re-parsing anything. `null` for a compute target that binds no geometry.
      geometry_kind: geometryKind,
      key_sql_type: keyType,
      scope,
      retract,
      retract_when: retractWhen,
      clear_sql: null,
      upsert_sql: null,
      delete_sql: null,
      // The INSERT/bind stride the compute-authored multi-row statement uses, so
      // `executeWrite`'s `pipeline.maxRowsPerInsert(plan.columnsPerRow)` batching is
      // identical to the default-codegen path (the compute must lay out `$n` placeholders
      // in this same column order — its half of the contract).
      columnsPerRow: stepColumns.length,
      generated_by: 'compute',
    };
  }

  // ── write_once_backfill (LG-20, BACKFILL pilot 6, 2026-08-29) — DESCRIPTIVE
  // ONLY. No statement is generated here: the whole conditional UPDATE...WHERE
  // <scope> statement is authored by the compute (buildBackfillSql), the same
  // split JOIN_UPDATE_CLASS/INSERT_ONLY_NO_RETRACT_CLASS use above. What the
  // descriptor still buys: the declared columns/scope are what the fence-lock
  // detectors and the conformance suite check the compute's AUTHORED text
  // against, and buildWritePlan's callers (write.assertWritePrivileges, the RLS
  // preflight) still work off `table`/`keys` alone.
  if (writeSpec.write_discipline.class === WRITE_ONCE_BACKFILL_CLASS) {
    return {
      table,
      keys,
      srid,
      mechanic: WRITE_ONCE_BACKFILL_CLASS,
      step_columns: stepColumnNames,
      update_columns: updateColumns,
      guard_columns: guardColumns,
      insert_only_columns: insertOnly,
      key_sql_type: keyType,
      scope,
      retract,
      retract_when: retractWhen,
      clear_sql: null,
      upsert_sql: null,
      delete_sql: null,
      generated_by: 'compute',
    };
  }

  const bindFor = (col, ordinal) => (col.bind === 'wkb_geometry'
    ? `ST_GeomFromWKB($${ordinal}, ${srid})`
    : `$${ordinal}`);

  /** One `($1, ST_GeomFromWKB($2, <guards.srid>), $3, $4)` group; `offset` is the running bind index. */
  // ST_GeomFromWKB preserves the WKB's own geometry type (Point stays Point, MultiPolygon
  // stays MultiPolygon), so the INSERT/bind path needs no geometry_kind branch — the
  // declared kind only selects the VALIDATOR's repair/accept arm in `validation_sql` above.
  const valuesGroup = (offset) => `(${stepColumns.map((c, i) => bindFor(c, offset + i)).join(', ')})`;

  // ── columns[].on_empty:"preserve"|"preserve_null" (prerequisite 0m + 0m follow-on,
  // 2026-09-24) ───────────────────────────────────────────────────────────────────
  // A per-column lookup, read once. Absent for every column (the overwhelming
  // majority of targets today) keeps `columnSetExpr`/`columnGuardExpr` byte-identical
  // to the pre-0m text — no map entries, both functions fall straight to their `else`.
  const onEmptyMode = new Map(
    writeSpec.columns
      .filter((c) => c.on_empty === 'preserve' || c.on_empty === 'preserve_null')
      .map((c) => [c.name, c.on_empty]),
  );
  /**
   * `col = EXCLUDED.col`, or the empty/NULL-preserving form for a declared column.
   * Mirrors scripts/load-parcels.js's own forms BYTE-FOR-BYTE, rather than an
   * algebraically-equivalent rewrite: T5/T7 (step-library.logic.test.ts) pin the
   * codegen's reproduction of the legacy statement against the legacy FILE TEXT, and
   * only these exact shapes reproduce it.
   */
  const columnSetExpr = (c) => {
    if (onEmptyMode.get(c) === 'preserve_null') {
      return `${c} = COALESCE(EXCLUDED.${c}, ${table}.${c})`;
    }
    if (onEmptyMode.get(c) === 'preserve') {
      return `${c} = COALESCE(NULLIF(EXCLUDED.${c}, ''), ${table}.${c})`;
    }
    return `${c} = EXCLUDED.${c}`;
  };
  const columnGuardExpr = (c) => {
    if (onEmptyMode.get(c) === 'preserve_null') {
      return `(EXCLUDED.${c} IS NOT NULL AND ${table}.${c} IS DISTINCT FROM EXCLUDED.${c})`;
    }
    if (onEmptyMode.get(c) === 'preserve') {
      return `(NULLIF(EXCLUDED.${c}, '') IS NOT NULL AND ${table}.${c} IS DISTINCT FROM EXCLUDED.${c})`;
    }
    return `${table}.${c} IS DISTINCT FROM EXCLUDED.${c}`;
  };

  // ── outputs.invalidates[].set_null_on_change_of (prerequisite 0l, 2026-09-24) ──
  // EXECUTED, unlike the base {table,column,when} entry: for every invalidates entry
  // naming THIS write target's table, append a lineage-stamp CASE arm. Validated by
  // scripts/lib/step/validate.js (an entry's table must equal a declared write target's
  // table); filtered here too so a caller that built a plan without validateDescriptor
  // (a unit test, e.g.) never renders a CASE arm for a foreign table's entry.
  const invalidatesHere = (descriptor.outputs && Array.isArray(descriptor.outputs.invalidates)
    ? descriptor.outputs.invalidates : [])
    .filter((e) => e.table === table && e.set_null_on_change_of);
  // A `wkb_geometry`-bound watched column is a REAL PostGIS geometry value and cannot
  // cast to jsonb; every other bind (the default "value" — the shape the founding case's
  // GeoJSON-text `geometry` column uses) is compared STRUCTURALLY via `::jsonb`, exactly
  // as load-parcels.js's own DEC-FENCE2 (#418) arms do — two syntactically different but
  // semantically identical JSON strings must not re-trigger the invalidation.
  const watchedCastsToJsonb = (name) => {
    const col = writeSpec.columns.find((c) => c.name === name);
    return !(col && col.bind === 'wkb_geometry');
  };
  const changeOfComparison = (watched) => (watchedCastsToJsonb(watched)
    ? `${table}.${watched}::jsonb IS DISTINCT FROM EXCLUDED.${watched}::jsonb`
    : `${table}.${watched} IS DISTINCT FROM EXCLUDED.${watched}`);
  const invalidatesSetArms = invalidatesHere.map(
    (e) => `${e.column} = CASE WHEN ${changeOfComparison(e.set_null_on_change_of)} THEN NULL ELSE ${table}.${e.column} END`,
  );
  // A watched column must be LIVE in the change-detection guard for its own CASE arm to
  // ever run on a conflict — folded in here, deduplicated against the declared
  // `guard_columns` (never double-clause a column declared both ways), placed FIRST
  // (the founding case's own WHERE clause opens on `geometry`, the watched column, ahead
  // of every explicitly declared guard column).
  const changeOfGuardColumns = [...new Set(invalidatesHere.map((e) => e.set_null_on_change_of))]
    .filter((w) => !guardColumns.includes(w));

  const head = `INSERT INTO ${table} (${stepColumnNames.join(', ')})\nVALUES `;
  const tail = `\nON CONFLICT (${keys.join(', ')}) DO UPDATE SET `
    + `${[...updateColumns.map(columnSetExpr), ...invalidatesSetArms].join(', ')}\n`
    + `  WHERE ${[...changeOfGuardColumns.map(changeOfComparison), ...guardColumns.map(columnGuardExpr)].join('\n     OR ')}\n`
    + (defaulted.length > 0
      ? `-- declared but never written by this step (DB default): ${defaulted.map((c) => c.name).join(', ')}\n`
      : '')
    + (insertOnly.length > 0
      // The 0j exclusion, rendered INTO the statement so a reader of the SQL — or a
      // diff of it — sees WHY the column is missing from the SET above. Never a silent
      // absence: `footprint_area_*` vanishing from a reload's UPDATE SET is exactly the
      // shape that must be visible (Spec 122 §5.1, measurement 2026-09-24).
      ? `-- seeded on INSERT, never rewritten by the conflict UPDATE (DB-recomputed): ${insertOnly.join(', ')}\n`
      : '')
    + `RETURNING (xmax = 0) AS is_insert;`;

  return {
    table,
    keys,
    srid,
    mechanic: writeSpec.write_discipline.class,
    scope,
    retract,
    retract_when: retractWhen,
    step_columns: stepColumnNames,
    update_columns: updateColumns,
    guard_columns: guardColumns,
    // The DECLARED `insert_only` columns (prerequisite 0j): in the INSERT list and
    // `bindRow`, EXCLUDED from `update_columns` and `guard_columns`. Carried explicitly
    // so a reader (or a plan-shape summary) sees the exclusion as a DECLARED set rather
    // than having to subtract two lists — `step_columns` minus `update_columns` is not a
    // usable signal, because the key sits in the first and not the second.
    insert_only_columns: insertOnly,
    // The DECLARED `on_empty:"preserve"|"preserve_null"` columns (prerequisite 0m +
    // follow-on) — a plan-shape summary sees the empty/NULL-preserving set directly
    // rather than re-reading `columns[]`. Names only; the mode (preserve vs
    // preserve_null) is recoverable from the descriptor's own `columns[].on_empty`.
    on_empty_columns: [...onEmptyMode.keys()],
    // The DECLARED `invalidates[].set_null_on_change_of` entries EXECUTED against this
    // write target (prerequisite 0l) — {column, watched} pairs, in declaration order, so
    // a plan-shape summary (write_inventory) can list which stamps this UPDATE may null
    // and which column change fires each one, without re-deriving it from the SQL text.
    invalidated_on_change: invalidatesHere.map((e) => ({ column: e.column, watched: e.set_null_on_change_of })),
    // The columns bound as WKB. The validation phase writes its output under THESE
    // names, so the row objects it produces are already keyed the way `bindRow`
    // reads them — the alternative is a hand-maintained rename between two phases,
    // which is a NOT NULL violation waiting for the first forced reload.
    geometry_columns: geometryColumns,
    // The DECLARED geometry family (polygon|point|line, Spec 124 Rule 1). Threaded into
    // validateGeometries via validation_sql AND carried on the plan so an executor can
    // read it without re-parsing the SQL. `null` on a non-validating plan (a LINK/CASCADE
    // target binds geometry from a server-side SELECT and never runs the validator).
    geometry_kind: geometryKind,
    // The DECLARED source SRID (prerequisite 0i). Threaded into `validation_sql` AND carried
    // on the plan so an executor/log can read it without re-parsing the SQL. `null` means
    // "the source is 4326 / no transform" — the case for every converted step today.
    geometry_srid: geometrySrid,
    // Templated from the DECLARED key type, so the cast that reads the key array agrees
    // with the cast in `delete_sql` below instead of hard-coding a second opinion.
    //
    // ⚠️ ONLY BUILT WHEN A KIND IS DECLARED. `geometryValidationSql` asserts by name (it is
    // the SQL whose arm the kind selects), so a plan with a `wkb_geometry` bind and NO kind
    // carries `validation_sql: null` HERE and the missing kind is diagnosed by
    // `validateGeometries` — the one caller that can reach it. LINK/CASCADE plans build and
    // execute with no validator SQL at all, exactly as they did before this field existed.
    validation_sql: geometryKind === null ? null : geometryValidationSql(keyType, geometryKind, geometrySrid),
    key_sql_type: keyType,
    // The single-row form: what the batched statement looks like at rowCount 1.
    upsert_sql: head + valuesGroup(1) + tail,
    // TWO retraction shapes, selected by the DECLARED axis and never by the class name
    // (V7). `departed` is class B's scoped departure DELETE — every key the source no
    // longer carries. `all` is the LINK's mass retraction — every row this run will
    // rebuild, bounded by `write_discipline.scope`, and fired only when `retract_when`
    // says so (`full_only` ⇒ only in full mode). `none` generates no statement at all,
    // rather than a statement the runner remembers not to call.
    delete_sql: retract === 'departed'
      ? `DELETE FROM ${table} WHERE ${keys[0]} <> ALL($1::${keyType}[]);`
      : (retract === 'all' ? `DELETE FROM ${table} WHERE ${scope};` : null),
    // Not a string, so it is never mistaken for a statement: the batched builder.
    upsertSqlFor: (rowCount) => head
      + Array.from({ length: rowCount }, (_, r) => valuesGroup(1 + r * stepColumns.length)).join(', ')
      + tail,
    columnsPerRow: stepColumns.length,
    bindRow: (row) => stepColumns.map((c) => row[c.name]),
  };
}

/** Alias kept because the frozen shape's reviewers grep for a `generate*` name. */
const generateWriteSql = buildWritePlan;

/**
 * The `rls_bypass_or_policy` preflight. Returns the measured privilege per table so
 * the compute can report it as an audit row even on the happy path — a check that
 * only exists in the failure branch is a check nobody sees working.
 */
async function assertWritePrivileges(pool, descriptor, { log, tag }) {
  const requires = (descriptor.guards && descriptor.guards.requires) || [];
  const subjects = requires.filter((r) => r.kind === 'rls_bypass_or_policy');
  const measured = {};
  for (const r of subjects) {
    const { rows } = await pool.query(RLS_PROBE_SQL, [r.name]);
    const row = rows[0] || { rls_enabled: false, policies: 0, bypassrls: false };
    const state = {
      rls_enabled: row.rls_enabled === true,
      policies: Number(row.policies || 0),
      bypassrls: row.bypassrls === true,
    };
    measured[r.name] = state;
    const writable = !state.rls_enabled || state.bypassrls || state.policies > 0;
    if (!writable && r.on_missing === 'fail') {
      throw new Error(
        `[${tag}] ${r.name}: row-level security is ENABLED with ${state.policies} policies and the current role `
        + 'does not bypass RLS — every UPSERT and DELETE would affect 0 rows with no error, which is '
        + 'indistinguishable from an unchanged source. Refusing before the write (guards.requires rls_bypass_or_policy).',
      );
    }
    if (!writable) log.warn(tag, `${r.name}: not writable under RLS and on_missing is "${r.on_missing}"`);
  }
  return measured;
}

/**
 * Run the declared geometry validation over the parsed features and split them into
 * the carried rows and the counters the audit table reports.
 *
 * The repair/accept arm is selected by the plan's DECLARED `geometry_kind`
 * (`plan.geometry_kind`, from `outputs.writes[].geometry_kind` via `buildWritePlan`,
 * threaded into `plan.validation_sql` — Spec 124 Rule 1, Spec 122 §5.1). This function
 * reads no payload to decide it.
 *
 * @param {(status: string, isValidOriginal: boolean) => object} classify - the
 *   step's own pure status→counter classifier, handed in so this file stays domain-free.
 */
async function validateGeometries(pool, plan, features, classify, { log, tag }) {
  const keyColumn = plan.keys[0];
  const geomColumn = plan.geometry_columns[0];
  if (!geomColumn) throw new Error(`[${tag}] ${plan.table}: no column declares bind "wkb_geometry", so the validated geometry has nowhere to land`);
  // The NAMED runtime backstop (Spec 124 Rule 1, Spec 122 §5.1, batch-2 row 3.1 c0e). The
  // ingest path is the ONLY caller whose SQL text is selected by the kind, so this is where
  // an absent kind must stop rather than silently defaulting to the polygon arm. `buildWritePlan`
  // deliberately does NOT throw — a LINK/CASCADE plan binds geometry and never gets here.
  assertGeometryKind(plan.geometry_kind, plan.table);
  // The plan's DECLARED source SRID (prerequisite 0i). `validation_sql` was already built
  // with it (or without it, when absent/4326) — this re-assert is the validator's own
  // backstop for a plan whose SQL was built by a caller that bypassed `buildWritePlan`,
  // so a bad value stops here by name rather than being interpolated.
  if (plan.geometry_srid != null && (!Number.isInteger(plan.geometry_srid) || plan.geometry_srid < 1)) {
    throw new InvalidGeometrySridError(plan.geometry_srid);
  }
  const keysIn = features.map((f) => f[keyColumn]);
  const geojsons = features.map((f) => f.geojson);
  const { rows } = await pool.query(plan.validation_sql, [keysIn, geojsons]);
  // ⚠️ BOTH SIDES GO THROUGH ONE `String()` NORMALIZER (WF3, 2026-09-24). This is the
  // key-type-agnostic canonical form for INTEGER / BIGINT / TEXT and it deliberately does
  // NOT branch on `plan.key_sql_type`: node-pg's defaults (this repo installs no
  // `setTypeParser`) hand back `int4` as a NUMBER, `int8` as a STRING and `text` as a
  // STRING, while the feature key is whatever the compute's `coerceKey` produced. The
  // previous `Number(…)`-keyed map matched only when `coerceKey` returned a NUMBER
  // (address_points INTEGER, load_ravines BIGINT — the latter by coincidence of its
  // coerceKey, not by contract). Measured on `parcels` (declares `key_sql_type: "TEXT"`,
  // coerceKey returns a string; every parcel_id is a clean digit string): the map held
  // numbers, the lookups were strings, SameValueZero never matched, all 495,495 lookups
  // missed, every row was counted `skipped`, ZERO rows were written, verdict PASS.
  const byKey = new Map(rows.map((r) => [String(r.source_key), r]));
  let repaired = 0;
  let collectionExtracted = 0;
  let skipped = 0;
  const carried = [];
  const skippedKeys = [];
  const missedKeys = [];
  for (const f of features) {
    const v = byKey.get(String(f[keyColumn]));
    if (!v) {
      // unnest WITH ORDINALITY returns a row per input key; a miss is anomalous. It is
      // NOT data and it is NOT a skip: collecting it into the counts below would let a
      // validator that returned nothing at all still report PASS (Spec 122 §11).
      missedKeys.push(f[keyColumn]);
      continue;
    }
    const d = classify(v.status, v.is_valid_original);
    repaired += d.repaired;
    collectionExtracted += d.collectionExtracted;
    skipped += d.skipped;
    // Carry EVERY shaped field of the feature, not just key + geom — a multi-column INGESTOR
    // (address_points: 16 columns, measured 2026-09-23 "null value in column latitude") binds them
    // through columnValues(row); the key and geom columns win on collision. Byte-identical for a
    // key+geom-only feature (load_ravines).
    if (d.carry) carried.push({ ...f, [keyColumn]: f[keyColumn], [geomColumn]: v.geom_wkb });
    else skippedKeys.push(f[keyColumn]);
  }
  // AFTER the loop, and BEFORE the caller's `executeWrite`: a miss means the validator
  // did not answer for a key it was handed, so nothing about this batch's geometry is
  // known and nothing may be written. Count + FIRST key only (Spec 124 Rule 3).
  if (missedKeys.length > 0) {
    throw new ValidationKeyMissError(plan.table, missedKeys.length, missedKeys[0]);
  }
  return { carried, repaired, collectionExtracted, skipped, skippedKeys };
}

/**
 * Execute a declared write — class A (`guarded_upsert`) or class B
 * (`upsert_scoped_departure_delete`) — in ONE transaction
 * (`write_discipline.txn_scope: "step"`).
 *
 * The retraction half is gated on `plan.delete_sql`, the SAME premise
 * `retractionFires` reads: a class-A plan (`retract: "none"`) carries
 * `delete_sql: null`, so there is nothing to retract and the runner must not
 * issue `client.query(null, …)`. The gate lives HERE, on the runner, and not in
 * the caller's `shouldSkipDelete` — a per-caller predicate that returned true for
 * class A would be a per-step escape hatch (Spec 122 §5.1) rather than a
 * property of the declared write class (Spec 122 §1.4).
 *
 * @returns {Promise<object>} the `ctx.written` block — the counters every
 *   write-discipline check reads, including `rows_scanned` / `rows_changed`.
 */
async function executeWrite(pool, {
  plan, writeSpec, carried, columnValues, shouldSkipDelete, log, tag,
}) {
  const keyColumn = plan.keys[0];
  const loadedKeys = carried.map((r) => r[keyColumn]);
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  let deleteSkippedEmptyGuard = false;

  const batchSize = pipeline.maxRowsPerInsert(plan.columnsPerRow);
  await pipeline.withTransaction(pool, async (client) => {
    for (let i = 0; i < carried.length; i += batchSize) {
      const slice = carried.slice(i, i + batchSize);
      const values = [];
      for (const row of slice) values.push(...plan.bindRow(columnValues(row)));
      const result = await client.query(plan.upsertSqlFor(slice.length), values);
      const ins = result.rows.filter((r) => r.is_insert).length;
      inserted += ins;
      updated += result.rows.length - ins;
    }
    // Three-way gate. ARM 1 — class A (`retract: "none"`): the plan carries NO
    // `delete_sql`, so there is nothing to retract: no statement, no warn, and
    // `deleted` stays 0. `<> ALL('{}')`-style bugs cannot reach here because there
    // is no statement to bind. Before this arm the ingest runner reached
    // `client.query(null, [keys])` on every non-empty class-A run.
    // ARM 2 — the empty-set guard, because `<> ALL('{}')` matches every row and
    // would retract the entire table on an empty parse.
    // ARM 3 — retract: departed — the scoped departure DELETE.
    if (!plan.delete_sql) {
      // Class A: no retraction declared. Nothing to do — deliberately silent: a
      // warn here would fire on every clean class-A run and drown the guard's.
    } else if (shouldSkipDelete(loadedKeys)) {
      deleteSkippedEmptyGuard = true;
      log.warn(tag, 'empty-set guard: the scoped departure DELETE was suppressed');
    } else {
      const del = await client.query(plan.delete_sql, [loadedKeys]);
      deleted = del.rowCount || 0;
    }
  });

  const rowsScanned = carried.length;
  const rowsChanged = inserted + updated;
  return {
    inserted,
    updated,
    deleted,
    rows_scanned: rowsScanned,
    rows_changed: rowsChanged,
    // `expected_change_ratio` is MEASURED here and CHECKED by a declared check, so
    // `idempotent_rerun: "zero_writes"` is a number in the audit table rather than a
    // claim: re-run an unchanged source and this must read 0.
    change_ratio: rowsScanned > 0 ? rowsChanged / rowsScanned : 0,
    expected_change_ratio: writeSpec.write_discipline.expected_change_ratio,
    idempotent_rerun: writeSpec.write_discipline.idempotent_rerun,
    delete_skipped_empty_guard: deleteSkippedEmptyGuard,
  };
}

/**
 * THE ORDERED MULTI-TARGET EXECUTORS (LG-3, LINK pilot).
 *
 * `runIngestPhase` refused more than one write target BY NAME because every line of it
 * indexed `writes[0]` — a second declared target would have been acquired for, gated
 * over and then NEVER WRITTEN, i.e. a table in `outputs.writes` and in PIPELINE_META,
 * silently empty, under a green verdict. A LINK writes TWO disciplines to ONE table in
 * a REQUIRED order (B-7/B-8: retract, then clear the primaries, then upsert), so the
 * loop had to exist. These three primitives are what the ordered loop calls; each is
 * one statement, takes a client so the caller owns the transaction boundary, and
 * returns the counters that become `written.e<N>`.
 */

/**
 * R-M / LG-17 (2026-08-28) — the SELECT mirror of a destructive retraction's scope, so
 * the rows about to be retracted can be read (and archived) BEFORE the retraction
 * statement fires. `plan.scope` is the SAME predicate string `clear_sql`/`delete_sql`
 * bind — for `set_based_null_retract` the columns to carry are `plan.step_columns`
 * (the columns the retraction nulls); for a `retract:"all"` DELETE the whole row is
 * removed, so the step-declared columns are the generic, declared-domain stand-in for
 * "the columns it nulls/deletes" (never the full physical row — geometry/defaulted
 * columns are not this step's write contract). Returns `null` when there is no scope
 * to mirror generically (e.g. a future `retract:"departed"` target, keyed by an array
 * of surviving ids rather than a WHERE predicate) — a declared limitation, not silently
 * skipped: the caller decides what "before_image: none" means for that shape.
 */
function buildBeforeImageSelectSql(plan) {
  if (!plan.scope) return null;
  const columns = [...new Set([...(plan.keys || []), ...(plan.step_columns || [])])];
  return { sql: `SELECT ${columns.join(', ')} FROM ${plan.table} WHERE ${plan.scope}`, columns };
}

/**
 * R-M / LG-17 — writes the rows a destructive retraction is ABOUT TO remove/null to a
 * dated JSONL file, INSIDE the same run, BEFORE the retraction statement: "a
 * destructive repair with no row-level before-image cannot be audited." The read is a
 * plain SELECT (safe to run on `client` inside the same transaction as the retraction
 * that follows, or on `pool` standalone) and the params are the SAME ones the
 * retraction itself binds (there is exactly one scope, read twice).
 *
 * ⚠️ FAIL LOUD, ON PURPOSE. Neither `fs.mkdirSync` nor `fs.writeFileSync` is wrapped in
 * a try/catch here — a write failure (disk full, permissions, a missing repo checkout)
 * must abort the run BEFORE the retraction executes, never silently skip the audit
 * trail and retract anyway. The caller is required to call this BEFORE the retraction
 * executor, in strict sequence, so an uncaught throw here naturally prevents it.
 *
 * @param {import('pg').PoolClient|import('pg').Pool} client
 * @param {object} plan - a write plan (buildWritePlan) whose retraction is about to fire
 * @param {unknown[]} scopeParams - the exact params the retraction statement itself binds
 * @param {string} slug - descriptor.identity.name
 * @param {Date} runAt - Spec 47 §R3.5 DB clock, the SAME capture the retraction uses
 * @returns {Promise<{written: false}|{written: true, path: string, rows: number}>}
 */
async function writeBeforeImage(client, plan, scopeParams, slug, runAt) {
  const select = buildBeforeImageSelectSql(plan);
  if (!select) return { written: false };
  const { rows } = await client.query(select.sql, scopeParams || []);
  return persistBeforeImageRows(rows, plan.table, slug, runAt);
}

/**
 * LG-22 (BACKFILL pilot 6 follow-on WF3, CC-D3, 2026-08-30) — the FILE-WRITING HALF
 * of R-M/LG-17's before-image mechanism, factored out of `writeBeforeImage` so a
 * caller whose SELECT is NOT `plan.scope`-shaped (a compute-authored guard predicate
 * over a server-side expression, e.g. `centroid_lat IS DISTINCT FROM
 * ST_Y(ST_Centroid(geom))`, which `buildBeforeImageSelectSql` cannot express — it only
 * knows the declared `write_discipline.scope` string) can still persist the SAME
 * dated-JSONL artifact `writeBeforeImage` writes, byte-for-byte. `writeBeforeImage`
 * now calls this directly; behaviour for every EXISTING caller (a destructive
 * retraction's own before-image) is unchanged.
 *
 * ⚠️ FAIL LOUD, ON PURPOSE — same contract as `writeBeforeImage` (mkdir/write are not
 * wrapped in a try/catch): the caller must persist this BEFORE issuing the write it
 * protects, so an uncaught throw here naturally prevents that write from ever running.
 *
 * @param {Record<string, unknown>[]} rows - already-fetched rows, one object per row
 * @param {string} table
 * @param {string} slug - descriptor.identity.name
 * @param {Date} runAt - Spec 47 §R3.5 DB clock, the SAME capture the protected write uses
 * @returns {{written: true, path: string, rows: number}}
 */
function persistBeforeImageRows(rows, table, slug, runAt) {
  const repoRoot = path.join(__dirname, '..', '..', '..');
  const dir = path.join(repoRoot, 'docs', 'reports', 'golden', slug, 'before-image');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = runAt.toISOString().replace(/:/g, '-');
  const filePath = path.join(dir, `${stamp}-${table}.jsonl`);
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length > 0 ? '\n' : '');
  // Fold B item 5 (LINK pilot 7, LG-24) — ONE per-run file per target; a MULTI-BATCH
  // caller (LG-24's own keyed-delete before-image, called once per batch inside the
  // SAME run) APPENDS into it rather than overwriting the prior batch's rows.
  // `appendFileSync` creates the file on its FIRST call within a run (identical to
  // `writeFileSync` for every EXISTING single-shot caller — a destructive retraction's
  // W1 before-image, called exactly once per run, so append-vs-overwrite is behaviourally
  // identical there) and appends on every subsequent call inside the same run (the
  // filename is keyed by `runAt`, one DB-clock capture per run, so a NEW run never
  // collides with a stale file from a PRIOR run).
  fs.appendFileSync(filePath, body, 'utf8');
  return { written: true, path: path.relative(repoRoot, filePath).replace(/\\/g, '/'), rows: rows.length };
}

/** `set_based_scoped` — the declared constants over the declared scope. Returns rows touched. */
async function executeSetBasedClear(client, plan, scopeParams) {
  const result = await client.query(plan.clear_sql, scopeParams || []);
  return result.rowCount || 0;
}

/**
 * ONE batched guarded upsert. `rows` are already ordered by the caller.
 *
 * `RETURNING (xmax = 0)` is what separates an INSERT from an UPDATE — the same
 * mechanism class B uses — so `records_new` becomes a MEASUREMENT rather than the
 * hardcoded literal a `rowCount` from a guarded upsert can never distinguish (D-8).
 */
async function executeUpsertBatch(client, plan, rows) {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const values = [];
  for (const row of rows) values.push(...plan.bindRow(row));
  const result = await client.query(plan.upsertSqlFor(rows.length), values);
  const inserted = result.rows.filter((r) => r.is_insert).length;
  return { inserted, updated: result.rows.length - inserted };
}

/** `retract: "all"` — the scoped mass retraction, fired only when `retract_when` allows it. */
async function executeRetraction(client, plan) {
  const result = await client.query(plan.delete_sql);
  return result.rowCount || 0;
}

/** SQL text a `set_based_join_update` target must never contain (LG-11's structural half). */
const JOIN_UPDATE_FORBIDDEN_RE = /\bINSERT\s+INTO\b|\bON\s+CONFLICT\b/i;

/**
 * LG-11 (MATCHER pilot 2026-08-28) — execute one `set_based_join_update` statement.
 *
 * ⚠️ THE ONE PLACE "INSERT STRUCTURALLY FORBIDDEN" IS ENFORCED, not merely declared.
 * `sql` is authored by the COMPUTE (`buildTierSql`, ruling A-2 option 2) — the whole
 * reason this executor exists is that `wsib_registry` rows may only ever be CREATED by
 * `load-wsib.js`, and an accidental `executeUpsertBatch`-generated INSERT would violate
 * that ownership boundary worse than a missed match. `executeUpsertBatch` is always
 * INSERT-capable by construction (`ON CONFLICT ... DO UPDATE`); this executor refuses to
 * run any statement that could ever create a row, checked on the ACTUAL text about to
 * run — not on a class label a descriptor could misdeclare.
 *
 * @param {import('pg').ClientBase} client
 * @param {string} sql - a complete `UPDATE ... FROM (...) m WHERE ...` statement
 * @param {unknown[]} [params]
 * @returns {Promise<number>} rows changed
 */
async function executeSetBasedJoinUpdate(client, sql, params) {
  if (JOIN_UPDATE_FORBIDDEN_RE.test(sql)) {
    throw new Error(
      `[write.js] executeSetBasedJoinUpdate (set_based_join_update / LG-11): the statement contains INSERT INTO `
      + 'or ON CONFLICT, which this executor structurally refuses — a set_based_join_update target may never '
      + `create a row. Statement: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  const result = await client.query(sql, params || []);
  return result.rowCount || 0;
}

/** SQL text an `insert_only_no_retraction` target must never contain (LG-18's structural half — mirrors LG-11's JOIN_UPDATE_FORBIDDEN_RE). */
const INSERT_ONLY_FORBIDDEN_RE = /\bUPDATE\b|\bDELETE\b/i;

/**
 * LG-18 (MATERIALIZER pilot 2026-08-29) — execute one `insert_only_no_retraction`
 * statement: a single server-side `INSERT INTO ... SELECT ... JOIN ... ON CONFLICT (...)
 * DO NOTHING`, no per-row VALUES insert and no retraction.
 *
 * ⚠️ THE ONE PLACE "NEVER TOUCHES AN EXISTING ROW" IS ENFORCED, not merely declared.
 * `sql` is authored by the COMPUTE (`buildMaterializeSql`) — a single statement, never a
 * SELECT-then-batched-INSERT split (that split would break G2's "verbatim SQL"
 * guarantee, Fold A Integration finding 3). This executor refuses to run any statement
 * that could ever UPDATE or DELETE an existing row, checked on the ACTUAL text about to
 * run — LPA-D1 pins the non-retraction as-is; a silent UPDATE/DELETE creeping into the
 * compute's generated text would fix that KNOWN-DEFECT without a ruling.
 *
 * @param {import('pg').ClientBase} client
 * @param {string} sql - a complete `INSERT INTO ... SELECT ... ON CONFLICT (...) DO NOTHING` statement
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, unknown>>} the statement's own single result row
 *   (e.g. `{new_links, max_parcel_id, parcels_in_batch}`) — the CALLER interprets the
 *   shape; this executor only enforces the structural insert-only boundary.
 */
async function executeInsertSelectNoRetract(client, sql, params) {
  if (INSERT_ONLY_FORBIDDEN_RE.test(sql)) {
    throw new Error(
      `[write.js] executeInsertSelectNoRetract (insert_only_no_retraction / LG-18): the statement contains `
      + 'an UPDATE or DELETE token, which this executor structurally refuses — an insert_only_no_retraction '
      + `target may never touch an existing row. Statement: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  if (!/INSERT\s+INTO/i.test(sql) || !/ON\s+CONFLICT/i.test(sql)) {
    throw new Error(
      '[write.js] executeInsertSelectNoRetract (insert_only_no_retraction / LG-18): the statement must be an '
      + `INSERT ... ON CONFLICT ... DO NOTHING — got: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  const result = await client.query(sql, params || []);
  return result.rows[0] || {};
}

/** SQL text a `write_once_backfill` target must never contain (LG-20's structural half — mirrors LG-11/LG-18's forbidden-token pattern). */
const BACKFILL_FORBIDDEN_RE = /\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i;

/**
 * LG-20 (BACKFILL pilot 6, 2026-08-29) — execute one `write_once_backfill`
 * statement: a single conditional `UPDATE <table> SET ... WHERE <scope>
 * [AND <key> > $1 ORDER BY <key> LIMIT $2]`.
 *
 * ⚠️ THE ONE PLACE "UPDATE-ONLY, NEVER CREATES OR REMOVES A ROW" IS ENFORCED,
 * not merely declared. `sql` is authored by the COMPUTE (`buildBackfillSql`) — a
 * single server-side statement, never a SELECT-then-per-row-UPDATE split. This
 * executor refuses to run any statement that could ever INSERT, DELETE or
 * TRUNCATE, checked on the ACTUAL text about to run — `compute_centroids`'s own
 * CC-D1 fence (the retired JS fallback's cursor-pagination fix) depended on this
 * exact shape staying a single conditional UPDATE with no client-side re-scan.
 *
 * Unlike `executeInsertSelectNoRetract` (LG-18), this executor does NOT require a
 * keyset cursor param — `compute_centroids`'s own statement is unpaginated (the
 * PostGIS fast path was always ONE statement, `txn_scope: "statement"`, no batch
 * loop); a FUTURE backfill target whose scope is too large for one statement may
 * author its own `id > $1 ORDER BY id LIMIT $2` tail and pass the params through
 * unchanged — the executor is agnostic to whether `params` is empty or a keyset
 * pair, it only enforces the token boundary.
 *
 * @param {import('pg').Pool|import('pg').ClientBase} client
 * @param {string} sql - a complete `UPDATE ... WHERE ...` statement (RETURNING optional)
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, unknown>[]>} the statement's own `RETURNING` rows
 *   (e.g. one row per updated id) — the CALLER interprets the shape; this executor
 *   only enforces the structural update-only boundary.
 */
async function executeBackfillUpdate(client, sql, params) {
  if (BACKFILL_FORBIDDEN_RE.test(sql)) {
    throw new Error(
      `[write.js] executeBackfillUpdate (write_once_backfill / LG-20): the statement contains `
      + 'an INSERT, DELETE or TRUNCATE token, which this executor structurally refuses — a '
      + `write_once_backfill target may only UPDATE existing rows. Statement: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  if (!/\bUPDATE\b/i.test(sql)) {
    throw new Error(
      '[write.js] executeBackfillUpdate (write_once_backfill / LG-20): the statement must be an '
      + `UPDATE ... WHERE ... — got: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  const result = await client.query(sql, params || []);
  return result.rows;
}

/** SQL text a compute-authored guarded UPDATE (`set_source: "compute"`, LG-22) must never contain — mirrors LG-20/LG-18/LG-11's forbidden-token pattern. */
const GUARDED_UPDATE_FORBIDDEN_RE = /\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i;

/**
 * LG-22 (BACKFILL pilot 6 follow-on WF3, CC-D3, 2026-08-30) — execute one batch of a
 * compute-authored, GUARD-SCOPED `set_based_scoped`/`set_source:"compute"` UPDATE: the
 * SET clause's right-hand sides are server-side expressions over the row itself
 * (`compute-centroids.js`'s `ST_Y(ST_Centroid(geom))`), the same reason
 * `executeBackfillUpdate` (LG-20) exists — but UNLIKE `write_once_backfill` (a
 * write-ONCE scope that never revisits an already-filled row, so a guard would be
 * vacuous), this target OVERWRITES an existing, non-NULL value under an explicit
 * `write_discipline.guard: "is_distinct_from"`. The caller MUST have persisted a
 * before-image (`persistBeforeImageRows`) of the exact rows a batch is about to touch
 * BEFORE calling this executor (R-M, generalized by this ruling from "before a
 * destructive retraction" to "before any value-overwriting guarded write" — a
 * fill-from-NULL is reversible by re-nulling; an overwrite of a REAL prior value is
 * not, so it gets the same audit trail).
 *
 * Kept as its own function rather than an alias of `executeBackfillUpdate` so a
 * future class-specific rule (e.g. requiring the WHERE clause to bind a keyset ID
 * array, which THIS executor's caller always does — `runBackfillFullRecompute` chunks
 * an already-fetched id list rather than re-deriving the guard predicate per batch,
 * so the SAME rows that were before-imaged are the exact rows this statement touches)
 * has its own home instead of overloading LG-20's docstring with a second class's
 * contract.
 *
 * @param {import('pg').Pool|import('pg').ClientBase} client
 * @param {string} sql - a complete `UPDATE ... WHERE id = ANY($1::int[])` statement (RETURNING optional)
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, unknown>[]>} the statement's own `RETURNING` rows
 */
async function executeGuardedUpdate(client, sql, params) {
  if (GUARDED_UPDATE_FORBIDDEN_RE.test(sql)) {
    throw new Error(
      `[write.js] executeGuardedUpdate (set_based_scoped/set_source:compute / LG-22): the statement contains `
      + 'an INSERT, DELETE or TRUNCATE token, which this executor structurally refuses — a guarded overwrite '
      + `target may only UPDATE existing rows. Statement: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  if (!/\bUPDATE\b/i.test(sql)) {
    throw new Error(
      '[write.js] executeGuardedUpdate (set_based_scoped/set_source:compute / LG-22): the statement must be an '
      + `UPDATE ... WHERE ... — got: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  const result = await client.query(sql, params || []);
  return result.rows;
}

/** SQL text a `link_full_retraction` keyed DELETE (LG-24) must never contain — mirrors LG-11/LG-18/LG-20/LG-22's forbidden-token pattern. */
const GUARDED_DELETE_BY_KEY_FORBIDDEN_RE = /\bINSERT\s+INTO\b|\bUPDATE\b|\bTRUNCATE\b/i;

/**
 * LG-24 (LINK pilot 7, `link_parcels`, 2026-08-30) — execute one batch's `link_full_retraction`
 * (class F) keyed DELETE: the superseded-row half of Spec 122 §1.4's own "upsert + DELETE
 * stale + DELETE zero-match" mechanic.
 *
 * `sql` is authored by the COMPUTE (`buildDeleteByKeySql`) — a single `DELETE FROM ...
 * USING (SELECT unnest(...) ...) v WHERE ...` statement, the same UNNEST-batched shape
 * `72362c44` (pre-conversion `link-parcels.js`, 2026-04-17) already used per-batch. The
 * caller MUST invoke this INSIDE THE SAME `pipeline.withTransaction` as the batch's own
 * `executeUpsertBatch` call, upsert FIRST (Fold B item 5's declared `writes[]` order) —
 * this executor does not itself open a transaction.
 *
 * ⚠️ THE ONE PLACE "DELETE-ONLY, NEVER CREATES OR MODIFIES A ROW" IS ENFORCED, not
 * merely declared — checked on the ACTUAL text about to run, mirroring LG-11/LG-18/
 * LG-20/LG-22's own structural-boundary executors.
 *
 * @param {import('pg').ClientBase} client
 * @param {string} sql - a complete `DELETE FROM ... USING (...) v WHERE ...` statement
 * @param {unknown[]} [params]
 * @returns {Promise<number>} rows deleted
 */
async function executeGuardedDeleteByKey(client, sql, params) {
  if (GUARDED_DELETE_BY_KEY_FORBIDDEN_RE.test(sql)) {
    throw new Error(
      `[write.js] executeGuardedDeleteByKey (link_full_retraction / LG-24): the statement contains `
      + 'an INSERT, UPDATE or TRUNCATE token, which this executor structurally refuses — a '
      + `link_full_retraction keyed-delete target may only DELETE rows. Statement: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  if (!/\bDELETE\s+FROM\b/i.test(sql)) {
    throw new Error(
      '[write.js] executeGuardedDeleteByKey (link_full_retraction / LG-24): the statement must be a '
      + `DELETE FROM ... — got: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  const result = await client.query(sql, params || []);
  return result.rowCount || 0;
}

/** SQL text a `guarded_upsert`/`set_source:"compute"` (LG-27) statement must never contain — mirrors LG-11/18/20/22/24's forbidden-token pattern. */
const RECORDER_UPSERT_FORBIDDEN_RE = /\bDELETE\s+FROM\b|\bTRUNCATE\b/i;

/**
 * LG-27 (RECORDER pilot 8, `refresh_snapshot`, 2026-08-31, Fold B RULING) — execute
 * one `guarded_upsert`/`set_source:"compute"` statement: a single, non-batched
 * `INSERT ... ON CONFLICT (<key>) DO UPDATE SET ...` (GAP-2's own prescribed shape).
 *
 * `sql` is authored by the COMPUTE (`buildWriteSql`) — the key column may be a
 * server-side literal (`CURRENT_DATE`), not a bound value, and `guard: "none"`
 * means no `IS DISTINCT FROM` clause is present — neither shape fits the DEFAULT
 * (unnamed) `guarded_upsert` codegen in `buildWritePlan` above, which always binds
 * the key as a parameter and always appends a guard clause. This executor enforces
 * the ONE thing a `guarded_upsert` target must NEVER do regardless of shape: DELETE
 * or TRUNCATE a row — checked on the ACTUAL text about to run, mirroring every
 * prior compute-authored executor's own structural-boundary pattern. Unlike
 * `executeBackfillUpdate`/`executeGuardedUpdate` (UPDATE-only, INSERT forbidden),
 * an upsert's whole point is that it MAY insert — so INSERT is required, not banned.
 *
 * @param {import('pg').Pool|import('pg').ClientBase} client
 * @param {string} sql - a complete `INSERT ... ON CONFLICT (...) DO UPDATE SET ...` statement (RETURNING optional)
 * @param {unknown[]} [params]
 * @returns {Promise<Record<string, unknown> | null>} the statement's own single `RETURNING` row, or null if none
 */
async function executeRecorderUpsert(client, sql, params) {
  if (RECORDER_UPSERT_FORBIDDEN_RE.test(sql)) {
    throw new Error(
      `[write.js] executeRecorderUpsert (guarded_upsert/set_source:compute / LG-27): the statement contains `
      + 'a DELETE or TRUNCATE token, which this executor structurally refuses — a '
      + `guarded_upsert target may only INSERT/UPDATE via an upsert. Statement: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  if (!/\bINSERT\s+INTO\b/i.test(sql) || !/\bON\s+CONFLICT\b[\s\S]*\bDO\s+UPDATE\b/i.test(sql)) {
    throw new Error(
      '[write.js] executeRecorderUpsert (guarded_upsert/set_source:compute / LG-27): the statement must be an '
      + `INSERT ... ON CONFLICT ... DO UPDATE — got: ${sql.slice(0, 200)}${sql.length > 200 ? '…' : ''}`,
    );
  }
  const result = await client.query(sql, params || []);
  return result.rows[0] || null;
}

/**
 * `write_discipline.class` value for LG-26 / INGESTOR prerequisite 0h (2026-09-24) — Spec
 * 122 §1.4's frozen enum letter C, "full staging replace", named for `load_centreline`
 * (Spec 62 L26) and therefore `banned_for_new` in `write-class-disposition.json` until the
 * orchestrator's own registry flip lands. Genuinely UNIMPLEMENTED before this prerequisite
 * (Fold A B-1): before `executeStagingReplace` there was no branch anywhere in
 * `scripts/lib/`, so a descriptor declaring this class fell through to the DEFAULT
 * (unnamed) codegen — a plain row-by-row guarded upsert — while the descriptor's own
 * `write_discipline.why` promised a `TEMP table → DELETE → INSERT...SELECT` replace. The
 * label was a lie the moment it was declared; that is the whole reason the registry
 * dispositions a class with no executor `banned_for_new` rather than merely unimplemented.
 */
const STAGING_FULL_REPLACE_CLASS = 'staging_full_replace';

/** SQL text a `staging_full_replace` target's staging INSERT must never contain. */
const STAGING_REPLACE_FORBIDDEN_RE = /\bON\s+CONFLICT\b|\bUPDATE\b/i;

/**
 * LG-26 / INGESTOR prerequisite 0h (2026-09-24) — the class-C `staging_full_replace`
 * executor (Spec 122 §1.4 "the class is not decoration — it SELECTS the generated SQL";
 * Spec 124 Rules 9 and 12).
 *
 * THE MECHANIC, and why it is a replace rather than an upsert: `load-centreline.js` L26
 * stages the validated parse into `CREATE TEMP TABLE temp_centreline (LIKE
 * toronto_centreline INCLUDING DEFAULTS INCLUDING CONSTRAINTS)` in batches, then — in ONE
 * transaction — `DELETE FROM toronto_centreline` followed by `INSERT INTO toronto_centreline
 * (…) SELECT … FROM temp_centreline` [:588-625]. The target row set after the run is
 * EXACTLY the source's; a source key that disappeared is gone because the DELETE took it,
 * not because a scoped departure DELETE enumerated it. A `guarded_upsert` (class A) cannot
 * express that at all, and a `retract: "departed"` class-B delete cannot either without
 * enumerating every retired key (47K rows' worth of keys).
 *
 * ⚠️ ONE TRANSACTION, OR NONE OF IT. `pipeline.withTransaction` opens the client, `BEGIN`s,
 * runs the whole replace and `COMMIT`s; ANY throw — a failed staged INSERT, the DELETE, the
 * final INSERT...SELECT — rolls the whole thing back and the OLD TABLE IS INTACT. The
 * staging table is server-side and session-local (`CREATE TEMP TABLE ... ON COMMIT DROP`),
 * so the interim state is never visible to a reader on another connection: `enrich-centreline.js`
 * reads `toronto_centreline` between chain steps and must never see an empty table (Fold A
 * F6: `withTransaction` = one client, advisory lock spans the whole step, and the temp table
 * drops at COMMIT for free). This is what makes `recovery.interrupted: "none"` truthful on
 * the class's descriptor: there is no half-replaced table to recover.
 *
 * ⚠️ DEFENSE IN DEPTH: THE EMPTY-SET GUARD IS STRUCTURAL, NOT DECLARED (Fold A F1). The
 * F-C1 floor is DECLARED by the step as two `pre_write` checks (`staged_rows_floor_first_run`
 * FAIL on a null `prior`, `staged_rows_floor` WARN on later runs) and enforced by the gate —
 * the library does not decide the floor. But the DELETE here is UNCONDITIONAL over the whole
 * table, which is precisely the shape class B's empty-set guard exists to prevent
 * (`<> ALL('{}')` matches every row). So `carried.length === 0` NEVER issues the DELETE: the
 * function returns `replace_skipped_empty_guard: true` and the target is untouched. A step
 * whose guard is mis-declared therefore still cannot destroy the table by accident.
 *
 * ⚠️ NO `ON CONFLICT`. The staging INSERT is a plain INSERT with a column list — the staging
 * table is empty by construction (it was created in this same transaction), so a conflict is
 * impossible and an `ON CONFLICT` would be a second, contradicting opinion about the write's
 * semantics. `STAGING_REPLACE_FORBIDDEN_RE` refuses the tokens rather than trusting the
 * builder; the final `INSERT ... SELECT` is a copy between two tables this function owns.
 *
 * Counters (Fold A D1/F6): `rows_before` is the DELETE's own `rowCount` (what the replace
 * removed), `rows_staged` is what the source carried in, `rows_after` is the INSERT...SELECT's
 * `rowCount` (the target's row count after the replace — what `records_total` reads, by
 * dot-path), and `deleted`/`inserted` mirror `rows_before`/`rows_after`. `records_new` /
 * `records_updated` / `records_unchanged` are NOT derivable for a replace — there is no
 * per-row insert-vs-update question to answer, every surviving row is a copy of a staged one
 * — and the descriptor declares them `"none"` with a why rather than inventing a number.
 *
 * @param {import('pg').Pool} pool
 * @param {object} args
 * @param {object} args.plan - `buildWritePlan`'s output for the declared target
 * @param {object} args.writeSpec - the same `outputs.writes[]` entry the plan was built from
 * @param {object[]} args.carried - the validated rows (one object per row, keyed by column name)
 * @param {(row: object) => object} args.columnValues - the step's row → bound-values mapping
 * @param {object|null} args.prior - the prior emit block (READ by the DECLARED floor checks,
 *   never by this executor — carried in the signature for call-site symmetry with `executeWrite`)
 * @param {{info: Function, warn: Function, error: Function}} args.log
 * @param {string} args.tag
 * @returns {Promise<object>} the `ctx.written` block for a replaced target
 */
async function executeStagingReplace(pool, {
  plan, writeSpec, carried, columnValues, prior, log, tag,
}) {
  const table = plan.table;
  const staging = `${table}_staging`;
  const stepColumns = plan.step_columns;
  const batchSize = pipeline.maxRowsPerInsert(plan.columnsPerRow);
  const insertColumns = stepColumns.join(', ');
  // A plain INSERT into the (empty by construction) staging table. No `ON CONFLICT`: see the
  // docstring above. Built once — the column list is a declared fact, not a per-batch one.
  const stagedInsertSql = (rowCount) => `INSERT INTO ${staging} (${insertColumns})\nVALUES `
    + Array.from({ length: rowCount }, (_, r) => `(${stepColumns.map((_, i) => `$${1 + r * stepColumns.length + i}`).join(', ')})`).join(', ')
    + ';';
  if (STAGING_REPLACE_FORBIDDEN_RE.test(stagedInsertSql(1))) {
    throw new Error(`[${tag}] executeStagingReplace (staging_full_replace / LG-26): the staged INSERT text for `
      + `"${table}" contains an ON CONFLICT or UPDATE token, which this executor structurally refuses — the `
      + 'staging table is created empty inside this same transaction, so there is nothing to conflict with and '
      + 'nothing to update.');
  }

  let rowsBefore = null;
  let rowsStaged = 0;
  let rowsAfter = null;

  await pipeline.withTransaction(pool, async (client) => {
    // 1. The staging table: session-local, CONSTRAINTS-INCLUDING (so a NOT NULL or CHECK the
    //    real table enforces fails HERE, inside the transaction, rather than mid-INSERT...SELECT),
    //    and dropped at COMMIT by the server.
    await client.query(
      `CREATE TEMP TABLE ${staging} (LIKE ${table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;`,
    );

    // 2. Batched INSERTs into the staging table — the same `bindRow`/`columnsPerRow` contract
    //    (and the same `maxRowsPerInsert` stride) class A/B use, so a step's `columnValues` is
    //    written once and works under either class.
    for (let i = 0; i < carried.length; i += batchSize) {
      const slice = carried.slice(i, i + batchSize);
      const values = [];
      for (const row of slice) values.push(...plan.bindRow(columnValues(row)));
      await client.query(stagedInsertSql(slice.length), values);
    }
    rowsStaged = carried.length;

    // 3. THE EMPTY-SET GUARD (F1 defense in depth). Zero carried rows means there is nothing
    //    to replace WITH, and `DELETE FROM <table>` here would be a whole-table truncation.
    //    The declared pre_write floor is what refuses such a run; this is the second lock.
    if (carried.length === 0) {
      log.warn(tag, `empty-set guard: staging_full_replace of ${table} was skipped — zero carried rows, the target is untouched`);
      return;
    }

    // 4. The replace proper: every row goes, then exactly the staged rows come back.
    const del = await client.query(`DELETE FROM ${table};`);
    rowsBefore = del.rowCount == null ? null : del.rowCount;
    const ins = await client.query(
      `INSERT INTO ${table} (${insertColumns}) SELECT ${insertColumns} FROM ${staging};`,
    );
    rowsAfter = ins.rowCount == null ? null : ins.rowCount;
  });

  if (carried.length === 0) {
    return {
      replace_skipped_empty_guard: true,
      rows_before: null,
      rows_staged: 0,
      rows_after: null,
      deleted: 0,
      inserted: 0,
    };
  }
  void prior; // read by the DECLARED pre_write floor checks; never by this executor.
  void writeSpec; // the class/why live on the descriptor and are checked at construction.
  return {
    replace_skipped_empty_guard: false,
    rows_before: rowsBefore,
    rows_staged: rowsStaged,
    rows_after: rowsAfter,
    deleted: rowsBefore,
    inserted: rowsAfter,
  };
}

module.exports = {
  buildWritePlan,
  generateWriteSql,
  targetKey,
  sqlLiteral,
  retractionFires,
  buildBeforeImageSelectSql,
  writeBeforeImage,
  persistBeforeImageRows,
  executeSetBasedClear,
  executeUpsertBatch,
  executeRetraction,
  executeSetBasedJoinUpdate,
  executeInsertSelectNoRetract,
  executeBackfillUpdate,
  executeGuardedUpdate,
  executeGuardedDeleteByKey,
  executeRecorderUpsert,
  executeStagingReplace,
  STAGING_FULL_REPLACE_CLASS,
  STAGING_REPLACE_FORBIDDEN_RE,
  GUARDED_UPDATE_FORBIDDEN_RE,
  GUARDED_DELETE_BY_KEY_FORBIDDEN_RE,
  RECORDER_UPSERT_FORBIDDEN_RE,
  GUARDED_UPSERT_COMPUTE_CLASS,
  JOIN_UPDATE_CLASS,
  JOIN_UPDATE_FORBIDDEN_RE,
  INSERT_ONLY_NO_RETRACT_CLASS,
  INSERT_ONLY_FORBIDDEN_RE,
  WRITE_ONCE_BACKFILL_CLASS,
  BACKFILL_FORBIDDEN_RE,
  LINK_FULL_RETRACTION_CLASS,
  SET_BASED_CLASSES,
  RETRACT_ALWAYS,
  RETRACT_FULL_ONLY,
  WRITTEN_BY_STEP,
  DEFAULT_KEY_SQL_TYPE,
  geometryValidationSql,
  GEOMETRY_VALIDATION_SQL,
  GEOMETRY_KINDS,
  GEOMETRY_KIND_EXTRACT_TYPE,
  GEOMETRY_KIND_ACCEPTED_TYPES,
  MissingGeometryKindError,
  assertGeometryKind,
  InvalidGeometrySridError,
  ValidationKeyMissError,
  WRITTEN_INSERT_ONLY,
  RLS_PROBE_SQL,
  keyColumns,
  resolveGuardColumns,
  assertWritePrivileges,
  validateGeometries,
  executeWrite,
};
