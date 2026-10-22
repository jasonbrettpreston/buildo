// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (inputs through effective() only), §3 (row shape), §4 (status sets), §5 (the
//            unauthored-exception gate, written per target), §7 (I1, I3, I4, I10, I13, I14, I15; the population and the reset arm);
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-JA (form C), R-IN (cell_id, option B), R-IR (classes), R-IT, R-IU
// Handbook: Spec 132 §x-rulings.4 (R-JA); Spec 132 §materializer.1 (R-EH: rows computed in JS, the runner owns I/O); Spec 132 §core.9 (R-W)
//
// The pure batch core of the resolve_bylaws compute (scripts/lib/bylaw-materialize.js): parcels rows in, the four tables' rows out,
// on fixtures through the REAL evaluator and the committed Layer 1 input (docs/reference/bylaw-layer2-input.json). No DB, no runner.
// RED FIRST (Spec 124 R-BA): run before the module existed (docs/reports/red-evidence/resolve_bylaws/step-red.json).
// Where Q-B (table merge) or Q-C (classes in by_class) is open, the plain Spec 134 reading is implemented and marked in the library.

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rb = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mz = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;

const INPUT = read('docs/reference/bylaw-layer2-input.json');
const VOCAB = read('scripts/seeds/bylaw/vocab.json');
const MAP = read('scripts/seeds/bylaw/layer2-map.json');
const SCOPE = read('scripts/seeds/bylaw/layer2-scope.json');
const PAIRS = (SCOPE.structures as string[]).flatMap((structure) => (SCOPE.targets[structure] as string[]).map((target) => ({ structure, target })));
const ZONES = ['R', 'RD', 'RS', 'RT', 'RM'];

const mkEnv = (over: Json = {}): Json => mz().makeEnv({ body: INPUT.body, map: MAP, scope: SCOPE, vocab: VOCAB, zoneList: ZONES, versions: { table_version: INPUT.table_version, evaluator_version: INPUT.evaluator_version }, ...over });

/** A parcels row as the step's source SQL selects it. */
const row = (id: number, o: Json = {}): Json => ({
  id, parcel_id: String(1000 + id), zoning_class: 'RD', zoning_zn_string: 'RD (f10.0; a245)', exception_number: null,
  zoning_overlays: {}, on_policy_road: false, is_corner_lot: false, is_through_lot: false, abuts_laneway: false,
  frontage_m: 10.5, depth_m: 35.2, lot_size_sqm: 369.6, zoning_is_ambiguous: false, in_sixplex_area: false, is_heritage_designated: false, geom_npoints: 5, ...o,
});
const chapterOf = (z: string): number => VOCAB.exception_chapter[z] as number;
const authoredNumber = (zone: string): number => {
  const re = new RegExp(`^900\\.${chapterOf(zone)}\\.10\\((\\d+)\\)$`);
  const hit = Object.keys(INPUT.body.authored).find((k) => re.test(k) && INPUT.body.authored[k] === 'authored');
  expect(hit, `an authored ${zone} exception`).toBeTruthy();
  return Number(re.exec(hit as string)![1]);
};
const UNAUTHORED = 999999; // no units, so never authored (a missing state is not authored, EV:126)
const withX = (z: string, n: number, letters = 'f10.0; a245'): Json => ({ zoning_class: z, zoning_zn_string: `${z} (${letters}) (x${n})`, exception_number: n });

