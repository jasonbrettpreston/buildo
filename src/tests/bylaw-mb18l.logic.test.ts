// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-435 (the R-zone main-building side yard: the stored maximum uses 0.9 m,
// 10.10.40.70(3)(A); the 0.45 m blank-wall reduction of 10.10.40.70(4) is a disclosure); M-259 (the blank_side_wall token); MB-18 (l).
// Red first: T-l1, T-l2, T-l5 and T-l6 fail on the base (taken_as true stores 0.45 at a (4) unit); T-l3 and T-l4 are locks.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ROOT = process.cwd();
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mz = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lr = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
const AG = await mod('scripts/analysis/bylaw/agree.mjs');
const AU = await mod('scripts/analysis/bylaw/authored.mjs');
const { I, E, units, C } = await AS.loadRealLotAssembly(ROOT);
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const INPUT = read('docs/reference/bylaw-layer2-input.json');

/** The stored path: makeEnv reads the design-choice defaults from vocab (bylaw-materialize.js makeEnv), materializeBatch writes the lot rows. */
const env = (): Json => mz().makeEnv({
  body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB,
  zoneList: read('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default,
  versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version },
});
const stored = (rows: Json[]): Map<string, Json> => {
  const e = env();
  const out = mz().materializeBatch(rows, e);
  const dicts = lr().makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts });
  // the lot row's layout is the env's own (the base pairs, then any option slots the scope appends), so the decode reads what was written
  const pairs = e.pairs;
  const m = new Map<string, Json>();
  for (const lot of out.rows.lots) {
    for (const d of lr().decodeLotResults({ lot, pairs, classes: SCOPE.classes, map: MAP, dicts, optionPairs: e.optionPairs })) m.set(`${lot.parcel_id}|${d.class}|${d.structure}|${d.target}`, d);
  }
  return m;
};
const row = (o: Json = {}): Json => ({
  id: 9001, parcel_id: '9001', zoning_class: 'R', zoning_zn_string: 'R (d0.6)', exception_number: -1,
  zoning_overlays: { base: [{ zn_zone: 'R', source_id: 1, area_share: 1 }] }, on_policy_road: false, is_corner_lot: false, is_through_lot: false,
  abuts_laneway: false, frontage_m: 7.6, depth_m: 36, lot_size_sqm: 273.6, zoning_is_ambiguous: false, in_sixplex_area: false,
  is_heritage_designated: false, geom_npoints: 5, ...o,
});
const R_LOT = (bt: string, flags: Json = {}): Json => ({
  zone: 'R', label: { d: 0.6 }, overlays: {}, map_areas: [], building_type: bt,
  flags: { lawfully_existing: false, corner_lot: false, through_lot: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...flags },
  vars: { lot_frontage_m: 7.6, lot_depth_m: 36 },
});
const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);
const CLASSES = ['detached_house', 'detached_houseplex', 'semi_detached_house', 'semi_detached_houseplex', 'house_with_secondary_suite'];
const UNIT4: Record<string, string> = { detached_house: '10.10.40.70(4)#(4)(A)', semi_detached_house: '10.10.40.70(4)#(4)(B)', detached_houseplex: '10.10.40.70(4)#(4)(D)', semi_detached_houseplex: '10.10.40.70(4)#(4)(E)' };
const SENTENCE = 'If the side of the building has no windows or doors: the side yard may be reduced to 0.45 m; the answer uses the 0.9 m side yard for a side with windows or doors.';

