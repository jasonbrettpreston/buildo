// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-69 (the generated report-field inventory is the denominator);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6.4 rule 8 (code parsed, never executed);
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md (generator home — PROVISIONAL);
//            .cursor/mcbylaw/phase3-prework/generator-design.md §2 G1 / G3 / G3' / G4
//
// Unit locks for the three engines of scripts/analysis/report-fields.mjs, over fixture modules written to a temp dir:
// the static SQL template lineage (CTE chain, set-op arms, jsonb focus, fragment spans, byte→line mapping), the JS
// def-use walker (field sensitivity, guarded mutation, depth cut, inline literal, config→logic-variable map,
// catalogue keys, presence guards) and the TSX display walk (label attr, own text, caption, .map element).
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const SQL = await load('scripts/analysis/report-fields/sql-lineage.mjs');
const JS = await load('scripts/analysis/report-fields/js-lineage.mjs');
const UI = await load('scripts/analysis/report-fields/display.mjs');

let dir = '';
const write = (rel: string, text: string) => {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
};

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-fields-'));
  if (typeof SQL.initSql === 'function') await SQL.initSql();
  write('lib/builders.js', [
    "'use strict';",
    'const K = 7.5; // a named constant',
    'function buildChain({ k }) {',
    '  return `',
    'WITH a AS (',
    '  SELECT p.id, p.x * 2 AS y FROM parcels p   -- ×2 is an inline literal; é non-ASCII comment',
    '),',
    'b AS (',
    '  SELECT a.*, y + ${k} AS z FROM a',
    ')',
    'SELECT id, z AS out FROM b WHERE (${k}) ${k > 1 ? "" : ""}`;',
    '}',
    'function buildUnion() {',
    '  return `SELECT p.x AS v FROM parcels p UNION ALL SELECT q.w FROM other q`;',
    '}',
    'function buildJson() {',
    "  return `UPDATE parcels t SET doc = agg.d FROM (SELECT s.id, jsonb_agg(jsonb_build_object('a', s.x, 'b', s.w * 3)) AS d FROM parcels s GROUP BY s.id) agg WHERE t.id = agg.id`;",
    '}',
    'module.exports = { buildChain, buildUnion, buildJson, K };',
  ].join('\n'));
  write('lib/engine.js', [
    "'use strict';",
    'const LIMITS = { CAP: 60, FLOOR: 18 };',
    'function inner(q) { return { gfa: q.a * LIMITS.CAP }; }',
    'function deep1(v) { return deep2(v); }',
    'function deep2(v) { return deep3(v); }',
    'function deep3(v) { return v * 9; }',
    'function compute(p) {',
    '  const base = Math.min(p.storeys || 2, p.cap);',
    '  const tier = inner({ a: base });',
    '  const up = inner({ a: p.p90 });',
    '  if (up.gfa < tier.gfa) {',
    '    up.gfa = tier.gfa;',
    '  }',
    '  return { aor: tier.gfa, coa: up.gfa, deep: deep1(p.z), noise: p.other };',
    '}',
    'function lines(rows, cat, opts) {',
    '  const out = {};',
    '  const cfg = opts.config;',
    '  for (const line of cat) {',
    '    const area = rows[line.areaField];',
    '    if (area == null || area <= cfg.minArea) continue;',
    '    const entry = { total: area * 2 };',
    '    out[line.id] = entry;',
    '  }',
    '  return out;',
    '}',
    'module.exports = { compute, lines, inner, LIMITS };',
  ].join('\n'));
  write('lib/step.js', [
    "'use strict';",
    'function run(config) {',
    '  const storeyHeight = Number(config.storey_height_m);',
    '  const acc = { gardenMax: config.garden_suite_max_gfa_sqm, minArea: config.min_area };',
    '  return { storeyHeight, acc, again: { sh: storeyHeight } };',
    '}',
    'module.exports = { run };',
  ].join('\n'));
  write('ui/Screen.tsx', [
    "import React from 'react';",
    'function Headline({ label, value }: { label: string; value: string | null }) { return <Text>{label}{value}</Text>; }',
    'export default function Screen() {',
    '  const { data } = useThing();',
    '  const { parcel } = data;',
    '  const { areas, neighbourhood } = parcel;',
    '  const comps = neighbourhood.comparableBuilds ?? [];',
    '  return (',
    '    <View>',
    '      <Headline label="Lot size" value={formatSqm(areas.lot_size_sqm)} />',
    '      <Text>Envelope constrained{areas.reason}</Text>',
    '      <View><Text>Ruling:</Text><View><Text>{areas.ruling}</Text></View></View>',
    '      {comps.map((c, i) => (<Text key={i}>FSI {formatFsi(c.permit_fsi)}</Text>))}',
    '    </View>',
    '  );',
    '}',
  ].join('\n'));
});

afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

const catalog = new Map<string, Set<string>>([['parcels', new Set(['id', 'x', 'w', 'doc'])]]);

describe('G3 SQL lineage (static template render, libpg-query)', () => {
  it('modules load', () => {
    expect(SQL.importError).toBeUndefined();
    expect(JS.importError).toBeUndefined();
    expect(UI.importError).toBeUndefined();
  });

  it('follows a CTE chain through a star passthrough to base columns, mapping each node to its source line', () => {
    const files = JS.createFiles(dir);
    const { render, lineage } = SQL.renderAndParse(files.get('lib/builders.js'), 'buildChain', catalog, new Map());
    const t = SQL.traceOutput(lineage, 'out', catalog);
    expect(t.bases).toEqual(['parcels.x']);
    const ids = t.nodes.map((n: Json) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['select.out', 'b.z', 'a.y']));
    const lineOf = (n: Json) => render.file.lineOf(SQL.nodeSource(render, n.loc).sOff);
    expect(lineOf(t.nodes.find((n: Json) => n.id === 'a.y'))).toBe(6); // the byte offset after "é"/"×" still maps to line 6
    expect(lineOf(t.nodes.find((n: Json) => n.id === 'b.z'))).toBe(9);
    // the inline literal 2 is SQL text; the ${k} span is an interpolation
    const ay = t.nodes.find((n: Json) => n.id === 'a.y');
    expect(ay.literals.map((l: Json) => [l.value, SQL.nodeSource(render, l.loc).span])).toEqual([[2, null]]);
    const bz = t.nodes.find((n: Json) => n.id === 'b.z');
    expect(bz.literals.map((l: Json) => SQL.nodeSource(render, l.loc).span)).toEqual([0]);
  });

  it('resolves a column named as TEXT by a nested fragment builder (`buildSetbackCase(\'s.zoning_class\')`) in the span\'s own scope', () => {
    const files = JS.createFiles(dir);
    const { lineage } = SQL.renderAndParse(files.get('lib/builders.js'), 'buildChain', catalog, new Map());
    const bz = SQL.traceOutput(lineage, 'out', catalog).nodes.find((n: Json) => n.id === 'b.z');
    expect(SQL.basesOfColumnText(bz.scopeObj, 'y', catalog)).toEqual(['parcels.x']); // through the CTE a.y
    expect(SQL.basesOfColumnText(bz.scopeObj, 'a.y', catalog)).toEqual(['parcels.x']);
    expect(SQL.basesOfColumnText(bz.scopeObj, "not a column; DROP", catalog)).toEqual([]);
  });

  it('retries a span in a statement-fragment position with an empty placeholder (`AND (x) ${extra}`)', () => {
    const files = JS.createFiles(dir);
    const { render } = SQL.renderAndParse(files.get('lib/builders.js'), 'buildChain', catalog, new Map());
    expect([...render.empty]).toEqual([2]);
  });

  it('resolves each UNION arm as its own scope and unions the deps by position (the resolver set-op rule)', () => {
    const files = JS.createFiles(dir);
    const { lineage } = SQL.renderAndParse(files.get('lib/builders.js'), 'buildUnion', new Map([['parcels', new Set(['x'])], ['other', new Set(['w'])]]), new Map());
    const t = SQL.traceOutput(lineage, 'v', catalog);
    expect(t.bases).toEqual(['other.w', 'parcels.x']);
  });

  it('focuses a jsonb_build_object key through an UPDATE … SET … FROM (subselect)', () => {
    const files = JS.createFiles(dir);
    const { lineage, render } = SQL.renderAndParse(files.get('lib/builders.js'), 'buildJson', catalog, new Map());
    const a = SQL.traceOutput(lineage, 'doc', catalog, 'a');
    const b = SQL.traceOutput(lineage, 'doc', catalog, 'b');
    expect(a.bases).toEqual(['parcels.x']);
    expect(b.bases).toEqual(['parcels.w']);
    const lits = b.nodes.flatMap((n: Json) => n.literals.map((l: Json) => l.value)).filter((v: unknown) => typeof v === 'number');
    expect(lits).toEqual([3]);
    expect(render.spans).toEqual([]);
  });
});

