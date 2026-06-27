// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md §Phase-3B (imagery-roof rename)
//
// Regression lock for the existing_footprint_sqm/existing_gfa_sqm → imagery_roof_* rename (mig 201).
// The rename's load-bearing SAFETY property: the cost-model geom_basis is DECOUPLED from these
// imagery-derived (±20–38% unreliable) columns — WF3-A remapped ADD/BAS→cur_floor, INT→cur_pot_2story.
// If a future change silently re-couples the cost model (or any consumer) to the renamed/retired
// imagery columns, ADD/BAS/INT cost estimates would go NULL across 486K parcels. These locks fail first.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARCHETYPE_GEOM_BASIS } from '@/lib/classification/archetypes';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mb = require('../../scripts/lib/max-build.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archJs = require('../../scripts/lib/archetypes.js');

const IMAGERY_AND_RETIRED = [
  'existing_footprint_sqm', 'existing_gfa_sqm',          // pre-rename names — must not reappear
  'imagery_roof_footprint_sqm', 'imagery_roof_gfa_sqm',  // the renamed imagery cols — cost model must NOT read
  'existing_stories', 'existing_height_m',               // WF3-A retired (tree-contaminated)
];

describe('imagery-roof rename — cost-model geom_basis decoupling (the safety fence)', () => {
  it('TS ARCHETYPE_GEOM_BASIS references NONE of the imagery/retired columns', () => {
    const vals = Object.values(ARCHETYPE_GEOM_BASIS).filter(Boolean) as string[];
    for (const v of vals) expect(IMAGERY_AND_RETIRED).not.toContain(v);
    // and still wired to the current-building menu (the reliable basis WF3-A established)
    expect(ARCHETYPE_GEOM_BASIS.ADD).toBe('cur_floor_gfa_sqm');
    expect(ARCHETYPE_GEOM_BASIS.BAS).toBe('cur_floor_gfa_sqm');
    expect(ARCHETYPE_GEOM_BASIS.INT).toBe('cur_pot_2story_gfa_sqm');
  });

  it('JS ARCHETYPE_GEOM_BASIS (the dual-path twin) matches and is equally decoupled', () => {
    const jsMap = archJs.ARCHETYPE_GEOM_BASIS;
    const vals = Object.values(jsMap).filter(Boolean) as string[];
    for (const v of vals) expect(IMAGERY_AND_RETIRED).not.toContain(v);
    expect(jsMap).toEqual(ARCHETYPE_GEOM_BASIS); // SQL↔TS parity
  });
});

describe('imagery-roof rename — array-driven propagation pins the new names (mig 201)', () => {
  it('EXISTING_COLS carries imagery_roof_* (not the old existing_*footprint/gfa) — drives UPDATE + propagation + orphan-nullify', () => {
    expect(mb.EXISTING_COLS).toContain('imagery_roof_footprint_sqm');
    expect(mb.EXISTING_COLS).toContain('imagery_roof_gfa_sqm');
    expect(mb.EXISTING_COLS).not.toContain('existing_footprint_sqm');
    expect(mb.EXISTING_COLS).not.toContain('existing_gfa_sqm');
  });

  it('migration 201 renames on all three propagation surfaces (parcels + permits + coa)', () => {
    const sql = readFileSync(resolve(__dirname, '../../migrations/201_rename_existing_to_imagery_roof.sql'), 'utf8');
    expect(sql).toContain("ARRAY['parcels','permits','coa_applications']");
    expect(sql).toContain('RENAME COLUMN existing_footprint_sqm TO imagery_roof_footprint_sqm');
    expect(sql).toContain('RENAME COLUMN existing_gfa_sqm TO imagery_roof_gfa_sqm');
  });
});
