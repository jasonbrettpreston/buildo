/**
 * scope_intensity_matrix.regression.test.ts
 *
 * SPEC LINK: docs/specs/01-pipeline/83_lead_cost_model.md §3.A
 *
 * Asserts the migration 163 file contains the expected production-vocabulary
 * structure: DELETE block targets the 18 old lowercase pairs, INSERT block
 * has 32 production-vocab rows including the largest top-N tuples.
 *
 * Note: this is a file-content regression test (cheap) — DB-state assertions
 * live in src/tests/cost-estimates.db.test.ts (skipped unless BUILDO_TEST_DB=1).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(__dirname, '../../migrations/163_scope_intensity_matrix_production_vocab.sql');
const sql = readFileSync(migrationPath, 'utf8');

describe('migration 163 — scope_intensity_matrix production-vocab re-key', () => {
  it('uses ON CONFLICT against the existing PRIMARY KEY (no new UNIQUE added)', () => {
    expect(sql).toMatch(/ON CONFLICT \(permit_type, structure_type\) DO UPDATE/);
    expect(sql).not.toMatch(/ADD CONSTRAINT.*UNIQUE/);
  });

  it('adds the allocation CHECK constraint idempotently', () => {
    expect(sql).toMatch(/scope_intensity_matrix_alloc_chk/);
    expect(sql).toMatch(/CHECK \(gfa_allocation_percentage > 0 AND gfa_allocation_percentage <= 1\)/);
  });

  it('DELETEs the 18 old lowercase pairs by EXACT (pt, st) pair', () => {
    expect(sql).toMatch(/DELETE FROM scope_intensity_matrix WHERE \(permit_type, structure_type\) IN/);
    // sample of old pairs
    expect(sql).toMatch(/\('addition', 'sfd'\)/);
    expect(sql).toMatch(/\('new building', 'townhouse'\)/);
    expect(sql).toMatch(/\('interior alteration', 'sfd'\)/);
  });

  it('INSERTs the top PI-1 production-vocabulary tuples', () => {
    expect(sql).toMatch(/'Small Residential Projects',\s+'SFD - Detached'/);
    expect(sql).toMatch(/'New Houses',\s+'SFD - Detached'/);
    expect(sql).toMatch(/'Building Additions\/Alterations',\s+'Office'/);
    expect(sql).toMatch(/'Building Additions\/Alterations',\s+'Apartment Building'/);
    expect(sql).toMatch(/'Residential Building Permit',\s+'SFD - Detached'/);
    expect(sql).toMatch(/'New Building',\s+'Apartment Building'/);
  });

  it('does NOT INSERT trade-specific permit_types (safe-skip per §3.A(d))', () => {
    expect(sql).not.toMatch(/'Plumbing\(PS\)'/);
    expect(sql).not.toMatch(/'Mechanical\(MS\)'/);
    expect(sql).not.toMatch(/'Drain and Site Service'/);
    expect(sql).not.toMatch(/'Demolition Folder/);
  });

  it('wraps the change in a single transaction', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});
