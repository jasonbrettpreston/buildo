// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §9 G-CODE (i)(ii)(iv), §6 `code_refs`, §6.3 (model heuristics),
//            §6.5 `feeds` (G-CODE cross-check, report-only), §6.4 rule 8 (code parsed, never executed);
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-11, M-22, M-32 note, M-46, M-52; docs/reports/mcbylaw-phase1-plan.md S9
//
// S9 unit tests over a fixture repo (temp dir): code_ref parsing and resolution (column in schema.ts ∪ the schema doc,
// module member by the typescript AST, logic variable), one known-bad fixture per G-CODE (i) reason code plus a good
// twin, the report-only arms (ii) expects comparison, (iv) constant classification and the feeds cross-check (never
// change `pass`), and the deterministic findings render. No authored rows exist yet, so rows here are fixtures.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const CL = await load('scripts/analysis/bylaw/code-link.mjs');

const FX_MODULE = [
  "'use strict';",
  '// --- By-law constants (569-2013 Ch.150.7 garden suites) ---',
  'const BYLAW = {',
  '  HEIGHT_HIGH_M: 6.0,  // height when far from main (150.7.60.40(1)(B))',
  '  SEP_M: 5.0,          // separation',
  '};',
  '// --- Model constants ---',
  '// Sane residential lot band (m²).',
  'const LOT_MIN_SQM = 50;',
  'const GARAGE_MAX_GFA_SQM = 60; // by-law cap on a garage footprint',
  'const STOREY_HEIGHT_M_DEFAULT = 3.0;',
  'const RAVINE_SETBACK_M = 10.0; // TRCA top-of-bank proxy',
  'function half(x) { return x * 0.5 + 2.5; }',
  "const SQL = `WHERE share < 0.6`;",
  'module.exports = { BYLAW, LOT_MIN_SQM, half, SQL };',
  '',
].join('\n');

const SCHEMA_TS = [
  'import { pgTable, serial, numeric } from "drizzle-orm/pg-core"',
  'export const parcels = pgTable("parcels", {',
  '\tid: serial().primaryKey().notNull(),',
  '\tlotSize: numeric("lot_size_sqm", { precision: 12, scale: 2 }),',
  '\tbylawStandardSetbackM: numeric("bylaw_standard_setback_m"),',
  '});',
  '',
].join('\n');

const SCHEMA_DOC = [
  '# Spec 01', '', '### Column Detail', '', '#### `parcels` (1 columns)', '', '| Column | Type | Nullable | Default |',
  '|--------|------|----------|---------|', '| `max_build_front_m` | NUMERIC | YES | - |', '', '### Materialized Views', '',
  '#### `ghost` (1 columns)', '| `not_a_column` | TEXT | YES | - |', '',
].join('\n');

const LOGIC_VARS = { storey_height_m: { default: 3.0, type: 'number' }, garden_min_lot_sqm: { default: 270, type: 'number' } };
const ROOTS = ['scripts/lib/fx.js', 'scripts/lib/broken.js'];
const MEMBER = (m: string) => `scripts/lib/fx.js#${m}`;

let root = '';
let ctx: Json = {};
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-code-link-'));
  const w = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  w('scripts/lib/fx.js', FX_MODULE);
  w('scripts/lib/broken.js', 'const A = {;\nconst B = 2;\n');
  w('scripts/other.js', 'const X = 1;\nmodule.exports = { X };\n');
  w('src/lib/db/generated/schema.ts', SCHEMA_TS);
  w('docs/specs/00-architecture/01_database_schema.md', SCHEMA_DOC);
  w('scripts/seeds/logic_variables.json', JSON.stringify(LOGIC_VARS));
  ctx = typeof CL.createContext === 'function' ? CL.createContext({ root }) : {}; // a missing module fails each test, not the hook
});
afterAll(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

const row = (id: string, status: string, codeRefs: unknown, units: Json[] = [{ unit_id: `${id}#(1)`, target: 'height_m' }]) => ({
  regulation_id: id,
  calculation_handling: { status },
  code_refs: codeRefs,
  units,
});
const linkage = (rows: Json[], extra: Json = {}) => CL.checkCodeLinkage({ ctx, rows, codeRoots: ROOTS, bannedCodeRefs: [], ...extra });
const codes = (r: Json) => r.items.map((i: Json) => i.code).sort();

describe('parseCodeRef — the three code_ref kinds (Spec 68 §6)', () => {
  it('classifies column, module member and logic variable refs and carries expects', () => {
    expect(CL.parseCodeRef('parcels.lot_size_sqm')).toMatchObject({ kind: 'column', table: 'parcels', column: 'lot_size_sqm' });
    expect(CL.parseCodeRef({ ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), expects: 6.3 })).toMatchObject({
      kind: 'member', path: 'scripts/lib/fx.js', member: 'BYLAW.HEIGHT_HIGH_M', expects: 6.3, hasExpects: true,
    });
    expect(CL.parseCodeRef('storey_height_m')).toMatchObject({ kind: 'logic_variable', key: 'storey_height_m', hasExpects: false });
  });
  it('a ref matching no form is malformed', () => {
    for (const bad of ['Bad Ref!', 'a.b.c', 'scripts/lib/fx.js#', '#X', { expects: 1 }, { ref: 'x', expects: 'six' }]) {
      expect(CL.parseCodeRef(bad).kind).toBe('malformed');
    }
  });
});

