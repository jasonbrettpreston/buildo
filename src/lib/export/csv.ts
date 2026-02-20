// ---------------------------------------------------------------------------
// CSV export for permits
// ---------------------------------------------------------------------------

import { getClient } from '@/lib/db/client';
import type { PermitFilter } from '@/lib/permits/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** UTF-8 Byte Order Mark to ensure Excel opens the file correctly. */
const UTF8_BOM = '\uFEFF';

/** Ordered list of columns included in every CSV export. */
export const CSV_COLUMNS = [
  'permit_num',
  'revision_num',
  'permit_type',
  'status',
  'work',
  'description',
  'street_num',
  'street_name',
  'ward',
  'builder_name',
  'est_const_cost',
  'application_date',
  'issued_date',
  'completed_date',
  'dwelling_units_created',
  'storeys',
] as const;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Escape and format a single CSV row per RFC 4180.
 *
 * Rules:
 *  - Fields containing commas, double-quotes, or newlines are enclosed in
 *    double-quotes.
 *  - Double-quote characters within a field are escaped by preceding them
 *    with another double-quote.
 *  - Null / undefined values become empty strings.
 */
export function formatCsvRow(permit: Record<string, unknown>): string {
  const cells = CSV_COLUMNS.map((col) => {
    const raw = permit[col];

    if (raw == null) {
      return '';
    }

    let value: string;
    if (raw instanceof Date) {
      value = raw.toISOString();
    } else {
      value = String(raw);
    }

    // If the value contains special characters, quote it
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  });

  return cells.join(',');
}

// ---------------------------------------------------------------------------
// Filter -> SQL helpers
// ---------------------------------------------------------------------------

function buildFilterClauses(filters: PermitFilter): {
  whereClause: string;
  values: unknown[];
} {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (filters.status) {
    conditions.push(`status = $${paramIdx++}`);
    values.push(filters.status);
  }
  if (filters.permit_type) {
    conditions.push(`permit_type = $${paramIdx++}`);
    values.push(filters.permit_type);
  }
  if (filters.ward) {
    conditions.push(`ward = $${paramIdx++}`);
    values.push(filters.ward);
  }
  if (filters.min_cost != null) {
    conditions.push(`est_const_cost >= $${paramIdx++}`);
    values.push(filters.min_cost);
  }
  if (filters.max_cost != null) {
    conditions.push(`est_const_cost <= $${paramIdx++}`);
    values.push(filters.max_cost);
  }
  if (filters.search) {
    conditions.push(
      `to_tsvector('english', coalesce(description,'') || ' ' || coalesce(street_name,'') || ' ' || coalesce(builder_name,'')) @@ plainto_tsquery('english', $${paramIdx++})`
    );
    values.push(filters.search);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { whereClause, values };
}

// ---------------------------------------------------------------------------
// Streaming CSV generator
// ---------------------------------------------------------------------------

/**
 * Stream CSV rows for a filtered set of permits using a PostgreSQL cursor.
 *
 * Yields:
 *  1. The UTF-8 BOM + header row as the first chunk.
 *  2. One line per permit row, terminated with `\r\n`.
 *
 * Uses a server-side cursor (DECLARE / FETCH) so the full result set is never
 * held in memory.
 *
 * @param filters  Standard permit query filters.
 * @param batchSize  Number of rows to fetch per cursor round-trip.
 */
export async function* generatePermitsCsv(
  filters: PermitFilter,
  batchSize: number = 500
): AsyncGenerator<string> {
  const { whereClause, values } = buildFilterClauses(filters);

  const columns = CSV_COLUMNS.join(', ');
  const cursorName = 'csv_export_cursor';

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Declare a cursor for the filtered query
    await client.query(
      `DECLARE ${cursorName} CURSOR FOR
       SELECT ${columns} FROM permits ${whereClause}
       ORDER BY issued_date DESC NULLS LAST`,
      values
    );

    // Yield BOM + header row
    yield UTF8_BOM + CSV_COLUMNS.join(',') + '\r\n';

    // Fetch in batches
    let done = false;
    while (!done) {
      const result = await client.query(
        `FETCH ${batchSize} FROM ${cursorName}`
      );

      if (result.rows.length === 0) {
        done = true;
        break;
      }

      for (const row of result.rows) {
        yield formatCsvRow(row) + '\r\n';
      }

      if (result.rows.length < batchSize) {
        done = true;
      }
    }

    await client.query(`CLOSE ${cursorName}`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
