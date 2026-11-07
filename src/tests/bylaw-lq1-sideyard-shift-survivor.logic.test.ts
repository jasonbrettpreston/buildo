// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5 rule 2 (an optional variation keeps the limit it names) and rule 4;
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-205 (dated note 2026-11-06, LQ-1 a, LQ-2 b; card LQ1-EVAL)
//
// MB-27 increment 3 (the Layer 2 night) · LQ1-EVAL · RED FIRST. Rule 2 adds an optional variation's sentence only if the limit it
// varies survives rule 4. Today the 10.20.40.70(4) side-yard shift sentence shows where 900.3.10(5)(A) sets the side yard (the 14
// cells on 7 golden lots). On the production path: Layer 2's own traceResult over the golden-25 parcels rows.
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
const ENV = MZ.makeEnv({ body: INPUT.body, map: read('scripts/seeds/bylaw/layer2-map.json'), scope: read('scripts/seeds/bylaw/layer2-scope.json'),
  vocab: read('scripts/seeds/bylaw/vocab.json'), zoneList: read('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default,
  versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
const PARCELS = read('src/tests/fixtures/layer3/golden-25/parcels-rows.json') as unknown as Json[];
const SHIFT = /One side yard may be up to/;
const side = (parcelId: number, cls: string): Json => {
  const row = PARCELS.find((p) => Number(p.id) === parcelId || Number(p.parcel_id) === parcelId) as Json;
  return MZ.traceResult(RB.buildLotVector(row, ENV.lotEnv).lot, 'principal', 'side_setback_m', cls, ENV);
};
const LOTS = { A0203: 6640, A0067: 205238 } as const; // RD; 900.3.10(5)(A) and 900.3.10(155)(D) set the side yard
const A0193 = 304365; // RD, no exception: 10.20.40.70(3)(C) sets the side yard, so the shift is a live variation

describe('LQ1-EVAL: the shift sentence only where the varied side yard survives rule 4', () => {
  it.each(Object.entries(LOTS).flatMap(([k, id]) => ["detached_house", "detached_houseplex"].map((c) => [k, id, c] as const)))("%s (%s) %s: the exception sets the side yard, so no 10.20.40.70(4) shift sentence", (_k, id, cls) => {
    const r = side(id, cls);
    expect(String(r.winner_unit_id)).toMatch(/^900\.3\.10\(/);
    expect((r.disclosures as string[]).filter((d) => SHIFT.test(d))).toEqual([]);
  });
});

describe('LQ1-EVAL: where 10.20.40.70(3) survives, the shift stays disclosed (green on both trees)', () => {
  it.each(['detached_house', 'detached_houseplex'])('A0193 %s: winner (3)(C), the shift sentence is kept', (cls) => {
    const r = side(A0193, cls);
    expect(r.winner_unit_id).toBe('10.20.40.70(3)#(3)(C)');
    expect((r.disclosures as string[]).some((d) => SHIFT.test(d))).toBe(true);
  });
});