describe('resolveCodeRef — static resolution, never execution (Spec 68 §6.4 rule 8)', () => {
  const res = (ref: unknown) => CL.resolveCodeRef(ctx, CL.parseCodeRef(ref));
  it('a column resolves from schema.ts or from the schema doc Column Detail (the union)', () => {
    expect(res('parcels.lot_size_sqm')).toMatchObject({ resolved: true, sources: ['schema.ts'] });
    expect(res('parcels.max_build_front_m')).toMatchObject({ resolved: true, sources: ['01_database_schema.md'] });
    expect(res('parcels.nope')).toMatchObject({ resolved: false, reason: 'column_not_found' });
    expect(res('ghost.not_a_column')).toMatchObject({ resolved: false, reason: 'column_not_found' });
  });
  it('a module member resolves through nested object literals by the typescript AST, with its value and line', () => {
    expect(res(MEMBER('BYLAW.HEIGHT_HIGH_M'))).toMatchObject({ resolved: true, value: 6, line: 4, constant: true, exported: true });
    expect(res(MEMBER('half'))).toMatchObject({ resolved: true, constant: false });
    expect(res(MEMBER('GARAGE_MAX_GFA_SQM'))).toMatchObject({ resolved: true, value: 60, exported: false });
    expect(res(MEMBER('BYLAW.NOPE'))).toMatchObject({ resolved: false, reason: 'member_not_found' });
    expect(res('scripts/lib/missing.js#X')).toMatchObject({ resolved: false, reason: 'file_missing' });
    expect(res('scripts/lib/broken.js#B')).toMatchObject({ resolved: false, reason: 'unparseable_code_file' });
  });
  it('a logic variable resolves from logic_variables.json with its default', () => {
    expect(res('storey_height_m')).toMatchObject({ resolved: true, value: 3, constant: true });
    expect(res('no_such_var')).toMatchObject({ resolved: false, reason: 'logic_variable_not_found' });
  });
});

