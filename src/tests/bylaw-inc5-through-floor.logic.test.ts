// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-198(1) (the larger-of is computed where both values exist), M-465, M-179(2);
//            docs/specs/01-pipeline/134_resolve_bylaws.md section 3
//
// MB-27 increment 5 · McBylaws queue · lane B5B-5 (P2 (a), Layer 2) · RED FIRST (captured on the tree without the change:
// docs/reports/red-evidence/bylaw/inc5-through-floor-red.txt). Operator 2026-11-13 ~19:50 P2 (a) as grounded in B5A-2 (a): on a through
// lot the rear is max(the lot's own front setback; the Layer 2 floor of 150.7.60.20(3)(A)/(B), 1.5 m). The stored (3)(A) cell stays
// not_evaluated (no abutting front setback in Layer 2); the 1.5 m floor is its own garden_suite target, rear_setback_through_floor_m,
// stored from (3)(B) by a generated unit (D-76 / M-465 form, the source unit keeps rear_setback_m), in the same still-unapplied
// migration 321 (width 71 -> 72). Layer 3 holds no law number (R3-02). Cells measured on the golden 25.
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
const FLOOR = 'rear_setback_through_floor_m';
const GEN = '150.7.60.20(3)#floor(3)(B)';

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

describe('P2 (a): the through-lot rear floor is its own garden_suite target', () => {
  it('vocab declares the target (metres, envelope, a minimum) and the scope lists it for the garden suite only, after rear_setback_m', () => {
    const t = VOCAB.dsl_target[FLOOR] as Json;
    expect([t.unit, t.aspect, t.bound]).toEqual(['m', 'envelope', 'min']);
    const g = SCOPE.targets.garden_suite as string[];
    expect(g.indexOf(FLOOR)).toBe(g.indexOf('rear_setback_m') + 1);
    expect(SCOPE.targets.principal).not.toContain(FLOOR);
    expect(SCOPE.targets.laneway_suite).not.toContain(FLOOR);
  });
  it('the row is 72 wide: 57 base pairs, the option slots after them, the floor at base position 37', () => {
    const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
    const base = rb.scopePairs(SCOPE) as Json[]; const opts = rb.optionPairs(SCOPE, VOCAB.design_options) as Json[];
    expect([base.length, base.length + opts.length]).toEqual([57, 72]);
    expect(base.findIndex((p) => p.structure === 'garden_suite' && p.target === FLOOR) + 1).toBe(37);
  });
  it('a generated unit states the 1.5 m of (3)(B) on the floor target; the source unit keeps rear_setback_m; (3)(A) is unchanged', () => {
    const g = unit(GEN);
    expect(g.target).toBe(FLOOR);
    expect(g.generated_from).toEqual(['150.7.60.20(3)#(3)(B)']);
    expect(g.numeric_expression).toEqual([`${FLOOR} = 1.5 m @(3)(B)`]);
    expect(unit('150.7.60.20(3)#(3)(B)').target).toBe('rear_setback_m');
    expect(unit('150.7.60.20(3)#(3)(A)').numeric_expression).toEqual(['rear_setback_m = abutting_front_setback_m @(3)(A)']);
  });
  it('A0464 (through lot): the floor cell is 1.5 m from the generated unit; the rear cell still waits for the step (P5.13)', () => {
    expect(cell('A0464', 'garden_suite', FLOOR, 'detached_house')).toBe(`number:1.5@${GEN}`);
    expect(cell('A0464', 'garden_suite', 'rear_setback_m', 'detached_house')).toBe('not_evaluated:missing_input:abutting_front_setback_m');
  });
});

describe('migration 321 carries the second target (written, not applied)', () => {
  const NAME = 'migrations/321_resolve_bylaws_corner_floor_slot.sql';
  it('321: width 72, the shared code refused at the 57 base slots and the threshold slot 64, both views at 72', () => {
    const s = read(NAME);
    expect(s).toContain('CHECK (cardinality(codes) = 72 AND');
    expect(s).toContain('CHECK (NOT (codes[1:57] @> ARRAY[5]::smallint[]) AND codes[64] <> 5) NOT VALID');
    expect(s.match(/WHERE cardinality\(l\.codes\) = 72;/g)).toHaveLength(2);
    expect(s).toContain(`(37, 'garden_suite', '${FLOOR}')`);
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
