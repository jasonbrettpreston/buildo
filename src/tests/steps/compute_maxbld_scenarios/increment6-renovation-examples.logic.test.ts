// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md (MB-27 increment 6, the six renovation building types: M-206, M-211(2), M-158, Q-UB-2, Q-UB-5, 800.50(80), 10.5.20.40(6));
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.6 (renovation), P5.9 (FD-1..FD-6)
//
// MB-27 increment 6 (renovations) · lane INC6-B · RED FIRST: `scripts/lib/compute/maxbld/renovation.js` does not exist on this
// tree, so every test here fails on the missing module, never on a typo.
// Rulings: the operator 2026-11-13 items 1-12 and UB-1..10 (DECISIONS-v2.md); the McProof key approved 2026-11-13.
// Oracle: src/tests/fixtures/layer3/increment-6/examples.json (26 worked examples + 47 edge cases N6-*, generated from the approved key re-run on the LANDED increment-5 rows,
// 2026-11-16; rulings F-2 (semi gate = lot_form_effective), Q-1..Q-4, 71(1) applied; not hand-edited).
// Law in data: 12.2 m, 0.45, 0.85 and the extension window arrive as `settings` (Layer 2 cells), never as a literal in the module.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const FIX_PATH = 'src/tests/fixtures/layer3/increment-6/examples.json';
const MOD_PATH = 'scripts/lib/compute/maxbld/renovation.js';
const ROW_KEYS = ['RA', 'RE', 'RI', 'RB', 'RF', 'UB'] as const;
const BUILT_TYPE: Record<string, string> = {
  RA: 'renovation_addition',
  RE: 'renovation_expand',
  RI: 'renovation_interior',
  RB: 'renovation_basement_new',
  RF: 'renovation_basement_finish',
  UB: 'renovation_basement_underpinned',
};
const NUMBERS: Record<string, string[]> = {
  RA: ['addition_gfa', 'total_after', 'up_gfa', 'back_gfa'],
  RE: ['gain'],
  RI: ['units', 'units_gain', 'suite_max_interior'],
  RB: ['basement_livable_gain', 'units'],
  RF: ['basement_finish_livable_area', 'units'],
  UB: ['basement_livable_area', 'units'],
};
const MISSING_ORDER = ['existing_footprint', 'existing_storeys', 'existing_basement'];
const missingFields = (reason: string): string[] =>
  reason.replace(/^needs_user_input:/, '').split(',').filter((x) => x.length > 0);

const FIX = readJson(FIX_PATH);
const EXAMPLES = FIX.examples as Json[];

const baseSettings = (): Json => ({
  houseplex_circulation_share: (FIX.settings as Json).circulation,
  houseplex_unit_min_net_m2: (FIX.settings as Json).unit_min,
  compute_maxbld_scenarios_reno_basement_livable_share: (FIX.settings as Json).reno_basement_livable_share,
  compute_maxbld_scenarios_suite_interior_gfa_share: (FIX.settings as Json).suite_interior_gfa_share,
  compute_maxbld_scenarios_relief_frontage_max_m: (readJson('scripts/seeds/logic_variables.json').compute_maxbld_scenarios_relief_frontage_max_m as Json).default,
  suite_share_of_interior: 0.45,
  extension_window: { rd: [12.0, 18.0], rsrm: [12.0, 12.0] },
});

function settingsFor(example: Json): Json {
  const s = baseSettings();
  const own = (example.input?.settings ?? {}) as Json;
  if ('reno_basement_livable_share' in own) s.compute_maxbld_scenarios_reno_basement_livable_share = own.reno_basement_livable_share;
  return s;
}

let R: Json;
beforeAll(() => {
  R = req(path.join(ROOT, MOD_PATH)) as Json;
});
const run = (example: Json, settings?: Json): Json => R.renovationResults(example.input, settings ?? settingsFor(example)) as Json;
const byId = (id: string): Json => EXAMPLES.find((e) => e.id === id) as Json;

