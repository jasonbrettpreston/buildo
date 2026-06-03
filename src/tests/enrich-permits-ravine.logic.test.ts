// SPEC LINK: docs/specs/01-pipeline/59_source_ravine_protection.md §8e, §11.2, §11.3
//
// Source-contract / logic tests for the §8e ravine additions to enrich-permits.js.
// Locks: RAVINE_COLS in allWriteCols (→ UPDATE guard + emitMeta); the L12 aggregate
// SQL (bool_or + MIN(ABS) × sign); the orphan-nullify NOT-NULL reset (false, not NULL);
// the L5 conditional WARN (INFO at 0, never an always-WARN cascade collapse).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ep = require('../../scripts/enrich-permits.js');
const SRC = fs.readFileSync(path.resolve(__dirname, '../../scripts/enrich-permits.js'), 'utf8');

describe('enrich-permits §8e ravine — write-col plumbing', () => {
  it('RAVINE_COLS = the 2 ravine columns, included in allWriteCols for BOTH targets', () => {
    expect(ep.RAVINE_COLS).toEqual(['is_in_ravine_protection_area', 'ravine_distance_m']);
    for (const t of ['permits', 'coa']) {
      expect(ep.allWriteCols(t)).toEqual(expect.arrayContaining(ep.RAVINE_COLS));
    }
  });

  it('the main UPDATE guard (IS DISTINCT FROM) covers the ravine cols (idempotency)', () => {
    const sql = ep.buildUpdateSql({ target: 'permits' });
    expect(sql).toMatch(/is_in_ravine_protection_area IS DISTINCT FROM e\.is_in_ravine_protection_area/);
    expect(sql).toMatch(/ravine_distance_m IS DISTINCT FROM e\.ravine_distance_m/);
  });
});

describe('enrich-permits §8e ravine — L12 propagation SQL (§11.2)', () => {
  const sql = ep.buildEnrichmentSql({ target: 'permits' });
  it('aggregates bool_or(is_in_ravine) + MIN(ABS(distance)) across linked parcels', () => {
    expect(sql).toMatch(/COALESCE\(bool_or\(is_in_ravine_protection_area\), false\) AS new_in_ravine/);
    expect(sql).toMatch(/MIN\(ABS\(ravine_distance_m\)\)\s+AS min_abs_dist/);
  });
  it('signs the distance by any-inside (MIN(ABS) × CASE new_in_ravine THEN -1 ELSE 1)', () => {
    expect(sql).toMatch(/min_abs_dist \* CASE WHEN ag\.new_in_ravine THEN -1 ELSE 1 END AS ravine_distance_m/);
  });
});

describe('enrich-permits §8e ravine — orphan-nullify respects NOT NULL (DEC-F)', () => {
  const sql = ep.buildNullifyOrphansSql({ target: 'permits' });
  it('does NOT set is_in_ravine_protection_area = NULL (would violate NOT NULL)', () => {
    expect(sql).not.toMatch(/is_in_ravine_protection_area = NULL/);
  });
  it('resets ravine on un-link to false / NULL', () => {
    expect(sql).toContain('is_in_ravine_protection_area = false');
    expect(sql).toContain('ravine_distance_m = NULL');
  });
  it('still NULLs the (nullable) zoning cols — existing behavior preserved', () => {
    expect(sql).toMatch(/zoning_class = NULL/);
  });
});

describe('enrich-permits §8e — L5 disagreement is conditional (no always-WARN cascade collapse)', () => {
  it('emits permit_type_geometry_disagreement as WARN only when count > 0, else INFO', () => {
    // The cascade-collapse bug would be an unconditional status:'WARN'. Lock the conditional.
    expect(SRC).toMatch(/permit_type_geometry_disagreement/);
    expect(SRC).toMatch(/status:\s*dis\s*>\s*0\s*\?\s*'WARN'\s*:\s*'INFO'/);
    expect(SRC).toContain("permit_type = 'RNFP'");
  });
});
