// 🔗 SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4
//             docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3.4
//             docs/specs/02-web-admin/86_control_panel.md §1
//
// SQL-string assertions on migration 119. Mirrors the existing pattern in
// migration-118-realtor-trade.infra.test.ts (text-based regex checks on
// the migration body — no live DB needed).
//
// Migration 119 moves the 18 phase distribution bands + 3 cross-status
// thresholds out of the hardcoded `EXPECTED_BANDS` constant in
// scripts/quality/assert-lifecycle-phase-distribution.js into the
// `logic_variables` table, per Spec 47's "no hardcoded thresholds"
// mandate. Total: 39 INSERTs (36 band keys × min/max + 3 threshold keys).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('migration 119 — lifecycle phase bands → logic_variables', () => {
  let sql: string;
  beforeAll(() => {
    sql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/119_lifecycle_phase_bands_logic_variables.sql'),
      'utf-8',
    );
  });

  it('inserts into logic_variables', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+logic_variables/i);
  });

  it('uses ON CONFLICT DO NOTHING for idempotency + operator-hotfix preservation', () => {
    // Same pattern as migration 118 (per Cycle 7 review): re-running the
    // migration must not silently revert operator-tuned values.
    // `[\s\S]*?` instead of `.*` + `s` flag (project tsconfig predates ES2018 dotAll).
    expect(sql).toMatch(/ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/i);
  });

  it('seeds all 18 phase band keys (× 2 min/max = 36 keys)', () => {
    // 12 single-phase bands (P3-P8, P18-P20, P7a-P7d) + 1 aggregate (P9-P17)
    // + 3 orphans (O1-O3) + 2 CoA bands (P1, P2) = 18 bands.
    const expectedBandPhases = [
      'p3', 'p4', 'p5', 'p6',
      'p7a', 'p7b', 'p7c', 'p7d',
      'p8', 'p18', 'p19', 'p20',
      'p9_p17_agg',
      'o1', 'o2', 'o3',
      'coa_p1', 'coa_p2',
    ];
    expect(expectedBandPhases.length).toBe(18);

    for (const phase of expectedBandPhases) {
      expect(sql).toMatch(new RegExp(`'lifecycle_band_${phase}_min'`));
      expect(sql).toMatch(new RegExp(`'lifecycle_band_${phase}_max'`));
    }
  });

  it('seeds the 3 cross-status threshold keys', () => {
    expect(sql).toMatch(/'lifecycle_cross_stalled_threshold'/);
    expect(sql).toMatch(/'lifecycle_cross_active_inspection_threshold'/);
    expect(sql).toMatch(/'lifecycle_cross_issued_threshold'/);
  });

  it('default values match the snapshot 2026-05-07 + ±15% tolerance documented in active_task plan-lock', () => {
    // Spot-check three representative values to ensure the migration
    // wasn't filled with placeholder/zero values. `[\s\S]*?` allows the
    // match to span multiple lines (some INSERT rows wrap because of
    // long descriptions).
    expect(sql).toMatch(/'lifecycle_band_p7c_min'[\s\S]*?28311/);
    expect(sql).toMatch(/'lifecycle_band_p7c_max'[\s\S]*?38303/);
    expect(sql).toMatch(/'lifecycle_band_p18_max'[\s\S]*?123270/);
    expect(sql).toMatch(/'lifecycle_cross_stalled_threshold'[\s\S]*?1000/);
  });

  it('every band/threshold INSERT includes a description column for admin UI tooltip', () => {
    // The admin Control Panel renders descriptions per Spec 86 §1.
    // We require ≥39 INSERT rows where a `lifecycle_(band|cross)_*` key
    // is followed by a numeric value AND a description string. Multi-
    // line aware via `[\s\S]*?` (some descriptions wrap).
    const descriptionAdjacent = sql.match(
      /'lifecycle_(band|cross)_[a-z0-9_]+'[\s\S]*?,[\s\S]*?\d+[\s\S]*?,[\s\S]*?'[^']+'/g,
    );
    // 39 INSERTs — each needs a description.
    expect(descriptionAdjacent?.length ?? 0).toBeGreaterThanOrEqual(39);
  });

  it('has commented manual-rollback procedure (no transactional DOWN)', () => {
    // Same convention as migration 118: rolling back can't happen
    // transactionally without risking destroying operator hotfixes.
    expect(sql).toMatch(/--\s*(DOWN|MANUAL ROLLBACK|ROLLBACK)/i);
  });
});
