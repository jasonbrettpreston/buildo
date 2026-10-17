// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md (R-CX — CP-S5 catalog seam; R-BZ G3)
'use strict';

/**
 * ctx.catalog — the RUNNER-OWNED catalog reader (Spec 124 R-CX, programme item CP-S5).
 *
 * WHY THIS SEAM EXISTS (R-BZ G3). A compute measures the population; it never reads the
 * catalog. The column facts a step genuinely reports (assert_global_coverage's
 * `*_step1_columns_present`, refresh_snapshot's `schema_column_counts`) and the column type
 * the vocab-coverage core compares are catalog facts, so the SQL that answers them lives
 * HERE, once — never in compute text (`information_schema` / `pg_*` in a compute is a G3
 * site). The compute asks a question by NAME; this module owns the query.
 *
 * Read-only and `public` only: every statement is a single `SELECT` over
 * `information_schema.columns` with `table_schema = 'public'`.
 *
 * REFUSAL (a defect, thrown before any SQL). A table outside the step's declared read set
 * — `inputs.reads.tables` ∪ `checks[].reads` ∪ `outputs.writes`, the same set gate E's G2
 * judges a compute's relations against — is refused. The thrown error carries
 * `catalogRefusal: true` so a caller with its own degrade path (the vocab-coverage core, the
 * recorder's optional-read carry-forward) can tell a declaration defect, which must stay
 * loud, apart from a query failure, which may degrade.
 *
 * A query error PROPAGATES to the caller's existing boundary (AGC's per-check dispatch
 * catch, refresh_snapshot's optional-read carry-forward, the vocab core's `unresolved`).
 */

const COLUMN_COUNT_SQL = `SELECT COUNT(*)::int AS cols FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = $1`;
const COLUMN_COUNTS_SQL = `SELECT table_name, COUNT(*)::int AS col_count FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = ANY($1::text[])
 GROUP BY table_name ORDER BY table_name`;
const COLUMN_TYPE_SQL = `SELECT data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`;

/** The table part of a declared read: an object's `table`, or a string's `<table>` in `<table>.<column>`. */
function tableOf(entry) {
  if (typeof entry === 'string') return entry.split('.')[0].trim().toLowerCase() || null;
  if (entry && typeof entry === 'object' && typeof entry.table === 'string') return entry.table.trim().toLowerCase() || null;
  return null;
}

/**
 * The step's declared read set: `inputs.reads.tables` ∪ `checks[].reads` ∪ `outputs.writes`
 * (missing keys tolerated; `outputs: "none"` contributes nothing).
 * @param {object} descriptor
 * @returns {Set<string>}
 */
function catalogDeclaredTables(descriptor) {
  const out = new Set();
  const add = (e) => { const t = tableOf(e); if (t) out.add(t); };
  const d = descriptor || {};
  const reads = d.inputs && d.inputs.reads && d.inputs.reads.tables;
  for (const t of Array.isArray(reads) ? reads : []) add(t);
  for (const c of Array.isArray(d.checks) ? d.checks : []) {
    for (const r of Array.isArray(c && c.reads) ? c.reads : []) add(r);
  }
  const writes = d.outputs && d.outputs !== 'none' && Array.isArray(d.outputs.writes) ? d.outputs.writes : [];
  for (const w of writes) add(w);
  return out;
}

/**
 * A finite integer out of a pg COUNT cell (int or numeric text). A null/absent cell stays null —
 * the same answer the former compute's `parseCountRow` gave (a real COUNT(*) always has one).
 */
function toCount(v, where) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) throw new Error(`${where}: the catalog returned a non-numeric column count ${JSON.stringify(v)}`);
  return n;
}

/**
 * Build the catalog reader for one step.
 * @param {{
 *   pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
 *   declaredTables: Iterable<string>,
 *   tag?: string,
 * }} deps - `pool` may be a pool or a pinned client (the recorder binds its optional-read client)
 * @returns {Readonly<{
 *   columnCount: (table: string) => Promise<number|null>,
 *   columnCounts: (tables: string[]) => Promise<Record<string, number>>,
 *   columnType: (table: string, column: string) => Promise<string|null>,
 * }>}
 */
function makeCatalog({ pool, declaredTables, tag = '[step]' }) {
  const declared = new Set([...(declaredTables || [])].map((t) => String(t).toLowerCase()));
  const where = `${tag} ctx.catalog`;
  const refuse = (table) => {
    if (typeof table === 'string' && declared.has(table.toLowerCase())) return;
    const err = new Error(`${where}: table ${JSON.stringify(table)} is not in this step's declared read set `
      + '(inputs.reads.tables ∪ checks[].reads ∪ outputs.writes) — a catalog read of an undeclared table is refused '
      + '(Spec 124 R-CX; the same set gate E G2 judges).');
    err.catalogRefusal = true;
    throw err;
  };

  /** COUNT of `public.<table>`'s columns (0 for a table that does not exist; null only if no count cell came back). */
  async function columnCount(table) {
    refuse(table);
    const { rows } = await pool.query(COLUMN_COUNT_SQL, [table]);
    return toCount(rows[0] ? rows[0].cols : null, where);
  }

  /** `{table: n}` for every named table that EXISTS (an absent table has no key — the GROUP BY semantics). */
  async function columnCounts(tables) {
    if (!Array.isArray(tables) || tables.length === 0) throw new Error(`${where}: columnCounts needs a non-empty table list`);
    for (const t of tables) refuse(t);
    const { rows } = await pool.query(COLUMN_COUNTS_SQL, [tables]);
    const out = {};
    for (const r of rows) out[r.table_name] = toCount(r.col_count, where);
    return out;
  }

  /** `information_schema.columns.data_type` of `public.<table>.<column>`, or null when absent. */
  async function columnType(table, column) {
    refuse(table);
    const { rows } = await pool.query(COLUMN_TYPE_SQL, [table, column]);
    return rows[0] && rows[0].data_type != null ? String(rows[0].data_type) : null;
  }

  return Object.freeze({ columnCount, columnCounts, columnType });
}

/**
 * The recorder's declared catalog op (`buildReads().optional[]` entry `{key, catalog: {op, tables}}`),
 * executed by the runner and returned in the same ROWS shape a SQL read gives
 * (`[{table_name, col_count}]`, ordered by table_name), so `buildRow` is unchanged.
 * @param {ReturnType<typeof makeCatalog>} catalog
 * @param {{op: string, tables: string[]}} spec
 * @param {string} where
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function runCatalogRead(catalog, spec, where) {
  if (!spec || spec.op !== 'columnCounts') {
    throw new Error(`${where}: unknown catalog op ${JSON.stringify(spec && spec.op)} — the recorder executes only "columnCounts"`);
  }
  const counts = await catalog.columnCounts(spec.tables);
  return Object.keys(counts).sort().map((table_name) => ({ table_name, col_count: counts[table_name] }));
}

module.exports = { makeCatalog, catalogDeclaredTables, runCatalogRead };
