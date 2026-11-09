// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.3, 11a.6, 11a.7 (dated note 2026-11-09, MF-14),
//            docs/specs/02-web-admin/127_surface_conversion_procedure.md 4.3 (capture-twice, note 2026-11-09),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-24 (throws on an unknown field or status), FE-29 (the one node contract).
//
// MF-14 · McFrontend queue · lane E-MF14. The pure renderer core: buildTree (the capture), assertTree (the throw), viewOf (the projection),
// and the capture script. Every datum is injected, so a synthetic declaration, registry or layout proves each rule. Assertions look for a
// problem line starting `RR-<KIND> <subject>`, never whole-message equality. No DB, no network.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ReportRenderError, assertTree, buildTree, viewOf } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { captureAll } from '../../../scripts/surfaces/report-capture';
import { TARGETS } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const ROOT = process.cwd();
const GOLD = path.join(ROOT, 'src/tests/fixtures/surfaces/report');
const manifest: Json = JSON.parse(fs.readFileSync(path.join(GOLD, 'states.json'), 'utf8'));
const golden = (s: string, t: string): Json => JSON.parse(fs.readFileSync(path.join(GOLD, `${s}.${t}.json`), 'utf8'));
const problemsOf = (fn: () => unknown): string[] => {
  try { fn(); } catch (e) { if (e instanceof ReportRenderError) return e.problems; throw e; }
  return [];
};
const has = (ps: string[], prefix: string): boolean => ps.some((p) => p.startsWith(prefix));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const withField = (name: string, extra: Json = {}): Json => {
  const c = clone(reportCtx) as Json;
  c.decl.sections.push({ id: 'zz', fields: [{ name, label: `Label ${name}`, source: `catalogue:${name}`, type: ['number', 'm²'], unit: 'm²', ...extra }] });
  return c;
};

describe('T1 buildTree reproduces every golden (the capture)', () => {
  for (const s of manifest.states as string[]) for (const t of TARGETS as string[]) {
    it(`${s}.${t}`, () => {
      const g = golden(s, t);
      expect(buildTree(g.response_fixture, reportCtx)).toEqual(g.rendered_tree);
      expect(() => assertTree(g.rendered_tree, reportCtx)).not.toThrow();
    });
  }
  it('capture twice writes identical bytes and equals the committed files', () => {
    const a = captureAll(ROOT);
    const b = captureAll(ROOT);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.size).toBe(48);
    for (const [file, text] of a) expect(fs.readFileSync(path.join(GOLD, file), 'utf8')).toBe(text);
  });
  it('no maths: a float is shown as the producer sent it', () => {
    const t = buildTree({ status: 'permitted', gfa_flat_m2: 0.30000000000000004 }, reportCtx);
    expect(t.nodes.find((n: Json) => n.field === 'gfa_flat_m2')?.value).toBe('0.30000000000000004 m²');
  });
  it('not_modelled shows its registry text and no figure (tranche 3)', () => {
    const t = buildTree({ status: 'not_modelled' }, reportCtx);
    expect(t.nodes.length).toBe(1);
    expect(t.nodes[0].field).toBe('status_text');
    expect(t.nodes[0].status).toBe('not_modelled');
    expect(t.nodes[0].value).toBe(reportCtx.content.status_text.not_modelled);
    expect(t.nodes[0].value).toBeTruthy();
  });
  it('lifecycle text comes from the registry, never null', () => {
    for (const l of ['loading', 'miss', 'error']) {
      const t = buildTree({ lifecycle: l }, reportCtx);
      expect(t.nodes).toHaveLength(1);
      expect(t.nodes[0].value).toBe(reportCtx.content.states.lifecycle[l]);
      expect(t.nodes[0].value).toBeTruthy();
    }
  });
});

