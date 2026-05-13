// 🔗 SPEC LINK: docs/specs/02-web-admin/86_control_panel.md §1 (logic_variables surface)
//             docs/specs/01-pipeline/82_crm_assistant_alerts.md (CoA stall + imminent)
//             docs/specs/01-pipeline/42_chain_coa.md §6.6.A.1 (orphan-audit CQA gate)
//
// SQL-shape regression-lock for migration 136 (Phase B logic_variables seed).
//
// Seeds 5 standalone logic_variables rows for Phase F / Phase C / Phase B
// consumers. Original draft also seeded 330 seq-level distribution band
// keys with NULL values — removed during R6 CI hotfix when the staging
// migration revealed that logic_variables.variable_value is DECIMAL NOT
// NULL (migration 092) and the _sample_size_threshold tier-selector
// values are enum strings that don't fit DECIMAL anyway. The 330 band
// keys are now Phase E's responsibility (recalibration script inserts
// them ON CONFLICT DO UPDATE once observed values exist).
//
// ON CONFLICT (variable_key) DO NOTHING — re-runs are no-ops; operator-
// tuned values already present in the DB are preserved.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 136 — logic_variables Phase B seed (WF1 #coa-pipeline-parity-phase-b R5.4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/136_seed_logic_variables_phase_b.sql'),
      'utf-8',
    );
  });

  it('inserts into logic_variables (not creating a new table)', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
  });

  it('declares (variable_key, variable_value, description) column list', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables\s*\(\s*variable_key\s*,\s*variable_value\s*,\s*description\s*\)/i);
  });

  it('uses ON CONFLICT (variable_key) DO NOTHING for re-runnability', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+NOTHING/i);
  });

  it('does NOT seed seq-level band keys (deferred to Phase E recalibration — CI hotfix)', () => {
    // The original draft seeded 330 lifecycle_band_seq_<N>_* rows with
    // NULL values, but logic_variables.variable_value is DECIMAL NOT NULL.
    // Phase E recalibration writes the band rows once observed values
    // exist. This test prevents the regression.
    const executableUp = (() => {
      const downIdx = sql.search(/--\s*DOWN\b/i);
      const upBody = downIdx === -1 ? sql : sql.slice(0, downIdx);
      return upBody
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
    })();
    expect(executableUp).not.toMatch(/'lifecycle_band_seq_\d+_(min|max|sample_size_threshold)'/);
  });

  it('seeds lifecycle_status_history_retention_days = 1825 (5 years, per Spec 86)', () => {
    expect(sql).toMatch(/'lifecycle_status_history_retention_days'\s*,\s*1825\s*,/i);
  });

  it('seeds coa_stall_threshold_p2_days = 90 (per Spec 82)', () => {
    expect(sql).toMatch(/'coa_stall_threshold_p2_days'\s*,\s*90\s*,/i);
  });

  it('seeds coa_imminent_window_days = 7 (per Spec 82)', () => {
    expect(sql).toMatch(/'coa_imminent_window_days'\s*,\s*7\s*,/i);
  });

  it('seeds coa_orphan_lead_id_warn_threshold = 0 (CQA gate)', () => {
    expect(sql).toMatch(/'coa_orphan_lead_id_warn_threshold'\s*,\s*0\s*,/i);
  });

  it('seeds phase_b_revision_num_max_length = 2 (Phase B preflight)', () => {
    expect(sql).toMatch(/'phase_b_revision_num_max_length'\s*,\s*2\s*,/i);
  });

  it('uses unquoted numeric literals (variable_value column is DECIMAL NOT NULL)', () => {
    // The original draft used quoted string literals ('1825', '90'); both
    // forms work via implicit cast but the unquoted form makes the
    // DECIMAL constraint explicit at the SQL layer.
    expect(sql).not.toMatch(/'lifecycle_status_history_retention_days'\s*,\s*'1825'/i);
  });

  it('does NOT use CONCURRENTLY (seed-only migration, no indexes)', () => {
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