// Operator "All approved" 2026-11-16 (REAPPROVAL-WALK items 4-5): the semi bar on the suite maximum applies only when the half ends with MORE than one unit
// (10.5.20.40(6) "converted to contain up to four dwelling units"); E10, E11 (one unit) keep 11.475.
const compareExample = (example: Json, out: Json): void => {
  for (const key of ROW_KEYS) {
    const want = (example.expect as Json)[key] as Json;
    const got = out[key] as Json;
    expect([example.id, key, got?.status]).toEqual([example.id, key, want.status]);
    expect([example.id, key, got?.reason ?? null]).toEqual([example.id, key, want.reason ?? null]);
    for (const field of NUMBERS[key] ?? []) {
      if (want[field] === null || want[field] === undefined) continue;
      if (typeof want[field] !== 'number') {
        expect([example.id, key, field, got?.[field]]).toEqual([example.id, key, field, want[field]]);
        continue;
      }
      expect([example.id, key, field, typeof got?.[field]]).toEqual([example.id, key, field, 'number']);
      expect(got[field] as number).toBeCloseTo(want[field] as number, 4);
    }
  }
  expect([example.id, out.disclosures]).toEqual([example.id, example.expect_disclosures]);
};

describe('MB-27 increment 6: the six renovation rows on the 26 worked examples (approved McProof key, landed rows)', () => {
  it('the module exports renovationResults and the fixture holds the 26 examples with all six row keys', () => {
    expect(typeof R.renovationResults).toBe('function');
    expect(EXAMPLES.length).toBe(26);
    for (const e of EXAMPLES) expect([e.id, ROW_KEYS.every((k) => e.expect[k] !== undefined)]).toEqual([e.id, true]);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as [string, Json]))('%s', (_id, example) => {
    const out = run(example);
    compareExample(example, out);
    const RA = out.RA as Json;
    expect([example.id, RA.binds]).toEqual([example.id, example.expect.RA.binds]);
    expect([example.id, RA.relief_applied]).toEqual([example.id, example.expect.RA.relief_applied]);
    expect([example.id, RA.lawfully_existing_caveat]).toEqual([example.id, example.expect.RA.lawfully_existing_caveat]);
    expect([example.id, (out.RE as Json).lawfully_existing_caveat]).toEqual([example.id, example.expect.RE.lawfully_existing_caveat]);
    expect([example.id, RA.up_plate]).toEqual([example.id, example.expect.RA.up_plate]);
    const RI = out.RI as Json;
    if (example.expect.RI.note !== undefined) expect([example.id, RI.note]).toEqual([example.id, example.expect.RI.note]);
  });
});

describe('MB-27 increment 6: the 47 edge cases N6-* (SWEEP-DS, ANSWER-KEY R6), keyed on the landed rows', () => {
  const EDGES = FIX.edge_cases_n6 as Json[];
  it('the fixture holds the 47 edge cases and pins the lot_form_effective snapshot', () => {
    expect(EDGES.length).toBe(47);
    expect(Object.keys(FIX.lot_form_snapshot as Json)).toEqual(expect.arrayContaining(['gate', 'view', 'settings', 'layer2_table_version']));
  });
  it.each(EDGES.map((e) => [e.id, e] as [string, Json]))('%s', (_id, edge) => {
    compareExample(edge, run(edge));
  });
  it('N6-04 (null frontage) shows no relief and no relief disclosure; N6-04-base (frontage 12.2) shows both', () => {
    const none = run(EDGES.find((e) => e.id === 'N6-04') as Json);
    const base = run(EDGES.find((e) => e.id === 'N6-04-base') as Json);
    expect(none.RA.relief_applied).toBe(false);
    expect(none.disclosures).not.toContain('relief_applied');
    expect(base.RA.relief_applied).toBe(true);
    expect(base.disclosures).toEqual(expect.arrayContaining(['relief_applied', 'relief_71_1_precondition_taken_as_holding']));
    expect(none.RA.addition_gfa).toBeCloseTo(base.RA.addition_gfa, 4);
  });
  it('P71-FAIL (precondition stated failing) gives no relief and no relief disclosure, with RA unchanged against P71-HOLD (F-1)', () => {
    const fail = run(EDGES.find((e) => e.id === 'P71-FAIL') as Json);
    const hold = run(EDGES.find((e) => e.id === 'P71-HOLD') as Json);
    expect(fail.RA.relief_applied).toBe(false);
    expect(fail.disclosures).not.toContain('relief_applied');
    expect(hold.disclosures).toEqual(expect.arrayContaining(['relief_applied', 'relief_71_1_precondition_taken_as_holding']));
    expect(fail.RA.addition_gfa).toBeCloseTo(hold.RA.addition_gfa, 4);
    expect(fail.RA.up_plate).toBeLessThan(hold.RA.up_plate);
  });
  it('an unsure half runs as a half and carries the assumption line (Q-4): E10, N6-36-A0375', () => {
    for (const ex of [EDGES.find((e) => e.id === 'N6-36-A0375') as Json]) {
      const out = run(ex);
      expect([ex.id, out.disclosures]).toEqual([ex.id, expect.arrayContaining(['envelope_semi_detached_used', 'unsure_half_assumed'])]);
      expect([ex.id, out.RI.suite_max_interior]).toEqual([ex.id, { status: 'not_applicable', reason: 'no_secondary_suite_in_converted_semi (10.5.20.40(6))' }]);
    }
  });
});

