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

  it('Stage 2: composite duplicate pre-check on (lead_id, trade_slug) per Spec 42 §6.6.C (WF3 #mig-139-composite-unique)', () => {
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?trade_forecasts[\s\S]*?GROUP\s+BY\s+lead_id\s*,\s*trade_slug\s+HAVING\s+COUNT\(\*\)\s*>\s*1[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('Stage 2: dup pre-check surfaces a sample of dup (lead_id, trade_slug) pairs (R8 DeepSeek LOW)', () => {
    // Operator debugging needs the actual values, not just the count.
    expect(sql).toMatch(/string_agg[\s\S]*?lead_id[\s\S]*?trade_slug/i);
    expect(sql).toMatch(/Sample:/i);
  });

  it('ALTERs trade_forecasts.lead_id SET NOT NULL', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+trade_forecasts\s+ALTER\s+COLUMN\s+lead_id\s+SET\s+NOT\s+NULL/i);
  });

  it('drops the prior single-column uniq_trade_forecasts_lead_id (stale-local-state cleanup, R8 Worktree #3)', () => {
    // Defensive against any local DB that applied the broken pre-WF3 version
    // against an empty trade_forecasts (trivially passed Stage-2 pre-check).
    expect(sql).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+uniq_trade_forecasts_lead_id\b(?!_trade)/i);
  });

  it('creates uniq_trade_forecasts_lead_id_trade with composite (lead_id, trade_slug) CONCURRENTLY (Spec 42 §6.6.C)', () => {
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+uniq_trade_forecasts_lead_id_trade\s+ON\s+trade_forecasts\s*\(\s*lead_id\s*,\s*trade_slug\s*\)/i);
  });

  it('does NOT create a single-column UNIQUE on lead_id (anti-regression — Spec 42 §6.6.C requires composite)', () => {
    expect(sql).not.toMatch(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+uniq_trade_forecasts_lead_id\s+ON\s+trade_forecasts\s*\(\s*lead_id\s*\)/i);
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