describe('T2 unknown field, shape and envelope', () => {
  it('unknown key throws RR-FIELD; three defects are all reported in stable order', () => {
    const ps = problemsOf(() => buildTree({ status: 'permitted', gfa_made_up_m2: 1, gfa_flat_m2: { a: 1 }, other_made_up: 2 }, reportCtx));
    expect(ps.filter((p) => p.startsWith('RR-FIELD'))).toHaveLength(3);
    expect(ps[0]).toMatch(/^RR-FIELD unknown field: gfa_made_up_m2/);
  });
  it('both or neither of status and lifecycle is RR-STATUS', () => {
    expect(has(problemsOf(() => buildTree({ status: 'permitted', lifecycle: 'loading' }, reportCtx)), 'RR-STATUS')).toBe(true);
    expect(has(problemsOf(() => buildTree({ gfa_flat_m2: 1 }, reportCtx)), 'RR-STATUS')).toBe(true);
  });
  it('an unknown lifecycle is RR-LIFECYCLE', () => {
    expect(has(problemsOf(() => buildTree({ lifecycle: 'sleeping' }, reportCtx)), 'RR-LIFECYCLE')).toBe(true);
  });
  it('a response key carried by two declared fields is RR-FIELD ambiguous', () => {
    const c = withField('dup_name');
    c.decl.sections.push({ id: 'zy', fields: [{ name: 'dup_name', label: 'Other', source: 'content:dup_name' }] });
    expect(has(problemsOf(() => buildTree({ status: 'permitted', dup_name: 1 }, c)), 'RR-FIELD ambiguous field name: dup_name')).toBe(true);
  });
  it('lock: no envelope key equals a declared field name', () => {
    const names = new Set(reportCtx.decl.sections.flatMap((s: Json) => s.fields.map((f: Json) => f.name)));
    for (const k of ['status', 'lifecycle', 'synthetic', 'roof_form']) expect(names.has(k)).toBe(false);
  });
  it('envelope keys synthetic and roof_form are accepted and never emitted', () => {
    const t = buildTree({ synthetic: true, roof_form: 'flat', status: 'at_least', gfa_flat_m2: 1 }, reportCtx);
    expect(t.nodes.map((n: Json) => n.field)).toEqual(['gfa_flat_m2']);
  });
});

describe('T3 statuses', () => {
  it('unknown status raises RR-STATUS on a response and on a tree', () => {
    expect(has(problemsOf(() => buildTree({ status: 'allowed', gfa_flat_m2: 1 }, reportCtx)), 'RR-STATUS')).toBe(true);
    const tree = clone(golden('permitted', 'web').rendered_tree);
    tree.nodes[1].status = 'allowed';
    expect(problemsOf(() => assertTree(tree, reportCtx)).length).toBeGreaterThan(0);
  });
  it('a not_evaluated reason with no registry text raises RR-CONTENT', () => {
    expect(has(problemsOf(() => buildTree({ status: 'not_evaluated:zzz', gfa_flat_m2: 1 }, reportCtx)), 'RR-CONTENT')).toBe(true);
  });
  it('not_permitted:lot_gate:x shows only the first clause segment (pinned, as bindProblems)', () => {
    const t = buildTree({ status: 'not_permitted:lot_gate:x' }, reportCtx);
    expect(t.nodes[0].value).toContain('(lot_gate)');
  });
  it('status_text node first when the registry has text; none for at_least', () => {
    expect(buildTree({ status: 'permitted', gfa_flat_m2: 1 }, reportCtx).nodes[0].field).toBe('status_text');
    expect(buildTree({ status: 'at_least', gfa_flat_m2: 1 }, reportCtx).nodes.map((n: Json) => n.field)).toEqual(['gfa_flat_m2']);
  });
});

describe('T5 source and tree checks', () => {
  it('node source that differs from the declared kind is RR-SOURCE', () => {
    const tree = clone(golden('permitted', 'web').rendered_tree);
    tree.nodes[1].source = 'parcels';
    expect(has(problemsOf(() => assertTree(tree, reportCtx)), 'RR-SOURCE')).toBe(true);
  });
  it('a node whose field is not declared is RR-FIELD; a schema break is RR-SCHEMA', () => {
    const tree = clone(golden('permitted', 'web').rendered_tree);
    tree.nodes[1].field = 'made_up';
    tree.nodes[2].extra = 1;
    const ps = problemsOf(() => assertTree(tree, reportCtx));
    expect(has(ps, 'RR-FIELD made_up')).toBe(true);
    expect(has(ps, 'RR-SCHEMA')).toBe(true);
  });
  it('none outside a lifecycle tree, and a lifecycle tree with two nodes, are RR-LIFECYCLE', () => {
    const a = clone(golden('permitted', 'web').rendered_tree);
    a.nodes[1].status = 'none';
    expect(has(problemsOf(() => assertTree(a, reportCtx)), 'RR-LIFECYCLE')).toBe(true);
    const b = clone(golden('loading', 'web').rendered_tree);
    b.nodes.push(clone(b.nodes[0]));
    expect(has(problemsOf(() => assertTree(b, reportCtx)), 'RR-LIFECYCLE')).toBe(true);
  });
});

describe('T19 disclosures, both directions', () => {
  const tree = (): Json => {
    const t = clone(golden('permitted', 'web').rendered_tree);
    t.nodes[1].disclosures = ['dz_test'];
    return t;
  };
  it('a registered code passes; an unregistered code is RR-CONTENT', () => {
    const c = clone(reportCtx) as Json;
    c.content.disclosure_texts.dz_test = { template: 'Disclosed text.' };
    expect(() => assertTree(tree(), c)).not.toThrow();
    expect(has(problemsOf(() => assertTree(tree(), reportCtx)), 'RR-CONTENT')).toBe(true);
  });
});