describe('MB-27 increment 6: the semi suite bar only when converted to more than one unit (operator "All approved" 2026-11-16)', () => {
  it('E10, E11 and N6-04-pool (a half that stays one unit) keep the suite maximum; the half carries the assumption line', () => {
    for (const ex of [byId('E10'), byId('E11'), (FIX.edge_cases_n6 as Json[]).find((e) => e.id === 'N6-04-pool') as Json]) {
      const out = run(ex);
      expect([ex.id, out.RI.units]).toEqual([ex.id, 1]);
      expect([ex.id, typeof out.RI.suite_max_interior]).toEqual([ex.id, 'number']);
    }
    expect(run(byId('E10')).RI.suite_max_interior).toBeCloseTo(11.475, 4);
    expect(run(byId('E10')).disclosures).toContain('unsure_half_assumed');
  });
  it('A0399 (L-A0399, V-A0399-FIN, E9: 4 units after) stays not_applicable', () => {
    for (const id of ['L-A0399', 'V-A0399-FIN', 'E9']) expect([id, run(byId(id)).RI.suite_max_interior.status]).toEqual([id, 'not_applicable']);
  });
});

describe('MB-27 increment 6: E1, E2, E3, E5 named', () => {
  it('E1: the 5.88 m frontage takes the relief, so the up plate is the owner footprint 80, not F', () => {
    const e = byId('E1');
    const { RA } = run(e);
    expect(RA.relief_applied).toBe(true);
    expect(RA.up_plate).toBeCloseTo(80, 4);
    expect(RA.up_plate).toBeGreaterThan(e.input.envelope.F_m2);
    expect(RA.lawfully_existing_caveat).toBe(true);
  });

  it('E2: over F with no FSI cap, the envelope room binds at G minus the existing GFA (182.494)', () => {
    const e = byId('E2');
    const { RA } = run(e);
    expect(RA.binds).toBe('envelope_room');
    expect(RA.envelope_room).toBeCloseTo(e.input.envelope.G_m2 - e.input.owner.footprint_m2 * e.input.owner.storeys, 4);
    expect(RA.addition_gfa).toBeCloseTo(182.494, 4);
    expect(run(e).RE.gain).toBeCloseTo(182.494, 4);
  });

  it('E3: a half storey raises the rear storey count to the next whole storey, never a half', () => {
    const { RA } = run(byId('E3'));
    expect(RA.back_storeys).toBe(2);
    expect(RA.back_storeys).toBe(Math.ceil(1.5));
    expect(RA.back_gfa).toBeCloseTo(9.36 * 2, 4);
  });

  it('E5: the one-storey extension inside the RD window is disclosed and carries no number', () => {
    const { RA } = run(byId('E5'));
    expect(RA.one_storey_extension).toBe('disclosed (window met; no number)');
    expect(RA.back_footprint).toBeCloseTo(71.4429, 4);
    expect(RA.back_gfa).toBeCloseTo(142.8858, 4);
    expect(RA.addition_gfa).toBeCloseTo(159, 4); // the key: the FSI room binds (back + up = 262.9, room 159); the extension adds no number of its own
  });
});