describe('MB-18 l / the R side yard stores 0.9 m and discloses 0.45 m (M-435)', () => {
  it('T-l1 (red): the design-choice default of blank_side_wall is not met, and its why cites M-435 and keeps M-259', () => {
    const d = VOCAB.design_choice_disclosure.default_overrides.blank_side_wall;
    expect(d.taken_as).toBe(false);
    expect(d.why).toContain('M-435');
    expect(d.why).toContain('M-259');
    expect(env().lotEnv.designDefaults.blank_side_wall).toBe(false);
  });

  it('T-l2 (red): through makeEnv and materializeBatch an R lot stores side_setback_m 0.9 at 10.10.40.70(3)(A) in all five classes', () => {
    const m = stored([row()]);
    for (const cls of CLASSES) {
      const d = m.get(`9001|${cls}|principal|side_setback_m`) as Json;
      expect([cls, d.status, d.value, d.winner_unit_id]).toEqual([cls, 'applies', 0.9, '10.10.40.70(3)#(3)(A)']);
    }
  });

  it('T-l3 (lock): the disclosed arm still computes: with blank_side_wall true each type gets 0.45 m at its own (4) unit', () => {
    for (const [bt, unit] of Object.entries(UNIT4)) {
      const r = eff(R_LOT(bt, { blank_side_wall: true }), 'side_setback_m');
      expect([bt, r.status, r.value, r.winner]).toEqual([bt, 'value', 0.45, unit]);
    }
  });

  it('T-l4 (lock): scope holds: RD, RS, RT and RM lots and the RD x252 exception keep their side yards; the platform keeps 0.9 m', () => {
    const others = [
      row({ id: 9002, parcel_id: '9002', zoning_class: 'RD', zoning_zn_string: 'RD (f10.5)', zoning_overlays: { base: [{ zn_zone: 'RD', source_id: 1, area_share: 1 }] } }),
      row({ id: 9003, parcel_id: '9003', zoning_class: 'RS', zoning_zn_string: 'RS (f10.5)', zoning_overlays: { base: [{ zn_zone: 'RS', source_id: 1, area_share: 1 }] } }),
      row({ id: 9004, parcel_id: '9004', zoning_class: 'RT', zoning_zn_string: 'RT (f6.0)', zoning_overlays: { base: [{ zn_zone: 'RT', source_id: 1, area_share: 1 }] } }),
      row({ id: 9005, parcel_id: '9005', zoning_class: 'RM', zoning_zn_string: 'RM (f12.0)', zoning_overlays: { base: [{ zn_zone: 'RM', source_id: 1, area_share: 1 }] } }),
    ];
    const g25 = read('src/tests/fixtures/layer3/golden-25/parcels-rows.json').filter((r: Json) => r.id === 159079);
    const m = stored([...others, ...g25]);
    for (const r of others) {
      const d = m.get(`${r.id}|detached_house|principal|side_setback_m`) as Json;
      expect([r.zoning_class, String(d.winner_unit_id || '').startsWith('10.10.40.70')]).toEqual([r.zoning_class, false]);
    }
    const x252 = m.get('159079|detached_house|principal|side_setback_m') as Json;
    expect([x252.value, x252.winner_unit_id]).toEqual([0.45, '900.3.10(252)#(252)[SSP](A)']);
    const deck = eff({ ...R_LOT('detached_house'), building_type: 'detached_house' }, 'platform_side_setback_m');
    expect([deck.status, deck.value]).toEqual(['value', 0.9]);
  });

  it('T-l5 (red): the five R golden lots store 0.9 at (3)(A); A0094 (159079, RD x252) stays 0.45 (r-side-yard-move.md)', () => {
    const ids = [173273, 410720, 442123, 427312, 461807];
    const rows = read('src/tests/fixtures/layer3/golden-25/parcels-rows.json').filter((r: Json) => ids.includes(r.id) || r.id === 159079);
    const m = stored(rows);
    for (const id of ids) {
      const d = m.get(`${id}|detached_house|principal|side_setback_m`) as Json;
      expect([id, d.status, d.value, d.winner_unit_id]).toEqual([id, 'applies', 0.9, '10.10.40.70(3)#(3)(A)']);
    }
    expect((m.get('159079|detached_house|principal|side_setback_m') as Json).value).toBe(0.45);
  });

  it('T-l6 (red): the (4) units carry the M-435 closed sentence (A)-(E) and gaps citing M-435 (A)-(G)', () => {
    const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
    for (const u of ['A', 'B', 'C', 'D', 'E', 'G']) {
      const id = `10.10.40.70(4)#(4)(${u})`;
      const unit = (ag.units.get(id) as Json).unit;
      if (u !== 'G') expect([id, unit.disclosure]).toEqual([id, SENTENCE]);
      expect([id, /M-435/.test(unit.calculation_handling.gaps)]).toEqual([id, true]);
    }
  });
});