describe('T6 the layout table is closed both ways', () => {
  const L = reportCtx.layout as Json;
  it('keys equal TARGETS and the manifest targets', () => {
    expect(Object.keys(L.targets)).toEqual(TARGETS);
    expect(manifest.targets).toEqual(TARGETS);
  });
  it('each value is in its closed set and no row has an extra key', () => {
    for (const row of Object.values(L.targets) as Json[]) {
      expect(Object.keys(row).sort()).toEqual(Object.keys(L.closed).sort());
      for (const k of Object.keys(L.closed)) expect(L.closed[k]).toContain(row[k]);
    }
  });
});

describe('T7 viewOf', () => {
  const node = (field: string, value: string | null = '1'): Json => ({ field, source: 'catalogue', label: field, value, status: 'permitted', confidence: 'none', provenance: 'none', disclosures: [] });
  const ctx = (): Json => {
    const c = clone(reportCtx) as Json;
    c.decl.sections.push({ id: 'zz', fields: ['a_m2', 'b_m2', 'c_m2'].map((n) => ({ name: n, label: n, source: `catalogue:${n}` })) });
    c.lists = { 'detached_house/pitched': ['c_m2', 'a_m2', 'missing_m2'] };
    c.decl.sections[c.decl.sections.length - 1].fields.push({ name: 'missing_m2', label: 'Missing', source: 'catalogue:missing_m2' });
    return c;
  };
  const tree = { nodes: [node('a_m2'), node('b_m2'), node('c_m2', null)] };
  it('headline in LIST order, absent row shows the dash and unavailable, detail in tree order', () => {
    const v = viewOf(tree, { scenario: 'detached_house/pitched', target: 'web' }, ctx());
    expect(v.headline.map((n: Json) => n.field)).toEqual(['c_m2', 'a_m2', 'missing_m2']);
    expect(v.headline[0].text).toBe('—');
    expect(v.headline[2]).toMatchObject({ text: '—', unavailable: true, label: 'Missing' });
    expect(v.detail.map((n: Json) => n.field)).toEqual(['b_m2']);
  });
  it('no scenario gives no headline', () => {
    for (const s of [undefined, null]) expect(viewOf(tree, { scenario: s, target: 'web' }, ctx()).headline).toEqual([]);
  });
  it('a bad scenario or target throws, and scenario pre-empts a bad tree', () => {
    for (const s of ['', 42, {}, 'detached_house', 'detached_house/pitchd']) expect(has(problemsOf(() => viewOf(tree, { scenario: s, target: 'web' } as Json, ctx())), 'RR-SCENARIO')).toBe(true);
    expect(has(problemsOf(() => viewOf(tree, { scenario: null, target: 'tablet' }, ctx())), 'RR-TARGET')).toBe(true);
    expect(has(problemsOf(() => viewOf({ nodes: [] }, { scenario: 'nope', target: 'web' }, ctx())), 'RR-SCENARIO')).toBe(true);
  });
  it('the layout row is carried verbatim and the badge follows the closed not_ words', () => {
    const t = clone(golden('not_evaluated', 'web').rendered_tree);
    const v = viewOf(t, { scenario: null, target: 'admin' }, reportCtx);
    expect(v.layout).toEqual((reportCtx.layout as Json).targets.admin);
    expect(v.reason?.badge).toBe('not evaluated');
  });
  it('the reason is separate from the field nodes; lifecycle gives a message and no blocks', () => {
    const v = viewOf(golden('permitted', 'web').rendered_tree, { scenario: 'detached_house/flat_or_shallow_roof', target: 'web' }, reportCtx);
    expect(v.reason?.text).toBe('Allowed as of right.');
    expect(v.headline.map((n: Json) => n.field)).toEqual(['gfa_flat_m2', 'storeys_max', 'height_max_m']);
    const l = viewOf(golden('miss', 'web').rendered_tree, { scenario: null, target: 'web' }, reportCtx);
    expect(l.lifecycle).toBe('miss');
    expect(l.reason?.text).toBe('No report for this lot yet.');
    expect([l.headline.length, l.detail.length]).toEqual([0, 0]);
  });
  it('showMeta: when_set hides none/none, shows a set value; always shows both', () => {
    const t = clone(golden('permitted', 'web').rendered_tree);
    expect(viewOf(t, { scenario: null, target: 'web' }, reportCtx).detail.every((n: Json) => n.showMeta === false)).toBe(true);
    expect(viewOf(t, { scenario: null, target: 'admin' }, reportCtx).detail.every((n: Json) => n.showMeta === true)).toBe(true);
    t.nodes[1].confidence = 'high';
    expect(viewOf(t, { scenario: null, target: 'web' }, reportCtx).detail.some((n: Json) => n.showMeta)).toBe(true);
  });
});