describe('materializeBatch: one plain lot gives one link row, one profile, and a cell per scope pair', () => {
  let out: Json;
  beforeAll(() => { out = mz().materializeBatch([row(1)], mkEnv()); });

  it('writes exactly one lot row, no retraction, and a profile keyed per R-JA', () => {
    expect(out.rows.lots).toHaveLength(1);
    expect(out.retract).toEqual([]);
    expect(out.rows.profiles).toHaveLength(1);
    const lot = out.rows.lots[0];
    expect(lot.parcel_id).toBe(1);
    expect(lot.lot_gate).toBeNull();
    expect(lot.inputs_defaulted).toBe(0);
    expect(lot.profile_id).toBe(out.rows.profiles[0].profile_id);
  });

  it('the profile holds 53 pointers in scope order, each to a cell row of this batch (I9 lineage)', () => {
    const p = out.rows.profiles[0];
    const entries = rb().unpackPointers(p.pointers, PAIRS);
    expect(entries).toHaveLength(53);
    const byId = new Map<string, Json>(out.rows.cells.map((c: Json) => [c.cell_id, c]));
    for (const e of entries) {
      const c = byId.get(e.cell_id);
      expect(c, `${e.structure}/${e.target}`).toBeTruthy();
      expect(c).toMatchObject({ structure: e.structure, target: e.target });
    }
    expect(rb().profileKey(entries)).toBe(p.profile_id);
  });

  it('every cell has a closed status, a closed reason code where not_evaluated, and value_kind only for applies (I3, I13)', () => {
    for (const c of out.rows.cells as Json[]) {
      expect(MAP.status).toContain(c.status);
      if (c.status === 'not_evaluated') expect(MAP.reason_code).toContain(String(c.reason).split(':')[0]);
      if (c.status === 'applies') expect(MAP.value_kind).toContain(c.value_kind);
      else expect(c.value_kind).toBeNull();
      if (c.status !== 'applies') expect(c.winner_unit_id).toBeNull();
    }
  });

  it('every cell, signature, profile and lot row carries the two versions and a row_sha that recomputes (I14)', () => {
    for (const [name, rows] of Object.entries(out.rows) as Array<[string, Json[]]>) {
      for (const r of rows) {
        expect(r.table_version, name).toBe(INPUT.table_version);
        expect(r.evaluator_version, name).toBe(INPUT.evaluator_version);
        expect(rb().verifyRowSha(r, mz().RESULT_COLUMNS[name]), name).toBe(true);
      }
    }
  });

  it('the signature is stored once with the candidate ids, and every computed cell points at it', () => {
    expect(out.rows.signatures).toHaveLength(1);
    const s = out.rows.signatures[0];
    expect(s.candidates.length).toBeGreaterThan(1000);
    expect(s.signature_id).toBe(rb().signatureId(s.candidates));
    for (const c of out.rows.cells as Json[]) expect(c.signature_id).toBe(s.signature_id);
  });

  it('winner ids are candidates of the signature (I9), and an applies winner has evidence', () => {
    const cand = new Set<string>(out.rows.signatures[0].candidates);
    for (const c of out.rows.cells as Json[]) {
      if (c.winner_unit_id !== null) {
        expect(cand.has(c.winner_unit_id), c.winner_unit_id).toBe(true);
        expect(MAP.evidence_kind).toContain(c.evidence_kind);
      }
      for (const l of c.losers as Json[]) expect(cand.has(l.unit_id), l.unit_id).toBe(true);
    }
  });

  it('by_class has one entry per catalogue class except the representative: collapsed_into:<rep> or a full differing result (Q-C)', () => {
    const rep = SCOPE.classes[0];
    for (const c of out.rows.cells as Json[]) {
      expect(Object.keys(c.by_class).sort()).toEqual((SCOPE.classes as string[]).filter((k) => k !== rep).sort());
      for (const v of Object.values(c.by_class) as Array<string | Json>) {
        if (typeof v === 'string') expect(v).toMatch(new RegExp(`^collapsed_into:(${(SCOPE.classes as string[]).join('|')})$`));
        else expect(v).toHaveProperty('status');
      }
    }
  });

  it('permitted_by_class holds permitted()\'s own words for every v1 class (R-IT)', () => {
    const pbc = out.rows.lots[0].permitted_by_class;
    expect(Object.keys(pbc).sort()).toEqual([...SCOPE.classes].sort());
    for (const v of Object.values(pbc) as Json[]) expect(['permitted', 'prohibited', 'not_evaluated']).toContain(v.status);
  });

  it('matched is additive: numbers or objects of numbers only (R-EH (c))', () => {
    const walk = (v: unknown, p: string): void => {
      if (typeof v === 'number') return;
      expect(v && typeof v === 'object' && !Array.isArray(v), `${p} is a number or an object`).toBe(true);
      for (const [k, x] of Object.entries(v as Json)) walk(x, `${p}.${k}`);
    };
    for (const [k, v] of Object.entries(out.matched)) walk(v, k);
    expect(out.matched.lots).toBe(1);
  });
});

