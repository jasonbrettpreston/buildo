// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 18, 19.7)
//
// MB-31 · E31-01 oracle-only brief B0d (part 2 of 5). RED FIRST: `scripts/lib/compute/maxbld/rows.js` does not
// exist yet.
//   M-393 / R3-11 a building type whose class is not resolved in Phase 2 is `not_modelled` on EVERY catalogue row:
//          null value, the reason names Phase 2, and the trace is empty (it never reads a Layer 2 cell). An
//          unknown building type id is a caller bug and THROWS.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const loadSeeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
});

const cell = (n: number): Json => ({ s: 'applies', kind: 'number', value: n, clause: 'fixture', reason: null });
const UNMODELLED_TYPE = 'detached_houseplex_5_6';
const REASON = 'class not resolved in Phase 2 (MB-27.L2)';

describe('MB-31 not_modelled, M-393 / R3-11 (B9)', () => {
  let SEEDS: Json;
  let COPY: Json;
  let R: Json;
  let rowIds: string[];

  beforeAll(() => {
    SEEDS = loadSeeds();
    COPY = JSON.parse(JSON.stringify(SEEDS)) as Json;
    COPY.buildingTypes.rows.push({
      id: UNMODELLED_TYPE,
      class: UNMODELLED_TYPE,
      structure: 'principal',
      units: 5,
      increment: '1',
      switch: 'building_type:detached_house',
      rules: ['M-393'],
    });
    rowIds = COPY.catalogue.rows.map((r: Json) => r.id);
    R = req(path.join(ROOT, 'scripts/lib/compute/maxbld/rows.js')) as Json;
  });

  it('every catalogue row of an unmodelled building type is not_modelled with an empty trace', () => {
    expect(rowIds.length).toBeGreaterThan(0);
    for (const id of rowIds) {
      const out = R.runRow(id, {
        seeds: COPY,
        buildingType: UNMODELLED_TYPE,
        l2: { height_m: cell(9) },
        perm: { code: 0, gate: null },
      });
      expect(out.status, id).toBe('not_modelled');
      expect(out.reason, id).toBe(REASON);
      expect(out.value, id).toBeNull();
      expect(out.trace, id).toEqual([]);
    }
  });

  it('an unknown building type id throws', () => {
    expect(() => R.runRow(rowIds[0], { seeds: COPY, buildingType: 'nope_type', l2: { height_m: cell(9) } })).toThrow();
  });
});
