// SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 Phase D R5.1
//
// Migration 145 — Phase D classifier substrate. 6 components:
//   1. Add parcel_linked_at + trade_classified_at to coa_applications
//   2. 4 partial indexes on classifier-state columns
//   3. cost_estimates PK swap (atomic combined ALTER + lock_timeout safety)
//   4. cost_source CHECK extension to include 'geometric' (preserving 'none')
//   5. lead_id_orphan_audit view update (COALESCE for nullable cost_estimates rows)
//   6. FK COMMENT documenting Phase G interlock
//
// Structural test (regex over SQL). Runtime correctness verified by the
// companion db.test.ts at R5.1.d Green Light.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 145 — Phase D classifier substrate (R5.1)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/145_phase_d_classifier_substrate.sql'),
      'utf-8',
    );
  });

  describe('Component 1 — coa_applications timestamp columns', () => {
    it('adds parcel_linked_at TIMESTAMPTZ (nullable)', () => {
      expect(sql).toMatch(/ALTER\s+TABLE\s+coa_applications[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+parcel_linked_at\s+TIMESTAMPTZ/i);
    });

    it('adds trade_classified_at TIMESTAMPTZ (nullable)', () => {
      expect(sql).toMatch(/ALTER\s+TABLE\s+coa_applications[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+trade_classified_at\s+TIMESTAMPTZ/i);
    });

    it('does not declare either column NOT NULL (additive only)', () => {
      expect(sql).not.toMatch(/parcel_linked_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
      expect(sql).not.toMatch(/trade_classified_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
    });
  });

  describe('Component 2 — 4 partial indexes on classifier-state columns', () => {
    it('creates idx_coa_parcel_linked_at WHERE parcel_linked_at IS NOT NULL', () => {
      expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_parcel_linked_at[\s\S]*?WHERE\s+parcel_linked_at\s+IS\s+NOT\s+NULL/i);
    });

    it('creates idx_coa_scope_classified_at WHERE scope_classified_at IS NOT NULL', () => {
      expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_scope_classified_at[\s\S]*?WHERE\s+scope_classified_at\s+IS\s+NOT\s+NULL/i);
    });

    it('creates idx_coa_trade_classified_at WHERE trade_classified_at IS NOT NULL', () => {
      expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_trade_classified_at[\s\S]*?WHERE\s+trade_classified_at\s+IS\s+NOT\s+NULL/i);
    });

    it('creates idx_coa_cost_classified_at WHERE cost_classified_at IS NOT NULL', () => {
      expect(sql).toMatch(/CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_coa_cost_classified_at[\s\S]*?WHERE\s+cost_classified_at\s+IS\s+NOT\s+NULL/i);
    });
  });

  describe('Component 3 — cost_estimates PK swap (atomic + production-safe)', () => {
    it('sets lock_timeout=500ms (production safety per R2.v5 fix C)', () => {
      expect(sql).toMatch(/SET\s+LOCAL\s+lock_timeout\s*=\s*'500ms'/i);
    });

    it('sets statement_timeout cap (production safety)', () => {
      expect(sql).toMatch(/SET\s+LOCAL\s+statement_timeout\s*=\s*'\d+(min|s)'/i);
    });

    it('pre-checks cost_estimates row count <1M (production safety per R2.v5 fix C)', () => {
      // Sanity guard before the ACCESS EXCLUSIVE swap
      expect(sql).toMatch(/SELECT\s+COUNT\s*\(\s*\*\s*\)\s+FROM\s+cost_estimates|cost_estimates_count|COUNT\s*\(\s*\*\s*\)\s*INTO\s+\w+\s+FROM\s+cost_estimates/i);
    });

    it('combines DROP CONSTRAINT + ADD CONSTRAINT in single ALTER TABLE (atomic per R2.v5 fix B)', () => {
      // Worktree CRITICAL: must be ONE statement, not two separate ALTERs, to
      // avoid a window with no PK on cost_estimates.
      expect(sql).toMatch(/ALTER\s+TABLE\s+cost_estimates\s+DROP\s+CONSTRAINT\s+cost_estimates_pkey\s*,\s*ADD\s+CONSTRAINT\s+cost_estimates_pkey\s+PRIMARY\s+KEY\s*\(\s*lead_id\s*\)/i);
    });

    it('drops NOT NULL on permit_num + revision_num (after the PK swap removes them from the PK)', () => {
      expect(sql).toMatch(/ALTER\s+TABLE\s+cost_estimates\s+ALTER\s+COLUMN\s+permit_num\s+DROP\s+NOT\s+NULL/i);
      expect(sql).toMatch(/ALTER\s+TABLE\s+cost_estimates\s+ALTER\s+COLUMN\s+revision_num\s+DROP\s+NOT\s+NULL/i);
    });

    it('drops redundant uniq_cost_estimates_lead_id index (superseded by new PK)', () => {
      expect(sql).toMatch(/DROP\s+INDEX\s+(CONCURRENTLY\s+)?IF\s+EXISTS\s+uniq_cost_estimates_lead_id/i);
    });
  });

  describe('Component 4 — cost_source CHECK constraint extension', () => {
    it('DROPs the existing cost_estimates_cost_source_check constraint by exact name', () => {
      // Per migration 096, the constraint is named cost_estimates_cost_source_check.
      // R2.v5 fix A — Worktree CRITICAL: must reference the actual name, not the
      // unnamed migration 071 CHECK.
      expect(sql).toMatch(/ALTER\s+TABLE\s+cost_estimates\s+DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?cost_estimates_cost_source_check/i);
    });

    it('ADDs new CHECK including ALL of permit, model, none, geometric (R2.v5 fix A — must preserve none)', () => {
      // Worktree CRITICAL: migration 096 already added 'none'. Dropping 'none'
      // from the new CHECK would break permit-side compute-cost-estimates.js.
      const checkMatch = sql.match(/ADD\s+CONSTRAINT\s+cost_estimates_cost_source_check[\s\S]*?CHECK\s*\(\s*cost_source\s+IN\s*\(([^)]+)\)/i);
      expect(checkMatch).not.toBeNull();
      const values = checkMatch![1];
      expect(values).toMatch(/'permit'/);
      expect(values).toMatch(/'model'/);
      expect(values).toMatch(/'none'/);
      expect(values).toMatch(/'geometric'/);
    });
  });

  describe('Component 5 — lead_id_orphan_audit view update (R2.v5 fix D)', () => {
    it('CREATE OR REPLACE VIEW lead_id_orphan_audit', () => {
      expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+VIEW\s+lead_id_orphan_audit/i);
    });

    it('cost_estimates branch uses COALESCE so CoA-row source_row_id is not NULL', () => {
      // Worktree HIGH: ce.permit_num || ':' || ce.revision_num produces NULL
      // when both are NULL (CoA rows after Phase D). COALESCE(ce.lead_id, ...)
      // falls back to lead_id which is always non-NULL after mig 138.
      expect(sql).toMatch(/COALESCE\s*\(\s*ce\.lead_id\s*,/i);
    });
  });

  describe('Component 6 — FK COMMENT (R2.v5 fix J — Gemini MED)', () => {
    it('emits COMMENT ON CONSTRAINT for the composite FK explaining Phase G interlock', () => {
      // Gemini MED: future developers will be confused by a composite FK on
      // nullable columns. Inline COMMENT documents the rationale.
      expect(sql).toMatch(/COMMENT\s+ON\s+CONSTRAINT[\s\S]*?cost_estimates[\s\S]*?Phase\s+G/i);
    });
  });

  describe('Migration hygiene', () => {
    it('comment-only DOWN block per Rule 6', () => {
      expect(sql).toMatch(/--\s*DOWN\b/i);
      const downIdx = sql.search(/--\s*DOWN\b/i);
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

    it('has SPEC LINK header', () => {
      expect(sql).toMatch(/SPEC\s+LINK|Spec:\s*docs\/specs/i);
    });
  });
});
