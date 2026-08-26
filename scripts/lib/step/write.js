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

/**
 * Batched geometry normalisation — ONE round-trip for the whole feature set.
 *
 * `$1` = the key array, `$2` = the ord-aligned GeoJSON array. `ST_MakeValid` repairs
 * self-intersections; `ST_CollectionExtract(…, 3)` rescues the polygon parts of a
 * GeometryCollection a repair can produce (3 is the PostGIS polygon type code, an
 * API constant, not a knob). The four statuses are the classifier's whole domain and
 * the reason this SQL is not `scripts/lib/geometry-validator.js`: that helper cannot
 * emit the collection-extracted counter a frozen producer contract may freeze.
 */
const GEOMETRY_VALIDATION_SQL = `
WITH input AS (
  SELECT s.source_key, ST_GeomFromGeoJSON(g.geojson) AS geom
    FROM unnest($1::BIGINT[]) WITH ORDINALITY AS s(source_key, ord)
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
  const srid = descriptor.guards && descriptor.guards.srid !== 'none' ? descriptor.guards.srid : null;
  const stepColumns = writeSpec.columns.filter((c) => (c.written || WRITTEN_BY_STEP) === WRITTEN_BY_STEP);
  const defaulted = writeSpec.columns.filter((c) => (c.written || WRITTEN_BY_STEP) !== WRITTEN_BY_STEP);
  const stepColumnNames = stepColumns.map((c) => c.name);
  const guardColumns = resolveGuardColumns(writeSpec, stepColumnNames);
  const updateColumns = stepColumnNames.filter((c) => !keys.includes(c));
  const keyType = writeSpec.key_sql_type || DEFAULT_KEY_SQL_TYPE;

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
    step_columns: stepColumnNames,
    update_columns: updateColumns,
    guard_columns: guardColumns,
    // The columns bound as WKB. The validation phase writes its output under THESE
    // names, so the row objects it produces are already keyed the way `bindRow`
    // reads them — the alternative is a hand-maintained rename between two phases,
    // which is a NOT NULL violation waiting for the first forced reload.
    geometry_columns: stepColumns.filter((c) => c.bind === 'wkb_geometry').map((c) => c.name),
    validation_sql: GEOMETRY_VALIDATION_SQL,
    // The single-row form: what the batched statement looks like at rowCount 1.
    upsert_sql: head + valuesGroup(1) + tail,
    delete_sql: `DELETE FROM ${table} WHERE ${keys[0]} <> ALL($1::${keyType}[]);`,
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

module.exports = {
  buildWritePlan,
  generateWriteSql,
  WRITTEN_BY_STEP,
  DEFAULT_KEY_SQL_TYPE,
  GEOMETRY_VALIDATION_SQL,
  RLS_PROBE_SQL,
  keyColumns,
  resolveGuardColumns,
  assertWritePrivileges,
  validateGeometries,
  executeWrite,
};
