// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase C C.3
//
// Migration 141 — promote lead_analytics.lead_id (currently empty per R0.8;
// NOT NULL is safe). Same two-stage pre-check pattern.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 141 — promote lead_analytics.lead_id NOT NULL + UNIQUE (Phase C R5.2)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/141_promote_lead_analytics_lead_id_not_null.sql'),
      'utf-8',
    );
  });

  it('sets statement_timeout', () => {
    expect(sql).toMatch(/SET\s+LOCAL\s+statement_timeout/i);
  });

  it('Stage 1: NULL pre-check', () => {
    expect(sql).toMatch(/lead_analytics[\s\S]*?WHERE\s+lead_id\s+IS\s+NULL[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('Stage 2: duplicate pre-check', () => {
    expect(sql).toMatch(/DO\s+\$\$[\s\S]*?lead_analytics[\s\S]*?GROUP\s+BY\s+lead_id\s+HAVING\s+COUNT\(\*\)\s*>\s*1[\s\S]*?RAISE\s+EXCEPTION/i);
  });

  it('ALTERs lead_analytics.lead_id SET NOT NULL', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+lead_analytics\s+ALTER\s+COLUMN\s+lead_id\s+SET\s+NOT\s+NULL/i);
  });

  it('creates uniq_lead_analytics_lead_id CONCURRENTLY', () => {
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+uniq_lead_analytics_lead_id\s+ON\s+lead_analytics\s*\(\s*lead_id\s*\)/i);
  });

  it('drops Phase B idx_lead_analytics_lead_id', () => {
    expect(sql).toMatch(/DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+idx_lead_analytics_lead_id/i);
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
