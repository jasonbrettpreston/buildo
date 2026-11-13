// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-465, M-284, M-198, M-191 / M-253, M-267 / M-314, M-451, M-481
//            (dated notes 2026-11-12, MB-27 increment 5); docs/specs/01-pipeline/134_resolve_bylaws.md section 3
//
// MB-27 increment 5 · McBylaws queue · lane B5A (C2a, Layer 1 / 2) · RED FIRST (on the parent the suite height option, the type-less
// exception rule, the flat 45 % (A) statement, the house's path-(B) target, migration 315 and 849-2025 in force are all absent).
// Operator rulings ~/Buildo-scratch/mcbylaws/inc5/WALK2-20261112.md ("Operator rulings, 2026-11-12 afternoon"): item 1 (D-1 a), item 3
// (D-3 a), item 5 (D-8 a), item 6 reading 2 + D-6 a ("through y"), item 7 (D-4 a), item 9 (a) / D-64, item 10 B / FD-5 a / D-66, item 12
// (D-10 a), build Q3 a as ruled "B5A-1 c", "B5A-2 a". Cells measured on the golden 25 through the committed pure core (traceResult).
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

// the golden 25 through the pure core, the probe of ~/Buildo-scratch/mcbylaws/inc5/b5a/probe-g25.mjs
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
  return (lotCase: string, structure: string, target: string, cls: string, flags: Json = {}): string => {
    const { lot } = rb.buildLotVector(rows.get(byCase.get(lotCase)), env.lotEnv);
    const x = mz.traceResult({ ...lot, flags: { ...(lot.flags || {}), ...flags } }, structure, target, cls, env);
    return x.status === 'value' || x.status === 'applies' ? `${x.value_kind}:${x.value}@${x.winner_unit_id}` : `${x.status}:${x.reason}`;
  };
})();
const LOW = { suite_height_over_4m: false, suite_one_storey: true };
const TALL = { suite_height_over_4m: true, suite_one_storey: false };