describe('sharing: identical inputs share one profile; a differing input moves only the cells that read it', () => {
  it('two lots that agree on every input share the profile and every cell, with two lot rows', () => {
    const out = mz().materializeBatch([row(1), row(2)], mkEnv());
    expect(out.rows.lots).toHaveLength(2);
    expect(out.rows.profiles).toHaveLength(1);
    expect(out.rows.lots[0].profile_id).toBe(out.rows.lots[1].profile_id);
    expect(new Set(out.rows.cells.map((c: Json) => c.cell_id)).size).toBe(out.rows.cells.length);
    expect(out.rows.cells.length).toBeLessThanOrEqual(53);
  });

  it('a lot with another frontage shares the targets that do not read frontage and not the ones that do (R-IN option B)', () => {
    const env = mkEnv();
    const a = mz().materializeBatch([row(1)], env);
    const b = mz().materializeBatch([row(2, { frontage_m: 14.1 })], env);
    const ids = (o: Json): Set<string> => new Set(o.rows.cells.map((c: Json) => c.cell_id));
    const shared = [...ids(a)].filter((x) => ids(b).has(x)).length;
    expect(shared).toBeGreaterThan(0);
    expect(shared).toBeLessThan(ids(a).size);
    expect(a.rows.lots[0].profile_id).not.toBe(b.rows.lots[0].profile_id);
  });

  it('batch order does not matter: the same rows come back in a canonical order', () => {
    const rows = [row(1), row(2, { frontage_m: 14.1 }), row(3, withX('RM', authoredNumber('RM'), 'f15.0; a550; u4'))];
    const env = mkEnv();
    const fwd = mz().materializeBatch(rows, env);
    const rev = mz().materializeBatch([...rows].reverse(), env);
    expect(JSON.stringify(rev.rows)).toBe(JSON.stringify(fwd.rows));
  });
});

describe('Spec 134 §5 / I4: the unauthored-exception gate is lot-wide, written per target, and fires before the evaluator', () => {
  const gated = row(5, withX('RD', UNAUTHORED));
  let env: Json;
  let out: Json;
  beforeAll(() => { env = mkEnv(); out = mz().materializeBatch([gated], env); });

  it('the lot row carries the gate and every cell is not_evaluated:exception_not_authored:<id> with no winner', () => {
    expect(out.rows.lots[0].lot_gate).toBe('exception_not_authored');
    expect(out.rows.cells).toHaveLength(53);
    for (const c of out.rows.cells as Json[]) {
      expect(c.status).toBe('not_evaluated');
      expect(c.reason).toBe(`exception_not_authored:900.${chapterOf('RD')}.10(${UNAUTHORED})`);
      expect(c.winner_unit_id).toBeNull();
      expect(c.signature_id).toBeNull();
    }
    expect(out.rows.signatures).toEqual([]);
  });

  it('permitted_by_class is not_evaluated with the gate reason for every class', () => {
    for (const v of Object.values(out.rows.lots[0].permitted_by_class) as Json[]) {
      expect(v.status).toBe('not_evaluated');
      expect(String(v.reason)).toMatch(/^exception_not_authored/);
    }
  });

  it('two lots with the same unauthored exception share every gated cell and one profile', () => {
    const two = mz().materializeBatch([gated, row(6, { ...withX('RD', UNAUTHORED), frontage_m: 20 })], env);
    expect(two.rows.profiles).toHaveLength(1);
    expect(two.rows.cells).toHaveLength(53);
  });

  it('the evaluator is never called for a gated lot (the gate is applied BEFORE effective(), P2:211)', () => {
    let calls = 0;
    const spy = mkEnv({ hooks: { evaluate: () => { calls += 1; throw new Error('must not be called'); }, permitted: () => { calls += 1; throw new Error('must not be called'); } } });
    mz().materializeBatch([gated, row(7, { zoning_is_ambiguous: true }), row(8, { frontage_m: null })], spy);
    expect(calls).toBe(0);
  });
});

