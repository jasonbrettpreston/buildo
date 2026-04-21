// SPEC LINK: docs/specs/product/admin/26_admin_dashboard.md — ColumnarAuditTable multi-schema row key contract
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

// ── Source shape tests — verify the fix is in place ────────────────────────

describe('src/components/FreshnessTimeline.tsx — ColumnarAuditTable rowKey (spec 26)', () => {
  let content: string;
  beforeAll(() => {
    content = read('src/components/FreshnessTimeline.tsx');
  });

  it('uses row.metric as primary key discriminator with nullish guard (not falsy)', () => {
    // Score Engine audit rows use { metric, value } — not { step_target, field }.
    // Guard uses != null so metric:0 and metric:"" are treated as valid metric values,
    // not as "missing metric". Without this, every Score Engine row produced key "-".
    expect(content).toMatch(/row\.metric\s*!=\s*null\s*\?\s*String\(row\.metric\)/);
  });

  it('appends rowIdx as absolute uniqueness suffix', () => {
    // rowIdx guarantees uniqueness even when both metric and step_target/field are absent.
    expect(content).toMatch(/`\$\{baseKey\}-\$\{rowIdx\}`/);
  });

  it('row map callback accepts rowIdx parameter', () => {
    expect(content).toMatch(/\.map\(\(row,\s*rowIdx\)\s*=>/);
  });

  it('does NOT use the old collision-prone key (no metric path)', () => {
    // The old pattern produced "-" for every Score Engine row.
    // After fix: baseKey uses metric first, falls back to step_target/field.
    expect(content).not.toMatch(
      /const rowKey = `\$\{String\(row\.step_target \?\? ''\)\}-\$\{String\(row\.field \?\? ''\)\}`/,
    );
  });
});

// ── Logic tests — pure key generation covering all three row schemas ────────

describe('ColumnarAuditTable rowKey generation logic (spec 26)', () => {
  type ColumnarAuditRow = Record<string, unknown>;

  // Mirror of the fixed key generation logic
  function computeRowKey(row: ColumnarAuditRow, rowIdx: number): string {
    const baseKey = row.metric != null
      ? String(row.metric)
      : `${String(row.step_target ?? '')}-${String(row.field ?? '')}`;
    return `${baseKey}-${rowIdx}`;
  }

  it('Schema 1 (Global Coverage): produces stable key from step_target + field', () => {
    const row: ColumnarAuditRow = {
      step_target: 'classify-permits',
      field: 'trade_slug',
      coverage_pct: 98,
      status: 'PASS',
    };
    expect(computeRowKey(row, 0)).toBe('classify-permits-trade_slug-0');
  });

  it('Schema 2 (Score Engine): produces stable key from metric', () => {
    const row: ColumnarAuditRow = {
      metric: 'records_scored',
      value: 2548,
      threshold: null,
      status: 'INFO',
    };
    expect(computeRowKey(row, 0)).toBe('records_scored-0');
  });

  it('Schema 2: three Score Engine rows with different metrics produce unique keys', () => {
    const rows: ColumnarAuditRow[] = [
      { metric: 'records_scored',    value: 2548, status: 'INFO' },
      { metric: 'null_scores',       value: 3,    status: 'INFO' },
      { metric: 'null_input_scores', value: 1,    status: 'INFO' },
    ];
    const keys = rows.map((r, i) => computeRowKey(r, i));
    expect(new Set(keys).size).toBe(3);
  });

  it('Schema 2: metric=0 (numeric zero) uses the metric path — nullish check not falsy', () => {
    // row.metric = 0 is falsy but NOT null/undefined. Guard uses != null so it correctly
    // takes the metric path and produces key "0-2", not the step_target/field fallback.
    const row: ColumnarAuditRow = { metric: 0, value: 5, status: 'PASS' };
    const key = computeRowKey(row, 2);
    expect(key).toBe('0-2');
  });

  it('Schema 2: metric="" (empty string) uses the metric path — nullish check not falsy', () => {
    // Empty string is not null/undefined, so it takes the metric path → key ""-2 → "-2"
    const row: ColumnarAuditRow = { metric: '', value: 5, status: 'PASS' };
    expect(computeRowKey(row, 3)).toBe('-3');
  });

  it('Schema 3 (Unknown — neither metric nor step_target/field): rowIdx suffix guarantees uniqueness', () => {
    const rows: ColumnarAuditRow[] = [
      { some_field: 'a', status: 'PASS' },
      { some_field: 'b', status: 'WARN' },
      { some_field: 'c', status: 'FAIL' },
    ];
    const keys = rows.map((r, i) => computeRowKey(r, i));
    // baseKey = "-" (empty step_target + separator + empty field), rowKey = "--{idx}"
    expect(keys).toEqual(['--0', '--1', '--2']);
    expect(new Set(keys).size).toBe(3);
  });

  it('Mixed schema in same table: all keys unique across schemas', () => {
    const rows: ColumnarAuditRow[] = [
      { step_target: 'classify-permits', field: 'trade_slug', status: 'PASS' },
      { metric: 'records_scored',        value: 100,          status: 'INFO' },
      { step_target: 'link-coa',         field: 'conf',       status: 'WARN' },
      { metric: 'null_scores',           value: 0,            status: 'INFO' },
    ];
    const keys = rows.map((r, i) => computeRowKey(r, i));
    expect(new Set(keys).size).toBe(4);
  });
});
