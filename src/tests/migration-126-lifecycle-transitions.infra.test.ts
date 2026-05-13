// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 126 (lifecycle_transitions table).
//
// Migration 126 creates the unified lifecycle_transitions ledger — replaces
// permit_phase_transitions in Phase H. Captures phase-level transitions with
// BOTH legacy P-codes AND new granular Universal Stream seq references
// (from_seq / to_seq populated in Phase E).
//
// NO backward-compat view in Phase B — existing permit_phase_transitions
// table stays live through Phase G (R2.v3 Item C1 fix).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 126 — lifecycle_transitions table (WF1 #coa-pipeline-parity-phase-b R5.1)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/126_create_lifecycle_transitions.sql'),
      'utf-8',
    );
  });

  it('creates the lifecycle_transitions table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lifecycle_transitions/i);
  });

  it('declares id SERIAL PRIMARY KEY', () => {
    expect(sql).toMatch(/id\s+SERIAL\s+PRIMARY\s+KEY/i);
  });

  it('declares lead_id TEXT NOT NULL with CHECK regex', () => {
    expect(sql).toMatch(/lead_id\s+TEXT\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*lead_id\s*~\s*'\^\(permit\|coa\):\.\+\$'\s*\)/);
  });

  it('declares from_phase VARCHAR(20) (legacy P-code, nullable)', () => {
    expect(sql).toMatch(/from_phase\s+VARCHAR\s*\(\s*20\s*\)/i);
  });

  it('declares to_phase VARCHAR(20) NOT NULL', () => {
    expect(sql).toMatch(/to_phase\s+VARCHAR\s*\(\s*20\s*\)\s+NOT\s+NULL/i);
  });

  it('declares from_seq INTEGER (granular Universal Stream row reference)', () => {
    expect(sql).toMatch(/from_seq\s+INTEGER/i);
  });

  it('declares to_seq INTEGER', () => {
    expect(sql).toMatch(/to_seq\s+INTEGER/i);
  });

  it('declares transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', () => {
    expect(sql).toMatch(/transitioned_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\s*\(\s*\)/i);
  });

  it('declares cohort dimensions: permit_type, project_type, coa_type_class, neighbourhood_id', () => {
    expect(sql).toMatch(/permit_type\s+VARCHAR\s*\(\s*50\s*\)/i);
    expect(sql).toMatch(/project_type\s+VARCHAR\s*\(\s*50\s*\)/i);
    expect(sql).toMatch(/coa_type_class\s+VARCHAR\s*\(\s*30\s*\)/i);
    expect(sql).toMatch(/neighbourhood_id\s+BIGINT/i);
  });

  it('creates idx_lifecycle_transitions_lead on lead_id', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lifecycle_transitions_lead\s+ON\s+lifecycle_transitions\s*\(\s*lead_id\s*\)/i);
  });

  it('creates idx_lifecycle_transitions_phase on (from_phase, to_phase)', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lifecycle_transitions_phase\s+ON\s+lifecycle_transitions\s*\(\s*from_phase\s*,\s*to_phase\s*\)/i);
  });

  it('creates partial idx_lifecycle_transitions_seq on (from_seq, to_seq) WHERE from_seq IS NOT NULL', () => {
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_lifecycle_transitions_seq\s+ON\s+lifecycle_transitions\s*\(\s*from_seq\s*,\s*to_seq\s*\)\s+WHERE\s+from_seq\s+IS\s+NOT\s+NULL/i);
  });

  it('uses bare CREATE INDEX (not CONCURRENTLY) — empty table at creation', () => {
    expect(sql).not.toMatch(/CREATE\s+INDEX\s+CONCURRENTLY/i);
  });

  it('does NOT create a backward-compat view aliasing permit_phase_transitions (R2.v3 C1 fix)', () => {
    // R2.v3 Item C1: views break live writers (classify-lifecycle-phase.js et al.
    // INSERT/DELETE by name on permit_phase_transitions). Phase B is purely
    // additive — old table stays live through Phase G.
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+permit_phase_transitions/i);
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
