// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-72, M-377 (MB-31 Layer 3 step; plan section 3 E1-E9, section 7 row 1)
//
// MB-31 B0a — the red-first oracle vectors for the Layer 3 DSL (C1) and value algebra (C2) and readers (C3). The modules
// under test (scripts/analysis/bylaw/dsl.mjs l3 additions, scripts/analysis/bylaw/evaluate-l3.mjs) do not exist yet:
// this file is expected to FAIL until B1-B4 land. C4 (the evaluate.mjs hooks, B5) is not tested here.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const mod = async (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href);
// a missing module FAILS its block (never caught, never skipped)
const arg = (v: Json): Json => (Array.isArray(v) ? v.map(arg) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, arg(x)])) : v);
const fixture = (file: string): Json => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/tests/fixtures/layer3/dsl-vectors', file), 'utf8'));
const parseF = fixture('parse.json');
const unitsF = fixture('units.json');
const valuesF = fixture('values.json');
const readersF = fixture('readers.json');
const ENV = { round9: (x: number): number => Math.round(x * 1e9) / 1e9, eps: 1e-9 };
const U = unitsF.base.U;

function expectClose(actual: Json, want: Json, at = '$'): void {
  if (Array.isArray(want)) {
    expect(actual, at).toEqual(want);
  } else if (want && typeof want === 'object') {
    for (const k of Object.keys(want)) expectClose(actual[k], want[k], `${at}.${k}`);
  } else {
    expect(actual, at).toBe(want);
  }
}