describe('G-CODE (i) — blocking: one known-bad fixture per reason code + good twin', () => {
  it('good twin: a modelled row with a resolved column and a constant with expects passes', () => {
    const r = linkage([row('150.7.60.40(1)', 'modelled', ['parcels.lot_size_sqm', { ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), expects: 6 }])]);
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBe(1);
  });
  it('modelled_without_code_ref: a modelled row whose code_refs is "none" or empty fails', () => {
    for (const refs of ['none', []]) {
      const r = linkage([row('10.5.1(1)', 'modelled', refs)]);
      expect(r.pass).toBe(false);
      expect(codes(r)).toEqual(['modelled_without_code_ref']);
    }
  });
  it('unresolved_code_ref: a modelled row citing a missing column fails; the same ref on a not_modelled row is report-only', () => {
    const bad = linkage([row('10.5.1(1)', 'modelled', ['parcels.lot_size_sqm', 'parcels.renamed_col'])]);
    expect(bad.pass).toBe(false);
    expect(codes(bad)).toEqual(['unresolved_code_ref']);
    const twin = linkage([row('10.5.1(1)', 'not_modelled', ['parcels.renamed_col'])]);
    expect(twin.pass).toBe(true);
    expect(twin.findings.map((f: Json) => f.code)).toEqual(['unresolved_code_ref_unmodelled']);
  });
  it('constant_without_expects: a constant ref with no expects fails; with expects it passes', () => {
    expect(codes(linkage([row('x(1)', 'modelled', [MEMBER('LOT_MIN_SQM')])]))).toEqual(['constant_without_expects']);
    expect(linkage([row('x(1)', 'modelled', [{ ref: MEMBER('LOT_MIN_SQM'), expects: 50 }])]).pass).toBe(true);
    expect(linkage([row('x(1)', 'modelled', [MEMBER('half')])]).pass).toBe(true); // a function is not a constant
  });
  it('banned_code_ref: STAND_SET cited by a row with a setback target fails; the same ref with another target passes', () => {
    const banned = [{ ref: 'parcels.bylaw_standard_setback_m', reason: 'CR standard-set selector, not metres (Spec 67 KFM-14)', targets: ['front_setback_m'] }];
    const bad = linkage([row('10.20.40.70(1)', 'modelled', ['parcels.bylaw_standard_setback_m'], [{ unit_id: 'u', target: 'front_setback_m' }])], { bannedCodeRefs: banned });
    expect(codes(bad)).toEqual(['banned_code_ref']);
    const twin = linkage([row('10.20.40.70(1)', 'modelled', ['parcels.bylaw_standard_setback_m'], [{ unit_id: 'u', target: 'height_m' }])], { bannedCodeRefs: banned });
    expect(twin.pass).toBe(true);
    const unconditional = linkage([row('a(1)', 'partially_modelled', ['parcels.bylaw_standard_setback_m'])], { bannedCodeRefs: [{ ref: 'parcels.bylaw_standard_setback_m', reason: 'r' }] });
    expect(codes(unconditional)).toEqual(['banned_code_ref']);
  });
  it('ref_outside_code_roots: a member path outside vocab.code_roots fails closed', () => {
    expect(codes(linkage([row('x(1)', 'modelled', ['scripts/other.js#X'])]))).toEqual(['ref_outside_code_roots']);
  });
  it('malformed_code_ref and unparseable_code_file fail', () => {
    expect(codes(linkage([row('x(1)', 'modelled', ['Bad Ref!'])]))).toEqual(['malformed_code_ref']);
    expect(codes(linkage([row('x(1)', 'modelled', ['scripts/lib/broken.js#B'])]))).toEqual(['unparseable_code_file']);
  });
  it('a row with no authored code_refs (pending) is counted, never failed (Spec 69 M-45)', () => {
    const r = linkage([{ regulation_id: 'p(1)', calculation_handling: { status: 'modelled' } }]);
    expect(r.pass).toBe(true);
    expect(r.pending).toBe(1);
    expect(r.checked).toBe(0);
  });
});

describe('G-CODE (ii) — report-only: live constant vs expects (Spec 69 M-11, M-22)', () => {
  it('a mismatch is a finding with both values and never changes pass', () => {
    const r = linkage([row('150.7.60.40(1)', 'modelled', [{ ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), expects: 6.3 }])]);
    expect(r.pass).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.findings).toEqual([expect.objectContaining({ code: 'expects_mismatch', ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), code_value: 6, expects: 6.3, line: 4 })]);
  });
  it('an equal value is no finding (6 m ≡ 6.0 m); a logic variable with expects is compared too', () => {
    expect(linkage([row('a(1)', 'modelled', [{ ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), expects: 6.0 }])]).findings).toEqual([]);
    const lv = linkage([row('a(1)', 'modelled', [{ ref: 'storey_height_m', expects: 3.2 }])]);
    expect(lv.findings.map((f: Json) => f.code)).toEqual(['expects_mismatch']);
  });
});

