// 🔗 SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3.A (CoA geometric path)
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 operator-tunable values
//             docs/specs/01-pipeline/79_pipeline_step_validation.md (validation trigger)
//
// SQL-shape regression-lock for migration 156. Surfaced by Spec 79 pipeline validation
// CoA chain Step 7 — compute-coa-cost-estimates.js Zod schema requires model_range_pct +
// fallback_range_pct as finite numbers in [0,1]. Both were missing from logic_variables
// (verified empty result on 2026-05-19 DB query).
//
// Defaults match scripts/lib/coa-cost-model.js lines 23-24 runtime fallback values.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 156 — seed CoA cost model logic_variables (Spec 79 HIGH-6)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/156_seed_coa_cost_model_logic_variables.sql'),
      'utf-8',
    );
  });

  // ─── UP — both keys present with documented defaults ────────────────

  it('seeds model_range_pct with default 0.20 (matches DEFAULT_MODEL_RANGE_PCT)', () => {
    expect(sql).toMatch(/'model_range_pct'\s*,\s*0\.20\b/);
  });

  it('seeds fallback_range_pct with default 0.40 (matches DEFAULT_FALLBACK_RANGE_PCT)', () => {
    expect(sql).toMatch(/'fallback_range_pct'\s*,\s*0\.40\b/);
  });

  it('contains a single INSERT INTO logic_variables (both keys in one statement)', () => {
    const exec = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    const insertCount = (exec.match(/INSERT\s+INTO\s+logic_variables/gi) || []).length;
    expect(insertCount).toBe(1);
  });

  // ─── UPSERT strategy (DeepSeek HIGH fold — handle NULL/NaN existing values) ─

  it('uses ON CONFLICT DO UPDATE (NOT DO NOTHING) — to repair NULL/NaN existing values', () => {
    // DeepSeek HIGH WF3 #5 fold: a pure ON CONFLICT DO NOTHING leaves NULL/NaN
    // existing rows in their broken state, and Zod will still fail on next run.
    // DO UPDATE with the WHERE guard handles the NULL/NaN repair case.
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+UPDATE/i);
    expect(sql).not.toMatch(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+NOTHING/i);
  });

  it('UPSERT preserves operator-tuned values (WHERE existing IS NULL OR is NaN)', () => {
    // The conditional WHERE clause ensures DO UPDATE only fires when the
    // existing value is NULL or NaN — never overwrites a valid operator
    // tuning (preserves Spec 47 §4.1 operator-tunable contract).
    expect(sql).toMatch(/WHERE\s+logic_variables\.variable_value\s+IS\s+NULL/i);
    expect(sql).toMatch(/logic_variables\.variable_value\s*=\s*'NaN'::numeric/i);
  });

  // ─── DOWN — comment-only per Rule 6 ─────────────────────────────────

  it('DOWN section is comment-only per Rule 6 convention', () => {
    const downIdx = sql.indexOf('-- DOWN');
    expect(downIdx).toBeGreaterThan(-1);
    const downSection = sql.slice(downIdx);
    // Every non-blank line in DOWN section must start with `--`
    const lines = downSection.split('\n').slice(1);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      expect(trimmed.startsWith('--')).toBe(true);
    }
  });

  it('has NO explicit BEGIN/COMMIT (logic_variables INSERT convention)', () => {
    expect(sql).not.toMatch(/^\s*BEGIN\s*;/im);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;/im);
  });

  // ─── SPEC LINK ──────────────────────────────────────────────────────

  it('references Spec 83 §3.A + Spec 47 §4.1 in header comment', () => {
    expect(sql).toMatch(/Spec\s+83\s+§3\.A|83_lead_cost_model.*§3\.A/i);
    expect(sql).toMatch(/Spec\s+47\s+§4\.1|47_pipeline_script_protocol.*§4\.1/i);
  });
});