describe('MB-31 E1 parser (B1)', () => {
  let D: Json;
  beforeAll(async () => { D = await mod('scripts/analysis/bylaw/dsl.mjs'); });

  for (const c of parseF.cases) {
    it(c.name, () => {
      const opts = c.l3 ? { layer: 'l3' } : undefined;
      if (c.fn) {
        const call = () => D[c.fn](c.src, opts);
        if (c.throws) {
          expect(call).toThrow();
          try { call(); } catch (e: any) { expect(e.code).toBe(c.throws); } // eslint-disable-line @typescript-eslint/no-explicit-any
        } else {
          expect(call()).toMatchObject(c.match);
        }
        return;
      }
      if (c.canon) {
        const want = c.want;
        expect(c.canon === 'cond' ? D.canonCond(D.parseCond(c.src, { layer: 'l3' })) : D.canonExpr(D.parseExpr(c.src, { layer: 'l3' }))).toBe(want);
        return;
      }
      expect(D.l3RefsOf(D.parseExpr(c.refs, { layer: 'l3' }))).toEqual(c.want);
    });
  }

  it('valueFormOf maps the new nodes to formula', () => {
    for (const src of ['lv(fya_porch_allowance_m)', 'l2(height_m)', 'floor(l2(height_m) ÷ lv(s1_ceiling_min_m))'])
      expect(D.valueFormOf(D.parseExpr(src, { layer: 'l3' }))).toBe('formula');
  });

  it('the parser refuses mapped() and labelled() in layer 3', () => {
    for (const [src, fn] of [['mapped(HT)', 'parseCond'], ['labelled(f)', 'parseCond']] as const) {
      expect(() => D[fn](src, { layer: 'l3' })).toThrow();
      try { D[fn](src, { layer: 'l3' }); } catch (e: any) { expect(e.code).toBe('unknown_function'); } // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  });
});

describe('MB-31 E2 unit algebra (B2)', () => {
  let D: Json;
  beforeAll(async () => { D = await mod('scripts/analysis/bylaw/dsl.mjs'); });

  for (const c of unitsF.cases) {
    it(c.name, () => {
      if (c.combine) return void expect(D.combineUnitsL3(...c.combine)).toBe(c.want);
      if (c.layer1) return void expect(D.combineUnits(...c.layer1)).toBe(c.want);
      const errs: string[] = D.checkRowL3(c.row, U);
      if (!c.errs.length) return void expect(errs).toEqual([]);
      for (const p of c.errs) expect(errs.some((e: string) => e.startsWith(p)), `${p} in ${JSON.stringify(errs)}`).toBe(true);
      expect(errs).toHaveLength(c.errs.length);
    });
  }

  it('staticUnitL3 reports the row unit table for a bare literal and unifies a count', () => {
    expect(D.staticUnitL3(D.parseExpr('2 ratio', { layer: 'l3' }), U).errs).toEqual([]);
    expect(D.combineUnitsL3('×', 'count', 'm')).toBe('m');
    expect(D.staticUnitL3(D.parseExpr('if(holds(corner_lot); 1 m; 2 m)', { layer: 'l3' }), U).errs).toEqual([]);
  });
});

describe('MB-31 E5/E6 value algebra (B3)', () => {
  let E: Json;
  beforeAll(async () => { E = await mod('scripts/analysis/bylaw/evaluate-l3.mjs'); });

  for (const c of valuesF.cases) {
    it(c.name, () => {
      const rs: Json[] = Array.isArray(c.args) ? (arg(c.args) as Json[]) : [arg(c.args) as Json];
      const got = rs.length === 2 && c.fn === 'minMax' ? E.minMax(rs[0], rs[1], ENV) : E[c.fn](...rs, ENV);
      if (typeof c.want !== 'boolean') return expectClose(got, c.want);
      expect(got).toBe(c.want);
    });
  }

  it('and3 is lazy and returns the first non-boolean over falses only', () => {
    const ne = E.ne('r');
    expect(E.and3([() => true, () => ne, () => false])).toBe(false);
    expect(E.and3([() => true, () => ne])).toMatchObject({ k: 'ne', reason: 'r' });
    expect(E.and3([() => false, () => { throw new Error('not lazy'); }])).toBe(false);
  });

  it('or3 is lazy and returns the first non-boolean over falses only', () => {
    const ne = E.ne('r');
    expect(E.or3([() => false, () => true])).toBe(true);
    expect(E.or3([() => ne, () => false])).toMatchObject({ k: 'ne', reason: 'r' });
  });

  it('not3 flips a boolean and passes a value through', () => {
    expect(E.not3(true)).toBe(false);
    expect(E.not3(false)).toBe(true);
    expect(E.not3(E.ne('r'))).toMatchObject({ k: 'ne', reason: 'r' });
  });

  it('the constructors build plain value objects and unionFlags sorts uniquely', () => {
    expect(E.num(2, 'm')).toMatchObject({ k: 'num', v: 2, u: 'm', flags: [] });
    expect(E.ne('r')).toMatchObject({ k: 'ne', reason: 'r', undecided: [{ id: '', reason: 'r' }] });
    expect(E.nb(['a'])).toMatchObject({ k: 'nb', clauses: ['a'], flags: [] });
    expect(E.unionFlags(['b', 'a'], ['a'])).toEqual(['a', 'b']);
  });
});

describe('MB-31 E3/E4/E7-E9 readers (B4)', () => {
  let E: Json;
  const B = readersF.base;
  const mk = (over: Json = {}): Json => E.makeL3Env({
    ...JSON.parse(JSON.stringify(B)),
    ...ENV,
    readRow: () => ({ k: 'num', v: 6, u: 'm', flags: [] }),
    ...JSON.parse(JSON.stringify(over)),
  });
  beforeAll(async () => { E = await mod('scripts/analysis/bylaw/evaluate-l3.mjs'); });

  for (const c of readersF.cases) {
    it(c.name, () => {
      const env = mk(c.env);
      const call = () => (c.fn === 'readName' ? E.readName(c.id, env) : E[c.fn](c.id, env));
      if (c.throws) {
        expect(call).toThrow();
        try { call(); } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          expect(e.code).toBe(c.throws.code);
          expect(e.setting).toBe(c.throws.setting);
          expect(e instanceof E.L3RefusalError).toBe(true);
          expect(String(e.message)).toContain(c.throws.code);
          expect(String(e.message)).toContain(c.throws.setting);
        }
        return;
      }
      const got = call();
      if (typeof c.want !== 'boolean') return expectClose(got, c.want);
      expect(got).toBe(c.want);
    });
  }

  it('NaN and Infinity cells are malformed', () => {
    for (const value of [NaN, Infinity]) {
      const r = E.readL2('height_m', mk({ cells: { height_m: { s: 'applies', kind: 'number', value, clause: 'c', reason: null } } }));
      expect(r).toMatchObject({ k: 'ne', reason: 'condition_unknown:cell_malformed' });
    }
  });

  it('one env traces L2 then LV in read order, the LV entry carrying its citation', () => {
    const env = mk({ cells: { height_m: { s: 'applies', kind: 'number', value: 9, clause: 'c', reason: null } } });
    E.readL2('height_m', env);
    E.readLv('fya_porch_allowance_m', env);
    expect(env.trace.map((t: Json) => t.kind + ':' + t.id)).toEqual(['l2:height_m', 'lv:fya_porch_allowance_m']);
    expect(env.trace[1]).toMatchObject({ kind: 'lv', id: 'fya_porch_allowance_m', citation: 'M-245' });
  });

  it('readRegulated marks its trace entry as a condition', () => {
    const env = mk({ cells: { height_storeys: { s: 'applies', kind: 'number', value: 3, clause: 'c', reason: null } } });
    E.readRegulated('height_storeys', env);
    expect(env.trace).toHaveLength(1);
    expect(env.trace[0]).toMatchObject({ kind: 'l2', id: 'height_storeys', role: 'cond' });
  });

  it('an out-of-bounds setting is an L3RefusalError naming the setting and the code', () => {
    const env = mk({ settingVals: { fya_porch_allowance_m: { value: 5 } } });
    expect(() => E.readLv('fya_porch_allowance_m', env)).toThrow();
    try { E.readLv('fya_porch_allowance_m', env); } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(e instanceof E.L3RefusalError).toBe(true);
      expect(String(e.message)).toContain('fya_porch_allowance_m');
      expect(String(e.message)).toContain('setting_out_of_bounds');
    }
  });
});

describe('MB-31 Layer 2 cell decode (B6)', () => {
  const cellsF = fixture('cells.json');
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  let X: Json;
  beforeAll(() => { X = require(path.join(process.cwd(), 'scripts/lib/compute/maxbld/layer2-cells.js')); });
  for (const c of cellsF.cases as Json[]) {
    it(`decodeCells: ${String(c.name)}`, () => {
      if (c.throws) expect(() => X.decodeCells(arg(c.rows), c.cls, c.structure)).toThrow();
      else expect(X.decodeCells(arg(c.rows), c.cls, c.structure)).toEqual(c.want);
    });
  }
  for (const c of cellsF.permCases as Json[]) {
    const p = c.perm;
    it(`decodePermission: ${String(c.name)}`, () => {
      const call = () => X.decodePermission(arg(p.lotRow), p.cls, { classes: p.classes, permissionKeys: p.permissionKeys, texts: p.texts });
      if (c.throws) expect(call).toThrow();
      else expect(call()).toMatchObject(c.want);
    });
  }
});
