// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §4 (the five lines: common fields, per-line extensions,
//            gate state pass · fail · not_run, a gate not run is never a PASS, pending never fails, PHASE 1 line),
//            §6 (row fields), §6 table-level `validated_against` (never a timestamp), §9 (exit codes 2 / 1 / 0;
//            a report-only arm never changes the exit code), §10 stage 8 (render: JSON source of truth, MD drift-locked),
//            §12 (verbatim containing `|`, `#`, `<!--` is escaped), §6.5 + Spec 69 M-52 (feeds per-pair counts in the render);
//            docs/reports/mcbylaw-phase1-plan.md S7 (renderer contract: fixed heading, no Status line, escaping, total sort,
//            LF, atomic writes, gates pass/run/total, row-state counts; --plan-batches)
//
// S7 renderer + five-line contract over in-memory fixtures (no seeds, no clock).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const R = await load('scripts/analysis/bylaw/render.mjs');
const VAL = await load('scripts/analysis/bylaw/validate.mjs');

const row = (id: string, page: string, section: string, start: number, verbatim: string, o: Json = {}): Json => ({
  article: id.replace(/\(.*$/, ''),
  article_title: 'Setbacks',
  carve_in: false,
  clauses: [{ end: verbatim.length, leaf: true, path: id.replace(/^[^(]*/, '') || '#article', start: 0, text: verbatim }],
  defects: [],
  end: start + verbatim.length,
  kind: 'regulation',
  literals: [{ clause_path: '(1)', end: 5, inherited_unit: false, raw: '6.0 metres', start: 0, unit: 'm', value: 6 }],
  number: 1,
  page,
  refs: [{ citation: '10.5.40.10(1)', clause_path: '(1)', end: 9, id: '10.5.40.10', path: '(1)', raw: '10.5.40.10(1)', start: 0, via: 'direct' }],
  regulation_id: id,
  retired: false,
  section,
  sha256: 'a'.repeat(64),
  start,
  tags: [{ clause_path: '(1)', end: 9, entries: [{ bylaw: '1313-2023', qualifier: null, raw: '1313-2023' }], raw: '[ By-law: 1313-2023 ]', start: 0 }],
  uncovered_numbers: [],
  verbatim,
  ...o,
});

function fixture(): Json {
  const rows = [
    row('10.20.40.70(1)', 'ch10_20', '10.20', 100, '(1) The required minimum front yard setback is 6.0 metres.'),
    row('10.20.40.70(2)', 'ch10_20', '10.20', 200, '(2) Pipes | hashes # and <!-- comments --> and `ticks` and a back\\slash\nnewline.'),
    row('10.10.40.10(1)', 'ch10_10', '10.10', 50, '(1) R zone height.'),
    row('800.50(410)', 'ch800_50', '800.50', 10, '(410) Lawfully Existing Means: x.', { kind: 'definition', term: 'Lawfully Existing', tags: [], literals: [], refs: [] }),
  ];
  const units = rows.map((r) => ({ clause_path: r.clauses[0].path, page: r.page, regulation_id: r.regulation_id, sha256: 'b'.repeat(64), unit_id: `${r.regulation_id}#${r.clauses[0].path}` }));
  const scoped = [
    { regulation_id: '10.20.40.70(1)', page: 'ch10_20', scope: 'in_scope', reason: null, rule_id: 'S-PAGE', ruling: null },
    { regulation_id: '10.20.40.70(2)', page: 'ch10_20', scope: 'in_scope', reason: null, rule_id: 'S-PAGE', ruling: null },
    { regulation_id: '10.10.40.10(1)', page: 'ch10_10', scope: 'in_scope', reason: null, rule_id: 'S-PAGE', ruling: null },
    { regulation_id: '800.50(410)', page: 'ch800_50', scope: 'out_of_scope', reason: 'definition_not_used', rule_id: 'S-DEF', ruling: null },
  ];
  const page = (key: string, section: string) => ({ consolidation: { amendments_up_to: '2026-04-30', version_date: '2024-07-31' }, fetch_id: 'F-1', key, normalized_sha256: 'c'.repeat(64), raw_sha256: 'd'.repeat(64), role: 'section', section, url: `https://www.toronto.ca/${key}.htm` });
  return {
    slice: { defects: [], rows, slicer_version: 'slice-v1', units },
    scoped,
    manifest: { adoption_id: 'adoption-1', normalizer_version: 'norm-v1', pages: [page('ch10_10', '10.10'), page('ch10_20', '10.20'), page('ch800_50', '800.50'), { key: 'ch1', role: 'toc_root', section: null, url: 'x', raw_sha256: 'e', normalized_sha256: 'f', fetch_id: 'F-1', consolidation: null }] },
    amendments: { statuses: { '1313-2023': { status: 'not_verified' } } },
    vocab: { version: 'vocab-v1' },
    rowStatus: { '10.20.40.70(1)': 'pending', '10.20.40.70(2)': 'pending', '10.10.40.10(1)': 'complete' },
    feeds: { checked: 2, counts: { 'principal/envelope': 2 } },
  };
}
const shuffled = (f: Json): Json => ({ ...f, slice: { ...f.slice, rows: [...f.slice.rows].reverse(), units: [...f.slice.units].reverse() }, scoped: [...f.scoped].reverse(), manifest: { ...f.manifest, pages: [...f.manifest.pages].reverse() } });

describe('renderer contract (S7)', () => {
  const doc = R.buildTable ? R.buildTable(fixture()) : {};
  const md = R.renderMarkdown ? R.renderMarkdown(doc) : '';
  const json = R.renderJson ? R.renderJson(doc) : '';

  it('fixed heading on line 1; no Status line anywhere (never scraped as a spec)', () => {
    expect(md.split('\n')[0]).toBe(R.MD_HEADING);
    expect(md).not.toMatch(/\*\*Status:?\*\*/);
    expect(md).not.toMatch(/^Status:/m);
  });

  it('LF only, one trailing newline, for both renders', () => {
    for (const t of [md, json]) {
      expect(t.includes('\r')).toBe(false);
      expect(t.endsWith('\n')).toBe(true);
      expect(t.endsWith('\n\n')).toBe(false);
    }
  });

  it('escaping: a verbatim with | # <!-- ` \\ and a newline cannot break the table or open a comment', () => {
    const line = md.split('\n').find((l: string) => l.includes('10.20.40.70(2)') && l.startsWith('|'))!;
    expect(line).toBeDefined();
    expect(line).not.toContain('<!--');
    expect(line).toContain('&lt;!--');
    expect(line).toContain('\\|');
    expect(line).toContain('\\`ticks\\`');
    expect(line).toContain('back\\\\slash');
    const cells = line.replace(/\\\|/g, '').split('|');
    expect(cells.length).toBe(R.MD_ROW_COLUMNS + 2);
    expect(R.escapeMd('a|b\r\nc')).toBe('a\\|b c');
  });

  it('total sort: any input order renders byte-identically (pages by section, rows by offset)', () => {
    const doc2 = R.buildTable(shuffled(fixture()));
    expect(R.renderMarkdown(doc2)).toBe(md);
    expect(R.renderJson(doc2)).toBe(json);
    expect(doc.rows.map((r: Json) => r.regulation_id)).toEqual(['10.10.40.10(1)', '10.20.40.70(1)', '10.20.40.70(2)', '800.50(410)']);
  });

  it('JSON is canonical (sorted keys, one row per line) and round-trips byte-equal', () => {
    expect(R.renderJson(JSON.parse(json))).toBe(json);
    const top = Object.keys(JSON.parse(json));
    expect(top).toEqual([...top].sort());
  });

  it('table-level validated_against = adoption + generator / slicer / normalizer / vocab versions, never a timestamp', () => {
    expect(doc.validated_against).toEqual({ adoption_id: 'adoption-1', generator_version: R.GENERATOR_VERSION, normalizer_version: 'norm-v1', slicer_version: 'slice-v1', vocab_version: 'vocab-v1' });
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(md).toContain('adoption-1');
  });

  it('row-state counts are computed from the rows (in scope only); out-of-scope rows carry no row_status', () => {
    expect(doc.counts.row_states).toEqual({ complete: 1, failed: 0, pending: 2, 'pending:stale': 0 });
    expect(doc.counts).toMatchObject({ rows: 4, in_scope: 3, out_of_scope: 1, awaiting_ruling: 0, unscoped: 0, units: 4 });
    expect(doc.rows.find((r: Json) => r.regulation_id === '800.50(410)').row_status).toBeNull();
    expect(md).toMatch(/complete 1 · pending 2 \(stale 0\) · failed 0/);
  });

  it('a row carries its source page, scope, amendments (by-law + clause), units with their sha, and no keyed field', () => {
    const r = doc.rows.find((x: Json) => x.regulation_id === '10.20.40.70(1)');
    expect(r).toMatchObject({ page: 'ch10_20', scope: 'in_scope', scope_rule_id: 'S-PAGE', out_of_scope_reason: null, scope_ruling: null, term: null, amendments: [{ bylaw: '1313-2023', clause_path: '(1)', qualifier: null }], drafts: [] });
    expect(r.units).toEqual([{ clause_path: '(1)', sha256: 'b'.repeat(64), unit_id: '10.20.40.70(1)#(1)' }]);
    for (const k of ['archetype', 'target', 'numeric_expression', 'explanation']) expect(Object.hasOwn(r, k)).toBe(false);
    expect(doc.pages.ch10_20).toMatchObject({ section: '10.20', fetch_id: 'F-1', url: 'https://www.toronto.ca/ch10_20.htm' });
    expect(Object.hasOwn(doc.pages, 'ch1')).toBe(false);
    expect(doc.amendment_statuses).toEqual({ '1313-2023': 'not_verified' });
  });

  it('each row lists its amending by-laws WITH their status (the P-1 notice); out-of-scope rows show their reason', () => {
    const line = md.split('\n').find((l: string) => l.startsWith('| 10.20.40.70(1) '))!;
    expect(line).toContain('1313-2023 [not_verified] @(1)');
    expect(md.split('\n').find((l: string) => l.startsWith('| 800.50(410) '))).toContain('| out: definition_not_used |');
  });

  it('fails closed: a row on a page that is not a pinned section page, or a unit naming no row, is an error — never silently dropped', () => {
    const f = fixture();
    f.slice.rows[0].page = 'ch999_1';
    expect(() => R.buildTable(f)).toThrow(/not a pinned section page/);
    const g = fixture();
    g.slice.units.push({ clause_path: '(9)', regulation_id: 'GHOST(1)', sha256: 'x', unit_id: 'GHOST(1)#(9)' });
    expect(() => R.buildTable(g)).toThrow(/name no row/);
  });

  it('every line-break code point is escaped (U+2028, U+2029, U+0085)', () => {
    expect(R.escapeMd('a\u2028b\u2029c\u0085d')).toBe('a b c d');
  });

  it('feeds per (structure, aspect) unit counts are rendered (M-52)', () => {
    expect(doc.feeds).toEqual({ checked: 2, counts: { 'principal/envelope': 2 } });
    expect(md).toContain('principal/envelope 2');
    expect(md).toMatch(/over 2 agreed/);
    const empty = R.renderMarkdown(R.buildTable({ ...fixture(), feeds: { checked: 0, counts: {} } }));
    expect(empty).toMatch(/feeds.*none yet/);
  });

  it('atomic writes: the files land complete, no temp file is left, and nothing outside the map is touched', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bylaw-render-'));
    R.writeFiles(dir, { 'docs/reference/a.md': 'x\n', 'docs/reference/b.json': '{}\n' });
    expect(fs.readdirSync(path.join(dir, 'docs/reference')).sort()).toEqual(['a.md', 'b.json']);
    expect(fs.readFileSync(path.join(dir, 'docs/reference/a.md'), 'utf8')).toBe('x\n');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

const G = (id: string, state: string): [string, Json] => [id, { state, arms: [], violations: state === 'fail' ? [`x: ${id}`] : [], notes: [] }];
const allGates = (state: string, over: Json = {}): Json => Object.fromEntries((VAL.GATES || []).map((g: Json) => G(g.id, over[g.id] ?? state)));
const zero = { in_scope: 10, complete: 0, pending: 10, stale: 0, failed: 0, draft_failures: 0, disagreements: 0, disclosed_defects: 3 };
const extras = { snapshot_age_days: 1, max_snapshot_age_days: 90, findings: { ii: 0, iv_unmapped: 5 }, eval_mismatches_adjudicated: 0, expert_rulings_against: 0, agreement_rate: null };

describe('the gate registry (Spec 68 §8 rule 8, §9)', () => {
  it('13 Phase 1 gates, frozen, each under one of the five words; on-demand = G-CHANGE, G-AUDIT', () => {
    expect(VAL.GATES.map((g: Json) => g.id)).toEqual(['G-TEXT', 'G-SHAPE', 'G-PROV', 'G-DRIFT', 'G-CLAUSE', 'G-XREF', 'G-AGREE', 'G-EVAL', 'G-CODE', 'G-READ', 'G-UNIVERSE', 'G-CHANGE', 'G-AUDIT']);
    expect(Object.isFrozen(VAL.GATES)).toBe(true);
    for (const g of VAL.GATES) expect(VAL.WORDS).toContain(g.word);
    expect(VAL.GATES.filter((g: Json) => g.when === 'on_demand').map((g: Json) => g.id)).toEqual(['G-CHANGE', 'G-AUDIT']);
  });

  it('registry check: a repeated id, an unknown `when`, a word with no pre-commit gate, an unknown fixture provider are each caught', () => {
    expect(VAL.registryViolations()).toEqual([]);
    const G = VAL.GATES.map((g: Json) => ({ ...g }));
    expect(VAL.registryViolations([...G.slice(0, 12), { ...G[0] }]).join(' ')).toMatch(/G-TEXT repeated/);
    expect(VAL.registryViolations(G.map((g: Json) => (g.id === 'G-READ' ? { ...g, when: 'nightly' } : g))).join(' ')).toMatch(/when nightly/);
    expect(VAL.registryViolations(G.map((g: Json) => (g.id === 'G-READ' ? { ...g, when: 'on_demand', selfTests: [] } : g))).join(' ')).toMatch(/UNDERSTANDABLE has no pre-commit gate/);
    expect(VAL.registryViolations(G.map((g: Json) => (g.id === 'G-EVAL' ? { ...g, selfTests: ['ghost'] } : g))).join(' ')).toMatch(/ghost, which does not exist/);
  });

  it('combineArms: any fail → fail; else any not_run → not_run; vacuous arms never make a pass on their own', () => {
    expect(VAL.combineArms([{ state: 'pass' }, { state: 'fail' }, { state: 'not_run' }])).toBe('fail');
    expect(VAL.combineArms([{ state: 'pass' }, { state: 'not_run' }])).toBe('not_run');
    expect(VAL.combineArms([{ state: 'pass' }, { state: 'vacuous' }])).toBe('pass');
    expect(VAL.combineArms([{ state: 'vacuous' }])).toBe('not_run');
    expect(VAL.combineArms([])).toBe('not_run');
  });
});

describe('the five lines + PHASE 1 (Spec 68 §4)', () => {
  it('format: WORD: PASS|FAIL (common fields; gates pass a / run r / total 13) and the per-line extensions', () => {
    const lines = VAL.fiveLines({ gates: allGates('pass', { 'G-AUDIT': 'not_run', 'G-CHANGE': 'not_run' }), counts: zero, extras });
    expect(lines.length).toBe(6);
    const common = /^(STANDARDIZED|OBSERVABLE|ACCURATE|UNDERSTANDABLE|SCALABLE): (PASS|FAIL) \(complete \d+ \/ in_scope \d+; pending \d+ \(stale \d+\); failed \d+; draft_failures \d+; disagreements \d+; disclosed_defects \d+; gates pass \d+ \/ run \d+ \/ total 13/;
    for (const l of lines.slice(0, 5)) expect(l).toMatch(common);
    expect(lines.map((l: string) => l.split(':')[0])).toEqual([...VAL.WORDS, 'PHASE 1']);
    expect(lines[1]).toMatch(/; snapshot_age_days 1\)$/);
    expect(lines[2]).toMatch(/; findings 5 \(ii 0 · iv unmapped 5\); eval_mismatches_adjudicated 0; expert_rulings_against 0; agreement_rate n\/a agreement≠correctness; code_linkage=declared-only\)$/);
    expect(lines[0]).toContain('gates pass 11 / run 11 / total 13');
  });

  it('a gate not run is never counted as a pass; a word with a not_run pre-commit gate does not PASS', () => {
    const lines = VAL.fiveLines({ gates: allGates('pass', { 'G-SHAPE': 'not_run', 'G-CHANGE': 'not_run', 'G-AUDIT': 'not_run' }), counts: zero, extras });
    expect(lines[0]).toMatch(/^STANDARDIZED: FAIL/);
    expect(lines[0]).toContain('gates pass 10 / run 10 / total 13');
    expect(lines[1]).toMatch(/^OBSERVABLE: PASS/);
  });

  it('on-demand gates (G-CHANGE, G-AUDIT) never decide a word; pending rows never make a word FAIL', () => {
    const v = VAL.wordVerdicts(allGates('pass', { 'G-CHANGE': 'not_run', 'G-AUDIT': 'fail' }), zero);
    expect(v.SCALABLE).toBe('PASS');
  });

  it('a failed row FAILs every word', () => {
    const v = VAL.wordVerdicts(allGates('pass'), { ...zero, failed: 1 });
    expect(Object.values(v)).toEqual(['FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL']);
  });

  it('snapshot age past vocab.max_snapshot_age_days is a WARN on the OBSERVABLE line, never a FAIL', () => {
    const lines = VAL.fiveLines({ gates: allGates('pass'), counts: zero, extras: { ...extras, snapshot_age_days: 91 } });
    expect(lines[1]).toMatch(/^OBSERVABLE: PASS .*snapshot_age_days 91 WARN>90\)$/);
  });

  it('PHASE 1: DONE only when all five PASS, pending 0, failed 0, run = total and G-AUDIT passed', () => {
    const done = { ...zero, complete: 10, pending: 0 };
    expect(VAL.fiveLines({ gates: allGates('pass'), counts: done, extras }).at(-1)).toBe('PHASE 1: DONE');
    expect(VAL.fiveLines({ gates: allGates('pass'), counts: zero, extras }).at(-1)).toBe('PHASE 1: NOT_DONE');
    expect(VAL.fiveLines({ gates: allGates('pass', { 'G-AUDIT': 'not_run' }), counts: done, extras }).at(-1)).toBe('PHASE 1: NOT_DONE');
    expect(VAL.fiveLines({ gates: allGates('pass', { 'G-CHANGE': 'not_run' }), counts: done, extras }).at(-1)).toBe('PHASE 1: NOT_DONE');
    expect(VAL.fiveLines({ gates: allGates('pass', { 'G-CHANGE': 'fail' }), counts: done, extras }).at(-1)).toBe('PHASE 1: NOT_DONE');
  });

  it('counts that cannot be computed yet print `unknown`, never a made-up 0', () => {
    const l = VAL.fiveLines({ gates: allGates('pass'), counts: { ...zero, draft_failures: null, disagreements: null }, extras });
    expect(l[0]).toContain('draft_failures unknown; disagreements unknown;');
    expect(VAL.fiveLines({ gates: allGates('pass'), counts: zero, extras: { ...extras, snapshot_age_days: null } })[1]).toMatch(/snapshot_age_days unknown\)$/);
  });
});

describe('exit codes (Spec 68 §9): 2 structural / a gate threw · 1 drift, a failed row or a gate failure · 0 otherwise', () => {
  it('the S8 state — 0 agreed rows, every row pending, unbuilt gates not_run — exits 0 (M-45)', () => {
    expect(VAL.exitCode({ gates: allGates('not_run', { 'G-TEXT': 'pass' }), counts: zero, drift: [] })).toBe(0);
  });
  it('a gate failure exits 1; drift exits 1; a failed row exits 1', () => {
    expect(VAL.exitCode({ gates: allGates('pass', { 'G-TEXT': 'fail' }), counts: zero, drift: [] })).toBe(1);
    expect(VAL.exitCode({ gates: allGates('pass'), counts: zero, drift: ['docs/reference/bylaw-provisions.md'] })).toBe(1);
    expect(VAL.exitCode({ gates: allGates('pass'), counts: { ...zero, failed: 1 }, drift: [] })).toBe(1);
  });
  it('a gate that threw exits 2 and is named', () => {
    const gates = allGates('pass');
    gates['G-EVAL'] = { state: 'not_run', error: 'boom', arms: [], violations: [], notes: [] };
    expect(VAL.exitCode({ gates, counts: zero, drift: [] })).toBe(2);
  });
  it('a report-only finding (G-CODE ii/iv, a stale findings render) never changes the exit code', () => {
    expect(VAL.exitCode({ gates: allGates('pass'), counts: zero, drift: [], reportOnly: ['bylaw-code-findings.md STALE', 'expects_mismatch'] })).toBe(0);
  });
});

describe('--plan-batches (plan A1..A7 membership)', () => {
  const sc = (id: string, section: string, kind = 'regulation', scope = 'in_scope') => ({ regulation_id: id, page: `ch${section.replace('.', '_')}`, section, kind, scope, article: id.replace(/\(.*$/, '') });
  const scoped = [
    sc('10.20.40.70(3)', '10.20'), sc('10.5.40.10(1)', '10.5'), sc('10.10.40.10(1)', '10.10'), sc('10.5.60.20(1)', '10.5'), sc('150.7.60.40(1)', '150.7'),
    sc('800.50(410)', '800.50', 'definition'), sc('5.10.1.10(1)', '5.10'), sc('200.5.1.10(1)', '200.5'), sc('900.1.10(3)', '900.1'), sc('1.5.7(1)', '1.5'),
    sc('600.60.40(1)', '600.60'), sc('10.5.80.10(1)', '10.5'), sc('230.20.1.10(1)', '230.20', 'regulation', 'out_of_scope'),
  ];
  it('every in-scope row is in exactly one batch; out-of-scope rows are in none; A6 holds the rest', () => {
    const r = VAL.planBatches({ scoped });
    const where = (id: string) => r.batches.filter((b: Json) => b.rows.includes(id)).map((b: Json) => b.id);
    expect(where('10.20.40.70(3)')).toEqual(['A1']);
    expect(where('10.5.40.10(1)')).toEqual(['A1']);
    expect(where('10.10.40.10(1)')).toEqual(['A2']);
    expect(where('10.5.60.20(1)')).toEqual(['A3']);
    expect(where('150.7.60.40(1)')).toEqual(['A3']);
    expect(where('800.50(410)')).toEqual(['A4']);
    expect(where('5.10.1.10(1)')).toEqual(['A5']);
    expect(where('200.5.1.10(1)')).toEqual(['A5']);
    expect(where('10.5.80.10(1)')).toEqual(['A6']);
    expect(where('900.1.10(3)')).toEqual(['A7']);
    expect(where('1.5.7(1)')).toEqual(['A7']);
    expect(where('600.60.40(1)')).toEqual(['A7']);
    expect(where('230.20.1.10(1)')).toEqual([]);
    expect(r.batches.map((b: Json) => b.id)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']);
    expect(r.batches.reduce((s: number, b: Json) => s + b.rows.length, 0)).toBe(scoped.filter((x) => x.scope === 'in_scope').length);
  });
  it('shards are articles, sorted', () => {
    const r = VAL.planBatches({ scoped });
    expect(r.batches.find((b: Json) => b.id === 'A1').shards).toEqual(['10.5.40.10', '10.20.40.70']);
  });
});