describe('item 1 (D-1 a) + item 7 (D-4 a): the suite_height design option', () => {
  it('vocab declares suite_height after roof_form, token suite_height_over_4m, no threshold; low sets one storey, tall does not', () => {
    expect(Object.keys(VOCAB.design_options).filter((k) => k !== '$comment')).toEqual(['roof_form', 'suite_height']);
    const o = VOCAB.design_options.suite_height as Json;
    expect(o.token).toBe('suite_height_over_4m');
    expect(o.threshold_target).toBeUndefined();
    expect(o.values).toEqual([
      expect.objectContaining({ option: 'suite_low', holds: false, sets: { suite_one_storey: true } }),
      expect.objectContaining({ option: 'suite_tall', holds: true, sets: { suite_one_storey: false } }),
    ]);
    expect(SCOPE.options.suite_height).toEqual({ classes: ['detached_house', 'detached_houseplex', 'house_with_secondary_suite'], targets: { garden_suite: ['gfa_m2', 'height_m', 'rear_setback_m', 'separation_m'] } });
  });
  it('the row is 70 wide: 55 base pairs, roof_form 56-62, suite_height 63-70 (low then tall), the option run sets the token and `sets`', () => {
    const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
    const base = rb.scopePairs(SCOPE); const opts = rb.optionPairs(SCOPE, VOCAB.design_options);
    expect([base.length, base.length + opts.length]).toEqual([55, 70]);
    const sh = opts.filter((p: Json) => p.option_name === 'suite_height');
    expect(sh.map((p: Json) => `${p.target}:${p.option}:${p.base_index + 1}`)).toEqual([
      'gfa_m2:suite_low:31', 'gfa_m2:suite_tall:31', 'height_m:suite_low:32', 'height_m:suite_tall:32',
      'rear_setback_m:suite_low:36', 'rear_setback_m:suite_tall:36', 'separation_m:suite_low:38', 'separation_m:suite_tall:38']);
    expect(rb.optionLot({ flags: { suite_one_storey: false } }, sh[0]).flags).toEqual({ suite_one_storey: true, suite_height_over_4m: false });
    expect(rb.optionInputPaths(opts)).toEqual(['flags.flat_or_shallow_roof', 'flags.suite_height_over_4m', 'flags.suite_one_storey']);
  });
  it('assembly generates no threshold unit for an option without threshold_target (assembly.mjs:94)', async () => {
    const A = await import(path.join(ROOT, 'scripts/analysis/bylaw-validation/assembly.mjs'));
    const tu = A.thresholdUnits(INPUT.body.units.filter((u: Json) => !String(u.unit_id).includes('#threshold')), VOCAB) as Json[];
    expect(tu.every((u) => u.target === 'pitched_roof_slope_min')).toBe(true);
  });
  it('the golden 25: low 4.0 m high at 4.0 m separation, GFA cap 60; tall 6.3 m at 7.5 m, cap 120; outside a run the arm is undecided', () => {
    expect(['height_m', 'separation_m', 'gfa_m2'].map((t) => cell('A0553', 'garden_suite', t, 'detached_house', LOW))).toEqual([
      'number:4@150.7.60.40(1)#(1)(A)', 'number:4@150.7.60.30(1)#(1)(A)', 'number:60@150.7.60.50(4)#(4)(B)']);
    expect(['height_m', 'separation_m', 'gfa_m2'].map((t) => cell('A0553', 'garden_suite', t, 'detached_house', TALL))).toEqual([
      'number:6.3@150.7.60.40(1)#(1)(B)', 'number:7.5@150.7.60.30(1)#(1)(B)', 'number:120@150.7.60.50(4)#(4)(A)']);
    expect(cell('A0553', 'garden_suite', 'height_m', 'detached_house')).toBe('not_evaluated:condition_unknown:suite_height_over_4m');
  });
  it('150.7.60.20(2)(A) reads the option\'s own height on a lot deeper than 45 m (A0277: 2.0 low, 3.15 tall)', () => {
    expect([LOW, TALL].map((f) => cell('A0277', 'garden_suite', 'rear_setback_m', 'detached_house', f))).toEqual([
      'number:2@150.7.60.20(2)#(2)(A)', 'number:3.15@150.7.60.20(2)#(2)(A)']);
  });
  it('150.7.60.50(2) leaves the stored gfa_m2 (a Layer 3 relation, INV-2): its own target, outside the Layer 2 scope', () => {
    const u = unit('150.7.60.50(2)#whole');
    expect([u.archetype, u.target, u.bound, u.numeric_expression]).toEqual(['LIMIT', 'suite_gfa_below_main_m2', 'max', ['suite_gfa_below_main_m2 = main_building_gfa_m2 @(2)']]);
    expect(Object.values(SCOPE.targets).flat()).not.toContain('suite_gfa_below_main_m2');
  });
});

describe('item 3 (D-3 a): a type-less exception unit binds the house, not the garden suite; coverage untouched', () => {
  it('vocab carries one generic row, coverage targets untouched', () => {
    const r = VOCAB.type_less_exception_application as Json;
    expect([r.excluded_building_types, r.untouched_targets]).toEqual([['garden_suite'], ['ancillary_coverage_pct', 'lot_coverage_pct']]);
  });
  it('A0166 / A0170 suite GFA is the 120 m2 cap (key E5, E6); A0203 suite side is 150.7.60.20(5)(B); the house keeps its exception', () => {
    expect(cell('A0166', 'garden_suite', 'gfa_m2', 'detached_house', TALL)).toBe('number:120@150.7.60.50(4)#(4)(A)');
    expect(cell('A0170', 'garden_suite', 'gfa_m2', 'detached_house', TALL)).toBe('number:120@150.7.60.50(4)#(4)(A)');
    expect(cell('A0203', 'garden_suite', 'side_setback_m', 'detached_house')).toBe('number:1.522@150.7.60.20(5)#(5)(B)');
    expect(cell('A0203', 'principal', 'side_setback_m', 'detached_house')).toMatch(/@900\.3\.10\(5\)/);
  });
});

