// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan sections 2, 7, 18, 19.7, 20.2)
//
// MB-31 · E31-01 oracle-only brief B0c. RED FIRST: the seeds
// (`scripts/seeds/bylaw/layer3-catalogue.json`, `switchboard.json`, `building-types.json`) and the modules
// (`scripts/lib/compute/maxbld/catalogue.js`, `scripts/analysis/bylaw/dsl.mjs` l3 mode) do not exist yet.
// The tests pin the catalogue invariants: ten rows, one switch each, disjoint name spaces, only 0/1/2 literals,
// a valid `validateCatalogue`, a topological row order, stable seed hashes, and the FS-SB2a / L31-14 / B8 seams.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href) as Promise<Json>;
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const clone = (x: unknown): Json => JSON.parse(JSON.stringify(x));

const SEED_FILES = {
  catalogue: 'scripts/seeds/bylaw/layer3-catalogue.json',
  switchboard: 'scripts/seeds/bylaw/switchboard.json',
  buildingTypes: 'scripts/seeds/bylaw/building-types.json',
  logicVariables: 'scripts/seeds/logic_variables.json',
  vocab: 'scripts/seeds/bylaw/vocab.json',
  layer2Scope: 'scripts/seeds/bylaw/layer2-scope.json',
};
const PINNED_SHA: Record<string, string> = {
  // re-pinned 2026-11-02 (MB-31, operator D2 option 1): the catalogue gained the `lexicon` key (the Layer 3 words that arm L, R-LA, moves out of the code).
  // re-pinned 2026-11-03 (MB-27 sqrt, operator RP-5 'Rp- 5 and RP-6 approved'): the lexicon gained root, sqrt and expression_error_sqrt_negative (M-466).
  // re-pinned 2026-11-04 (MB-27 Layer 3 forms, operator RP-10 'RP-10 approved, switchboard pin approved, shape low yes'): the lexicon gained refuse, best_of, ceiling, headline_, headline_lower_bound_, dropped_, unknown_reason, semi, syntax and three best_of syntax phrases, and the catalogue gained the declared lists refuse_reasons, drop_reasons, flag_words and flag_params (M-480, with its Q-K5 a dated note).
  // re-pinned 2026-11-04 (MB-27 increment-2 rows + R1, operator RP-K "pre approved ..." (inc2/open-questions.md:543), version and hash fields only): 37 increment-2 rows (M-457..M-487), the revisions of buildable_width_m (M-458) and gfa_max_m2 (M-476), the R1 design_option tags, 8 rafter settings (M-462), the flag word attic_outside_gfa and the refuse word no_permitted_gfa_base (M-480, Q-MECH0).
  // re-pinned 2026-11-08 (MB-27 inc3 E8, DL-21 a, E1C-S, hash fields only): every row's building_type becomes a list (Q2 a); was catalogue: '
  catalogue: '86d7911e7ce759f21e15c3f3e493ac0dc2ea15f8749fff42af578214b1691889',
  // re-pinned 2026-11-04 (MB-27 switchboard confidence, operator Q-CONF a 'Q CONF a' and 'RP-10 approved, switchboard pin approved, shape low yes'): schema switchboard-v2; every reading row gained confidence and evidence; the seven increment-2 register readings C1-C7 joined as reading rows (M-481).
  // re-pinned 2026-11-04 (MB-27 increment-2 rows, operator RP-K "pre approved ..." (inc2/open-questions.md:543), version and hash fields only): 39 formula switches (37 rows, 2 revisions; M-378, M-476), four off by "Q-default a".
  // re-pinned 2026-11-06 (MB-27 the switch-on, operator RP-SW "all recommended" (D-9) and RP-SW2 "a", version and hash fields only): the four Q-DEFAULT switches off -> on, their reason text; was 4aa44e44
  // re-pinned 2026-11-08 (MB-27 inc3 E8, DL-21 a, E1C-S, hash fields only): the detached_houseplex switch and the six confidence readings; was switchboard:
  switchboard: '5d9d4459afe0034b81a49098e45397b5490a72666403f123d2fa89132c5b6be7',
  // re-pinned 2026-11-08 (MB-27 inc3 E8, DL-21 a, E1C-S, hash fields only): the detached_houseplex type; was buildingType
  buildingTypes: '05398a754244b841d7a49a4b6516e3e8bb0766ee71150946f63a6bcd29f9a936',
};
const ROW_IDS = [
  'permitted',
  'front_setback_used_m',
  'depth_room_m',
  'buildable_width_m',
  'buildable_depth_m',
  'footprint_max_m2',
  'height_max_m',
  'storeys_max',
  'gfa_max_m2',
  'units_max',
];

