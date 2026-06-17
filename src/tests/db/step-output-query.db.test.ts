// 🔗 SPEC LINK: docs/specs/01-pipeline/26_*.md §3.1 (Step-Output Inspector)
//
// Live-DB integration for the read-only step-output query: real pagination, prefix filter,
// column listing, and the manifest allow-list — proves the dynamic SQL runs on real PG.
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { afterAll, describe, expect, it } from 'vitest';
import { dbAvailable } from './setup-testcontainer';
import { pool } from '@/lib/db/client';
import { fetchStepOutput } from '@/lib/admin/step-output-query';
import { fetchTableColumns, getStepTelemetryTable } from '@/lib/admin/manifest-utils';

describe.skipIf(!dbAvailable())('step-output-query (Spec 26 §3.1) — live DB', () => {
  afterAll(async () => { await pool.end(); });

  it('fetchTableColumns lists a table\'s columns in definition order', async () => {
    const cols = await fetchTableColumns('permits');
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.map((c) => c.name)).toContain('permit_num');
  });

  it('fetchStepOutput paginates permit_trades — ≤limit rows, stable projection, numeric total', async () => {
    const cols = await fetchTableColumns('permit_trades');
    const page = await fetchStepOutput('permit_trades', { columns: cols, limit: 5, offset: 0 });
    expect(page.columns).toEqual(cols.map((c) => c.name));
    expect(page.rows.length).toBeLessThanOrEqual(5);
    expect(typeof page.total).toBe('number');
    expect(typeof page.approxTotal).toBe('boolean');
  });

  it('prefix filter returns only rows matching the bound value (no leading wildcard)', async () => {
    const cols = await fetchTableColumns('permit_trades');
    const res = await fetchStepOutput('permit_trades', {
      columns: cols, filterField: 'phase', filterValue: 'structural', limit: 10, offset: 0,
    });
    for (const r of res.rows) expect(String(r.phase)).toMatch(/^structural/i);
  });

  it('allow-list excludes PII + tableless slugs, maps classify steps', () => {
    expect(getStepTelemetryTable('lead_views')).toBeNull();      // PII-excluded
    expect(getStepTelemetryTable('assert_schema')).toBeNull();   // no telemetry_tables
    expect(getStepTelemetryTable('classify_permits')).toBe('permit_trades');
  });
});
