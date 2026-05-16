// 🔗 SPEC LINK: docs/specs/01-pipeline/85_trade_forecast_engine.md §3 (CoA-stage Anchor priority)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 (operator-tunable values in DB)
//             docs/specs/01-pipeline/48_pipeline_observability.md §3.4 (baseline window)
//
// SQL-shape regression-lock for migration 152 — Phase F.1 v4.
//
// Mig 152 seeds TWO logic_variables consumed by compute-trade-forecasts.js Phase F.1:
//   1. coa_lifecycle_transition_stale_days (default 180) — snowplow staleness gate (v3 CRIT-D fold)
//   2. coa_gate_calibration_window_days (default 7)      — gate freshness window (v4 MED-J fold)
//
// Both keys are integer; Zod validates via .int().positive() at script startup.
// ON CONFLICT DO NOTHING preserves operator-tuned values on re-run.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 152 — CoA forecast logic_variables (WF1 Phase F.1 v4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/152_coa_forecast_logic_variables.sql'),
      'utf-8',
    );
  });

  // ─── UP — single INSERT VALUES with 2 rows ──────────────────────────

  it('contains a single INSERT INTO logic_variables', () => {
    const exec = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const insertCount = (exec.match(/INSERT\s+INTO\s+logic_variables/gi) || []).length;
    expect(insertCount).toBe(1);
  });

  it('seeds coa_lifecycle_transition_stale_days with default 180 (v3 CRIT-D fold)', () => {
    expect(sql).toMatch(/'coa_lifecycle_transition_stale_days'\s*,\s*180\b/);
  });

  it('seeds coa_gate_calibration_window_days with default 7 (v4 MED-J fold)', () => {
    expect(sql).toMatch(/'coa_gate_calibration_window_days'\s*,\s*7\b/);
  });

  it('uses ON CONFLICT (variable_key) DO NOTHING for idempotency', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+NOTHING/i);
  });

  it('has NO explicit BEGIN/COMMIT (mig 135 R8 convention for logic_variables INSERTs)', () => {
    const exec = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    expect(exec).not.toMatch(/\bBEGIN\s*;/i);
    expect(exec).not.toMatch(/\bCOMMIT\s*;/i);
  });

  // ─── DOWN — comment-only per Rule 6 convention ──────────────────────

  it('DOWN block is comment-only (Rule 6 convention)', () => {
    const downIdx = sql.indexOf('-- DOWN');
    expect(downIdx).toBeGreaterThan(0);
    const downSection = sql.slice(downIdx);
    const nonCommentLines = downSection
      .split('\n')
      .filter(line => line.trim() !== '' && !line.trim().startsWith('--') && !line.startsWith('==='));
    expect(nonCommentLines).toEqual([]);
  });

  it('DOWN block references both seeded keys in DELETE template', () => {
    expect(sql).toMatch(/coa_lifecycle_transition_stale_days/);
    expect(sql).toMatch(/coa_gate_calibration_window_days/);
    expect(sql).toMatch(/DELETE\s+FROM\s+logic_variables\s+WHERE\s+variable_key\s+IN/i);
  });

  // ─── SPEC LINK header ─────────────────────────────────────────────

  it('contains SPEC LINK references to Spec 85 + Spec 47 + Spec 48', () => {
    expect(sql).toMatch(/SPEC LINK.*85_trade_forecast_engine\.md/);
    expect(sql).toMatch(/SPEC LINK.*47_pipeline_script_protocol\.md/);
    expect(sql).toMatch(/SPEC LINK.*48_pipeline_observability\.md/);
  });
});
