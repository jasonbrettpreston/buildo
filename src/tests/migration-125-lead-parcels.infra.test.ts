// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 125 (lead_parcels table).
//
// Migration 125 creates the unified lead_parcels table — replaces permit_parcels
// in Phase H. Keys on lead_id per Spec 42 §6.6.A.1 Option C.
//
// parcel_id is INTEGER (matching parcels.id SERIAL) — NOT BIGINT, which would
// reject the FK. The R2.v1 DeepSeek review caught this type mismatch in the
// canonical DDL; the active task §B.2 + Spec 42 §6.6.B were corrected.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 125 — lead_parcels table (WF1 #coa-pipeline-parity-phase-b R5.1)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/125_create_lead_parcels.sql'),
      'utf-8',
    );
  });

  it('creates the lead_parcels table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lead_parcels/i);
  });

  it('declares lead_id TEXT NOT NULL with CHECK regex', () => {
    expect(sql).toMatch(/lead_id\s+TEXT\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*lead_id\s*~\s*'\^\(permit\|coa\):\.\+\$'\s*\)/);
  });

  it('declares parcel_id INTEGER NOT NULL REFERENCES parcels(id) — INTEGER not BIGINT (R2.v1 DeepSeek fix)', () => {
    // R2.v1 DeepSeek caught BIGINT vs SERIAL/INTEGER type mismatch on parcels.id.
    // INTEGER is the correct type — BIGINT would cause FK creation to fail.
    expect(sql).toMatch(/parcel_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+parcels\s*\(\s*id\s*\)/i);
    expect(sql).not.toMatch(/parcel_id\s+BIGINT/i);
  });

  it('declares match_type VARCHAR(20) NOT NULL', () => {
    expect(sql).toMatch(/match_type\s+VARCHAR\s*\(\s*20\s*\)\s+NOT\s+NULL/i);
  });

  it('declares confidence DECIMAL(3,2) NOT NULL with 0-1 range CHECK', () => {
    expect(sql).toMatch(/confidence\s+DECIMAL\s*\(\s*3\s*,\s*2\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*confidence\s*>=\s*0\s+AND\s+confidence\s*<=\s*1\s*\)/i);
  });

  it('declares matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', () => {
    expect(sql).toMatch(/matched_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\s*\(\s*\)/i);
  });

  it('declares PRIMARY KEY (lead_id, parcel_id)', () => {
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*lead_id\s*,\s*parcel_id\s*\)/i);
  });

  it('creates idx_lead_parcels_parcel index on parcel_id', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lead_parcels_parcel\s+ON\s+lead_parcels\s*\(\s*parcel_id\s*\)/i);
  });

  it('creates idx_lead_parcels_lead index on lead_id', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lead_parcels_lead\s+ON\s+lead_parcels\s*\(\s*lead_id\s*\)/i);
  });

  it('uses bare CREATE INDEX (not CONCURRENTLY) — empty table at creation', () => {
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
