// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-494 (Q1 a: "it depends on the houseplex roof option rows (D5) on the
//            increment-3 Layer 2 night"), M-400 / RR-01 (D5 owned by the houseplex increment), M-465 (option slots), M-60 (positions
//            never move); Q-STOR a F ("stored only where they differ from the base class")
//
// MB-27 increment 3 (the Layer 2 night) · DL-7 a · RED FIRST. The houseplex roof-option cells: layer2-scope options.roof_form.classes
// gains detached_houseplex; the representative-only guards (bylaw-materialize.js makeEnv, bylaw-lot-row.js encode / decode) are lifted
// for the listed classes; a class override is written at an option slot only where the class's option tuple differs from the
// representative's slot, and decoded class override first, then a shared code reads that class's own base.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js'));
const LR = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js'));
const RB = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
const INPUT = read('docs/reference/bylaw-layer2-input.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const PARCELS = read('src/tests/fixtures/layer3/golden-25/parcels-rows.json') as unknown as Json[];
const CLASSES = ['detached_house', 'detached_houseplex'];
const envOf = (scope: Json): Json => MZ.makeEnv({ body: INPUT.body, map: MAP, scope, vocab: VOCAB,
  zoneList: read('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default,
  versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });

describe('DL-7 a: the scope lists the houseplex for the roof-form option slots', () => {
  it('options.roof_form.classes = [detached_house, detached_houseplex]', () => {
    expect(SCOPE.options.roof_form.classes).toEqual(CLASSES);
  });
  it('base positions do not move: the base pairs and the option slot order are those of migration 295 (54 + 7)', () => {
    expect([RB.scopePairs(SCOPE).length, RB.optionPairs(SCOPE, VOCAB.design_options).length]).toEqual([54, 7]);
  });
});

describe('DL-7 a: houseplex option rows round-trip through encode and decode (Q-STOR F)', () => {
  const env = envOf(SCOPE);
  const out = MZ.materializeBatch(PARCELS, env);
  const dicts = LR.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = RB.scopePairs(SCOPE);
  const optionPairs = RB.optionPairs(SCOPE, VOCAB.design_options);
  const decoded = out.rows.lots.filter((l: Json) => !l.lot_gate).map((lot: Json) => ({ lot,
    rows: LR.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }) as Json[] }));
  it('every ungated golden lot decodes option rows for both listed classes', () => {
    for (const d of decoded) expect([...new Set(d.rows.map((r: Json) => r.class))].sort()).toEqual([...CLASSES].sort());
  });
  it('the decoded houseplex option rows equal Layer 2\'s own traceOption for the houseplex class', () => {
    for (const d of decoded) {
      const row = PARCELS.find((p) => Number(p.id) === Number(d.lot.parcel_id)) as Json;
      const { lot } = RB.buildLotVector(row, env.lotEnv);
      for (const p of optionPairs) {
        const t = MZ.traceOption(lot, p, 'detached_houseplex', env);
        const got = d.rows.find((r: Json) => r.class === 'detached_houseplex' && r.target === p.target && r.option === p.option) as Json;
        expect([d.lot.parcel_id, p.target, p.option, got && got.status, got && got.value]).toEqual([d.lot.parcel_id, p.target, p.option, t.status, t.value]);
      }
    }
  });
  it('a class override is written only where the houseplex option tuple differs from the representative slot (RR-01 / Q-STOR F)', () => {
    const n = pairs.length;
    const over = decoded.flatMap((d: Json) => Object.keys((d.lot.class_results || {}).detached_houseplex || {}).map(Number).filter((i) => i >= n));
    expect(over.length).toBeGreaterThan(0);
  });
});
