// SPEC LINK: docs/specs/01-pipeline/134_resolve_bylaws.md §2 (inputs through effective() only), §3 (row shape), §4 (status sets), §5 (the
//            unauthored-exception gate, written per target), §7 (I1, I3, I4, I10, I13, I14, I15; the population and the reset arm);
//            docs/specs/01-pipeline/124a_step_standard_policy_appendix.md R-IN, R-IR (classes), R-IT, R-IU
// Handbook: Spec 132 §materializer.1 (R-EH: rows computed in JS, the runner owns I/O); Spec 132 §core.9 (R-W); operator CHAT-80.QP (option 4)
//
// The pure batch core of the resolve_bylaws compute (scripts/lib/bylaw-materialize.js): parcels rows in, the three tables' rows out (units,
// texts, lots), on fixtures through the REAL evaluator and the committed Layer 1 input (docs/reference/bylaw-layer2-input.json). No DB, no runner.
// RED FIRST (Spec 124 R-BA): docs/reports/red-evidence/resolve_bylaws/part-e-option4-red.json (run against the interning build, before option 4).

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .js module surface
const ROOT = path.resolve(__dirname, '../../../../');
const read = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rb = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-resolution.js')) as Json;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lr = (): Json => require(path.join(ROOT, 'scripts/lib/bylaw-lot-row.js')) as Json;
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
/** The logical results of lot `i` of a batch output, decoded from the arrays and the batch's own dictionaries. */
const decoded = (o: Json, i = 0): Json[] => lr().decodeLotResults({ lot: o.rows.lots[i], pairs: PAIRS, classes: SCOPE.classes, map: MAP, dicts: lr().makeDecodeDicts({ units: o.rows.units, texts: o.rows.texts }) }) as Json[];
const repOf = (o: Json, i = 0): Json[] => decoded(o, i).filter((r) => r.class === SCOPE.classes[0]);
const chapterOf = (z: string): number => VOCAB.exception_chapter[z] as number;
const authoredNumber = (zone: string): number => {
  const re = new RegExp(`^900\\.${chapterOf(zone)}\\.10\\((\\d+)\\)$`);
  const hit = Object.keys(INPUT.body.authored).find((k) => re.test(k) && INPUT.body.authored[k] === 'authored');
  expect(hit, `an authored ${zone} exception`).toBeTruthy();
  return Number(re.exec(hit as string)![1]);
};
const UNAUTHORED = 999999; // no units, so never authored (a missing state is not authored, EV:126)
const withX = (z: string, n: number, letters = 'f10.0; a245'): Json => ({ zoning_class: z, zoning_zn_string: `${z} (${letters}) (x${n})`, exception_number: n });

