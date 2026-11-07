// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-435 ("the stored maximum uses 0.9 m; the 0.45 m blank-wall reduction is a
//            disclosure"; pointer note 2026-11-06), M-172 (a design-choice arm not taken is disclosed), M-386 (flags propagate);
//            card L3-DISC ~/Buildo-scratch/mcbylaws/inc2/CARD-l3-base-disclosures.md; switch-on D-8 (a Phase 2 item on the increment-3 night)
//
// MB-27 increment 3 (the Layer 2 night) · L3-DISC M-435 Phase 2 emit · RED FIRST. The 10.10.40.70(4) units carry the 0.45 m sentence
// as their own `disclosure`; vocab default_overrides.blank_side_wall takes the token as not met, so they drop `condition_false` and
// no code emits their sentence. The emit: a unit dropped only because a design-default token is taken as false contributes its own
// disclosure (generic; no zone, unit or value in code). Read on Layer 2's own traceResult, so the lock holds whichever module emits.
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
const SENTENCE = String(((INPUT.body.units as Json[]).find((u) => u.unit_id === "10.10.40.70(4)#(4)(A)") as Json).disclosure);
const trace = (id: number, cls: string, target = 'side_setback_m'): Json => {
  const row = PARCELS.find((p) => Number(p.id) === id || Number(p.parcel_id) === id) as Json;
  return MZ.traceResult(RB.buildLotVector(row, ENV.lotEnv).lot, 'principal', target, cls, ENV);
};
const R_LOTS = { A0175: 173273, A0375: 410720, A0464: 427312, A0388: 442123, A0561: 461807 } as const;

describe('M-435: the 0.45 m blank-wall sentence is emitted by Phase 2', () => {
  it('the sentence is the 10.10.40.70(4) unit text (no new wording; DL-16 names its closed flag word)', () => {
    expect(SENTENCE).toMatch(/0\.45 m/);
  });
  it.each(Object.entries(R_LOTS).flatMap(([k, id]) => (SCOPE.classes as string[]).map((c) => [k, id, c] as const)))('%s (%s) %s: value 0.9 m from (3)(A) and the sentence is carried', (_k, id, cls) => {
    const r = trace(id, cls);
    expect([r.value, r.winner_unit_id]).toEqual([0.9, '10.10.40.70(3)#(3)(A)']);
    expect(r.disclosures).toContain(SENTENCE);
  });
  it('a target the (4) units do not set carries no blank-wall sentence (green on both trees)', () => {
    expect(trace(R_LOTS.A0175, 'detached_house', 'rear_setback_m').disclosures).not.toContain(SENTENCE);
  });
});
