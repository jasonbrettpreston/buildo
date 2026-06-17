// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//   + docs/specs/00_engineering_standards.md §4.2 (dynamic-query safety) §4.3 (projected cols)
//
// Read-only row browser for a pipeline step's main output table. Injection fences:
//   1. `table` is a manifest-allow-listed value (resolved by the route, never request text).
//   2. `filterField` is validated ∈ the table's information_schema columns (by the route).
//   3. all identifiers quoteIdent-wrapped; filter VALUE is bound; ORDER BY 1, ctid (no dynamic sort).

import { withTransaction } from '@/lib/db/client';
import { quoteIdent, isFilterable, type TableColumn } from './manifest-utils';

const STATEMENT_TIMEOUT_MS = 15000;
// Above this row count, use the pg_class.reltuples estimate instead of an exact COUNT(*).
const RELTUPLES_EXACT_THRESHOLD = 50000;

export interface StepOutputResult {
  columns: string[];
  /** Subset of columns that can back a `::text ILIKE` filter (excludes geometry/json/array). */
  filterableColumns: string[];
  rows: Record<string, unknown>[];
  total: number;
  approxTotal: boolean;
}

export interface StepOutputParams {
  /** Projection — columns already fetched for the (allow-listed) table. */
  columns: TableColumn[];
  /** Already validated ∈ columns AND filterable by the route. */
  filterField?: string | null;
  filterValue?: string | null;
  limit: number;
  offset: number;
}

export async function fetchStepOutput(table: string, params: StepOutputParams): Promise<StepOutputResult> {
  const { columns, filterField, filterValue, limit, offset } = params;
  const qTable = quoteIdent(table);
  const colNames = columns.map((c) => c.name);
  const projection = colNames.map(quoteIdent).join(', ');

  const hasFilter = !!filterField && filterValue != null && filterValue !== '';
  // Prefix match — value bound as `<input>%` (no leading wildcard → index-eligible on text cols).
  const whereSql = hasFilter ? `WHERE ${quoteIdent(filterField)}::text ILIKE $1` : '';
  const filterParams: unknown[] = hasFilter ? [`${filterValue}%`] : [];

  return withTransaction(async (client) => {
    // SET LOCAL is tx-scoped — guaranteed reset on COMMIT (withTransaction commits/releases).
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    let total: number;
    let approxTotal = false;
    if (!hasFilter) {
      // Fast estimate for large tables; exact COUNT for small OR never-analyzed (reltuples <= 0).
      const est = await client.query<{ reltuples: string }>(
        `SELECT c.reltuples::bigint::text AS reltuples
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = $1 AND n.nspname = 'public' AND c.relkind = 'r'`,
        [table],
      );
      const estRow = est.rows[0];
      const reltuples = estRow ? parseInt(estRow.reltuples, 10) : -1;
      if (reltuples > RELTUPLES_EXACT_THRESHOLD) {
        total = reltuples;
        approxTotal = true;
      } else {
        const c = await client.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${qTable}`);
        total = parseInt(c.rows[0]?.n ?? '0', 10);
      }
    } else {
      const c = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ${qTable} ${whereSql}`,
        filterParams,
      );
      total = parseInt(c.rows[0]?.n ?? '0', 10);
    }

    const limitIdx = filterParams.length + 1;
    const offsetIdx = filterParams.length + 2;
    const data = await client.query<Record<string, unknown>>(
      `SELECT ${projection} FROM ${qTable} ${whereSql} ORDER BY 1, ctid LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...filterParams, limit, offset],
    );

    const filterableColumns = columns.filter(isFilterable).map((c) => c.name);
    return { columns: colNames, filterableColumns, rows: data.rows, total, approxTotal };
  });
}