describe('G-CODE (iv) — root-module constant classifier: by-law · heuristic · unmapped (Spec 69 M-46)', () => {
  const rows = [row('150.7.60.40(1)', 'modelled', [{ ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), expects: 6.3 }])];
  const heuristics = [
    { id: 'HEUR-1', kind: 'model_heuristic', code_ref: MEMBER('LOT_MIN_SQM') },
    { id: 'HEUR-2', kind: 'model_heuristic', code_ref: 'storey_height_m' },
  ];
  const classify = (extra: Json = {}) => CL.classifyConstants({ ctx, codeRoots: ['scripts/lib/fx.js'], rows, heuristics, ...extra });

  it('finds every named numeric constant (top-level and nested object members), never inline literals', () => {
    const r = classify();
    expect(r.constants.map((c: Json) => c.member)).toEqual([
      'BYLAW.HEIGHT_HIGH_M', 'BYLAW.SEP_M', 'LOT_MIN_SQM', 'GARAGE_MAX_GFA_SQM', 'STOREY_HEIGHT_M_DEFAULT', 'RAVINE_SETBACK_M',
    ]);
    expect(r.inline).toEqual([{ path: 'scripts/lib/fx.js', numeric_literals: 2, numbers_in_strings: 1 }]);
  });
  it('classifies by a row code_ref (by-law), a heuristic row incl. via its logic variable (heuristic), else unmapped', () => {
    const r = classify();
    const cls = Object.fromEntries(r.constants.map((c: Json) => [c.member, c.class]));
    expect(cls).toEqual({
      'BYLAW.HEIGHT_HIGH_M': 'by-law', 'BYLAW.SEP_M': 'unmapped', LOT_MIN_SQM: 'heuristic', GARAGE_MAX_GFA_SQM: 'unmapped',
      STOREY_HEIGHT_M_DEFAULT: 'heuristic', RAVINE_SETBACK_M: 'unmapped',
    });
    expect(r.counts).toEqual({ 'by-law': 1, heuristic: 2, unmapped: 3, total: 6 });
    expect(r.findings.filter((f: Json) => f.code === 'unmapped_constant')).toHaveLength(3);
    expect(r.constants.find((c: Json) => c.member === 'STOREY_HEIGHT_M_DEFAULT').logic_variable).toEqual({ key: 'storey_height_m', default: 3, default_equal: true });
  });
  it('a constant cited as law and listed as a heuristic is a finding', () => {
    const r = classify({ heuristics: [...heuristics, { id: 'HEUR-3', kind: 'model_heuristic', code_ref: MEMBER('BYLAW.HEIGHT_HIGH_M') }] });
    expect(r.findings.filter((f: Json) => f.code === 'constant_double_classified').map((f: Json) => f.member)).toEqual(['BYLAW.HEIGHT_HIGH_M']);
  });
  it('proposes a class from the code comments, for operator confirmation (never the gate class)', () => {
    const p = Object.fromEntries(classify({ rows: [], heuristics: [] }).constants.map((c: Json) => [c.member, [c.proposed, c.proposed_reason, c.clauses]]));
    expect(p['BYLAW.HEIGHT_HIGH_M']).toEqual(['by_law_cited', null, ['150.7.60.40(1)(B)']]);
    expect(p['BYLAW.SEP_M']).toEqual(['by_law_claimed_unsourced', null, []]); // section header claims by-law, no clause
    expect(p.GARAGE_MAX_GFA_SQM).toEqual(['by_law_claimed_unsourced', null, []]);
    expect(p.LOT_MIN_SQM).toEqual(['heuristic', 'data_cleaning_bound', []]);
    expect(p.RAVINE_SETBACK_M).toEqual(['heuristic', 'proxy_for_unmodelled_rule', []]);
    expect(p.STOREY_HEIGHT_M_DEFAULT).toEqual(['heuristic', 'modelling_assumption', []]);
  });
  it('an unparseable root module is a finding, never a silent skip', () => {
    const r = CL.classifyConstants({ ctx, codeRoots: ROOTS, rows: [], heuristics: [] });
    expect(r.findings.filter((f: Json) => f.code === 'unparseable_code_file').map((f: Json) => f.path)).toEqual(['scripts/lib/broken.js']);
  });
});