describe('item 5 (D-8 a) / D-61 and Q3 a as ruled B5A-1 c: the two coverage paths', () => {
  it('150.7.60.70(1)(A) is a flat 45 % on every lot', () => {
    expect(unit('150.7.60.70(1)#(1)(A)').numeric_expression).toEqual(['lot_coverage_pct = 45 pct @(1)(A)']);
    expect(cell('A0175', 'garden_suite', 'lot_coverage_pct', 'detached_house')).toBe('number:45@150.7.60.70(1)#(1)(A)');
  });
  it('the house\'s path-(B) figure is the principal target principal_coverage_path_b_pct: overlay where mapped, else unregulated (AR-1 R1)', () => {
    expect(SCOPE.targets.principal).toContain('principal_coverage_path_b_pct');
    expect(cell('A0097', 'principal', 'principal_coverage_path_b_pct', 'detached_houseplex')).toBe('number:33@150.7.60.70(1)#principal(1)(B)');
    expect(cell('A0354', 'principal', 'principal_coverage_path_b_pct', 'house_with_secondary_suite')).toBe('number:35@150.7.60.70(1)#principal(1)(B)');
    expect(cell('A0175', 'principal', 'principal_coverage_path_b_pct', 'detached_house')).toMatch(/^unregulated:/);
  });
});

describe('D-76: the generated unit carries the house figure; the source unit keeps its 20 %', () => {
  it('150.7.60.70(1)#principal(1)(B) is generated from 150.7.60.70(1)#(1)(B) for the residential house types, M-465 form', () => {
    const g = unit('150.7.60.70(1)#principal(1)(B)');
    expect([g.archetype, g.target, g.bound, g.numeric_expression, g.generated_from]).toEqual(['LIMIT', 'principal_coverage_path_b_pct', 'max', ['principal_coverage_path_b_pct = if(mapped(LC); overlay(LC); unregulated) @(1)(B)'], ['150.7.60.70(1)#(1)(B)']]);
    expect(g.application.building_types).toEqual(['detached_house', 'semi_detached_house', 'townhouse', 'detached_houseplex', 'semi_detached_houseplex']);
    expect(unit('150.7.60.70(1)#(1)(B)').numeric_expression).toEqual(['ancillary_coverage_pct = 20 pct @(1)(B)']);
  });
  it('the laneway suite keeps 150.8 and the garden suite keeps the source 20 %', () => {
    expect(cell('A0097', 'garden_suite', 'ancillary_coverage_pct', 'detached_house')).toBe('number:20@150.7.60.70(1)#(1)(B)');
  });
});

describe('D-77: the (6) heading licenses the street-side target for 150.7.60.20(6) only', () => {
  it('the heading phrase occurs once across every page (the 150.7.60.20(6) heading), so it licenses no other unit', () => {
    const P = 'garden suite on corner lot - side yard setback';
    expect(VOCAB.dsl_target.side_setback_street_m.patterns).toContain(P);
    const dir = path.join(ROOT, 'scripts/seeds/bylaw/pages');
    const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ');
    const hits = fs.readdirSync(dir).filter((n) => n.endsWith('.txt')).flatMap((n) => { const t = norm(fs.readFileSync(path.join(dir, n), 'utf8')); const out: string[] = []; let i = t.indexOf(P); while (i >= 0) { out.push(n + ':' + t.slice(Math.max(0, i - 40), i).trim().split(' ').slice(-1)[0]); i = t.indexOf(P, i + 1); } return out; });
    expect(hits).toEqual(['ch150_7.txt:(6)']);
    expect(unit('150.7.60.20(6)#(6)(C)').numeric_expression).toEqual(['side_setback_street_m = max(principal_side_setback_m; 1.5 m) @(6)(C)']);
  });
});

