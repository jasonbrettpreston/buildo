// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-246 (the increments table, row 6, dated note 2026-11-13), M-206 (renovation rows only),
//            LC-62 / LC-25 / LC-26, LC-16 (no garden-suite add-on on a renovation row), MB-103 (the owner-input contract), MB-97 (semi detection, UB-7);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.6 (renovation_interior, the unit split and the basement level), P5.1 / P5.12;
//            McStorage strategy ST-4 (a lot without the existing-house input stores no renovation row; an absent row reads not_evaluated:no_existing_house).
//
// MB-27 increment 6 (renovations) · lane INC6-B · RED FIRST: scripts/lib/compute/maxbld/renovation.js does not exist yet, so every case below fails
// on the missing module, and the six renovation building-type rows fail on the missing seed rows. Operator rulings 2026-11-13, items 1-12 and UB-1..10
// (~/Buildo-scratch/mcbylaws/inc6/DECISIONS-v2.md); the McProof key was approved 2026-11-13.
//
// The owner entry is footprint_m2 (> 0), storeys (0.5 steps, 1 to the cap), basement one of none | unfinished | finished, and the empty_lot boolean
// (items 3, 4 b, 10, 11 c, UB-9): all three of footprint, storeys and basement are required. The rows are the six renovation types of the approved key, on the
// worked examples of src/tests/fixtures/layer3/increment-6/examples.json; no golden lot carries an owner entry, so the rows are tested on declared inputs.
// Adapted 2026-11-16 to the landed fixture and the 2026-11-15 rulings (BUILD-LOG-20261116): Q-2 (a footprint of 0 or less, non-numeric or missing reads
// needs_user_input:existing_footprint, no new word), the key's 0.5 and over-cap storeys (N6-20, N6-23 accepted), the carried house-row word, F-2 (the half flag
// now removes the secondary suite maximum, 10.5.20.40(6)).
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel: string): boolean => fs.existsSync(path.join(ROOT, rel));
const FIXTURE = 'src/tests/fixtures/layer3/increment-6/examples.json';
const ROW_KEYS = ['RA', 'RE', 'RI', 'RB', 'RF', 'UB'] as const;
const RENOVATION_TYPES = [
  'renovation_addition',
  'renovation_expand',
  'renovation_interior',
  'renovation_basement_new',
  'renovation_basement_finish',
  'renovation_basement_underpinned',
] as const;
const OWNER_FIELDS = ['footprint_m2', 'storeys', 'basement'] as const;
const ENVELOPE_KEYS = ['F_m2', 'G_m2', 'S_storeys', 'fsi_cap_m2', 'status'];
const OWNER_FLAG = 'needs_user_input';

const seeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').targets,
  layer2Options: readJson('scripts/seeds/bylaw/layer2-scope.json').options,
});
const fixture = (): Json => readJson(FIXTURE);

/** The 12.2 m of 10.5.40.71(3) is the clause-cited setting compute_maxbld_scenarios_relief_frontage_max_m (M-404; operator 2026-11-16), not a Layer 2 cell. */
const reliefFrontage = (SEEDS: Json): number | null => SEEDS.logicVariables.compute_maxbld_scenarios_relief_frontage_max_m?.default ?? null;

const settingsOf = (ex: Json, SEEDS: Json): Json => {
  const base: Json = {
  houseplex_circulation_share: SEEDS.logicVariables.houseplex_circulation_share.default,
  houseplex_unit_min_net_m2: SEEDS.logicVariables.houseplex_unit_min_net_m2.default,
  compute_maxbld_scenarios_reno_basement_livable_share: SEEDS.logicVariables.compute_maxbld_scenarios_reno_basement_livable_share?.default ?? null,
  compute_maxbld_scenarios_suite_interior_gfa_share: SEEDS.logicVariables.compute_maxbld_scenarios_suite_interior_gfa_share?.default ?? null,
  compute_maxbld_scenarios_relief_frontage_max_m: reliefFrontage(SEEDS),
  suite_share_of_interior: 0.45,
  extension_window: { rd: [12.0, 18.0], rsrm: [12.0, 12.0] },
  ...(ex.input?.settings || {}),
  };
  if (ex.input?.settings && 'reno_basement_livable_share' in ex.input.settings) base.compute_maxbld_scenarios_reno_basement_livable_share = ex.input.settings.reno_basement_livable_share;
  return base;
};

