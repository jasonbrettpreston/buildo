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
 * `.columns[].written`, the SRID from `guards.srid`.
 *
 * SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.4, §8.2
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R9
 */
'use strict';

const pipeline = require('../pipeline');
const fs = require('fs');
const path = require('path');

/** Columns whose value the STEP supplies; anything else is declared-but-not-written. */
const WRITTEN_BY_STEP = 'step';

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
 * ⚠️ IT IS A BUILDER, NOT A CONSTANT, and the parameter is the one thing in it that
 * is not an API constant: `outputs.writes[].key_sql_type`. The literal `BIGINT[]`
 * that used to sit here disagreed with the departure DELETE's cast twelve lines
 * below, which reads the DECLARED type — so a step declaring `TEXT` keys would have
 * had its keys cast to BIGINT on the way in and TEXT on the way out. Nothing in the
 * descriptor said which one won; today one source says both.
 */
const geometryValidationSql = (keyType) => `
WITH input AS (
  SELECT s.source_key, ST_GeomFromGeoJSON(g.geojson) AS geom
    FROM unnest($1::${keyType}[]) WITH ORDINALITY AS s(source_key, ord)
    JOIN unnest($2::TEXT[])   WITH ORDINALITY AS g(geojson, ord)   ON s.ord = g.ord
),
validated AS (
  SELECT
    source_key,
    ST_GeometryType(repaired) AS repaired_type,
    ST_Multi(COALESCE(ST_CollectionExtract(repaired, 3), repaired)) AS geom_final,
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
         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')
              AND NOT ST_IsEmpty(geom_final)
              AND repaired_type = 'ST_GeometryCollection'                       THEN 'collection_extracted'
         WHEN ST_GeometryType(geom_final) IN ('ST_Polygon','ST_MultiPolygon')
              AND NOT ST_IsEmpty(geom_final)                                     THEN 'accepted'
         WHEN geom_final IS NULL OR ST_IsEmpty(geom_final)                       THEN 'skipped_null'
         ELSE 'skipped_unsupported_type'
       END AS status,
       ST_AsBinary(geom_final) AS geom_wkb,
       is_valid_original
  FROM validated;`;