describe('item 6 reading 2 and D-6 a (B5A-2 a): the corner and through-lot suite yards', () => {
  it('(6)(C) is keyed to the suite\'s street-side target; the interior side takes (5)(B); the street cell waits for the step (P5.13)', () => {
    expect(unit('150.7.60.20(6)#(6)(C)').target).toBe('side_setback_street_m');
    expect(cell('A0578', 'garden_suite', 'side_setback_m', 'detached_house')).toBe('number:0.94@150.7.60.20(5)#(5)(B)');
    expect(cell('A0578', 'garden_suite', 'side_setback_street_m', 'detached_house')).toBe('not_evaluated:missing_input:principal_side_setback_m');
  });
  it('(3)(A) is the M-198(1) proxy with the 1.5 m floor, disclosed "may understate"; the step supplies the front (P5.13)', () => {
    const u = unit('150.7.60.20(3)#(3)(A)');
    expect(u.numeric_expression).toEqual(['rear_setback_m = abutting_front_setback_m @(3)(A)']); // the floor is (B) 1.5 m, M-198(1)
    expect(u.disclosure).toMatch(/may understate/);
    expect(cell('A0464', 'garden_suite', 'rear_setback_m', 'detached_house')).toBe('not_evaluated:missing_input:abutting_front_setback_m');
  });
});

describe('item 12 (D-10 a): By-law 849-2025 in force, carve-out kept', () => {
  it('statuses["849-2025"] is in_force from 2025-07-24, basis M-481, the carve-out in the trigger', () => {
    const s = readJson('scripts/seeds/bylaw/amendments.json').statuses['849-2025'] as Json;
    expect([s.status, s.enacted_on, s.in_force_on, s.basis]).toEqual(['in_force', '2025-07-24', '2025-07-24', 'M-481']);
    expect(String(s.in_force_trigger)).toMatch(/except one property-specific appeal; property not named/);
  });
});

describe('migration 315 (written, not applied)', () => {
  const m315 = (): string => read('migrations/315_resolve_bylaws_suite_height_option.sql');
  it('315: width 70, the shared code refused at the 55 base slots and the threshold slot 62, toast_tuple_target 1624 (ST-1), both views at 70', () => {
    const s = m315();
    expect(s).toContain('CHECK (cardinality(codes) = 70 AND');
    expect(s).toContain('CHECK (NOT (codes[1:55] @> ARRAY[5]::smallint[]) AND codes[62] <> 5) NOT VALID');
    expect(s).toContain('ALTER TABLE bylaw_resolution_lots SET (toast_tuple_target = 1624);');
    expect(s.match(/WHERE cardinality\(l\.codes\) = 70;/g)).toHaveLength(2);
    expect(s).toContain("(63, 'garden_suite', 'gfa_m2', 'suite_low', 31)");
    expect(s).toContain("(22, 'principal', 'principal_coverage_path_b_pct')");
  });
  it('315: both views name every position both ways against rb.scopePairs / rb.optionPairs (the 295 lock form, at width 70)', () => {
    const rb = req(path.join(ROOT, 'scripts/lib/bylaw-resolution.js'));
    const s = m315();
    const v = (name: string): string => (new RegExp(`CREATE OR REPLACE VIEW ${name} AS([\\s\\S]*?);\\n`).exec(s) as RegExpExecArray)[1] as string;
    const base = [...v('bylaw_resolution_results').matchAll(/\((\d+), '([a-z_]+)', '([a-z0-9_]+)'\)/g)].map((m) => ({ i: Number(m[1]), structure: m[2], target: m[3] }));
    expect(base).toEqual((rb.scopePairs(SCOPE) as Json[]).map((p, i) => ({ i: i + 1, ...p })));
    const opt = [...v('bylaw_resolution_option_results').matchAll(/\((\d+), '([a-z_]+)', '([a-z0-9_]+)', (NULL|'[a-z_]+'), (NULL|\d+)\)/g)].map((m) => [Number(m[1]), m[3], m[4] === 'NULL' ? null : m[4]!.slice(1, -1), m[5] === 'NULL' ? null : Number(m[5])]);
    expect(opt).toEqual((rb.optionPairs(SCOPE, VOCAB.design_options) as Json[]).map((p, k) => [56 + k, p.target, p.option, p.base_index === null ? null : p.base_index + 1]));
  });
});