describe('feeds cross-check — report-only (Spec 68 §6.5, Spec 69 M-52)', () => {
  const registry = [{ structure: 'suite', aspect: 'envelope', refs: ['scripts/lib/fx.js'] }];
  const feedsRow = (feeds: Json[], refs: unknown[]) => row('150.7.60.40(1)', 'modelled', refs, [{ unit_id: 'u1', target: 'height_m', feeds }]);
  it('a modelled unit whose ref lies in a module registered for its pair is clean', () => {
    const r = CL.checkFeeds({ rows: [feedsRow([{ structure: 'suite', aspect: 'envelope' }], [{ ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), expects: 6 }])], registry });
    expect(r.findings).toEqual([]);
    expect(r.checked).toBe(1);
  });
  it('an unregistered pair and a ref outside the pair registry are findings; structure "any" matches any registered structure', () => {
    const r = CL.checkFeeds({
      rows: [
        feedsRow([{ structure: 'principal', aspect: 'envelope' }], [MEMBER('half')]),
        feedsRow([{ structure: 'suite', aspect: 'envelope' }], ['parcels.lot_size_sqm']),
        feedsRow([{ structure: 'any', aspect: 'envelope' }], [MEMBER('half')]),
      ],
      registry,
    });
    expect(r.findings.map((f: Json) => f.code)).toEqual(['feeds_pair_unregistered', 'feeds_ref_outside_registry']);
  });
  it('rows that are not modelled, or units with no feeds yet, are not checked', () => {
    const r = CL.checkFeeds({ rows: [row('a(1)', 'not_modelled', [MEMBER('half')]), feedsRow([], [MEMBER('half')])], registry });
    expect(r).toMatchObject({ findings: [], checked: 0 });
  });
});

describe('findings render (Spec 68 §10 stage 8) — deterministic, report-only', () => {
  const build = () => CL.buildReport({
    ctx,
    rows: [row('150.7.60.40(1)', 'modelled', [{ ref: MEMBER('BYLAW.HEIGHT_HIGH_M'), expects: 6.3 }])],
    heuristics: [],
    vocab: { code_roots: ['scripts/lib/fx.js'], banned_code_refs: [], code_registry: [] },
  });
  it('renders the same bytes twice, LF only, with every arm and the declared-only label', () => {
    const a = build().markdown;
    expect(build().markdown).toBe(a);
    expect(a.includes('\r')).toBe(false);
    expect(a.endsWith('\n')).toBe(true);
    for (const h of ['## G-CODE (i)', '## G-CODE (ii)', '## feeds cross-check', '## G-CODE (iv)', 'code_linkage: declared-only']) expect(a).toContain(h);
    expect(a).toContain('| `scripts/lib/fx.js#BYLAW.HEIGHT_HIGH_M` | 6 | 6.3 |');
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/); // no run timestamp
  });
  it('a report-only finding never changes the exit verdict; a (i) violation does', () => {
    expect(build().pass).toBe(true);
    const bad = CL.buildReport({ ctx, rows: [row('a(1)', 'modelled', 'none')], heuristics: [], vocab: { code_roots: ['scripts/lib/fx.js'] } });
    expect(bad.pass).toBe(false);
  });
  it('without vocab.code_roots the report says the roots are the S9 proposal, not a ratified vocabulary', () => {
    const r = CL.buildReport({ ctx, rows: [], heuristics: [], vocab: null });
    expect(r.markdown).toContain('code_roots source: PROPOSED');
  });
});