/** The input of an example with the owner block replaced, or a field dropped. */
const inputOf = (ex: Json, owner: Json | null, drop: readonly string[] = []): Json => {
  const base = JSON.parse(JSON.stringify(ex.input)) as Json;
  if (owner !== null) base.owner = { ...(base.owner || {}), ...owner };
  for (const k of drop) delete base.owner[k];
  return base;
};

interface Outcome {
  threw: boolean;
  out: Json | null;
  message: string;
}

const run = (RV: Json, input: Json, settings: Json): Outcome => {
  try {
    return { threw: false, out: RV.renovationResults(input, settings) as Json, message: '' };
  } catch (e) {
    return { threw: true, out: null, message: (e as Error).message };
  }
};

/** Expected missing fields in the reason's fixed order (existing_footprint, existing_storeys, existing_basement). */
const missingReason = (owner: Json): string => {
  const named: string[] = [];
  const f = owner.footprint_m2;
  if (f === null || f === undefined || !(Number(f) > 0)) named.push('existing_footprint');
  if (owner.storeys === null || owner.storeys === undefined) named.push('existing_storeys');
  if (owner.basement === null || owner.basement === undefined) named.push('existing_basement');
  return `${OWNER_FLAG}:${named.join(',')}`;
};

/** Items 4 b / UB-9, as the key reads them (N6-20, N6-23): 0.5 steps, above zero; the stored cap is NOT a bound (storeys above S still compute). */
const storeysValid = (storeys: number): boolean => storeys > 0 && Math.abs(storeys * 2 - Math.round(storeys * 2)) < 1e-9;
const refuse = (outcome: Outcome): string => {
  if (outcome.threw) return `threw:${outcome.message}`;
  return `reasons:${ROW_KEYS.map((k) => outcome.out?.[k]?.reason ?? null).join('|')}`;
};
/** A refusal: a throw, or the reason form `invalid_owner_input:<field>` on every row. */
const expectRefused = (outcome: Outcome, field: string): void => {
  if (outcome.threw) return;
  for (const key of ROW_KEYS) expect([key, outcome.out?.[key]?.status, outcome.out?.[key]?.reason, refuse(outcome)]).toEqual([key, 'not_evaluated', `invalid_owner_input:${field}`, refuse(outcome)]);
};
/** Q-2: no new status word; the key's own word for a footprint that is missing, non-numeric, zero or negative. */
const expectFootprintWord = (outcome: Outcome): void => {
  expect(outcome.threw).toBe(false);
  for (const key of ROW_KEYS) {
    expect([key, outcome.out?.[key]?.status, outcome.out?.[key]?.reason]).toEqual([key, 'not_evaluated', 'needs_user_input:existing_footprint']);
    for (const f of ['value', 'addition_gfa', 'gain', 'units', 'basement_livable_gain', 'basement_finish_livable_area', 'basement_livable_area']) expect([key, f, outcome.out?.[key]?.[f] ?? null]).toEqual([key, f, null]);
  }
};

const allRows = (out: Json): Json[] => ROW_KEYS.map((k) => out?.[k] ?? null);
const notesOf = (row: Json): string[] => ['note', 'notes'].flatMap((k) => (row?.[k] === undefined || row?.[k] === null ? [] : [String(row?.[k])]));

const expectNotEvaluated = (out: Json, reason: string, flag: string): void => {
  expect(allRows(out).every(Boolean)).toBe(true);
  for (const key of ROW_KEYS) {
    expect([key, out[key].status]).toEqual([key, 'not_evaluated']);
    expect([key, out[key].reason]).toEqual([key, reason]);
    expect([key, out[key].value ?? null]).toEqual([key, null]);
    expect([key, (out[key].flags ?? []).includes(flag)]).toEqual([key, true]);
  }
};
const expectNotApplicable = (out: Json, reason: string): void => {
  expect(allRows(out).every(Boolean)).toBe(true);
  for (const key of ROW_KEYS) {
    expect([key, out[key].status]).toEqual([key, 'not_applicable']);
    expect([key, out[key].reason]).toEqual([key, reason]);
    expect([key, out[key].value ?? null]).toEqual([key, null]);
  }
};

