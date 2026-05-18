// 🔗 SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.A + §6.11 Phase I.1
//             docs/specs/01-pipeline/47_pipeline_script_protocol.md §R9 (Tier framework)
//
// SQL-shape regression-lock for migration 155 (extend permits with matched_status,
// matched_rule, unmapped_status — mirror of mig 146 for coa_applications, minus
// unmapped_decision which is CoA-only per Spec 42 §6.6.A).
//
// Phase I.1 Option B per user authorization 2026-05-18 — closes the substrate
// gap that prevented Phase I.1's classifier from writing permit-side
// lifecycle_status_history rows (mig 127's CHECK constraint anticipated symmetric
// writers but mig 146 only added matched_status to coa_applications).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 155 — extend permits with matched_status columns (WF1 Phase I.1)', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/155_extend_permits_matched_status.sql'),
      'utf-8',
    );
  });

  it('adds matched_status column to permits as nullable TEXT', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+matched_status\s+TEXT/);
  });

  it('adds matched_rule column as nullable SMALLINT', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+matched_rule\s+SMALLINT/);
  });

  it('adds unmapped_status column as BOOLEAN NOT NULL DEFAULT false', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+unmapped_status\s+BOOLEAN NOT NULL DEFAULT false/);
  });

  it('does NOT add unmapped_decision column (decisions are CoA-only per Spec 42 §6.6.A)', () => {
    // Allow the word in header comment ("minus unmapped_decision") but reject the actual ADD COLUMN.
    expect(sql).not.toMatch(/ADD COLUMN[^;]*unmapped_decision/);
  });

  it('adds CHECK constraint chk_permits_matched_rule_range with bounds 0..99', () => {
    expect(sql).toMatch(/ADD CONSTRAINT chk_permits_matched_rule_range/);
    expect(sql).toMatch(/matched_rule >= 0 AND matched_rule <= 99/);
  });

  it('uses NOT VALID + VALIDATE pattern for the CHECK constraint (non-blocking validation)', () => {
    expect(sql).toMatch(/NOT VALID/);
    expect(sql).toMatch(/VALIDATE CONSTRAINT chk_permits_matched_rule_range/);
  });

  it('creates partial index idx_permits_unmapped_status CONCURRENTLY WHERE unmapped_status = true', () => {
    // CONCURRENTLY required because permits is large (~247K rows); CREATE INDEX
    // CONCURRENTLY cannot run inside BEGIN/COMMIT so the index creation is
    // placed AFTER the transaction block in the migration file.
    expect(sql).toMatch(
      /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_permits_unmapped_status\s+ON permits\s*\(unmapped_status\)\s+WHERE unmapped_status = true/,
    );
  });

  it('uses BEGIN/COMMIT transaction wrapper', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m);
    expect(sql).toMatch(/^\s*COMMIT;/m);
  });

  it('uses IF NOT EXISTS guards (idempotent re-application)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/g);
    // Three column adds → at least 3 IF NOT EXISTS clauses
    const matches = sql.match(/ADD COLUMN IF NOT EXISTS/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('DOWN section is comment-only per Rule 6 (migrations 128/132/133/146 convention)', () => {
    // Locate DOWN section
    const downIdx = sql.indexOf('DOWN');
    expect(downIdx).toBeGreaterThan(0);
    const downSection = sql.slice(downIdx);
    // Every non-blank line in DOWN section must start with `--`
    const lines = downSection.split('\n').slice(1); // skip the DOWN header line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      expect(trimmed.startsWith('--')).toBe(true);
    }
  });

  it('mirrors mig 146 type choices (TEXT/SMALLINT/BOOLEAN, NOT VARCHAR(N)/INTEGER)', () => {
    // Defensive: ensure we didn't accidentally write VARCHAR or INTEGER instead of
    // the canonical types from mig 146.
    expect(sql).not.toMatch(/matched_status\s+VARCHAR/);
    expect(sql).not.toMatch(/matched_rule\s+INTEGER/);
  });

  it('references Spec 42 §6.6.A + §6.11 Phase I.1 in header comment', () => {
    expect(sql).toMatch(/Phase I\.1/);
    expect(sql).toMatch(/Spec 42|spec 42|42_chain_coa/i);
  });
});