describe('the other lot gates (R-IQ order) are written per target too', () => {
  let env: Json;
  beforeAll(() => { env = mkEnv(); });
  const cases: Array<[string, Json, string]> = [
    ['ambiguous_zone', { zoning_is_ambiguous: true }, 'ambiguous_zone'],
    ['lot_metric_missing', { depth_m: null }, 'lot_metric_missing'],
    ['label_unparsed', { zoning_zn_string: 'RD (zz9)' }, 'label_unparsed'],
    ['label_exception_mismatch', { exception_number: 940 }, 'label_exception_mismatch'],
  ];
  for (const [gate, patch, reason] of cases) {
    it(`${gate}: gate on the lot row, not_evaluated:${reason} on all 53 targets`, () => {
      const out = mz().materializeBatch([row(1, patch)], env);
      expect(out.rows.lots[0].lot_gate).toBe(gate);
      expect(out.rows.cells).toHaveLength(53);
      for (const c of out.rows.cells as Json[]) expect({ s: c.status, r: c.reason, w: c.winner_unit_id }).toEqual({ s: 'not_evaluated', r: reason, w: null });
    });
  }

  it('the first gate in the map order is the one reported when several fire (R-IQ)', () => {
    const out = mz().materializeBatch([row(1, { zoning_is_ambiguous: true, depth_m: null })], env);
    expect(out.rows.lots[0].lot_gate).toBe('ambiguous_zone');
  });

  it('I10: a missing metric is never defaulted (inputs_defaulted stays 0 and the gate fires)', () => {
    const out = mz().materializeBatch([row(1, { frontage_m: null })], env);
    expect(out.rows.lots[0].inputs_defaulted).toBe(0);
    expect(out.rows.lots[0].lot_gate).toBe('lot_metric_missing');
  });
});

describe('an authored exception resolves (no gate) and keys its own cells', () => {
  it('the exception moves the cell ids of every target (zone and exception are always in the key, R-IN)', () => {
    const env = mkEnv();
    const n = authoredNumber('RD');
    const plain = mz().materializeBatch([row(1)], env);
    const exc = mz().materializeBatch([row(2, withX('RD', n))], env);
    expect(exc.rows.lots[0].lot_gate).toBeNull();
    const a = new Set(plain.rows.cells.map((c: Json) => c.cell_id));
    expect(exc.rows.cells.every((c: Json) => !a.has(c.cell_id))).toBe(true);
    expect(exc.rows.signatures[0].signature_id).not.toBe(plain.rows.signatures[0].signature_id);
  });
});

describe('the population and the reset arm (R-IU, I11)', () => {
  it('a parcel whose zone is not in the list is retracted by key and writes no row', () => {
    const out = mz().materializeBatch([row(1), row(2, { zoning_class: 'CR', zoning_zn_string: 'CR' })], mkEnv());
    expect(out.retract).toEqual([2]);
    expect(out.rows.lots.map((l: Json) => l.parcel_id)).toEqual([1]);
    expect(out.matched.lots_retracted).toBe(1);
  });

  it('a narrower zone list retracts the parcels that left it', () => {
    const out = mz().materializeBatch([row(1), row(2, { zoning_class: 'RM', zoning_zn_string: 'RM (f15.0; a550; u4)' })], mkEnv({ zoneList: ['RD'] }));
    expect(out.retract).toEqual([2]);
  });

  it('an empty population list or a zone outside the vocabulary throws (inPopulation)', () => {
    expect(() => mkEnv({ zoneList: [] })).toThrow(/empty/);
    expect(() => mkEnv({ zoneList: ['ZZ'] })).toThrow(/vocabulary/);
  });
});