function loadSeeds(): Json {
  return {
    catalogue: readJson(SEED_FILES.catalogue),
    switchboard: readJson(SEED_FILES.switchboard),
    buildingTypes: readJson(SEED_FILES.buildingTypes),
    logicVariables: readJson(SEED_FILES.logicVariables),
    vocab: readJson(SEED_FILES.vocab),
    layer2Classes: readJson(SEED_FILES.layer2Scope).classes,
  };
}
const exprRows = (cat: Json): Json[] => cat.rows.filter((r: Json) => r.form === 'expr' && r.id !== 'front_setback_used_m');
const rowOf = (cat: Json, id: string): Json => cat.rows.find((r: Json) => r.id === id);

describe('MB-31 B11 data files (hash manifest)', () => {
  it('the three seed files hash to the pinned sha256 of their raw bytes', () => {
    for (const key of Object.keys(PINNED_SHA)) {
      const bytes = fs.readFileSync(path.join(ROOT, SEED_FILES[key as keyof typeof SEED_FILES]));
      expect(crypto.createHash('sha256').update(bytes).digest('hex'), key).toBe(PINNED_SHA[key]);
    }
  });
});

describe('MB-31 catalogue invariants (B8)', () => {
  let C: Json;
  let D: Json;
  let SEEDS: Json;
  let CAT: Json;
  let SW: Json;

  beforeAll(async () => {
    C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
    D = await mod('scripts/analysis/bylaw/dsl.mjs');
    SEEDS = loadSeeds();
    CAT = SEEDS.catalogue;
    SW = SEEDS.switchboard;
  });

  // Q-K-ASSERT a (M-457): the ten increment-1 rows in their pinned order, then the 37 increment-2 rows
  it('schema + ten increment-1 rows in the pinned order, then the 37 increment-2 rows, all detached_house', () => {
    expect(CAT.schema).toBe('layer3-catalogue-v1');
    expect(CAT.rows).toHaveLength(47);
    expect(CAT.rows.slice(0, 10).map((r: Json) => r.id)).toEqual(ROW_IDS);
    for (const [i, row] of CAT.rows.entries()) {
      expect(row.building_type).toEqual(['detached_house', 'detached_houseplex']); // DL-21 a move 1 (Q2 a): every row's building_type is a list
      expect(row.increment).toBe(i < 10 ? '1' : '2');
      expect(row.clauses.length).toBeGreaterThan(0);
      expect(row.rules.length).toBeGreaterThan(0);
      expect(row.example_ids.length).toBeGreaterThan(0);
    }
  });

  it('every row points at a live switchboard row and the five name spaces are disjoint', () => {
    const swIds = new Set(SW.rows.map((r: Json) => r.id));
    for (const row of CAT.rows) expect(swIds.has(row.switch), row.id).toBe(true);
    const spaces = new Map<string, string[]>([
      ['rows', CAT.rows.map((r: Json) => r.id)],
      ['facts', CAT.facts.map((f: Json) => f.id)],
      ['geometry_inputs', CAT.geometry_inputs.map((g: Json) => g.id)],
      ['lot_flags', CAT.lot_flags.map((l: Json) => l.id)],
      ['dsl_target', Object.keys(SEEDS.vocab.dsl_target)],
    ]);
    const keys = [...spaces.keys()];
    for (const a of keys) {
      for (const b of keys) {
        if (a >= b) continue;
        const left = spaces.get(a) as string[];
        const right = spaces.get(b) as string[];
        const overlap = left.filter((id) => right.includes(id));
        expect(overlap, `${a} vs ${b}`).toEqual([]);
      }
    }
  });

  it('literals are only 0, 1, 2 and no expression spells 6.0', () => {
    expect(D.literalsOf).toBeTypeOf('function');
    for (const row of CAT.rows.filter((r: Json) => r.form === 'expr')) {
      const lits = D.literalsOf(D.parseExpr(row.expression, { layer: 'l3' }));
      for (const lit of lits) expect([0, 1, 2]).toContain(lit.value);
      expect(row.expression).not.toContain('6.0');
    }
  });

  it('names resolve: checkRowL3 is [] for every expression row but the front row', () => {
    const U = C.unitsFor(CAT, SEEDS.vocab);
    for (const row of exprRows(CAT)) expect(D.checkRowL3(row, U), row.id).toEqual([]);
  });

  it('front row: l2(front_setback_fallback_m) names a stored target, no violation', () => {
    const U = C.unitsFor(CAT, SEEDS.vocab);
    expect(D.checkRowL3(rowOf(CAT, 'front_setback_used_m'), U)).toEqual([]);
  });

  it('validateCatalogue on the real seeds: no violation', () => {
    expect(C.validateCatalogue(SEEDS, ['1', '2'])).toHaveLength(0); // Q-K-ASSERT a (M-457): the increment-2 rows; was ['1']
  });

  it('validateCatalogue rejects a renamed fact, a deleted switchboard row, a 6 ratio and a fact named fsi', () => {
    const base = C.validateCatalogue(SEEDS, ['1']).length;
    const renamed = clone(SEEDS);
    renamed.catalogue.facts.find((f: Json) => f.id === 'ring_n').id = 'ring_count';
    expect(C.validateCatalogue(renamed, ['1']).length).toBeGreaterThan(base);

    const noSwitch = clone(SEEDS);
    noSwitch.switchboard.rows = noSwitch.switchboard.rows.filter((r: Json) => r.id !== 'formula:height_max_m');
    expect(C.validateCatalogue(noSwitch, ['1']).length).toBeGreaterThan(base);

    const badRatio = clone(SEEDS);
    const front = badRatio.catalogue.rows.find((r: Json) => r.id === 'front_setback_used_m');
    front.expression = front.expression.replace('÷ 2 ratio', '÷ 6 ratio');
    expect(C.validateCatalogue(badRatio, ['1']).length).toBeGreaterThan(base);

    const fsi = clone(SEEDS);
    fsi.catalogue.facts.push({ id: 'fsi', unit: 'ratio', source: 'user', flags: [] });
    expect(C.validateCatalogue(fsi, ['1']).length).toBeGreaterThan(base);
  });

  it('topoOrder puts every row after the rows it names, and throws on a cycle', () => {
    const order = C.topoOrder(CAT);
    const at = (id: string) => order.indexOf(id);
    expect(at('front_setback_used_m')).toBeLessThan(at('depth_room_m'));
    expect(at('depth_room_m')).toBeLessThan(at('buildable_depth_m'));
    expect(at('buildable_depth_m')).toBeLessThan(at('footprint_max_m2'));
    expect(at('footprint_max_m2')).toBeLessThan(at('gfa_max_m2'));
    expect(at('storeys_max')).toBeLessThan(at('gfa_max_m2'));

    const cyclic = clone(CAT);
    cyclic.rows.find((r: Json) => r.id === 'height_max_m').expression = 'storeys_max';
    cyclic.rows.find((r: Json) => r.id === 'storeys_max').expression = 'height_max_m';
    expect(() => C.topoOrder(cyclic)).toThrow();
  });

  it('seedShas + sha256 are stable and key-order independent', () => {
    const shas = C.seedShas(SEEDS);
    for (const key of ['catalogue_sha', 'switchboard_sha', 'building_types_sha']) expect(shas[key]).toMatch(/^[0-9a-f]{64}$/);
    expect(C.seedShas(SEEDS)).toEqual(shas);
    expect(C.sha256({ b: 1, a: 2 })).toBe(C.sha256({ a: 2, b: 1 }));
  });

  it('FS-SB2a: the ring facts and the two calibration settings exist with their citations', () => {
    const ringN = CAT.facts.find((f: Json) => f.id === 'ring_n');
    const ringMean = CAT.facts.find((f: Json) => f.id === 'ring_est_mean_m');
    expect(ringN.unit).toBe('units');
    expect(ringMean.unit).toBe('m');
    expect(ringN.flags ?? ringMean.flags).toContain('front_yard_needs_survey');
    for (const id of ['fya_placeholder_ring_depth', 'fya_placeholder_ring_min_n']) {
      const decl = CAT.settings.find((s: Json) => s.id === id);
      expect(decl.citation.startsWith('CARD-fs-sb2a'), id).toBe(true);
    }
  });

  it('L31-14: the seam flags, the refuse terminal and the unit seam are declared', () => {
    const storeys = rowOf(CAT, 'storeys_max');
    expect(storeys.input_flags['lv(s1_ceiling_min_m)']).toEqual(['storeys_from_minimum_ceiling']);
    expect(storeys.terminal).toBe('refuse');
    expect(rowOf(CAT, 'gfa_max_m2').optional_targets).toEqual(['gfa_m2']);
    expect(rowOf(CAT, 'footprint_max_m2').status_map['setting_not_fitted:footprint_shape_factor']).toBe(
      'shape_factor_not_fitted',
    );
  });

  it('every lv() setting is seeded (waits C1 seeds)', () => {
    const decls = C.settingDecls(CAT, SEEDS.logicVariables);
    const vals = C.settingVals(CAT, SEEDS.logicVariables);
    for (const setting of CAT.settings) {
      expect(decls[setting.id], setting.id).toBeTruthy();
      expect('value' in vals[setting.id], setting.id).toBe(true);
    }
  });

  it('increment ids are the closed set (MB-68 increments.json)', () => {
    const p = path.join(ROOT, 'scripts/analysis/mcbylaws-loop/data/increments.json');
    expect(fs.existsSync(p), p).toBe(true);
    const inc = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ids: string[] = (Array.isArray(inc) ? inc : inc.ids ?? inc.rows ?? inc.increments).map((x: Json) => (typeof x === 'string' ? x : x.id));
    expect(ids).toContain('1');
  });
});
