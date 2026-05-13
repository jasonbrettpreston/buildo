// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C C.3
//
// SQL-shape regression-lock for migration 138 — promote cost_estimates.lead_id
// from nullable to NOT NULL + UNIQUE.
//
// Two-stage pre-check (R2 DeepSeek finding): NULL count + duplicate count.
// statement_timeout = '5min' (R2 DeepSeek DEFER) for CONCURRENTLY INDEX.
// Drops the partial index from Phase B (idx_cost_estimates_lead_id).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 138 — promote cost_estimates.lead_id NOT NULL + UNIQUE (Phase C R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/138_promote_cost_estimates_lead_id_not_null.sql'),
      'utf-8',
    );
  });

  it('sets statement_timeout = 5min in prologue (R2 DeepSeek DEFER)', () => {
    expect(sql).toMatch(/SET\s+LOCAL\s+statement_timeout\s*=\s*'5\s*min'/i);
  });

  it('Stage 1: DO block raises EXCEPTION on NULL lead_id rows', () => {
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?SELECT\s+COUNT\(\*\)\s+INTO\s+null_count\s+FROM\s+cost_estimates\s+WHERE\s+lead_id\s+IS\s+NULL[\s\S]*?RAISE\s+EXCEPTION[\s\S]*?END\s+\$\$/i);
  });

  it('Stage 2: DO block raises EXCEPTION on duplicate lead_id (R2 DeepSeek HIGH)', () => {
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?GROUP\s+BY\s+lead_id\s+HAVING\s+COUNT\(\*\)\s*>\s*1[\s\S]*?RAISE\s+EXCEPTION[\s\S]*?END\s+\$\$/i);
  });

  it('ALTERs cost_estimates.lead_id SET NOT NULL', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+cost_estimates\s+ALTER\s+COLUMN\s+lead_id\s+SET\s+NOT\s+NULL/i);
  });

  it('creates uniq_cost_estimates_lead_id CONCURRENTLY', () => {
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+uniq_cost_estimates_lead_id\s+ON\s+cost_estimates\s*\(\s*lead_id\s*\)/i);
  });

  it('drops the Phase B partial index idx_cost_estimates_lead_id CONCURRENTLY', () => {
    expect(sql).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+idx_cost_estimates_lead_id/i);
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
