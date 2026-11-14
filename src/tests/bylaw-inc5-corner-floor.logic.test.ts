// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-198 (the larger-of is computed where both values exist), M-465, M-179(2);
//            docs/specs/01-pipeline/134_resolve_bylaws.md section 3
//
// MB-27 increment 5 · McBylaws queue · lane B5B-4 (P1 (b), Layer 2) · RED FIRST (captured on the tree without the change:
// docs/reports/red-evidence/bylaw/inc5-corner-floor-red.txt). Operator 2026-11-13 evening ("The corner-floor keying question:
// recommended (i), the by-law table stores the 1.5 m floor", "approved as long as they are compliant") and ~19:50 P1 (b): the
// 150.7.60.20(6)(C) clause floor (1.5 m) is its own Layer 2 target on the garden suite, in a NEW migration (321), so Layer 3 takes
// max(the house's street-side yard; the floor) with no law number in Layer 3 (R3-02). Cells measured on the golden 25.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON / CommonJS surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'x.js'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const VOCAB = readJson('scripts/seeds/bylaw/vocab.json');
const SCOPE = readJson('scripts/seeds/bylaw/layer2-scope.json');
const INPUT = readJson('docs/reference/bylaw-layer2-input.json');
const unit = (id: string): Json => (INPUT.body.units as Json[]).find((u) => u.unit_id === id) as Json;
const FLOOR = 'side_setback_street_floor_m';

const cell = (() => {
  const mz = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js'));
  const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
  const env = mz.makeEnv({ body: INPUT.body, map: readJson('scripts/seeds/bylaw/layer2-map.json'), scope: SCOPE, vocab: VOCAB,
    zoneList: readJson('scripts/seeds/logic_variables.json').resolve_bylaws_population_zone_classes.default,
    versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version } });
  const G = 'src/tests/fixtures/layer3/golden-25';
  const exp = read(`${G}/expected.jsonl`).trim().split('\n').map((l) => JSON.parse(l) as Json);
  const byCase = new Map(exp.map((e) => [String(e.case).slice(0, 5), e.parcel_id]));
  const rows = new Map((readJson(`${G}/parcels-rows.json`) as unknown as Json[]).map((r) => [r.id, r]));
  return (lotCase: string, structure: string, target: string, cls: string): string => {
    const { lot } = rb.buildLotVector(rows.get(byCase.get(lotCase)), env.lotEnv);
    const x = mz.traceResult(lot, structure, target, cls, env);
    return x.status === 'value' || x.status === 'applies' ? `${x.value_kind}:${x.value}@${x.winner_unit_id}` : `${x.status}:${x.reason}`;
  };
})();

describe('P1 (b): the corner street-side floor is its own garden_suite target', () => {
  it('vocab declares the target (metres, envelope, a minimum) and the scope lists it for the garden suite only, in its sorted place', () => {
    const t = VOCAB.dsl_target[FLOOR] as Json;
    expect([t.unit, t.aspect, t.bound]).toEqual(['m', 'envelope', 'min']);
    expect(SCOPE.targets.garden_suite).toContain(FLOOR);
    const g = SCOPE.targets.garden_suite as string[];
    expect(g.indexOf(FLOOR)).toBe(g.indexOf('side_setback_m') + 1);
    expect(SCOPE.targets.principal).not.toContain(FLOOR);
    expect(SCOPE.targets.laneway_suite).not.toContain(FLOOR);
  });
  it('the row is 72 wide (P2 a: the through-lot rear floor joined at 37): 57 base pairs, the option slots after them (roof_form, suite_height), the corner floor at base position 41', () => {
    const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
    const base = rb.scopePairs(SCOPE) as Json[]; const opts = rb.optionPairs(SCOPE, VOCAB.design_options) as Json[];
    expect([base.length, base.length + opts.length]).toEqual([57, 72]);
    expect(base.findIndex((p) => p.structure === 'garden_suite' && p.target === FLOOR) + 1).toBe(41);
  });
  it('150.7.60.20(6)(C) states the floor on its own target, 1.5 m, and no longer reads the principal side yard input', () => {
    const u = unit('150.7.60.20(6)#(6)(C)');
    expect(u.target).toBe(FLOOR);
    expect(u.numeric_expression).toEqual([`${FLOOR} = 1.5 m @(6)(C)`]);
    expect(JSON.stringify(u)).not.toContain('principal_side_setback_m');
  });
  it('A0578 (corner lot): the stored floor cell is 1.5 m from (6)(C); a lot that is not a corner lot stores no floor', () => {
    expect(cell('A0578', 'garden_suite', FLOOR, 'detached_house')).toBe(`number:1.5@150.7.60.20(6)#(6)(C)`);
    expect(cell('A0094', 'garden_suite', FLOOR, 'detached_house')).toMatch(/^not_applicable|^not_evaluated/);
    expect(cell('A0094', 'garden_suite', FLOOR, 'detached_house')).not.toMatch(/^number/);
  });
});

describe('migration 321 (written, not applied)', () => {
  const NAME = 'migrations/321_resolve_bylaws_corner_floor_slot.sql';
  it('321: width 72, the shared code refused at the 57 base slots and the threshold slot 64, both views at 72', () => {
    const s = read(NAME);
    expect(s).toContain('CHECK (cardinality(codes) = 72 AND');
    expect(s).toContain('CHECK (NOT (codes[1:57] @> ARRAY[5]::smallint[]) AND codes[64] <> 5) NOT VALID');
    expect(s.match(/WHERE cardinality\(l\.codes\) = 72;/g)).toHaveLength(2);
    expect(s).toContain(`(41, 'garden_suite', '${FLOOR}')`);
  });
  it('321: both views name every position both ways against rb.scopePairs / rb.optionPairs', () => {
    const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
    const s = read(NAME);
    const v = (name: string): string => (new RegExp(`CREATE OR REPLACE VIEW ${name} AS([\\s\\S]*?);\\n`).exec(s) as RegExpExecArray)[1] as string;
    const base = [...v('bylaw_resolution_results').matchAll(/\((\d+), '([a-z_]+)', '([a-z0-9_]+)'\)/g)].map((m) => ({ i: Number(m[1]), structure: m[2], target: m[3] }));
    expect(base).toEqual((rb.scopePairs(SCOPE) as Json[]).map((p, i) => ({ i: i + 1, ...p })));
    const opt = [...v('bylaw_resolution_option_results').matchAll(/\((\d+), '([a-z_]+)', '([a-z0-9_]+)', (NULL|'[a-z_]+'), (NULL|\d+)\)/g)].map((m) => [Number(m[1]), m[3], m[4] === 'NULL' ? null : m[4]!.slice(1, -1), m[5] === 'NULL' ? null : Number(m[5])]);
    expect(opt).toEqual((rb.optionPairs(SCOPE, VOCAB.design_options) as Json[]).map((p, k) => [58 + k, p.target, p.option, p.base_index === null ? null : p.base_index + 1]));
  });
});
