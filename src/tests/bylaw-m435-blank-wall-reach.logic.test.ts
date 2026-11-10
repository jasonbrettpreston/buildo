// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 rule 2 (dated note LQ-1: a variation is disclosed only where the limit it
//            varies survives rule 4) and rule 4; docs/specs/01-pipeline/69a_mcbylaw_register.md M-435 ("R-zone main-building side yard: the
//            maximum uses 0.9 m (10.10.40.70(3)(A)); the 0.45 m blank-wall reduction ... is a DISCLOSURE")
//
// MB-27 increment 3 · E2c follow-up · operator "Census decision a" (2026-11-10; ~/Buildo-scratch/mcbylaws/inc3/open-questions.md, last
// section; review ~/Buildo-scratch/mcbylaws/inc3/night/CENSUS-REVIEW-20261110.md) · RED FIRST. The companion of
// bylaw-m435-blank-wall-emit.logic.test.ts (which keeps the 25 principal cells that must carry the sentence). The 10.10.40.70(4) sentence
// says "the answer uses the 0.9 m side yard", so it is disclosed only where the unit the (4) arm displaces (the 0.9 m 10.10.40.70(3)(A))
// survives rule 4, the LQ-1 form (d337dd606). On garden_suite / laneway_suite side_setback_m that unit is itself dropped condition_false
// and 150.7.60.20(5)(B) / 150.8.60.20(3)(D) or no answer stands, so no sentence there. Read on Layer 2's own traceResult.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js'));
const RB = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
const INPUT = read('docs/reference/bylaw-layer2-input.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const ENV = MZ.makeEnv({ body: INPUT.body, map: read('scripts/seeds/bylaw/layer2-map.json'), scope: SCOPE,
  vocab: read('scripts/seeds/bylaw/vocab.json'), zoneList: read('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default,
  versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
const PARCELS = read('src/tests/fixtures/layer3/golden-25/parcels-rows.json') as unknown as Json[];
const SENTENCE = String(((INPUT.body.units as Json[]).find((u) => u.unit_id === '10.10.40.70(4)#(4)(A)') as Json).disclosure);
const side = (id: number, cls: string, structure: string): Json => {
  const row = PARCELS.find((p) => Number(p.id) === id || Number(p.parcel_id) === id) as Json;
  return MZ.traceResult(RB.buildLotVector(row, ENV.lotEnv).lot, structure, 'side_setback_m', cls, ENV);
};
const R_LOTS = { A0175: 173273, A0375: 410720, A0464: 427312, A0388: 442123, A0561: 461807 } as const;
const SUITES = ['garden_suite', 'laneway_suite'] as const;

describe('Census decision a: the blank-wall sentence only where the 0.9 m unit it varies survives rule 4 (the LQ-1 form)', () => {
  it.each(Object.entries(R_LOTS).flatMap(([k, id]) => SUITES.flatMap((st) => (SCOPE.classes as string[]).map((c) => [k, id, st, c] as const))))('%s (%s) %s %s: (3)(A) does not set the side yard, so no blank-wall sentence', (_k, id, st, cls) => {
    const r = side(id, cls, st);
    expect(r.winner_unit_id).not.toBe('10.10.40.70(3)#(3)(A)');
    expect(r.disclosures ?? []).not.toContain(SENTENCE);
  });
  it('on the golden 25, every side_setback_m cell carrying the sentence is a principal cell won by (3)(A): 25 cells (5 R lots x 5 classes)', () => {
    let cells = 0;
    for (const row of PARCELS) {
      const lot = RB.buildLotVector(row, ENV.lotEnv).lot;
      if (!lot) continue;
      for (const st of SCOPE.structures as string[]) for (const cls of SCOPE.classes as string[]) {
        const r = MZ.traceResult(lot, st, 'side_setback_m', cls, ENV);
        if (!(r.disclosures ?? []).includes(SENTENCE)) continue;
        cells += 1;
        expect([st, r.winner_unit_id]).toEqual(['principal', '10.10.40.70(3)#(3)(A)']);
      }
    }
    expect(cells).toBe(25);
  });
});
