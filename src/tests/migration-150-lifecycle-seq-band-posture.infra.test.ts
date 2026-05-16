// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase E.5
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
//             docs/specs/01-pipeline/48_pipeline_observability.md §3.1
//
// SQL-shape regression-lock for migration 150 — Phase E.5 v4.
//
// Mig 150 adds 3 per-kind posture logic_variables that the assert script
// (assert-lifecycle-phase-distribution.js) reads to gate WARN→FAIL routing
// per violation kind:
//   - lifecycle_seq_band_promote_to_fail_band_violation        (default 0)
//   - lifecycle_seq_band_promote_to_fail_no_band_configured    (default 0)
//   - lifecycle_seq_band_promote_to_fail_expected_data_missing (default 0)
//
// Each flag is integer 0/1 (Zod-enforced via .int().min(0).max(1) in the
// script; no DB CHECK constraint per Spec 47 §R4 — Zod is the source of
// truth, and per-row CHECKs scoped by variable_key are not natively
// supported in PostgreSQL).
//
// Operator-driven gate: WF-aligned operator-tunable promotion mechanism
// per Spec 86 Control Panel single-click flow + pre-promotion checklist
// in Spec 84 §3.4.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 150 — lifecycle_seq_band posture flags (WF1 Phase E.5 v4)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/150_lifecycle_seq_band_promote_to_fail.sql'),
      'utf-8',
    );
  });

  // ─── UP — 3 INSERT VALUES rows ──────────────────────────────────────

  it('contains a single INSERT INTO logic_variables with 3 VALUES rows (one per per-kind flag)', () => {
    // Strip line comments first — narrative blocks may reference these constructs.
    const executableOnly = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const insertMatches = executableOnly.match(/INSERT\s+INTO\s+logic_variables/gi);
    expect(insertMatches?.length).toBe(1);
  });

  it('inserts band_violation posture key with default 0', () => {
    expect(sql).toMatch(
      /'lifecycle_seq_band_promote_to_fail_band_violation'\s*,\s*0\b/i,
    );
  });

  it('inserts no_band_configured posture key with default 0', () => {
    expect(sql).toMatch(
      /'lifecycle_seq_band_promote_to_fail_no_band_configured'\s*,\s*0\b/i,
    );
  });

  it('inserts expected_data_missing posture key with default 0', () => {
    expect(sql).toMatch(
      /'lifecycle_seq_band_promote_to_fail_expected_data_missing'\s*,\s*0\b/i,
    );
  });

  // ─── Idempotency ────────────────────────────────────────────────────

  it('uses ON CONFLICT (variable_key) DO NOTHING (operator-tuned values preserved on re-apply)', () => {
    const executableOnly = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executableOnly).toMatch(/ON\s+CONFLICT\s*\(\s*variable_key\s*\)\s+DO\s+NOTHING/i);
  });

  // ─── Transaction-handling convention (mig 135 R8 hotfix) ─────────────

  it('does NOT contain explicit top-level BEGIN/COMMIT (mig 135 R8 hotfix convention)', () => {
    expect(sql).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;/m);
  });

  // ─── -- UP marker (pre-commit hook enforces) ─────────────────────────

  it('contains an `-- UP` marker (project pre-commit hook enforces)', () => {
    expect(sql).toMatch(/--\s*UP\b/i);
  });

  // ─── Comment-only DOWN block (Rule 6 / commit 8b1c10b) ──────────────

  it('comment-only DOWN block (Rule 6 — migrate.js does not respect markers)', () => {
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

  it('DOWN block documents 3-key DELETE for rollback', () => {
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const afterDown = sql.slice(downIdx);
    // Either inline IN clause or 3 separate DELETE statements — both acceptable
    // shapes; the test ensures all 3 keys are referenced in the DOWN comments.
    expect(afterDown).toMatch(/lifecycle_seq_band_promote_to_fail_band_violation/);
    expect(afterDown).toMatch(/lifecycle_seq_band_promote_to_fail_no_band_configured/);
    expect(afterDown).toMatch(/lifecycle_seq_band_promote_to_fail_expected_data_missing/);
    expect(afterDown).toMatch(/DELETE\s+FROM\s+logic_variables/i);
  });

  // ─── SPEC LINK headers ──────────────────────────────────────────────

  it('SPEC LINK header references Spec 42 §6.11 + Spec 84 §3.4 + Spec 48 §3.1', () => {
    expect(sql).toMatch(/SPEC LINK[\s\S]*?42_chain_coa/i);
    expect(sql).toMatch(/SPEC LINK[\s\S]*?84_lifecycle_phase_engine/i);
    expect(sql).toMatch(/SPEC LINK[\s\S]*?48_pipeline_observability/i);
  });
});