describe('owner entry: the contract (increment 6, items 3, 4 b, 10, 11 c, UB-9)', () => {
  let RV: Json;
  let SEEDS: Json;
  let EX: Json[];
  beforeAll(() => {
    RV = req(path.join(ROOT, 'scripts/lib/compute/maxbld/renovation.js')) as Json;
    SEEDS = seeds();
    EX = fixture().examples as Json[];
  });
  const byId = (id: string): Json => {
    const ex = EX.find((e) => e.id === id) as Json;
    expect(ex, `fixture example ${id}`).toBeDefined();
    return ex;
  };

  it('the fixture exists, its ids are unique, every example carries the declared input shape and the six row keys', () => {
    expect(exists(FIXTURE)).toBe(true);
    const ids = EX.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ex of EX) {
      expect([ex.id, Object.keys(ex.input).sort()]).toEqual([ex.id, ['envelope', 'half_lot', 'lot', 'lot_form', 'owner', 'settings', 'sixplex_overlay', 'units_max']]);
      expect([ex.id, Object.keys(ex.input.envelope).sort()]).toEqual([ex.id, [...ENVELOPE_KEYS].sort()]);
      expect([ex.id, Object.keys(ex.expect).sort()]).toEqual([ex.id, [...ROW_KEYS].sort()]);
      expect([ex.id, typeof RV.renovationResults]).toEqual([ex.id, 'function']);
    }
  });

  it('a missing field is not filled: every recorded lot that lacks footprint, storeys or basement reads not_evaluated with the owner reason and the input flag', () => {
    const incomplete = EX.filter((e) => missingReason(e.input.owner) !== `${OWNER_FLAG}:` && e.input.owner.empty_lot !== true);
    expect(incomplete.length).toBeGreaterThan(0);
    for (const ex of incomplete) {
      const out = RV.renovationResults(ex.input, settingsOf(ex, SEEDS)) as Json;
      expectNotEvaluated(out, missingReason(ex.input.owner), OWNER_FLAG);
    }
    for (const id of ['N-A0097', 'N-A0399-NOBS', 'N-A0067', 'N-A0289-NOST', 'N-A0553', 'N-A0561']) byId(id);
  });

  it('dropping a field (absent, not null) on a complete example reads the same reason, and still no default storey is assumed', () => {
    const ex = byId('E3');
    const settings = settingsOf(ex, SEEDS);
    for (const field of OWNER_FIELDS) {
      const owner = { ...ex.input.owner };
      delete owner[field];
      const out = RV.renovationResults(inputOf(ex, null, [field]), settings) as Json;
      expect([field, out.RI.status]).toEqual([field, 'not_evaluated']);
      expect([field, out.RI.reason]).toEqual([field, missingReason(owner)]);
    }
  });

  it('a storey count off the 0.5 step or a basement outside none|unfinished|finished is refused, never read as a default', () => {
    const ex = byId('E3');
    const settings = settingsOf(ex, SEEDS);
    const cases: [string, Json][] = [
      ['storeys', { ...ex.input.owner, storeys: 1.3 }],
      ['basement', { ...ex.input.owner, basement: 'maybe' }],
    ];
    for (const [field, owner] of cases) {
      const outcome = run(RV, inputOf(ex, owner), settings);
      expect([field, refuse(outcome).startsWith('threw:') || refuse(outcome).includes(`invalid_owner_input:${field}`)]).toEqual([field, true]);
      expectRefused(outcome, field);
    }
  });

  it('Q-2: a footprint that is 0, negative, non-numeric or missing reads needs_user_input:existing_footprint on all six rows and no number', () => {
    const ex = byId('E3');
    const settings = settingsOf(ex, SEEDS);
    for (const footprint_m2 of [0, -20, 'abc', null, Number.NaN]) {
      expectFootprintWord(run(RV, inputOf(ex, { footprint_m2 }), settings));
    }
    expectFootprintWord(run(RV, inputOf(ex, null, ['footprint_m2']), settings));
  });

  it('empty lot is read first: vacant_lot, never the footprint word, even with footprint 0 (Q-2)', () => {
    const ex = byId('E3');
    expectNotApplicable(RV.renovationResults(inputOf(ex, { footprint_m2: 0, empty_lot: true }), settingsOf(ex, SEEDS)) as Json, 'vacant_lot');
  });

  it('the key reads a half storey and a storey count above the cap as computed rows (N6-20, N6-23), and a zero or negative storey count is refused', () => {
    const ex = byId('E3');
    const settings = settingsOf(ex, SEEDS);
    for (const storeys of [0, -1, 1.3]) {
      expect([storeys, storeysValid(storeys)]).toEqual([storeys, false]);
      expectRefused(run(RV, inputOf(ex, { storeys }), settings), 'storeys');
    }
    for (const storeys of [0.5, 1, 1.5, (ex.input.envelope.S_storeys as number) + 1]) {
      expect([storeys, storeysValid(storeys)]).toEqual([storeys, true]);
      const out = run(RV, inputOf(ex, { storeys }), settings);
      expect([storeys, out.threw, out.out?.RA?.status]).toEqual([storeys, false, 'computed']);
    }
  });

  it('empty_lot true is not_applicable vacant_lot on all six rows, even with a complete entry behind it', () => {
    const vacant = byId('V-A0094');
    expect(vacant.input.owner.empty_lot).toBe(true);
    expectNotApplicable(RV.renovationResults(vacant.input, settingsOf(vacant, SEEDS)) as Json, 'vacant_lot');
    const complete = byId('E3');
    expectNotApplicable(RV.renovationResults(inputOf(complete, { empty_lot: true }), settingsOf(complete, SEEDS)) as Json, 'vacant_lot');
  });

  it('an envelope that is not computed makes every row not_evaluated with the envelope reason', () => {
    const ex = byId('E3');
    const settings = settingsOf(ex, SEEDS);
    for (const status of ['not_buildable', 'not_evaluated']) {
      const reason = status === 'not_buildable' ? 'buildable_envelope' : 'missing_input:fsi';
      const input = inputOf(ex, null);
      input.envelope = { ...input.envelope, status, reason };
      expectNotEvaluated(RV.renovationResults(input, settings) as Json, `house row ${reason}`, 'envelope');
    }
    const bare = inputOf(ex, null);
    bare.envelope = { ...bare.envelope, status: 'not_buildable' };
    delete bare.envelope.reason;
    expectNotEvaluated(RV.renovationResults(bare, settings) as Json, 'house row not_buildable', 'envelope');
  });

  it('the half-lot flag changes only the secondary-suite maximum and the disclosures (F-2, 10.5.20.40(6)): a semi half is otherwise computed from its owner entry exactly like a detached house', () => {
    const semi = byId('S-A0179');
    expect(semi.input.half_lot).toBe(true);
    expect(semi.expect.RI.units).toBe(3);
    expect(semi.expect.RI.units_gain).toBe(2);
    const asSemi = RV.renovationResults(semi.input, settingsOf(semi, SEEDS)) as Json;
    expect(asSemi.RI.status).toBe('computed');
    expect(asSemi.RI.units).toBe(3);
    expect(asSemi.RI.units_gain).toBe(2);
    expect(asSemi.RI.suite_max_interior).toEqual({ status: 'not_applicable', reason: 'no_secondary_suite_in_converted_semi (10.5.20.40(6))' });
    expect(asSemi.disclosures).toContain('envelope_semi_detached_used');
    const cleared = inputOf(semi, null);
    cleared.half_lot = false;
    cleared.lot_form = { detected: 'detached', unsure: false, assumed: false };
    const asDetached = RV.renovationResults(cleared, settingsOf(semi, SEEDS)) as Json;
    expect(typeof asDetached.RI.suite_max_interior).toBe('number');
    expect(asDetached.disclosures).not.toContain('envelope_semi_detached_used');
    for (const key of ['RA', 'RE', 'RB', 'RF', 'UB']) expect([key, asDetached[key]]).toEqual([key, asSemi[key]]);
    expect({ ...asDetached.RI, suite_max_interior: null }).toEqual({ ...asSemi.RI, suite_max_interior: null });
  });
});

