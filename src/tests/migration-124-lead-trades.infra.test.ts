// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 124 (lead_trades table).
//
// Migration 124 creates the unified lead_trades table — replaces permit_trades
// in Phase H. Keys on lead_id ('permit:<num>:<rev>' or 'coa:<application_number>')
// per Spec 42 §6.6.A.1 Option C. Handles both permit-side and CoA-side trade
// tagging with a CHECK constraint enforcing the lead_id format.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 124 — lead_trades table (WF1 #coa-pipeline-parity-phase-b R5.1)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/124_create_lead_trades.sql'),
      'utf-8',
    );
  });

  it('creates the lead_trades table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lead_trades/i);
  });

  it('declares id as SERIAL PRIMARY KEY (matching permit_trades pattern)', () => {
    expect(sql).toMatch(/id\s+SERIAL\s+PRIMARY\s+KEY/i);
  });

  it('declares lead_id TEXT NOT NULL with CHECK regex enforcing permit:|coa: prefix', () => {
    expect(sql).toMatch(/lead_id\s+TEXT\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*lead_id\s*~\s*'\^\(permit\|coa\):\.\+\$'\s*\)/);
  });

  it('declares trade_id INTEGER NOT NULL with FK to trades(id)', () => {
    expect(sql).toMatch(/trade_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+trades\s*\(\s*id\s*\)/i);
  });

  it('declares tier INTEGER with CHECK (tier IN (1, 2, 3)) allowing NULL', () => {
    expect(sql).toMatch(/tier\s+INTEGER/i);
    expect(sql).toMatch(/CHECK\s*\(\s*tier\s+IS\s+NULL\s+OR\s+tier\s+IN\s*\(\s*1\s*,\s*2\s*,\s*3\s*\)\s*\)/i);
  });

  it('declares confidence DECIMAL(3,2) with 0-1 range CHECK allowing NULL', () => {
    expect(sql).toMatch(/confidence\s+DECIMAL\s*\(\s*3\s*,\s*2\s*\)/i);
    expect(sql).toMatch(/CHECK\s*\(\s*confidence\s+IS\s+NULL\s+OR\s*\(\s*confidence\s*>=\s*0\s+AND\s+confidence\s*<=\s*1\s*\)\s*\)/i);
  });

  it('declares is_active BOOLEAN NOT NULL DEFAULT true', () => {
    expect(sql).toMatch(/is_active\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/i);
  });

  it('declares phase VARCHAR(20) (legacy P-code, kept for backward compat)', () => {
    expect(sql).toMatch(/phase\s+VARCHAR\s*\(\s*20\s*\)/i);
  });

  it('declares lead_score INTEGER NOT NULL DEFAULT 0', () => {
    expect(sql).toMatch(/lead_score\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i);
  });

  it('declares classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', () => {
    expect(sql).toMatch(/classified_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\s*\(\s*\)/i);
  });

  it('declares UNIQUE (lead_id, trade_id) constraint', () => {
    expect(sql).toMatch(/UNIQUE\s*\(\s*lead_id\s*,\s*trade_id\s*\)/i);
  });

  it('creates idx_lead_trades_trade index on trade_id', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lead_trades_trade\s+ON\s+lead_trades\s*\(\s*trade_id\s*\)/i);
  });

  it('creates idx_lead_trades_active index on is_active', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lead_trades_active\s+ON\s+lead_trades\s*\(\s*is_active\s*\)/i);
  });

  it('creates idx_lead_trades_lead index on lead_id', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lead_trades_lead\s+ON\s+lead_trades\s*\(\s*lead_id\s*\)/i);
  });

  it('uses bare CREATE INDEX (not CONCURRENTLY) so the whole file runs transactionally — empty table at creation', () => {
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
  });

  it('comment-only DOWN block per Rule 6', () => {
    expect(sql).toMatch(/--\s*DOWN\b/i);
    const downIdx = sql.search(/--\s*DOWN\b/i);
    expect(downIdx).toBeGreaterThan(0);
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
