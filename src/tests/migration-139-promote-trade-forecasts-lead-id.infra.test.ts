// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C C.3
//
// Migration 139 — promote trade_forecasts.lead_id (654K rows per R0.8 audit).
// Same pattern as migration 138. HIGHEST runtime in Phase C — statement_timeout
// is critical.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 139 — promote trade_forecasts.lead_id NOT NULL + UNIQUE (Phase C R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/139_promote_trade_forecasts_lead_id_not_null.sql'),
      'utf-8',
    );
  });

  it('sets statement_timeout = 5min', () => {
    expect(sql).toMatch(/SET\s+LOCAL\s+statement_timeout\s*=\s*'5\s*min'/i);
  });

  it('Stage 1: NULL pre-check', () => {
    expect(sql).toMatch(/SELECT\s+COUNT\(\*\)\s+INTO\s+null_count\s+FROM\s+trade_forecasts\s+WHERE\s+lead_id\s+IS\s+NULL[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('Stage 2: duplicate pre-check', () => {
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?trade_forecasts[\s\S]*?GROUP\s+BY\s+lead_id\s+HAVING\s+COUNT\(\*\)\s*>\s*1[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('ALTERs trade_forecasts.lead_id SET NOT NULL', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+trade_forecasts\s+ALTER\s+COLUMN\s+lead_id\s+SET\s+NOT\s+NULL/i);
  });

  it('creates uniq_trade_forecasts_lead_id CONCURRENTLY', () => {
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+uniq_trade_forecasts_lead_id\s+ON\s+trade_forecasts\s*\(\s*lead_id\s*\)/i);
  });

  it('drops Phase B partial idx_trade_forecasts_lead_id CONCURRENTLY', () => {
    expect(sql).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+idx_trade_forecasts_lead_id/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const afterDown = sql.slice(downIdx);
    const offending = afterDown
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t === '' || t.startsWith('--')) return false;
        return /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
      });
    expect(offending).toEqual([]);
  });
});
