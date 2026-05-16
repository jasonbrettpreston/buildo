// 🔗 SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 operator-tunable values
//
// SQL-shape regression-lock for migration 154 — Phase F.2 v4.
//
// Mig 154 seeds ONE new logic_variable: coa_stall_threshold_postponed_days=60 (v2 CRIT-A fold).
// The other 3 v1-proposed keys (coa_stall_threshold, coa_stall_threshold_p2_days,
// coa_imminent_window_days) ALREADY EXIST in DB from mig 093 + mig 136. v2 HIGH-I promotes the
// previously-hardcoded 60-day Postponed/Deferred threshold to operator-tunable.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 154 — CoA CRM assistant logic_variables (WF1 Phase F.2 v4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/154_coa_crm_assistant_logic_variables.sql'),
      'utf-8',
    );
  });

  // ─── UP — single INSERT, single key ─────────────────────────────────

  it('contains a single INSERT INTO logic_variables', () => {
    const exec = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    const insertCount = (exec.match(/INSERT\s+INTO\s+logic_variables/gi) || []).length;
    expect(insertCount).toBe(1);
  });

  it('seeds ONLY coa_stall_threshold_postponed_days with default 60 (v2 CRIT-A fold — 1 new key only)', () => {
    expect(sql).toMatch(/'coa_stall_threshold_postponed_days'\s*,\s*60\b/);
  });

  it('does NOT re-seed existing keys (coa_stall_threshold / coa_stall_threshold_p2_days / coa_imminent_window_days)', () => {
    const exec = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    // These keys already exist via mig 093 + mig 136 — re-seeding them is wasteful (ON CONFLICT
    // DO NOTHING would no-op but the migration should remain narrowly scoped).
    expect(exec).not.toMatch(/'coa_stall_threshold'\s*,/);
    expect(exec).not.toMatch(/'coa_stall_threshold_p2_days'\s*,/);
    expect(exec).not.toMatch(/'coa_imminent_window_days'\s*,/);
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

  it('DOWN block is comment-only with the 1 new key in DELETE template', () => {
    const downIdx = sql.indexOf('-- DOWN');
    expect(downIdx).toBeGreaterThan(0);
    const downSection = sql.slice(downIdx);
    const nonCommentLines = downSection
      .split('\n')
      .filter(line => line.trim() !== '' && !line.trim().startsWith('--') && !line.startsWith('==='));
    expect(nonCommentLines).toEqual([]);
    expect(sql).toMatch(/DELETE\s+FROM\s+logic_variables\s+WHERE\s+variable_key\s*=\s*'coa_stall_threshold_postponed_days'/i);
  });

  it('SPEC LINK header references Spec 82 + Spec 47', () => {
    expect(sql).toMatch(/SPEC LINK.*82_crm_assistant_alerts/);
    expect(sql).toMatch(/SPEC LINK.*47_pipeline_script_protocol/);
  });
});
