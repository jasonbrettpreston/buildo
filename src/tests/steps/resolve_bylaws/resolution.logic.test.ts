// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §3 (row shape, value_kind), §5 (the unauthored-exception
//            gate), §7 I3 / I4 / I10; docs/specs/01-pipeline/69a_mcbylaw_register.md M-231 (operator approved
//            2026-10-20, 2026-10-20-scenario-build-rulings#R-4); M-232 (the Layer 2 status set)
//
// Slice (a) of the Layer 2 build plan (docs/reports/2026-10-21-layer2-build-plan.md §4, §7): the pure resolution
// functions that Spec 134 and the recorded rulings fully settle, built ahead of commit ① on fixtures (the node N6a
// form, Spec 134 §9). Anything still open (the closure source, the scope file, the gate order, the status columns:
// plan §6 OQ-2, OQ-8, OQ-6, OQ-4) is an INPUT of these functions, never decided here.
//
// RED FIRST: committed as it.fails at 027e5f72, before the module existed (gate K artifact
// docs/reports/red-evidence/resolve_bylaws/slice-a-red.json, 18 red at ee5ed572); the implementation commit flips
// every case to it (flipped with the implementation).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js / .mjs module surface
const ROOT = path.resolve(__dirname, '../../../../');
// A library the compute module will require (as compute modules require ../zoning-precedence), not the compute module
// itself: a file in scripts/lib/compute/ must pair with a manifest step (step-conformance §5.5), and the step is not
// registered before ① (Spec 134 §9). First committed at scripts/lib/compute/resolve-bylaws.js (f973687a).
const COMPUTE = 'scripts/lib/bylaw-resolution.js';
function rb(): Json {
  expect(fs.existsSync(path.join(ROOT, COMPUTE)), `${COMPUTE} should exist`).toBe(true);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(ROOT, COMPUTE)) as Json;
}
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const E = await load('scripts/analysis/bylaw/evaluate.mjs');
const VO = await load('scripts/analysis/bylaw/vocab.mjs');
const PVOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8')) as Json;
const ctx = (extra: Json = {}): Json => E.makeContext(VO.evaluatorVocab(PVOCAB), extra);

