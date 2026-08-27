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

/** Columns whose value the STEP supplies; anything else is declared-but-not-written. */
const WRITTEN_BY_STEP = 'step';

/** Default SQL type for the departure DELETE's key array cast. */
const DEFAULT_KEY_SQL_TYPE = 'BIGINT';

/** `write_discipline.class` values whose generated statement is a scoped set-based UPDATE. */
const SET_BASED_CLASSES = new Set(['set_based_scoped', 'set_based_unscoped']);

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

  // ── set_based_scoped / set_based_unscoped: one UPDATE, constants only ──────
  // No row values are bound: a set-based mechanic writes a DECLARED CONSTANT
  // (`columns[].set_value`) over the rows its scope selects. The scope carries its own
  // placeholders, so the caller binds those and nothing else.
  if (SET_BASED_CLASSES.has(writeSpec.write_discipline.class)) {
    const assignments = stepColumns.map((c) => `${c.name} = ${sqlLiteral(c.set_value)}`).join(', ');
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
      clear_sql: `UPDATE ${table} SET ${assignments}${scope ? ` WHERE ${scope}` : ''};`,
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

module.exports = {
  buildWritePlan,
  generateWriteSql,
  targetKey,
  sqlLiteral,
  retractionFires,
  executeSetBasedClear,
  executeUpsertBatch,
  executeRetraction,
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
