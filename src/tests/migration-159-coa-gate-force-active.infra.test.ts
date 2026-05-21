// 🔗 SPEC LINK: docs/specs/01-pipeline/79_pipeline_step_validation.md §7a (Pass-2.5)
//             docs/specs/01-pipeline/41_chain_permits.md §C+F (compute_trade_forecasts CoA UNION)
//             docs/specs/01-pipeline/48_pipeline_observability.md §3.6 (audit_table cascade)
//
// Mig 159 seeds `coa_gate_force_active` logic_variable (default 0). This is the
// operator safety valve added by WF3 #2 (Finding J) to break the chicken-and-egg
// gate deadlock when `compute-trade-forecasts.js`'s audit-verdict gate would
// otherwise permanently block CoA writes (e.g., post-7-day grace if calibration
// still WARNs because cohorts never populated).
//
// SQL-shape regression-lock — no live DB needed.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 159 — coa_gate_force_active logic_variable seed', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/159_coa_gate_force_active_logic_variable.sql'),
      'utf-8',
    );
  });

  it('inserts the `coa_gate_force_active` logic_variable with default 0', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables/i);
    expect(sql).toMatch(/'coa_gate_force_active'\s*,\s*0/);
  });

  it('uses ON CONFLICT DO NOTHING (idempotent; preserves operator-set value)', () => {
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+NOTHING/i);
  });

  it('description explains the operator override semantics + safety-valve purpose', () => {
    expect(sql).toMatch(/Operator override|safety valve|deadlock/i);
    expect(sql).toMatch(/compute-trade-forecasts/i);
  });

  it('SPEC LINK header references Spec 79 §7a (the WF3 origin)', () => {
    expect(sql).toMatch(/Spec\s+79|79_pipeline_step_validation/i);
  });
});