// Synthetic fixtures (the bylaw-rulings.logic.test.ts form): ids are test tokens, never a real exception.
const U = (o: Json): Json => ({ layer: 'base', archetype: 'LIMIT', bound: 'max', displaces: [], condition: 'none', applies_to: { part: 'whole', refs: [] }, application: { zones: ['any'], building_types: ['any'] }, ...o });
const rdLot: Json = { zone: 'RD', label: { f: 9, a: 280, d: 0.45 }, overlays: { HT: 8.5 }, vars: { lot_frontage_m: 9.75, lot_depth_m: 33.56, lot_area_m2: 327.12 }, flags: { corner_lot: false, major_street: false, through_lot: false }, building_type: 'detached_house', exception: null };
const height = U({ unit_id: '10.20.40.10(1)#(B)', regulation_id: '10.20.40.10(1)', target: 'height_m', numeric_expression: ['height_m = 10.0 m @(1)(B)'] });
const front = U({ unit_id: '10.20.40.70(1)#whole', regulation_id: '10.20.40.70(1)', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 6.0 m @(1)'] });
const exq = U({ unit_id: 'EXQ#SSP(A)', regulation_id: 'EXQ', layer: 'exception', exception: 'EXQ', target: 'front_setback_m', bound: 'min', numeric_expression: ['front_setback_m = 7.5 m @SSP(A)'] });
const UNITS = [height, front, exq];

const SCOPE = [
  { target: 'height_m', structure: 'principal' },
  { target: 'front_setback_m', structure: 'principal' },
  { target: 'height_m', structure: 'garden_suite' },
];

describe('M-231: the lot-wide unauthored-exception gate (Spec 134 §5)', () => {
  it('a lot with no exception (an empty closure) is not gated', () => {
    expect(rb().unauthoredException([], {})).toBeNull();
  });

  it('a fully authored closure is not gated, in either authored form', () => {
    expect(rb().unauthoredException(['EXA', 'EXB'], { EXA: 'authored', EXB: { status: 'authored' } })).toBeNull();
  });

  it('the lot own exception missing from the authored map gates the lot with its id', () => {
    expect(rb().unauthoredException(['EXA'], {})).toBe('EXA');
  });

  it('a partial exception is not fully authored, even for the targets it lists', () => {
    expect(rb().unauthoredException(['EXQ'], { EXQ: { status: 'partial', targets: ['front_setback_m', 'height_m'] } })).toBe('EXQ');
  });

  it('an authored exception that INCLUDEs an unauthored one gates with the included id', () => {
    expect(rb().unauthoredException(['EXA', 'EXB'], { EXA: 'authored' })).toBe('EXB');
  });

  it('the first unauthored id in closure order is reported', () => {
    expect(rb().unauthoredException(['EXA', 'EXB', 'EXC'], { EXA: 'authored' })).toBe('EXB');
    expect(rb().unauthoredException(['EXC', 'EXB', 'EXA'], { EXA: 'authored' })).toBe('EXC');
  });

  it('a missing closure or authored map throws, never defaulted (I10)', () => {
    expect(() => rb().unauthoredException(undefined, {})).toThrow(/closure/);
    expect(() => rb().unauthoredException(['EXA'], undefined)).toThrow(/authored/);
    expect(() => rb().unauthoredException(['EXA'], null)).toThrow(/authored/);
  });

  it('the gate status is not_evaluated:exception_not_authored:<id>, an evaluator closed code', () => {
    expect(E.NOT_EVALUATED_CODES).toContain('exception_not_authored');
    expect(rb().exceptionGateStatus(['EXA', 'EXB'], { EXA: 'authored' })).toBe('not_evaluated:exception_not_authored:EXB');
    expect(rb().exceptionGateStatus(['EXA'], { EXA: 'authored' })).toBeNull();
    expect(rb().exceptionGateStatus([], {})).toBeNull();
  });
});

describe('M-231: written per target (gatedRows)', () => {
  it('one row per declared target and structure, each with the gate status and no winner', () => {
    const status = 'not_evaluated:exception_not_authored:EXQ';
    expect(rb().gatedRows(SCOPE, status)).toEqual(SCOPE.map((s) => ({ target: s.target, structure: s.structure, status, winner_unit_id: null })));
  });

  it('a duplicate scope entry throws (I1 counts exactly)', () => {
    expect(() => rb().gatedRows([...SCOPE, { target: 'height_m', structure: 'principal' }], 'not_evaluated:x')).toThrow(/duplicate/);
  });

  it('a scope entry without a target or a structure throws', () => {
    expect(() => rb().gatedRows([{ target: 'height_m' }], 'not_evaluated:x')).toThrow(/structure/);
    expect(() => rb().gatedRows([{ structure: 'principal' }], 'not_evaluated:x')).toThrow(/target/);
  });

  it('a gate status outside the not_evaluated form is refused (I3: a gated row has a closed reason)', () => {
    expect(() => rb().gatedRows(SCOPE, null)).toThrow(/status/);
    expect(() => rb().gatedRows(SCOPE, 'applies')).toThrow(/status/);
  });
});

describe('M-231: the gate fires before effective() (resolveLot)', () => {
  it('a gated lot never calls the resolver', () => {
    let calls = 0;
    const rows = rb().resolveLot({ scope: SCOPE, gateStatus: 'not_evaluated:exception_not_authored:EXQ', resolveOne: () => { calls += 1; return {}; } });
    expect(calls).toBe(0);
    expect(rows.map((r: Json) => r.status)).toEqual(SCOPE.map(() => 'not_evaluated:exception_not_authored:EXQ'));
  });

  it('an ungated lot resolves every scope entry once, in scope order', () => {
    const seen: string[] = [];
    const rows = rb().resolveLot({ scope: SCOPE, gateStatus: null, resolveOne: (s: Json) => { seen.push(`${s.target}|${s.structure}`); return { ...s, status: 'applies' }; } });
    expect(seen).toEqual(SCOPE.map((s) => `${s.target}|${s.structure}`));
    expect(rows).toHaveLength(SCOPE.length);
  });

  it('the A14 case with the real evaluator: a partial exception resolves its listed target in effective(), Layer 2 still gates every target', () => {
    const lot = { ...rdLot, exception: 'EXQ' };
    const authored = { EXQ: { status: 'partial', targets: ['front_setback_m'] } };
    const C = ctx({ authored });
    const eff = (target: string): Json => E.effective(lot, target, E.loadCandidates(lot, UNITS).candidates, C);
    // the evaluator's own gate is per target (ruling (d)): the listed target resolves from the exception
    expect([eff('front_setback_m').status, eff('front_setback_m').value]).toEqual(['value', 7.5]);
    // Layer 2's gate is lot-wide (M-231): no winner on any target, the evaluator is never reached
    const gateStatus = rb().exceptionGateStatus(['EXQ'], authored);
    let calls = 0;
    const rows = rb().resolveLot({ scope: SCOPE, gateStatus, resolveOne: (s: Json) => { calls += 1; return eff(s.target); } });
    expect(calls).toBe(0);
    expect(rows.every((r: Json) => r.status === 'not_evaluated:exception_not_authored:EXQ' && r.winner_unit_id === null)).toBe(true);
  });
});

describe('Spec 134 §3: value_kind', () => {
  it('a finite number is number; the two terminal strings map to themselves', () => {
    expect([rb().valueKindOf(0), rb().valueKindOf(7.5), rb().valueKindOf('unlimited'), rb().valueKindOf('unregulated')]).toEqual(['number', 'number', 'unlimited', 'unregulated']);
  });

  it('anything else throws, never guessed', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '7.5', 'none', {}]) expect(() => rb().valueKindOf(v), String(v)).toThrow(/value_kind/);
  });
});

