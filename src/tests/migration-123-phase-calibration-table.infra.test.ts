// 🔗 SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7
//             docs/specs/02-web-admin/76_lead_feed_health_dashboard.md §3.5
//
// SQL-shape regression-lock for migration 123 (phase_stay_calibration table).
//
// Migration 123 creates the phase_stay_calibration table that stores per-cohort
// (permit_type, phase) percentile statistics computed from
// permit_phase_transitions. Closes Spec 84 bug 84-W4 ("Dead Transition
// Write: Ledger is written but not used") by giving the ledger a downstream
// consumer (the inspector's lifecycle.timeline[] cohort fields).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 123 — phase_stay_calibration table (WF1 #B 2026-05-09)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/123_phase_calibration_table.sql'),
      'utf-8',
    );
  });

  it('creates the phase_stay_calibration table', () => {
    expect(sql).toMatch(/CREATE\s+TABLE[\s\S]*?phase_stay_calibration/i);
  });

  it('declares all required columns: permit_type, phase, median/p25/p75 days, sample_size, computed_at', () => {
    expect(sql).toMatch(/permit_type\s+VARCHAR/i);
    expect(sql).toMatch(/phase\s+VARCHAR/i);
    expect(sql).toMatch(/median_days\s+INTEGER/i);
    expect(sql).toMatch(/p25_days\s+INTEGER/i);
    expect(sql).toMatch(/p75_days\s+INTEGER/i);
    expect(sql).toMatch(/sample_size\s+INTEGER\s+NOT\s+NULL/i);
    expect(sql).toMatch(/computed_at\s+TIMESTAMPTZ/i);
  });

  it('declares composite PK (permit_type, phase)', () => {
    expect(sql).toMatch(/PRIMARY\s+KEY\s*\(\s*permit_type\s*,\s*phase\s*\)/i);
  });

  it('creates a lookup index on (permit_type, phase)', () => {
    expect(sql).toMatch(/CREATE\s+INDEX[\s\S]*?ON\s+phase_stay_calibration\s*\([\s\S]*?permit_type[\s\S]*?phase/i);
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
