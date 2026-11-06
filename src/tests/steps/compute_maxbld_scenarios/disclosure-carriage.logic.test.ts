// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-386 (R3-02 flags propagate) and its 2026-11-06 dated note
//            (MB-27 switch-on D-8; operator "all recommended" on D-1..D-9 and on OQ-1..OQ-3; LQ-2 b)
//
// MB-27 · McBylaws queue · lane E. The lock of the Phase 2 disclosure carriage: every Phase 2 base-row and permission
// disclosure of a carried family on the 25 golden cases appears, as its one closed word, in the Layer 3 flags of every
// row that reads the target it sits on, up to the headline; the M-35 alternate-path lines are held to the report; an
// unlisted family fails closed; a stale stamp carries the closed stale word and recomputes nothing (D-6 a, guard (i)).
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));

const G25 = 'src/tests/fixtures/layer3/golden-25';
const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
const FAMILIES = readJson('scripts/lib/compute/maxbld/disclosure-families.json');
const HEADLINE_ON = { 'formula:gfa_max_m2:increment_2': 'on', 'formula:gfa_flat_m2': 'on', 'formula:gfa_pitched_a_m2': 'on', 'formula:gfa_pitched_b_m2': 'on' };
const W = {
  m406: 'frontage_assumed_unchanged_since_2013',
  ext: 'rd_extension_not_modelled',
  shift: 'side_yard_shift_permitted',
  rear: 'rear_extension_not_modelled',
};
// The carried words on footprint and gfa of each lot, as Phase 2 emits them (OQ-2; LQ-2 b: the side-yard shift sentence on
// A0067, A0097, A0182, A0203, A0205, A0229 and A0277 is carried as emitted, the named accepted finding). Every other lot: none.
const ON_FOOTPRINT_AND_GFA: Record<string, string[]> = {
  A0067: [W.m406, W.ext, W.shift], A0097: [W.m406, W.ext, W.shift],
  A0182: [W.ext, W.shift], A0203: [W.ext, W.shift], A0205: [W.ext, W.shift], A0229: [W.ext, W.shift], A0277: [W.ext, W.shift],
  A0170: [W.ext, W.shift], A0193: [W.ext, W.shift], A0553: [W.ext, W.shift],
  A0578: [W.shift],
  A0166: [W.ext, W.rear],
};
const CARRIED = new Set(FAMILIES.families.map((f: Json) => f.carry).filter((w: unknown) => typeof w === 'string'));

let S: Json; // compute-maxbld-scenarios.js
let D: Json; // maxbld/disclosures.js
let SEEDS: Json;
const LOTS = new Map<string, Json>();

/** The 25 golden lots through the Layer 2 pure core (the OR-7 loader), with each lot's parcels row and stored stamp. */
function materialiseGolden(): Json {
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')) as Json;
  const lr = req(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
  const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
  const MAP = readJson('scripts/seeds/bylaw/layer2-map.json');
  const zoneList = readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default;
  const env = MZ.makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const parcels = readJson(`${G25}/parcels-rows.json`) as unknown as Json[];
  const out = MZ.materializeBatch(parcels, env);
  const dicts = lr.makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  const pairs = rb.scopePairs(SCOPE);
  const optionPairs = rb.optionPairs(SCOPE, VOCAB.design_options);
  const expected = readJsonl(`${G25}/expected.jsonl`);
  const lines = readJsonl(`${G25}/inputs.jsonl`);
  for (const lot of out.rows.lots) {
    const e = expected.find((x) => x.parcel_id === lot.parcel_id) as Json;
    const cells = lr.decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs }).filter((d: Json) => !d.option)
      .map((d: Json) => ({ parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...d }));
    const options = lr.decodeOptionResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs })
      .map((d: Json) => { const { option_name: _n, ...rest } = d; return { parcel_id: lot.parcel_id, lot_gate: lot.lot_gate ?? null, ...rest }; }); // eslint-disable-line @typescript-eslint/no-unused-vars
    LOTS.set(String(e.case).split('_')[0] as string, {
      source: {
        parcel_id: lot.parcel_id, lot, parcel: parcels.find((p) => p.id === lot.parcel_id),
        permitted_by_class: lr.decodePermitted({ lot, classes: SCOPE.classes, map: MAP, dicts }),
      },
      l2: C.decodeCells(cells, 'detached_house', 'principal').cells,
      l2Options: C.decodeOptionCells(options, 'detached_house', 'principal', { designOptions: VOCAB.design_options, notAbove: MZ.withNotAbove }),
      line: lines.find((l) => l.case === e.case),
      logical: MZ.logicalRowsOf(parcels.find((p) => p.id === lot.parcel_id), lot, dicts, env),
    });
  }
  return env;
}

