// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.7 step 6 + §6.11 Phase E.3
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §7
//             docs/specs/00-architecture/01_database_schema.md §3.A
//
// SQL-shape regression-lock for migration 147 — Phase E.3 v5.
//
// Mig 147 drops legacy PK (permit_type, phase) from phase_stay_calibration,
// makes permit_type + phase nullable, adds a partial unique index restoring
// 2-tuple uniqueness for permit-side rows (where permit_type IS NOT NULL),
// and adds a partial composite index on lifecycle_transitions for the CoA
// aggregate's LAG window.
//
// v5 fold v4-M1: DOWN block adds `DELETE WHERE phase IS NULL` step to make
// rollback work against post-E.3 data state.
//
// v4 fold v3-IF: NO explicit BEGIN/COMMIT (mig 135 R8 hotfix convention —
// runner provides outer transaction; explicit COMMIT commits it prematurely).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 147 — phase_stay_calibration drop legacy PK (WF1 Phase E.3 v5)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/147_phase_stay_calibration_drop_legacy_pk.sql'),
      'utf-8',
    );
  });

  // ─── UP — schema changes ──────────────────────────────────────────────

  it('drops the legacy PRIMARY KEY on (permit_type, phase) (v3 fold v2-G)', () => {
    expect(sql).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+phase_stay_calibration_pkey/i);
  });

  it('makes permit_type nullable (CoA-side rows have NULL permit_type)', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+phase_stay_calibration[\s\S]*?ALTER\s+COLUMN\s+permit_type\s+DROP\s+NOT\s+NULL/i);
  });

  it('makes phase nullable (MIN(from_phase) can be NULL for all-null partition)', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+phase_stay_calibration[\s\S]*?ALTER\s+COLUMN\s+phase\s+DROP\s+NOT\s+NULL/i);
  });

  it('creates partial unique index restoring permit-side 2-tuple uniqueness (v5 fold v3-DS-1)', () => {
    // (permit_type, phase) WHERE permit_type IS NOT NULL — excludes CoA rows.
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+phase_stay_calibration_permit_legacy_unique[\s\S]*?ON\s+phase_stay_calibration\s*\(\s*permit_type\s*,\s*phase\s*\)[\s\S]*?WHERE\s+permit_type\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('creates partial composite index on lifecycle_transitions for CoA LAG window (v5 fold v3-G-HIGH-2)', () => {
    // (lead_id, transitioned_at, id) WHERE lead_id LIKE 'coa:%' — keeps the
    // index small (CoA rows only) while supporting the LAG window's PARTITION/ORDER.
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+lifecycle_transitions_coa_lag_idx[\s\S]*?ON\s+lifecycle_transitions\s*\(\s*lead_id\s*,\s*transitioned_at\s*,\s*id\s*\)[\s\S]*?WHERE\s+lead_id\s+LIKE\s+'coa:%'/i,
    );
  });

  // ─── Transaction-handling convention (mig 135 R8 hotfix) ─────────────

  it('does NOT contain explicit top-level BEGIN/COMMIT (v4 fold v3-IF — runner wraps; explicit commits prematurely)', () => {
    // The substring "BEGIN" may appear in `DO $$ BEGIN ... END $$` PL/pgSQL blocks.
    // Anchor on lines that START with BEGIN/COMMIT (top-level transaction control).
    expect(sql).not.toMatch(/^\s*BEGIN\s*;/m);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;/m);
  });

  // ─── Convention: -- UP marker (caught by pre-commit hook) ────────────

  it('contains an `-- UP` marker (project pre-commit hook enforces this)', () => {
    expect(sql).toMatch(/--\s*UP\b/i);
  });

  // ─── Comment-only DOWN block per Rule 6 / commit 8b1c10b ─────────────

  it('comment-only DOWN block (Rule 6 — migrate.js does not respect -- UP/-- DOWN markers)', () => {
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

  it('DOWN block documents both DELETE steps before re-adding constraints (v5 fold v4-M1)', () => {
    // The rollback must:
    //   1a. DELETE FROM phase_stay_calibration WHERE permit_type IS NULL (CoA-side rows)
    //   1b. DELETE FROM phase_stay_calibration WHERE phase IS NULL (catch any NULL-phase row)
    //   then re-add NOT NULL + PRIMARY KEY.
    // Both DELETEs must appear in DOWN comments BEFORE the SET NOT NULL / ADD PRIMARY KEY steps.
    const downIdx = sql.search(/--\s*DOWN\b/i);
    const afterDown = sql.slice(downIdx);
    // The DOWN steps are comments, so search inside them. Both DELETE patterns required.
    expect(afterDown).toMatch(/DELETE\s+FROM\s+phase_stay_calibration\s+WHERE\s+permit_type\s+IS\s+NULL/i);
    expect(afterDown).toMatch(/DELETE\s+FROM\s+phase_stay_calibration\s+WHERE\s+phase\s+IS\s+NULL/i);
    // The SET NOT NULL + ADD PRIMARY KEY references should come after the DELETE steps
    // in the comment ordering.
    const phaseDeleteIdx = afterDown.search(/DELETE\s+FROM\s+phase_stay_calibration\s+WHERE\s+phase\s+IS\s+NULL/i);
    const setNotNullIdx = afterDown.search(/ALTER\s+COLUMN\s+phase\s+SET\s+NOT\s+NULL/i);
    expect(phaseDeleteIdx).toBeGreaterThanOrEqual(0);
    expect(setNotNullIdx).toBeGreaterThan(phaseDeleteIdx);
  });

  it('SPEC LINK header references Spec 42 + Spec 84 (Phase E.3 anchor)', () => {
    expect(sql).toMatch(/SPEC LINK[\s\S]*?42_chain_coa/i);
    expect(sql).toMatch(/SPEC LINK[\s\S]*?84_lifecycle_phase_engine/i);
  });
});