describe('purity (Spec 132 §1 compute purity; gate E at ①)', () => {
  it('the library requires only node:crypto and the two pure evaluator modules, and reads no environment, clock or randomness', () => {
    const src = fs.readFileSync(path.join(ROOT, COMPUTE), 'utf8');
    const required = [...src.matchAll(/\brequire\(([^)]*)\)/g)].map((m) => m[1]).sort();
    for (const r of required) expect(["'../analysis/bylaw/cell-cache.mjs'", "'../analysis/bylaw/evaluate.mjs'", "'node:crypto'"], r).toContain(r);
    expect(src).not.toMatch(/\bprocess\./);
    expect(src).not.toMatch(/\bDate\b|Math\.random/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The operator's batch-J rulings (2026-10-21, `2026-10-21-chat-batch-j`; Spec 124 R-IN, R-IO, R-IP, R-IQ, R-IR, R-IU,
// R-IW), each in its simplest compliant form. RED FIRST: committed as it.fails at c038d605, before the functions
// existed (gate K artifact docs/reports/red-evidence/resolve_bylaws/rulings-j-red.json); flipped to it with them.
// ---------------------------------------------------------------------------------------------------------------------
const MAP = (): Json => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/layer2-map.json'), 'utf8')) as Json;
const CC = await load('scripts/analysis/bylaw/cell-cache.mjs');
const sha = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

describe('R-IW: version hashes (sha256 of bytes; several files hash the sorted path NUL sha256 lines)', () => {
  it('sha256Hex is the hex sha256 of the bytes', () => {
    expect(rb().sha256Hex('abc')).toBe(sha('abc'));
    expect(rb().sha256Hex(Buffer.from('abc'))).toBe(sha('abc'));
  });

  it('filesHash is order-free and rename-visible', () => {
    const a = { path: 'scripts/a.json', sha256: sha('1') };
    const b = { path: 'scripts/b.json', sha256: sha('2') };
    expect(rb().filesHash([a, b])).toBe(sha(`${a.path}\0${a.sha256}\n${b.path}\0${b.sha256}\n`));
    expect(rb().filesHash([b, a])).toBe(rb().filesHash([a, b]));
    expect(rb().filesHash([{ ...a, path: 'scripts/c.json' }, b])).not.toBe(rb().filesHash([a, b]));
  });

  it('a duplicate path, a bad sha or an absolute or parent path throws', () => {
    const a = { path: 'scripts/a.json', sha256: sha('1') };
    expect(() => rb().filesHash([a, a])).toThrow(/duplicate/);
    expect(() => rb().filesHash([{ ...a, sha256: 'x' }])).toThrow(/sha256/);
    expect(() => rb().filesHash([{ ...a, path: '/abs.json' }])).toThrow(/path/);
    expect(() => rb().filesHash([{ ...a, path: '../up.json' }])).toThrow(/path/);
  });
});

describe('R-IN (option B, CHAT-41): cell_id keys ONE target\'s result by the values of that target\'s own read inputs, zone and exception always included', () => {
  const lot: Json = { zone: 'RD', exception: null, label: { f: 9 }, vars: { lot_area_m2: 327.12 }, flags: { corner_lot: false } };
  const line = (p: string, l: Json = lot): string => `${p}\t${CC.inputValue(l, p)}`;
  const S = { structure: 'principal', target: 'height_m' };

  it('cell_id = sha256 over the sorted path TAB token lines of zone, exception and the read paths; there is no separate inputs_hash column (Q-L2-1)', () => {
    const k = rb().cellKey(lot, ['vars.lot_area_m2', 'label.f'], S);
    const expected = sha(['structure\tprincipal', 'target\theight_m', ...['exception', 'label.f', 'vars.lot_area_m2', 'zone'].map((p) => line(p))].join('\n'));
    expect(k).toEqual({ cell_id: expected });
  });

  it('target.* paths are dropped (derived: their own lot inputs are listed too, as in the cell cache); duplicates are folded', () => {
    expect(rb().cellKey(lot, ['label.f', 'target.height_m', 'label.f'], S)).toEqual(rb().cellKey(lot, ['label.f'], S));
  });

  it('two lots that differ only in an input no result read share a cell; a read input or the zone or exception splits them', () => {
    const other = { ...lot, vars: { lot_area_m2: 999 } };
    expect(rb().cellKey(other, ['label.f'], S).cell_id).toBe(rb().cellKey(lot, ['label.f'], S).cell_id);
    expect(rb().cellKey(other, ['vars.lot_area_m2'], S).cell_id).not.toBe(rb().cellKey(lot, ['vars.lot_area_m2'], S).cell_id);
    expect(rb().cellKey({ ...lot, zone: 'RS' }, [], S).cell_id).not.toBe(rb().cellKey(lot, [], S).cell_id);
    expect(rb().cellKey({ ...lot, exception: 'EXQ' }, [], S).cell_id).not.toBe(rb().cellKey(lot, [], S).cell_id);
  });

  it('the same inputs give a different id for another target or structure (one key per stored result); no scope throws', () => {
    const k = rb().cellKey(lot, ['label.f'], S).cell_id;
    expect(rb().cellKey(lot, ['label.f'], { ...S, target: 'fsi' }).cell_id).not.toBe(k);
    expect(rb().cellKey(lot, ['label.f'], { ...S, structure: 'garden_suite' }).cell_id).not.toBe(k);
    expect(() => rb().cellKey(lot, ['label.f'])).toThrow(/scope/);
    expect(() => rb().cellKey(lot, ['label.f'], { structure: 'principal' })).toThrow(/scope/);
  });

  it('zone and exception fix the candidate set: loadCandidates reads no other lot field', () => {
    const a = E.loadCandidates({ ...rdLot, exception: 'EXQ' }, UNITS).candidates.map((u: Json) => u.unit_id);
    const b = E.loadCandidates({ zone: 'RD', exception: 'EXQ' }, UNITS).candidates.map((u: Json) => u.unit_id);
    expect(b).toEqual(a);
  });

  it('an input path the cell cache cannot value throws (refused, never keyed loosely)', () => {
    expect(() => rb().cellKey(lot, ['nonsense'], S)).toThrow(/unkeyable/);
  });
});

describe('R-IO: the Layer 2 status is stored bare, the reason holds the parameter; the string form is derived on read', () => {
  it('statusText writes <status>:<reason>, or the bare status when there is no reason', () => {
    expect(rb().statusText('applies', null)).toBe('applies');
    expect(rb().statusText('not_applicable', '10.5.40.70(2)')).toBe('not_applicable:10.5.40.70(2)');
    expect(rb().statusText('not_evaluated', 'exception_not_authored:EXQ')).toBe('not_evaluated:exception_not_authored:EXQ');
  });

  it('layer2Status maps each evaluator status through the map; a not_applicable prefix is stripped; conflict is not_evaluated:conflict', () => {
    const m = MAP();
    expect(rb().layer2Status({ status: 'value', value: 7.5 }, m)).toEqual({ status: 'applies', reason: null });
    expect(rb().layer2Status({ status: 'not_applicable', reason: 'not_applicable:10.5.40.70(2)' }, m)).toEqual({ status: 'not_applicable', reason: '10.5.40.70(2)' });
    expect(rb().layer2Status({ status: 'not_evaluated', reason: 'missing_input:lot_area_m2' }, m)).toEqual({ status: 'not_evaluated', reason: 'missing_input:lot_area_m2' });
    expect(rb().layer2Status({ status: 'conflict', reason: 'eval_conflict' }, m)).toEqual({ status: 'not_evaluated', reason: 'conflict' });
  });

  it('an unmapped status, or a not_evaluated code outside the map, throws (the map is total and closed)', () => {
    const m = MAP();
    expect(() => rb().layer2Status({ status: 'maybe' }, m)).toThrow(/maybe/);
    expect(() => rb().layer2Status({ status: 'not_evaluated', reason: 'invented_code:x' }, m)).toThrow(/invented_code/);
  });
});

describe('R-IP: evidence_kind is the evaluator\'s own kind; a numeric winner records clause (provincial for a provincial winner) and its regulation id', () => {
  it('each evaluator evidence kind keeps its name and takes its own ref', () => {
    const m = MAP();
    expect(rb().evidenceOf({ status: 'value', value: 'unregulated', winner: null, evidence: { kind: 'clause', clause: '10.20.40.10(1)#(B)' } }, m)).toEqual({ evidence_kind: 'clause', evidence_ref: '10.20.40.10(1)#(B)' });
    expect(rb().evidenceOf({ status: 'value', value: 'unregulated', evidence: { kind: 'absence', ruling: 'ABS-1' } }, m)).toEqual({ evidence_kind: 'absence', evidence_ref: 'ABS-1' });
    expect(rb().evidenceOf({ status: 'value', value: 'unregulated', evidence: { kind: 'label_absent', letter: 'h', ruling: 'M-220' } }, m)).toEqual({ evidence_kind: 'label_absent', evidence_ref: 'M-220' });
    expect(rb().evidenceOf({ status: 'not_applicable', evidence: { kind: 'disapply', disapplied_by: ['B#2', 'A#1'] } }, m)).toEqual({ evidence_kind: 'disapply', evidence_ref: 'A#1,B#2' });
  });

  it('a numeric winner has no evidence object: clause, or provincial when its layer is provincial, with splitRef(winner).reg', () => {
    const m = MAP();
    const r = { status: 'value', value: 10, winner: '10.20.40.10(1)#(B)' };
    expect(rb().evidenceOf(r, m)).toEqual({ evidence_kind: 'clause', evidence_ref: E.splitRef('10.20.40.10(1)#(B)').reg });
    expect(rb().evidenceOf(r, m, { winnerLayer: 'provincial' })).toEqual({ evidence_kind: 'provincial', evidence_ref: E.splitRef('10.20.40.10(1)#(B)').reg });
  });

  it('a result with no winner and no evidence has no evidence; an evidence kind outside the map throws', () => {
    const m = MAP();
    expect(rb().evidenceOf({ status: 'not_evaluated', reason: 'no_candidate' }, m)).toEqual({ evidence_kind: null, evidence_ref: null });
    expect(() => rb().evidenceOf({ status: 'value', evidence: { kind: 'hunch' } }, m)).toThrow(/hunch/);
  });
});

describe('R-IQ: one lot gate per lot, the first in the map order; the sentinel and the mismatch rule', () => {
  it('firstLotGate returns the first fired gate in the declared order, or null', () => {
    const order = MAP().lot_gate as string[];
    expect(rb().firstLotGate(new Set(['lot_metric_missing', 'label_unparsed']), order)).toBe('label_unparsed');
    expect(rb().firstLotGate(['exception_not_authored'], order)).toBe('exception_not_authored');
    expect(rb().firstLotGate([], order)).toBeNull();
  });

  it('a fired gate outside the declared order throws', () => {
    expect(() => rb().firstLotGate(['made_up_gate'], MAP().lot_gate)).toThrow(/made_up_gate/);
  });

  it('the sentinel is no exception for the closure; it is present for the mismatch test (xN != number arm included)', () => {
    const s = MAP().exception_number_sentinel as number;
    expect(rb().closureStart(null, s)).toBeNull();
    expect(rb().closureStart(s, s)).toBeNull();
    expect(rb().closureStart(12, s)).toBe(12);
    // [exception number, label xN] → mismatch?
    const cases: Array<[number | null, number | null, boolean]> = [[null, null, false], [s, null, false], [12, 12, false], [null, 12, true], [12, null, true], [s, 12, true], [12, 13, true]];
    for (const [n, x, want] of cases) expect(rb().exceptionMismatch(n, x, s), `${n} vs x${x}`).toBe(want);
  });
});

describe('R-IR: classes collapse by byte-equal results into the first in catalogue order', () => {
  it('equal results collapse into the earliest equal class; a different result keeps its own class', () => {
    const order = ['detached_house', 'detached_houseplex', 'semi_detached_houseplex', 'semi_detached_house'];
    const r1 = { status: 'value', value: 10 };
    const r2 = { value: 10, status: 'value' }; // the same result, keys in another order
    const r3 = { status: 'value', value: 12 };
    expect(rb().collapseClasses(order, { detached_house: r1, detached_houseplex: r3, semi_detached_houseplex: r2, semi_detached_house: r3 }))
      .toEqual({ detached_house: 'detached_house', detached_houseplex: 'detached_houseplex', semi_detached_houseplex: 'detached_house', semi_detached_house: 'detached_houseplex' });
  });

  it('a class missing from the results, or a result for an undeclared class, throws (I13)', () => {
    expect(() => rb().collapseClasses(['a', 'b'], { a: {} })).toThrow(/b/);
    expect(() => rb().collapseClasses(['a'], { a: {}, z: {} })).toThrow(/z/);
  });
});

describe('R-IU: a batch splits into the population and the keys to retract (the replace_keys write)', () => {
  it('rows in the population pass through; the others give their key to the retraction', () => {
    const batch = [{ id: 1, z: 'RD' }, { id: 2, z: 'CR' }, { id: 3, z: 'RM' }];
    expect(rb().splitPopulation(batch, 'id', (r: Json) => r.z.startsWith('R'))).toEqual({ inside: [batch[0], batch[2]], retract: [2] });
  });

  it('a predicate that is not a function, or a row without its key, throws', () => {
    expect(() => rb().splitPopulation([{ id: 1 }], 'id', null)).toThrow(/predicate/);
    expect(() => rb().splitPopulation([{ x: 1 }], 'id', () => false)).toThrow(/id/);
  });
});

describe('Q-L2-4: the in-scope zone list is a logic variable, kept inside the evaluator zone vocabulary', () => {
  // Kept out of migrations/ until commit ① (a migration file changes the migration count 28 generated scorecards embed).
  const MIG = 'docs/reports/layer2-measure/pending-migrations/280_resolve_bylaws_logic_variables.sql';
  const zones: string[] = PVOCAB.zone;

  it('inPopulation(zoneList, vocabZones) is the predicate splitPopulation takes: a row is in when its zone is listed', () => {
    const isIn = rb().inPopulation(['RD', 'RM'], zones);
    expect(rb().splitPopulation([{ id: 1, zone: 'RD' }, { id: 2, zone: 'RS' }, { id: 3, zone: 'CR' }], 'id', isIn)).toEqual({ inside: [{ id: 1, zone: 'RD' }], retract: [2, 3] });
  });

  it('a list that is empty, not strings, or names a zone outside the vocabulary throws (the lock R-AY words)', () => {
    expect(() => rb().inPopulation([], zones)).toThrow(/empty/);
    expect(() => rb().inPopulation('RD', zones)).toThrow(/array/);
    expect(() => rb().inPopulation([3], zones)).toThrow(/string/);
    expect(() => rb().inPopulation(['RD', 'ZZ'], zones)).toThrow(/ZZ/);
  });

  it('pending migration 280 seeds resolve_bylaws_population_zone_classes with a list inside vocab.zone, idempotently', () => {
    expect(fs.existsSync(path.join(ROOT, MIG)), `${MIG} should exist`).toBe(true);
    const sql = fs.readFileSync(path.join(ROOT, MIG), 'utf8');
    expect(sql).toMatch(/'resolve_bylaws_population_zone_classes'/);
    expect(sql).toMatch(/ON CONFLICT \(variable_key\) DO NOTHING/);
    const list = JSON.parse(/'(\[[^']*\])'::jsonb/.exec(sql)![1] as string) as string[];
    expect(() => rb().inPopulation(list, zones)).not.toThrow();
  });
});

describe('R-IX (Q-L2-3): commit ① waits for the evaluator prerequisites; nothing is registered before it', () => {
  it('there is no resolve_bylaws descriptor, shell or compute module yet (remove this case in the commit that lands ①)', () => {
    for (const rel of ['scripts/resolve-bylaws.descriptor.json', 'scripts/resolve-bylaws.js', 'scripts/lib/compute/resolve-bylaws.js']) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(false);
    }
  });
});

describe('PIN-L2-2: the CommonJS library requires the ES evaluator modules synchronously in plain Node (the bridge)', () => {
  it('node (no test transform) requires the library and reaches evaluate.mjs and cell-cache.mjs', () => {
    const out = execFileSync(process.execPath, ['-e', `const r = require(${JSON.stringify(path.join(ROOT, COMPUTE))}); console.log(typeof r.cellKey, typeof r.evidenceOf, r.cellKey({ zone: 'RD', exception: null }, [], { structure: 'principal', target: 'height_m' }).cell_id.length)`], { encoding: 'utf8' });
    expect(out.trim()).toBe('function function 64');
  });
});