describe('I15 / rerun-zero: the output is a pure function of the rows', () => {
  it('the same batch twice gives byte-identical rows (an unchanged re-run writes nothing)', () => {
    const rows = [row(1), row(2, withX('RD', UNAUTHORED))];
    const a = mz().materializeBatch(rows, mkEnv());
    const b = mz().materializeBatch(rows, mkEnv());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a seeded shuffle of the unit order does not change a single row (I15)', () => {
    let s = 12345;
    const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const units = [...INPUT.body.units] as Json[];
    for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = units[i] as Json; units[i] = units[j] as Json; units[j] = tmp; }
    const rows = [row(1), row(2, withX('RM', authoredNumber('RM'), 'f15.0; a550; u4'))];
    const base = mz().materializeBatch(rows, mkEnv());
    const shuffled = mz().materializeBatch(rows, mkEnv({ body: { ...INPUT.body, units } }));
    expect(JSON.stringify(shuffled.rows)).toBe(JSON.stringify(base.rows));
  });

  it('the input rows are not mutated', () => {
    const rows = [row(1)];
    const copy = JSON.stringify(rows);
    mz().materializeBatch(rows, mkEnv());
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

describe('Q-C (plain reading): classes are evaluated per cell and collapse by equal results (R-IR)', () => {
  // a stub evaluator that answers by building type, so a differing class is stored and equal classes collapse
  const stub = (lot: Json, target: string): Json => {
    const bt = lot.building_type as string;
    const houseplex = bt === 'detached_houseplex' || bt === 'semi_detached_houseplex';
    return houseplex
      ? { status: 'value', value: 12, bound: 'max', winner: null, evidence: { kind: 'absence', ruling: 'M-54' }, losers: [], disclosures: ['b', 'a'], applied: [], inputs: ['zone', 'exception', 'building_type', `vars.dwelling_units`], trace: [] }
      : { status: 'value', value: 10, bound: 'max', winner: null, evidence: { kind: 'absence', ruling: 'M-54' }, losers: [], disclosures: ['a'], applied: [], inputs: ['zone', 'exception', 'building_type', `vars.dwelling_units`, 'vars.lot_frontage_m'], trace: [], _t: target };
  };
  let out: Json;
  beforeAll(() => { out = mz().materializeBatch([row(1)], mkEnv({ hooks: { evaluate: stub, permitted: () => ({ status: 'permitted', winners: [] }) } })); });

  it('the representative is the first class; a class equal to an earlier one collapses into it (R-IR (iv)) and a differing class is stored whole', () => {
    const c = out.rows.cells.find((k: Json) => k.structure === 'principal');
    expect(c.value).toBe(10);
    expect(c.by_class.detached_houseplex).toMatchObject({ status: 'applies', value: 12 });
    expect(c.by_class.semi_detached_houseplex).toBe('collapsed_into:detached_houseplex');
    expect(c.by_class.semi_detached_house).toBe('collapsed_into:detached_house');
    expect(c.by_class.house_with_secondary_suite).toBe('collapsed_into:detached_house');
  });

  it('disclosures are stored sorted (R-IT); the class-vector inputs are not in the cell key but the other read inputs are', () => {
    const c = out.rows.cells.find((k: Json) => k.structure === 'principal');
    expect(c.disclosures).toEqual(['a']);
    const rep = mz().classLotFor(row(1), 'principal', 'detached_house', mkEnv());
    const want = rb().cellKey(rep, ['zone', 'exception', 'vars.lot_frontage_m'], { structure: c.structure, target: c.target }).cell_id;
    expect(c.cell_id).toBe(want);
    expect(c.inputs_used).toEqual(['exception', 'vars.lot_frontage_m', 'zone']);
  });
});

describe('RESULT_COLUMNS: the canonical result columns per table (the write guard and row_sha cover these and nothing else)', () => {
  it('names the four tables; chain_run_id, versions and timestamps are outside every list (Spec 134 §3)', () => {
    expect(Object.keys(mz().RESULT_COLUMNS).sort()).toEqual(['cells', 'lots', 'profiles', 'signatures']);
    for (const cols of Object.values(mz().RESULT_COLUMNS) as string[][]) for (const x of ['chain_run_id', 'table_version', 'evaluator_version', 'row_sha', 'resolved_at']) expect(cols).not.toContain(x);
  });
});

// Added with the implementation (green on first run; the red run above covers the cases before it).
describe('I12 on fixtures: the stored cell equals a direct per-lot effective() for the representative class', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const E = require(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')) as Json;
  it('status, reason and value of every principal and suite cell match the uncached evaluator on two lots', () => {
    const env = mkEnv();
    const rows = [row(1), row(2, withX('RM', authoredNumber('RM'), 'f15.0; a550; u4'))];
    const out = mz().materializeBatch(rows, env);
    const byId = new Map<string, Json>(out.rows.cells.map((c: Json) => [c.cell_id, c]));
    for (const r of rows) {
      const lotRow = out.rows.lots.find((l: Json) => l.parcel_id === r.id);
      const pointers = rb().unpackPointers(out.rows.profiles.find((p: Json) => p.profile_id === lotRow.profile_id).pointers, PAIRS);
      for (const e of pointers) {
        const lot = mz().classLotFor(r, e.structure, SCOPE.classes[0], env);
        const { candidates } = E.loadCandidates(lot, INPUT.body.units);
        const want = E.effective(lot, e.target, candidates, env.ctx);
        const got = byId.get(e.cell_id) as Json;
        const l2 = rb().layer2Status(want, MAP);
        expect({ s: got.status, r: got.reason, v: got.value_kind === 'number' ? got.value : got.value_kind }, `${r.id} ${e.structure}/${e.target}`)
          .toEqual({ s: l2.status, r: l2.reason, v: l2.status === 'applies' ? (typeof want.value === 'number' ? want.value : want.value) : null });
      }
    }
  });
});

describe('tripwire: every input path the evaluator reports can be keyed (cell-cache inputValue) or is a declared constant', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const E = require(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')) as Json;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CC = require(path.join(ROOT, 'scripts/analysis/bylaw/cell-cache.mjs')) as Json;
  it('effective() and permitted() over every structure x class x target of an RD and an RM lot', () => {
    const env = mkEnv();
    const unkeyable = new Set<string>();
    for (const r of [row(1), row(2, withX('RM', authoredNumber('RM'), 'f15.0; a550; u4'))]) {
      for (const structure of SCOPE.structures as string[]) {
        for (const c of SCOPE.classes as string[]) {
          const lot = mz().classLotFor(r, structure, c, env);
          const { candidates } = E.loadCandidates(lot, INPUT.body.units);
          const paths = new Set<string>();
          for (const t of SCOPE.targets[structure] as string[]) for (const p of E.effective(lot, t, candidates, env.ctx).inputs || []) paths.add(p);
          if (structure === 'principal') for (const p of E.permitted(lot, VOCAB.scenario_class_units[c].building_type, candidates, env.ctx).inputs || []) paths.add(p);
          for (const p of paths) { try { CC.inputValue(lot, p); } catch { unkeyable.add(p); } }
        }
      }
    }
    expect([...unkeyable].sort()).toEqual([...rb().UNSET_LOT_INPUTS]);
  });

  it('a declared constant input is one this step\'s lot vector never sets', () => {
    const lot = mz().classLotFor(row(1), 'principal', 'detached_house', mkEnv());
    for (const p of rb().UNSET_LOT_INPUTS as string[]) expect(lot[p], p).toBeUndefined();
  });
});