describe('renovation rows: the worked examples, each row read by its own key (approved key 2026-11-13)', () => {
  let RV: Json;
  let SEEDS: Json;
  let EX: Json[];
  beforeAll(() => {
    RV = req(path.join(ROOT, 'scripts/lib/compute/maxbld/renovation.js')) as Json;
    SEEDS = seeds();
    EX = fixture().examples as Json[];
  });
  const compared = (value: Json): Json => JSON.parse(JSON.stringify(value, (k, v) => (k === 'attic' ? undefined : v))) as Json;
  const byType = (out: Json, key: string): Json => (key === 'RI' ? { status: out[key].status, ...compared(out[key]) } : compared(out[key]));

  for (const id of ['E1', 'E2', 'E3', 'E4', 'E5', 'E9', 'E10', 'E11', 'COV-1', 'H-A0097-1', 'H-A0097-2', 'L-A0175', 'L-A0289', 'L-A0399', 'S-A0179', 'UB-A0175-FIN', 'UB-SHARE', 'V-A0289-NONE', 'V-A0399-FIN']) {
    it(`${id}: every computed row equals its key value to nine places, and every row carries a number only when computed`, () => {
      const ex = (EX.find((e) => e.id === id) as Json) || null;
      expect(ex, `fixture example ${id}`).toBeDefined();
      const out = RV.renovationResults(ex.input, settingsOf(ex, SEEDS)) as Json;
      for (const key of ROW_KEYS) {
        const want = ex.expect[key] as Json;
        const got = byType(out, key);
        expect([id, key, got.status]).toEqual([id, key, want.status]);
        for (const [field, value] of Object.entries(want)) {
          if (field === 'status' || field === 'attic') continue;
          expect([id, key, field, got[field]]).toEqual([id, key, field, value]);
        }
        if (got.status === 'computed') expect(Array.isArray(got.trace) && got.trace.length > 0).toBe(true);
        else expect([id, key, got.value ?? null]).toEqual([id, key, null]);
      }
    });
  }

  it('the attic count stays not_evaluated on every conversion: the existing box is carded, and no number is invented', () => {
    for (const id of ['E1', 'E3', 'E9', 'S-A0179']) {
      const ex = EX.find((e) => e.id === id) as Json;
      const out = RV.renovationResults(ex.input, settingsOf(ex, SEEDS)) as Json;
      expect([id, out.RI.attic?.status]).toEqual([id, 'not_evaluated']);
    }
  });
});