/** The default-keyed instance, for a reader (and `load-ravines.notes.json`) that wants the shape. */
const GEOMETRY_VALIDATION_SQL = geometryValidationSql(DEFAULT_KEY_SQL_TYPE);

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
  const stepColumns = writeSpec.columns.filter((c) => (c.written || WRITTEN_BY_STEP) === WRITTEN_BY_STEP);
  const defaulted = writeSpec.columns.filter((c) => (c.written || WRITTEN_BY_STEP) !== WRITTEN_BY_STEP);
  const stepColumnNames = stepColumns.map((c) => c.name);
  const guardColumns = resolveGuardColumns(writeSpec, stepColumnNames);
  const updateColumns = stepColumnNames.filter((c) => !keys.includes(c));
  const keyType = writeSpec.key_sql_type || DEFAULT_KEY_SQL_TYPE;
  const scope = writeSpec.write_discipline.scope !== 'none' ? writeSpec.write_discipline.scope : null;
  const geometryColumns = stepColumns.filter((c) => c.bind === 'wkb_geometry').map((c) => c.name);
  if (geometryColumns.length > 1) {
    throw new Error(`[write_discipline] ${table}: ${geometryColumns.length} columns declare bind "wkb_geometry" `
      + `(${geometryColumns.join(', ')}), and the validation phase writes its output under exactly one. `
      + 'A second geometry column would be bound NULL on every row; declare one, or extend validateGeometries first.');
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

  /** One `($1, ST_GeomFromWKB($2, 4326), $3, $4)` group; `offset` is the running bind index. */
  const valuesGroup = (offset) => `(${stepColumns.map((c, i) => bindFor(c, offset + i)).join(', ')})`;

  const head = `INSERT INTO ${table} (${stepColumnNames.join(', ')})\nVALUES `;
  const tail = `\nON CONFLICT (${keys.join(', ')}) DO UPDATE SET `
    + `${updateColumns.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}\n`
    + `  WHERE ${guardColumns.map((c) => `${table}.${c} IS DISTINCT FROM EXCLUDED.${c}`).join('\n     OR ')}\n`
    + (defaulted.length > 0
      ? `-- declared but never written by this step (DB default): ${defaulted.map((c) => c.name).join(', ')}\n`
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
    // The columns bound as WKB. The validation phase writes its output under THESE
    // names, so the row objects it produces are already keyed the way `bindRow`
    // reads them — the alternative is a hand-maintained rename between two phases,
    // which is a NOT NULL violation waiting for the first forced reload.
    geometry_columns: geometryColumns,
    // Templated from the DECLARED key type, so the cast that reads the key array agrees
    // with the cast in `delete_sql` below instead of hard-coding a second opinion.
    validation_sql: geometryValidationSql(keyType),
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
 * @param {(status: string, isValidOriginal: boolean) => object} classify - the
 *   step's own pure status→counter classifier, handed in so this file stays domain-free.
 */
async function validateGeometries(pool, plan, features, classify, { log, tag }) {
  const keyColumn = plan.keys[0];
  const geomColumn = plan.geometry_columns[0];
  if (!geomColumn) throw new Error(`[${tag}] ${plan.table}: no column declares bind "wkb_geometry", so the validated geometry has nowhere to land`);
  const keysIn = features.map((f) => f[keyColumn]);
  const geojsons = features.map((f) => f.geojson);
  const { rows } = await pool.query(plan.validation_sql, [keysIn, geojsons]);
  const byKey = new Map(rows.map((r) => [Number(r.source_key), r]));
  let repaired = 0;
  let collectionExtracted = 0;
  let skipped = 0;
  const carried = [];
  const skippedKeys = [];
  for (const f of features) {
    const v = byKey.get(f[keyColumn]);
    if (!v) {
      // unnest WITH ORDINALITY returns a row per input key; a miss is anomalous.
      skipped++;
      skippedKeys.push(f[keyColumn]);
      log.warn(tag, `key ${f[keyColumn]} missing from the validation result — counted as skipped`);
      continue;
    }
    const d = classify(v.status, v.is_valid_original);
    repaired += d.repaired;
    collectionExtracted += d.collectionExtracted;
    skipped += d.skipped;
    if (d.carry) carried.push({ [keyColumn]: f[keyColumn], [geomColumn]: v.geom_wkb });
    else skippedKeys.push(f[keyColumn]);
  }
  return { carried, repaired, collectionExtracted, skipped, skippedKeys };
}

/**
 * Execute the class-B write: guarded upsert then scoped departure DELETE, in ONE
 * transaction (`write_discipline.txn_scope: "step"`).
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
    // retract: departed — and the empty-set guard, because `<> ALL('{}')` matches
    // every row and would retract the entire table on an empty parse.
    if (shouldSkipDelete(loadedKeys)) {
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
  fs.writeFileSync(filePath, body, 'utf8');
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
  GUARDED_UPDATE_FORBIDDEN_RE,
  JOIN_UPDATE_CLASS,
  JOIN_UPDATE_FORBIDDEN_RE,
  INSERT_ONLY_NO_RETRACT_CLASS,
  INSERT_ONLY_FORBIDDEN_RE,
  WRITE_ONCE_BACKFILL_CLASS,
  BACKFILL_FORBIDDEN_RE,
  SET_BASED_CLASSES,
  RETRACT_ALWAYS,
  RETRACT_FULL_ONLY,
  WRITTEN_BY_STEP,
  DEFAULT_KEY_SQL_TYPE,
  geometryValidationSql,
  GEOMETRY_VALIDATION_SQL,
  RLS_PROBE_SQL,
  keyColumns,
  resolveGuardColumns,
  assertWritePrivileges,
  validateGeometries,
  executeWrite,
};