describe("G3' JS def-use walk (TypeScript AST, nothing executed)", () => {
  const trace = (focus: string[], maxDepth = 4) => {
    const files = JS.createFiles(dir);
    const T = JS.createTracer({ files, maxDepth, transparent: new Set(), configMap: new Map() });
    T.begin();
    const f = files.get('lib/engine.js');
    const fn = JS.moduleTop(files, 'lib/engine.js').functions.get('compute');
    const env = T.env(f, fn, 0, new Map(), null, {});
    // trace compute's return with a focus
    const visit = (n: ts.Node): void => { if (ts.isReturnStatement(n) && n.expression) T.expr(n.expression, env, focus); ts.forEachChild(n, visit); };
    ts.forEachChild(fn.body, visit);
    return T.acc;
  };

  it('is field-sensitive through object literals and call returns, and records the literal `|| 2` fallback', () => {
    const acc = trace(['aor']);
    expect([...acc.inputs.keys()].sort()).toEqual(['param:compute.p.cap', 'param:compute.p.storeys']);
    expect([...acc.constants.keys()]).toEqual(['lib/engine.js#LIMITS.CAP']);
    expect([...acc.literals.values()].map((l: Json) => l.value)).toEqual([2]);
  });

  it('follows a guarded mutation (`up.gfa = tier.gfa` under `if (…)`) for the CoA-like field', () => {
    const acc = trace(['coa']);
    const keys = [...acc.inputs.keys()].sort();
    expect(keys).toEqual(['param:compute.p.cap', 'param:compute.p.p90', 'param:compute.p.storeys']);
    const notes = [...acc.nodes.values()].map((n: Json) => n.note).filter(Boolean);
    expect(notes.some((x: string) => x.startsWith('if (up.gfa < tier.gfa)'))).toBe(true);
  });

  it('cuts a call deeper than maxDepth and records it (evidence I), never guessing past it', () => {
    const deep = trace(['deep'], 2);
    expect([...deep.cuts.values()].map((c: Json) => c.what)).toEqual(['deep3()']);
    const full = trace(['deep'], 4);
    expect([...full.cuts.values()]).toEqual([]);
    expect([...full.literals.values()].map((l: Json) => l.value)).toEqual([9]);
  });

  it('reads a dynamic key from a catalogue binding and records the presence guard (`if (…) continue`)', () => {
    const files = JS.createFiles(dir);
    const T = JS.createTracer({ files, maxDepth: 4, transparent: new Set(), configMap: new Map([['minArea', new Set(['min_area'])]]) });
    T.begin();
    const f = files.get('lib/engine.js');
    const fn = JS.moduleTop(files, 'lib/engine.js').functions.get('lines');
    const env = T.env(f, fn, 0, new Map(), null, { rowSource: { param: 'rows', builder: 'buildRows', file: 'lib/builders.js' }, catalogueBindings: new Map([['line', { id: 'x', areaField: 'area_col', __key: 'x', __sources: {} }]]) });
    const entry = T.lookupLocal(env, 'entry');
    T.ref(entry.decl.name, env, ['total']);
    expect([...T.acc.inputs.keys()].sort()).toEqual(['lv:min_area', 'row:buildRows.area_col']);
    expect([...T.acc.nodes.values()].map((n: Json) => n.note).filter(Boolean)).toContain('catalogue[x].areaField = "area_col"');
  });

  it('maps step-module config reads to logic variables (const, object property, re-bound shorthand)', () => {
    const files = JS.createFiles(dir);
    const m = JS.configMapOf(files, ['lib/step.js'], new Set(['storey_height_m', 'garden_suite_max_gfa_sqm', 'min_area']));
    expect(Object.fromEntries([...m].map(([k, v]: [string, Set<string>]) => [k, [...v]]))).toEqual({
      storeyHeight: ['storey_height_m'], gardenMax: ['garden_suite_max_gfa_sqm'], minArea: ['min_area'], sh: ['storey_height_m'],
    });
  });
});

describe('G1 display walk (TSX)', () => {
  it('finds each rendered payload path with its label (label attr · own text · caption) and formatter', () => {
    const files = JS.createFiles(dir);
    const rows = UI.renderedPaths(files.get('ui/Screen.tsx'), new Map([['data', { path: [] }]]), { skipComponents: new Set(['Headline']) });
    const by = Object.fromEntries(rows.map((r: Json) => [r.path, [r.label, r.label_how, r.formatter]]));
    expect(by['parcel.areas.lot_size_sqm']).toEqual(['Lot size', 'label_attr', 'formatSqm']);
    expect(by['parcel.areas.reason']).toEqual(['Envelope constrained', 'own_text', null]);
    expect(by['parcel.areas.ruling']).toEqual(['Ruling', 'caption', null]);
    expect(by['parcel.neighbourhood.comparableBuilds.[].permit_fsi']).toEqual(['FSI', 'own_text', 'formatFsi']);
  });
});