describe('RI and the basement level (E3, E11): a basement floor counts only when the existing house has one', () => {
  let RV: Json;
  let SEEDS: Json;
  let EX: Json[];
  beforeAll(() => {
    RV = req(path.join(ROOT, 'scripts/lib/compute/maxbld/renovation.js')) as Json;
    SEEDS = seeds();
    EX = fixture().examples as Json[];
  });
  const E10 = (): Json => EX.find((e) => e.id === 'E10') as Json;

  it('the same house with and without a basement differs in RI basement_level_count by exactly that level', () => {
    const at = (id: string): Json => EX.find((e) => e.id === id) as Json;
    for (const [withBasement, noBasement] of [[at('L-A0289'), at('V-A0289-NONE')], [at('E10'), at('E11')]] as [Json, Json][]) {
      const x = RV.renovationResults(withBasement.input, settingsOf(withBasement, SEEDS)) as Json;
      const y = RV.renovationResults(noBasement.input, settingsOf(noBasement, SEEDS)) as Json;
      expect([withBasement.id, withBasement.input.owner.basement, x.RI.basement_level_count]).toEqual([withBasement.id, withBasement.input.owner.basement, withBasement.expect.RI.basement_level_count]);
      expect([noBasement.id, noBasement.input.owner.basement, y.RI.basement_level_count]).toEqual([noBasement.id, noBasement.input.owner.basement, noBasement.expect.RI.basement_level_count]);
      expect(x.RI.basement_level_count - y.RI.basement_level_count).toBe(withBasement.expect.RI.basement_level_count - noBasement.expect.RI.basement_level_count);
    }
  });

  it('basement none (V-A0289-NONE): RI reads no basement floor and RB, RF and UB each refuse their own row', () => {
    const none = EX.find((e) => e.id === 'V-A0289-NONE') as Json;
    const out = RV.renovationResults(none.input, settingsOf(none, SEEDS)) as Json;
    expect([out.RI.basement_level_count, out.RI.floors_above_grade_count]).toEqual([0, none.expect.RI.floors_above_grade_count]);
    expect([out.RB.status, out.RB.reason]).toEqual([none.expect.RB.status, none.expect.RB.reason]);
    expect([out.RF.status, out.RF.reason]).toEqual([none.expect.RF.status, none.expect.RF.reason]);
    expect([out.UB.status, out.UB.reason]).toEqual([none.expect.UB.status, none.expect.UB.reason]);
    const finished = EX.find((e) => e.id === 'V-A0399-FIN') as Json;
    const fin = RV.renovationResults(finished.input, settingsOf(finished, SEEDS)) as Json;
    expect([fin.RB.status, fin.RB.reason]).toEqual([finished.expect.RB.status, finished.expect.RB.reason]);
    expect([fin.UB.status, fin.UB.reason]).toEqual([finished.expect.UB.status, finished.expect.UB.reason]);
  });

  it('11b (E10): a house too small to split reads units 1, units_gain 0 and the too-small-to-split note, never not_buildable', () => {
    const tiny = E10();
    expect(tiny.input.owner.footprint_m2).toBe(30);
    const out = RV.renovationResults(tiny.input, settingsOf(tiny, SEEDS)) as Json;
    expect([out.RI.status]).toEqual(['computed']);
    expect([out.RI.units, out.RI.units_gain]).toEqual([1, 0]);
    expect(notesOf(out.RI).some((n) => n.includes('too small to split'))).toBe(true);
    for (const key of ROW_KEYS) expect([key, out[key].status]).not.toEqual([key, 'not_buildable']);
    for (const key of ROW_KEYS) if (out[key].status !== 'computed') expect([key, out[key].value ?? null]).toEqual([key, null]);
  });
});