describe('materializeBatch (option 4): one plain lot gives ONE lot row with 53 positional results and the dictionary rows it names', () => {
  let out: Json;
  beforeAll(() => { out = mz().materializeBatch([row(1)], mkEnv()); });

  it('writes exactly one lot row, no retraction, and only the three tables (no profiles, cells, signatures or sets)', () => {
    expect(Object.keys(out.rows).sort()).toEqual(['lots', 'texts', 'units']);
    expect(out.rows.lots).toHaveLength(1);
    expect(out.retract).toEqual([]);
    const lot = out.rows.lots[0];
    expect(lot.parcel_id).toBe(1);
    expect(lot.lot_gate).toBeNull();
    expect(lot.inputs_defaulted).toBe(0);
  });

  it('every positional array has one slot per scope pair, in layer2-scope.json order (53); permitted has one slot per class', () => {
    const lot = out.rows.lots[0];
    expect(PAIRS).toHaveLength(53);
    for (const k of ['codes', 'numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids']) if (lot[k] !== null) expect(lot[k], k).toHaveLength(53);
    expect(lot.codes).toHaveLength(53);
    expect(lot.permitted).toHaveLength(SCOPE.classes.length);
  });

  it('the decoded results have a closed status, a closed reason code where not_evaluated, and value_kind only for applies (I3, I13)', () => {
    expect(decoded(out)).toHaveLength(53 * SCOPE.classes.length);
    for (const c of decoded(out)) {
      expect(MAP.status).toContain(c.status);
      if (c.status === 'not_evaluated') expect(MAP.reason_code).toContain(String(c.reason).split(':')[0]);
      if (c.status === 'applies') expect(MAP.value_kind).toContain(c.value_kind);
      else expect(c.value_kind).toBeNull();
      if (c.status !== 'applies') expect(c.winner_unit_id).toBeNull();
    }
  });

  it('the lot row carries the two versions and a row_sha that recomputes over RESULT_COLUMNS.lots (I14)', () => {
    const l = out.rows.lots[0];
    expect(l.table_version).toBe(INPUT.table_version);
    expect(l.evaluator_version).toBe(INPUT.evaluator_version);
    expect(rb().verifyRowSha(l, mz().RESULT_COLUMNS.lots, mz().COLUMN_KINDS.lots)).toBe(true);
  });

  it('dictionary rows are keyed by hash32 of their content, carry no row_sha, and hold only what the lot names (nothing unreferenced)', () => {
    for (const u of out.rows.units as Json[]) { expect(u.unit_key).toBe(lr().hash32(u.unit_id)); expect(u).not.toHaveProperty('row_sha'); expect(['base', 'overlay', 'exception']).toContain(u.layer); }
    for (const t of out.rows.texts as Json[]) { expect(t.text_key).toBe(lr().hash32(t.text)); expect(t).not.toHaveProperty('row_sha'); }
    const l = out.rows.lots[0];
    const unitKeys = new Set<number>((out.rows.units as Json[]).map((u) => u.unit_key));
    for (const w of (l.winner_ids || []) as Array<number | null>) if (w !== null) expect(unitKeys.has(w)).toBe(true);
    const named = new Set<number>([...(l.winner_ids || [])].filter((x: number | null) => x !== null) as number[]);
    for (const cls of Object.values(l.class_results || {}) as Json[]) for (const t of Object.values(cls) as Array<Array<number | null>>) if (t[3] !== null) named.add(t[3] as number);
    expect(named.size).toBe(unitKeys.size);
  });

  it('there is no per-pair json: losers, by_class, disclosures and inputs are not columns of the lot row (they are recomputed on read)', () => {
    for (const k of ['losers', 'by_class', 'disclosures', 'disclosure_set_id', 'loser_set_id', 'permission_set_id', 'profile_id', 'inputs_used']) expect(out.rows.lots[0], k).not.toHaveProperty(k);
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

describe('classes: the first class fills the arrays, a differing class stores only its differing positions (sparse class_results)', () => {
  it('a real RD lot has few or no per-class overrides, and every override key is a declared class', () => {
    const o = mz().materializeBatch([row(1), row(2, withX('RM', authoredNumber('RM'), 'f15.0; a550; u4'))], mkEnv());
    for (const l of o.rows.lots as Json[]) if (l.class_results !== null) for (const c of Object.keys(l.class_results)) expect(SCOPE.classes).toContain(c);
  });

  it('permitted holds permitted()\'s own words for every v1 class (R-IT), decoded', () => {
    const o = mz().materializeBatch([row(1)], mkEnv());
    const pbc = lr().decodePermitted({ lot: o.rows.lots[0], classes: SCOPE.classes, map: MAP, dicts: lr().makeDecodeDicts({ units: o.rows.units, texts: o.rows.texts }) });
    expect(Object.keys(pbc).sort()).toEqual([...SCOPE.classes].sort());
    for (const v of Object.values(pbc) as Json[]) expect(['permitted', 'prohibited', 'not_evaluated']).toContain(v.status);
  });
});

describe('sharing is no longer a storage concern: two lots with the same inputs give two equal result arrays (the dictionaries hold the words once)', () => {
  it('two lots that agree on every input have identical arrays and one set of dictionary rows', () => {
    const out = mz().materializeBatch([row(1), row(2)], mkEnv());
    expect(out.rows.lots).toHaveLength(2);
    const [a, b] = out.rows.lots as [Json, Json];
    for (const k of ['codes', 'numbers', 'reason_ids', 'winner_ids', 'evidence_kinds', 'evidence_ref_ids', 'class_results', 'permitted', 'permitted_text_ids']) expect(JSON.stringify(a[k]), k).toBe(JSON.stringify(b[k]));
    expect(a.row_sha).not.toBe(b.row_sha); // parcel_id is a covered column
  });

  it('a lot with another frontage differs in the positions that read frontage and only those', () => {
    const env = mkEnv();
    const a = mz().materializeBatch([row(1)], env);
    const b = mz().materializeBatch([row(2, { frontage_m: 14.1 })], env);
    const ra = repOf(a);
    const rbb = repOf(b);
    const differing = ra.filter((r, i) => JSON.stringify(r) !== JSON.stringify(rbb[i])).length;
    expect(differing).toBeGreaterThan(0);
    expect(differing).toBeLessThan(ra.length);
  });

  it('batch order does not matter: the same rows come back in a canonical order', () => {
    const rows = [row(1), row(2, { frontage_m: 14.1 }), row(3, withX('RM', authoredNumber('RM'), 'f15.0; a550; u4'))];
    const env = mkEnv();
    const fwd = mz().materializeBatch(rows, env);
    const rev = mz().materializeBatch([...rows].reverse(), mkEnv());
    expect(JSON.stringify(rev.rows)).toBe(JSON.stringify(fwd.rows));
  });
});

describe('Spec 134 §5 / I4: the unauthored-exception gate is lot-wide, written per target, and fires before the evaluator', () => {
  const gated = row(5, withX('RD', UNAUTHORED));
  let env: Json;
  let out: Json;
  beforeAll(() => { env = mkEnv(); out = mz().materializeBatch([gated], env); });

  it('the lot row carries the gate and every result is not_evaluated:exception_not_authored:<id> with no winner', () => {
    expect(out.rows.lots[0].lot_gate).toBe('exception_not_authored');
    expect(decoded(out)).toHaveLength(53 * SCOPE.classes.length);
    for (const c of decoded(out)) {
      expect(c.status).toBe('not_evaluated');
      expect(c.reason).toBe(`exception_not_authored:900.${chapterOf('RD')}.10(${UNAUTHORED})`);
      expect(c.winner_unit_id).toBeNull();
    }
    expect(out.rows.lots[0].numbers).toBeNull();
    expect(out.rows.lots[0].winner_ids).toBeNull();
    expect(out.rows.lots[0].class_results).toBeNull();
    expect(out.rows.units).toEqual([]);
  });

  it('permitted is not_evaluated with the gate reason for every class', () => {
    const pbc = lr().decodePermitted({ lot: out.rows.lots[0], classes: SCOPE.classes, map: MAP, dicts: lr().makeDecodeDicts({ units: out.rows.units, texts: out.rows.texts }) });
    for (const v of Object.values(pbc) as Json[]) {
      expect(v.status).toBe('not_evaluated');
      expect(String(v.reason)).toMatch(/^exception_not_authored/);
    }
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
      const rep = repOf(out);
      expect(rep).toHaveLength(53);
      for (const c of rep) expect({ s: c.status, r: c.reason, w: c.winner_unit_id }).toEqual({ s: 'not_evaluated', r: reason, w: null });
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

describe('an authored exception resolves (no gate) and its own winners are exception-layer units in the dictionary', () => {
  it('the exception lot has no gate and decodes to applies results', () => {
    const env = mkEnv();
    const exc = mz().materializeBatch([row(2, withX('RD', authoredNumber('RD')))], env);
    expect(exc.rows.lots[0].lot_gate).toBeNull();
    expect(repOf(exc).some((r) => r.status === 'applies')).toBe(true);
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

describe('classes by stub: a differing class stores only the positions that differ; an equal class adds nothing (R-IR)', () => {
  const stub = (lot: Json): Json => {
    const bt = lot.building_type as string;
    const houseplex = bt === 'detached_houseplex' || bt === 'semi_detached_houseplex';
    return { status: 'value', value: houseplex ? 12 : 10, bound: 'max', winner: null, evidence: { kind: 'absence', ruling: 'M-54' }, losers: [], disclosures: ['b', 'a'], applied: [], inputs: ['zone', 'exception', 'building_type'], trace: [] };
  };
  let out: Json;
  beforeAll(() => { out = mz().materializeBatch([row(1)], mkEnv({ hooks: { evaluate: stub, permitted: () => ({ status: 'permitted', winners: [] }) } })); });

  it('the representative fills the arrays; a differing class is stored as overrides keyed by pair index', () => {
    expect(out.rows.lots[0].numbers.every((v: number) => v === 10)).toBe(true);
    const cr = out.rows.lots[0].class_results;
    expect(Object.keys(cr).sort()).toEqual(['detached_houseplex', 'semi_detached_houseplex']);
    expect(Object.keys(cr.detached_houseplex)).toHaveLength(PAIRS.filter((p) => p.structure === 'principal').length); // only the principal structure carries the class vector
    const dec = decoded(out);
    expect(dec.find((r) => r.class === 'detached_houseplex' && r.structure === 'principal')).toMatchObject({ status: 'applies', value: 12 });
    expect(dec.find((r) => r.class === 'semi_detached_house' && r.structure === 'principal')).toMatchObject({ status: 'applies', value: 10 });
  });

  it('disclosures and losers are not stored: the lot row has no column for them', () => {
    expect(JSON.stringify(out.rows)).not.toMatch(/"b"/);
  });
});

describe('RESULT_COLUMNS: the canonical result columns per table (the write guard and row_sha cover these and nothing else)', () => {
  it('names the three tables; chain_run_id, versions and timestamps are outside every list (Spec 134 §3)', () => {
    expect(Object.keys(mz().RESULT_COLUMNS).sort()).toEqual(['lots', 'texts', 'units']);
    for (const cols of Object.values(mz().RESULT_COLUMNS) as string[][]) for (const x of ['chain_run_id', 'table_version', 'evaluator_version', 'row_sha', 'resolved_at']) expect(cols).not.toContain(x);
  });
});

describe('I12 on fixtures: the decoded result equals a direct per-lot effective() for the representative class', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const E = require(path.join(ROOT, 'scripts/analysis/bylaw/evaluate.mjs')) as Json;
  it('status, reason and value of every pair match the uncached evaluator on two lots', () => {
    const env = mkEnv();
    const rows = [row(1), row(2, withX('RM', authoredNumber('RM'), 'f15.0; a550; u4'))];
    const out = mz().materializeBatch(rows, env);
    rows.forEach((r, i) => {
      for (const d of repOf(out, i)) {
        const lot = mz().classLotFor(r, d.structure, SCOPE.classes[0], env);
        const { candidates } = E.loadCandidates(lot, INPUT.body.units);
        const want = E.effective(lot, d.target, candidates, env.ctx);
        const l2 = rb().layer2Status(want, MAP);
        expect({ s: d.status, r: d.reason, v: d.value_kind === 'number' ? d.value : d.value_kind }, `${r.id} ${d.structure}/${d.target}`)
          .toEqual({ s: l2.status, r: l2.reason, v: l2.status === 'applies' ? (typeof want.value === 'number' ? want.value : want.value) : null });
      }
    });
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

describe('Q-N / I12 / I15: the audit re-evaluates every Nth lot uncached and in reversed candidate order (the sample is the budget; pure compute holds no clock)', () => {
  const real = (nth: number, offset: number): Json => mkEnv({ audit: { everyNth: nth, offset } });

  it('with no audit configured the tallies are zero', () => {
    const out = mz().materializeBatch([row(1), row(2)], mkEnv());
    expect(out.matched.equivalence_checked).toBe(0);
    expect(out.matched.equivalence_disagreements).toBe(0);
    expect(out.matched.order_disagreements).toBe(0);
  });

  it('lots whose id modulo N equals the offset are checked: 53 pairs each, and the real evaluator agrees with what the lot row decodes to and with itself in reverse order', () => {
    const out = mz().materializeBatch([row(1), row(2), row(3), row(4)], real(2, 1)); // ids 1 and 3
    expect(out.matched.equivalence_checked).toBe(2 * 53);
    expect(out.matched.equivalence_disagreements).toBe(0);
    expect(out.matched.order_disagreements).toBe(0);
  });

  it('a gated lot is not audited (there is no evaluator result to compare)', () => {
    const out = mz().materializeBatch([row(1, { zoning_is_ambiguous: true })], real(1, 0));
    expect(out.matched.equivalence_checked).toBe(0);
  });

  it('a stored result that disagrees with the direct evaluator is counted (a stub whose cached answer drifts from the direct one)', () => {
    const cached = (): Json => ({ status: 'value', value: 10, bound: 'max', winner: null, evidence: { kind: 'absence', ruling: 'M-54' }, losers: [], disclosures: [], applied: [], inputs: ['zone', 'exception'], trace: [] });
    const direct = (): Json => ({ ...cached(), value: 11 });
    const env = mkEnv({ audit: { everyNth: 1, offset: 0 }, hooks: { evaluate: cached, evaluateDirect: direct, permitted: () => ({ status: 'permitted', winners: [] }) } });
    const out = mz().materializeBatch([row(1)], env);
    expect(out.matched.equivalence_checked).toBe(53);
    expect(out.matched.equivalence_disagreements).toBe(53);
  });

  it('a result that depends on candidate order is counted (a stub that answers by the first candidate)', () => {
    const first = (_lot: Json, _t: string, cands: Json[]): Json => ({ status: 'value', value: (cands[0] as Json).unit_id.length, bound: 'max', winner: null, evidence: { kind: 'absence', ruling: 'M-54' }, losers: [], disclosures: [], applied: [], inputs: ['zone', 'exception'], trace: [] });
    const env = mkEnv({ audit: { everyNth: 1, offset: 0 }, hooks: { evaluate: first, evaluateDirect: first, permitted: () => ({ status: 'permitted', winners: [] }) } });
    const out = mz().materializeBatch([row(1)], env);
    expect(out.matched.order_disagreements).toBeGreaterThan(0);
  });

  it('an audit with a non-positive or non-integer N, or an offset outside [0, N), is refused', () => {
    expect(() => mkEnv({ audit: { everyNth: 0, offset: 0 } })).toThrow(/everyNth/);
    expect(() => mkEnv({ audit: { everyNth: 2.5, offset: 0 } })).toThrow(/everyNth/);
    expect(() => mkEnv({ audit: { everyNth: 2, offset: 2 } })).toThrow(/offset/);
  });
});

describe('Q-F / I13 and the winner-layer histogram: tallies the descriptor checks read', () => {
  const stubWith = (reason: string | null): Json => mkEnv({ hooks: { evaluate: () => (reason === null
    ? { status: 'value', value: 1, bound: 'max', winner: null, evidence: { kind: 'absence', ruling: 'M-54' }, losers: [], disclosures: [], applied: [], inputs: ['zone', 'exception'], trace: [] }
    : { status: 'not_evaluated', value: null, reason, losers: [], disclosures: [], applied: [], inputs: ['zone', 'exception'], trace: [] }), permitted: () => ({ status: 'permitted', winners: [] }) } });

  it('counts a needs_user_input result on a scenario axis, not on a legal axis (existing_*, current_stories, lawfully_existing_status, roof_type, pool, suite_wall_openings)', () => {
    const bad = mz().materializeBatch([row(1)], stubWith('needs_user_input:has_secondary_suite'));
    expect(bad.matched.scenario_axis_results).toBe(53);
    for (const axis of ['existing_footprint_sqm', 'current_stories', 'lawfully_existing_status', 'roof_type', 'pool', 'suite_wall_openings']) {
      expect(mz().materializeBatch([row(1)], stubWith(`needs_user_input:${axis}`)).matched.scenario_axis_results, axis).toBe(0);
    }
    expect(mz().materializeBatch([row(1)], stubWith(null)).matched.scenario_axis_results).toBe(0);
  });

  it('winner_layers counts the layer of each applies winner among the batch\'s representative results; results_by_status counts every one', () => {
    const out = mz().materializeBatch([row(1)], mkEnv());
    const total = Object.values(out.matched.winner_layers as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(total).toBe(repOf(out).filter((c) => c.winner_unit_id !== null).length);
    expect(Object.values(out.matched.results_by_status as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(53);
    for (const k of Object.keys(out.matched.winner_layers)) expect(['base', 'overlay', 'exception', 'provincial']).toContain(k);
  });
});

describe('the dictionary seed: a stored row under a fresh key with other content fails loud (collision), a stored identical row is reused', () => {
  it('seeding a unit key with another unit id makes the batch that needs that unit throw', () => {
    const env = mkEnv();
    const probe = mz().materializeBatch([row(1)], mkEnv());
    const u = (probe.rows.units as Json[])[0]!;
    mz().seedDictionaries(env, { units: [{ unit_key: u.unit_key, unit_id: 'someone-else', regulation_id: 'x', layer: 'base' }], texts: [] });
    expect(() => mz().materializeBatch([row(1)], env)).toThrow(/collision/);
  });
  it('seeding the true rows changes nothing: the batch emits the same rows', () => {
    const env = mkEnv();
    const probe = mz().materializeBatch([row(1)], mkEnv());
    mz().seedDictionaries(env, { units: probe.rows.units, texts: probe.rows.texts });
    expect(JSON.stringify(mz().materializeBatch([row(1)], env).rows)).toBe(JSON.stringify(probe.rows));
  });
});
