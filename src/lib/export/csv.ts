// ---------------------------------------------------------------------------
// CSV export for permits
// ---------------------------------------------------------------------------

import { getClient } from '@/lib/db/client';
import { logError } from '@/lib/logger';
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