describe('review fold (DeepSeek spec / error-paths / idempotency lenses, adjudicated by execution)', () => {
  it('a gate that checked no row is not_run, never pass (Spec 68 §4); the render says so', () => {
    expect(linkage([]).state).toBe('not_run');
    expect(linkage([row('a(1)', 'modelled', ['parcels.lot_size_sqm'])]).state).toBe('pass');
    const md = CL.buildReport({ ctx, rows: [], heuristics: [], vocab: { code_roots: ['scripts/lib/fx.js'] } }).markdown;
    expect(md).toContain('| G-CODE (i) blocking | not_run |');
    expect(md).toContain('not_run (registry not declared)');
  });
  it('a scoped ban fails closed when the row has no unit targets; an empty targets list bans everywhere', () => {
    const scoped = [{ ref: 'parcels.bylaw_standard_setback_m', reason: 'r', targets: ['front_setback_m'] }];
    expect(codes(linkage([row('a(1)', 'modelled', ['parcels.bylaw_standard_setback_m'], [])], { bannedCodeRefs: scoped }))).toEqual(['banned_code_ref']);
    const empty = [{ ref: 'parcels.bylaw_standard_setback_m', reason: 'r', targets: [] }];
    expect(codes(linkage([row('a(1)', 'modelled', ['parcels.bylaw_standard_setback_m'])], { bannedCodeRefs: empty }))).toEqual(['banned_code_ref']);
  });
  it('expects on a ref that is not a constant is a report-only expects_unverifiable finding', () => {
    const r = linkage([row('a(1)', 'modelled', [{ ref: 'parcels.lot_size_sqm', expects: 6 }])]);
    expect(r.pass).toBe(true);
    expect(r.findings.map((f: Json) => f.code)).toEqual(['expects_unverifiable']);
  });
  it('a module path with a .. segment is malformed (never read outside the roots)', () => {
    expect(CL.parseCodeRef('scripts/lib/../../etc/x.js#A').kind).toBe('malformed');
  });
  it('a directory root that holds no code is code_root_missing; a file under two roots is classified once', () => {
    const r = CL.classifyConstants({ ctx, codeRoots: ['scripts/nowhere/', 'scripts/lib/fx.js', 'scripts/lib/fx.js'], rows: [], heuristics: [] });
    expect(r.findings.filter((f: Json) => f.code === 'code_root_missing').map((f: Json) => f.path)).toEqual(['scripts/nowhere/']);
    expect(r.counts.total).toBe(6);
    const both = CL.classifyConstants({ ctx, codeRoots: ['scripts/lib/', 'scripts/lib/fx.js'], rows: [], heuristics: [] });
    expect(both.constants.filter((c: Json) => c.member === 'LOT_MIN_SQM')).toHaveLength(1);
  });
  it('a directory or missing path as a module is file_missing, never a thrown EISDIR', () => {
    expect(CL.resolveCodeRef(ctx, CL.parseCodeRef('scripts/lib.js#X'))).toMatchObject({ resolved: false });
    fs.mkdirSync(path.join(root, 'scripts/dir.js'), { recursive: true });
    expect(CL.resolveCodeRef(ctx, CL.parseCodeRef('scripts/dir.js#X'))).toMatchObject({ resolved: false, reason: 'file_missing' });
  });
  it('an aliased export resolves to its local, and a trailing comment is never read from inside a later string', () => {
    fs.writeFileSync(path.join(root, 'scripts/lib/alias.mjs'), 'const K = 4.5; // real comment\nconst U = [1, "http://x"];\nexport { K as PUBLIC_K };\nmodule.exports = { ALIAS: K };\n');
    const c2 = CL.createContext({ root });
    expect(CL.resolveCodeRef(c2, CL.parseCodeRef('scripts/lib/alias.mjs#PUBLIC_K'))).toMatchObject({ resolved: true, value: 4.5, exported: true });
    expect(CL.resolveCodeRef(c2, CL.parseCodeRef('scripts/lib/alias.mjs#ALIAS'))).toMatchObject({ resolved: true, value: 4.5 });
    const cs = CL.classifyConstants({ ctx: c2, codeRoots: ['scripts/lib/alias.mjs'], rows: [], heuristics: [] }).constants;
    expect(cs.map((c: Json) => [c.member, c.comment])).toEqual([['K', 'real comment'], ['U.0', '']]);
  });
  it('an unparseable JSON input is a named structural error (exit 2 at the CLI), never a raw SyntaxError', () => {
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-code-link-bad-'));
    fs.mkdirSync(path.join(bad, 'scripts/seeds'), { recursive: true });
    fs.writeFileSync(path.join(bad, 'scripts/seeds/logic_variables.json'), '{ nope');
    expect(() => CL.createContext({ root: bad })).toThrow(CL.CodeLinkError);
    expect(() => CL.createContext({ root: bad })).toThrow(/logic_variables\.json is not valid JSON/);
    fs.rmSync(bad, { recursive: true, force: true });
  });
  it('a registry module path covers its members only — never a bare string prefix', () => {
    const registry = [{ structure: 'suite', aspect: 'envelope', refs: ['scripts/lib/fx'] }];
    const r = CL.checkFeeds({ rows: [row('a(1)', 'modelled', [MEMBER('half')], [{ unit_id: 'u', target: 'height_m', feeds: [{ structure: 'suite', aspect: 'envelope' }] }])], registry });
    expect(r.findings.map((f: Json) => f.code)).toEqual(['feeds_ref_outside_registry']);
  });
});

describe('selfTest (Spec 68 §8 rule 8) — every reason code has a known-bad fixture that fails for that reason', () => {
  it('passes, covering each (i) reason code', () => {
    const r = CL.selfTest();
    expect(r.violations).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.checked).toBeGreaterThanOrEqual(CL.REASON_CODES_I.length);
  });
});