let ENV: Json;
const BT = { id: 'detached_house', class: 'detached_house', structure: 'principal' };
const wordsOfLot = (name: string): Json => {
  const lot = LOTS.get(name) as Json;
  return S.disclosureWords(lot.source, BT, Object.keys(lot.l2), { layer1Env: ENV });
};
const rowsOfLot = (name: string): Json[] => {
  const lot = LOTS.get(name) as Json;
  const line = lot.line as Json;
  const parcel = line.parcel || {};
  const words = wordsOfLot(name);
  const seeds = JSON.parse(JSON.stringify(SEEDS));
  for (const [id, state] of Object.entries(HEADLINE_ON)) ((seeds.switchboard.rows as Json[]).find((r) => r.id === id) as Json).state = state;
  const neighbours = (line.abutments || []).map((a: Json) => ({ same_street: a.sameStreet, residential: a.res, bldg_m: a.bldg, est: a.est, est_status: a.st }));
  const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
  return S.buildParcelRows({
    parcel_id: lot.source.parcel_id, l2: lot.l2, l2Options: lot.l2Options, l2Flags: words.l2Flags, permFlags: words.permFlags,
    perm: { code: line.permitted_word.code, gate: line.permitted_word.gate },
    geometry: { lot_frontage_m: parcel.frontage, lot_depth_m: parcel.depth, lot_area_m2: parcel.area }, flags: { corner_lot: parcel.corner },
    neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: 1 },
  }, seeds, { layer2_table_version: 'dc', settings_sha: 'dc' }).filter((r: Json) => r.building_type === 'detached_house');
};

beforeAll(() => {
  S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  D = req(path.join(ROOT, 'scripts/lib/compute/maxbld/disclosures.js')) as Json;
  SEEDS = {
    catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
    switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
    buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
    logicVariables: readJson('scripts/seeds/logic_variables.json'),
    vocab: VOCAB,
    layer2Classes: SCOPE.classes,
    layer2Options: SCOPE.options,
  };
  ENV = materialiseGolden();
});

describe('DC-1: the closed family map (data) and the pure carriage', () => {
  it('each family carries one closed word or is held (M-35); the stale and unmapped words are closed', () => {
    expect(FAMILIES.schema).toBe('l3-disclosure-families-v1');
    const m35 = FAMILIES.families.find((f: Json) => f.id === 'M-35');
    expect(m35.carry).toBeNull();
    expect(D.wordsOf(['alternate compliance path under 10.10.40.10(1)#whole — not evaluated (rule 5)'], FAMILIES)).toEqual([]);
    expect(D.wordsOf(['If the lot has changed since 9 May 2013 (for example by severance or consent): x'], FAMILIES)).toEqual([W.m406]);
    expect(D.wordsOf(['A sentence of no listed family'], FAMILIES)).toEqual([FAMILIES.unmapped_word]);
  });
  it('a stale stamp puts the stale word on every read target and on the permission row, recomputing nothing', () => {
    const out = D.carriedWords({ targets: ['height_m', 'fsi'], stale: true }, FAMILIES);
    expect(out).toEqual({ l2Flags: { height_m: [FAMILIES.stale_word], fsi: [FAMILIES.stale_word] }, permFlags: [FAMILIES.stale_word] });
    const lot = LOTS.get('A0193') as Json;
    const stale = S.disclosureWords({ ...lot.source, lot: { ...lot.source.lot, table_version: 'ffffffff' } }, BT, ['fsi'], { layer1Env: ENV });
    expect(stale.l2Flags).toEqual({ fsi: [FAMILIES.stale_word] });
    expect(S.disclosureWords(lot.source, BT, ['fsi'], {}).l2Flags).toEqual({ fsi: [FAMILIES.stale_word] }); // no Layer 1 env: never silence
  });
});

describe('DC-2: the lock on the 25 golden cases (increment 2 is not green until this is green)', () => {
  it('no golden disclosure is of an unlisted family, and every carried word comes from a Layer 2 sentence of its family', () => {
    for (const name of LOTS.keys()) {
      const words = wordsOfLot(name);
      for (const [t, list] of Object.entries(words.l2Flags as Json)) {
        expect([name, t, (list as string[]).includes(FAMILIES.unmapped_word)]).toEqual([name, t, false]);
        const sentences = (((LOTS.get(name) as Json).logical.rows as Json[]).find((r) => r.class === 'detached_house' && r.structure === 'principal' && r.target === t) as Json).disclosures || [];
        expect([name, t, list]).toEqual([name, t, D.wordsOf(sentences, FAMILIES)]);
      }
    }
  });
  it('every carried word on a target appears in the flags of every row that reads that target', () => {
    for (const name of LOTS.keys()) {
      const words = wordsOfLot(name).l2Flags as Json;
      for (const row of rowsOfLot(name)) {
        const read = new Set((row.trace as Json[]).filter((t) => t && t.kind === 'l2').map((t) => t.id));
        for (const [t, list] of Object.entries(words)) {
          if (!read.has(t)) continue;
          for (const w of list as string[]) expect([name, row.field_id, t, (row.flags as string[]).includes(w)]).toEqual([name, row.field_id, t, true]);
        }
      }
    }
  });
  it('footprint and the headline gfa carry exactly the named-family words of the map (24 cells on 12 lots); M-35 never', () => {
    let cells = 0;
    for (const name of LOTS.keys()) {
      const rows = rowsOfLot(name);
      for (const field of ['footprint_max_m2', 'gfa_max_m2']) {
        const row = rows.find((r) => r.field_id === field) as Json;
        const carried = (row.flags as string[]).filter((f) => CARRIED.has(f)).sort();
        expect([name, field, carried]).toEqual([name, field, (ON_FOOTPRINT_AND_GFA[name] || []).slice().sort()]);
        if (carried.length) cells += 1;
      }
    }
    expect(cells).toBe(24);
  });
  it('permission disclosures: none on the 25 for the detached house, so the permission row carries no word', () => {
    for (const name of LOTS.keys()) expect([name, wordsOfLot(name).permFlags]).toEqual([name, []]);
  });
});