describe('MB-27 increment 6: the owner entry gates every row (items 3, 4 b, UB-9)', () => {
  // The H-* examples are the complete hypothetical siblings of N-A0097 and compute (landed key).
  const needs = EXAMPLES.filter((e) => (e.id as string).startsWith('N-'));
  it('the fixture holds the six N-* examples', () => {
    expect(needs.map((e) => e.id).sort()).toEqual(['N-A0067', 'N-A0097', 'N-A0289-NOST', 'N-A0399-NOBS', 'N-A0553', 'N-A0561'].sort());
  });

  it.each(needs.map((e) => [e.id, e] as [string, Json]))('%s reads needs_user_input with the missing fields in key order and no number', (_id, example) => {
    const out = run(example);
    for (const key of ROW_KEYS) {
      const row = out[key] as Json;
      expect([example.id, key, row.status]).toEqual([example.id, key, 'not_evaluated']);
      expect(row.reason as string).toMatch(/^needs_user_input:/);
      const fields = missingFields(row.reason as string);
      expect([example.id, key, fields]).toEqual([example.id, key, example.expect[key].reason.replace(/^needs_user_input:/, '').split(',')]);
      const sorted = [...fields].sort((a, b) => MISSING_ORDER.indexOf(a) - MISSING_ORDER.indexOf(b));
      expect([example.id, key, fields]).toEqual([example.id, key, sorted]);
    }
    const N = NUMBERS as Record<string, string[]> & { RA: string[]; RE: string[]; RI: string[]; RB: string[]; RF: string[]; UB: string[] };
    const numbers = [...N.RA.map((f) => out.RA[f]), ...N.RE.map((f) => out.RE[f]), ...N.RI.map((f) => out.RI[f]), ...N.RB.map((f) => out.RB[f]), ...N.RF.map((f) => out.RF[f]), ...N.UB.map((f) => out.UB[f])];
    expect([example.id, numbers.filter((n) => typeof n === 'number')]).toEqual([example.id, []]);
  });

  it('N-A0097 lists both missing fields in the order existing_storeys then existing_basement', () => {
    const { RA } = run(byId('N-A0097'));
    expect(missingFields(RA.reason)).toEqual(['existing_storeys', 'existing_basement']);
  });

  it('the vacant lot is not_applicable vacant_lot on all six rows', () => {
    const out = run(byId('V-A0094'));
    for (const key of ROW_KEYS) expect([key, (out[key] as Json).status, (out[key] as Json).reason]).toEqual([key, 'not_applicable', 'vacant_lot']);
  });
});

describe('MB-27 increment 6: the law arrives in settings, never as a literal in the module', () => {
  it('UB-SHARE: halving reno_basement_livable_share halves the RF and UB basement areas', () => {
    const e = byId('UB-SHARE');
    const half = run(e, { ...settingsFor(e), compute_maxbld_scenarios_reno_basement_livable_share: 0.5 });
    const full = run({ ...e, input: { ...e.input, settings: { reno_basement_livable_share: 1 } } });
    expect(half.RF.basement_finish_livable_area).toBeCloseTo(full.RF.basement_finish_livable_area / 2, 4);
    expect(half.UB.basement_livable_area).toBeCloseTo(full.UB.basement_livable_area / 2, 4);
    expect(half.RF.basement_finish_livable_area).toBeCloseTo(e.expect.RF.basement_finish_livable_area, 4);
  });

  it('the module source holds no 12.2, 0.45 or 0.85 outside its comments', () => {
    const src = fs.readFileSync(path.join(ROOT, MOD_PATH), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const literal of ['12.2', '0.45', '0.85']) expect([literal, code.includes(literal)]).toEqual([literal, false]);
  });

  it('the building types, switches and increment are the six renovation ids with their own switch', () => {
    const types = readJson('scripts/seeds/bylaw/building-types.json');
    const switches = readJson('scripts/seeds/bylaw/switchboard.json');
    for (const id of Object.values(BUILT_TYPE)) {
      const row = (types.rows as Json[]).find((x) => x.id === id) as Json;
      expect([id, row?.class]).toEqual([id, 'detached_house']);
      expect([id, row?.structure]).toEqual([id, 'principal']);
      expect([id, row?.increment]).toEqual([id, '6']);
      const sw = (switches.rows as Json[]).find((x) => x.id === `building_type:${id}`) as Json;
      expect([id, sw?.kind]).toEqual([id, 'building_type']);
    }
  });
});