describe('ST-4 (McStorage strategy, item 10 a): no existing-house input, no renovation row', () => {
  let RV: Json;
  let STEP: Json;
  let SEEDS: Json;
  beforeAll(() => {
    RV = req(path.join(ROOT, 'scripts/lib/compute/maxbld/renovation.js')) as Json;
    STEP = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
    SEEDS = seeds();
  });

  it('the skip names each renovation type with its own switch (item 1: detached_house class, principal, increment 6)', () => {
    for (const id of RENOVATION_TYPES) {
      const bt = (SEEDS.buildingTypes.rows as Json[]).find((b) => b.id === id) as Json;
      expect([id, bt]).toBeDefined();
      expect([id, bt.class, bt.structure, bt.increment, bt.switch]).toEqual([id, 'detached_house', 'principal', '6', `building_type:${id}`]);
    }
  });

  it('renovationApplies is false for all six renovation types without owner_input, and true for a non-renovation type', () => {
    for (const id of RENOVATION_TYPES) {
      expect([id, RV.renovationApplies({ parcel_id: 1 }, id)]).toEqual([id, false]);
      expect([id, RV.renovationApplies({ parcel_id: 1, owner_input: null }, id)]).toEqual([id, false]);
      expect([id, RV.renovationApplies({ parcel_id: 1, owner_input: { footprint_m2: 60, storeys: 2, basement: 'unfinished', empty_lot: false } }, id)]).toEqual([id, true]);
      for (const id_ of ['detached_house', 'detached_houseplex', 'house_with_secondary_suite']) expect([id_, RV.renovationApplies({ parcel_id: 1 }, id_)]).toEqual([id_, true]);
    }
    expect(RV.renovationApplies({ parcel_id: 1 }, null)).toBe(true);
  });

  it('the step emits zero rows for the six renovation ids on a source without owner_input', () => {
    const before = STEP.buildParcelRows({ parcel_id: 1 }, SEEDS, {}) as Json[];
    expect(before.length).toBeGreaterThan(0);
    const legacy = STEP.buildParcelRows({ parcel_id: 1, buildingType: 'detached_house' }, SEEDS, {}) as Json[];
    expect(legacy.filter((r) => (RENOVATION_TYPES as readonly string[]).includes(r.building_type))).toEqual([]);
    for (const id of RENOVATION_TYPES) {
      const one = STEP.buildParcelRows({ parcel_id: 1, buildingType: id }, SEEDS, {}) as Json[];
      expect([id, one]).toEqual([id, []]);
    }
  });
});
