// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §8 rule 1 ("No per-row code. No regulation id or exception
//            number appears as an executable literal in `scripts/` or `src/` (G-EXC-LIT, Phase 2); no branch on a
//            regulation id"), §8 rule 9 (the `typescript` compiler API, AST), §9 G-EXC-LIT row and the "every named
//            reason code has a known-bad fixture … plus a good twin" rule; docs/specs/01-pipeline/69_mcbylaw_policy.md
//            M-25 (output HOLD: legacy compute is report-only until Phase 3); .cursor/mcbylaw/phase2-plan-v2.md row L8
//            (regulation ids, exception numbers in executable position, parcel-id literals)
//
// G-EXC-LIT logic: every reason code and every executable position has a known-bad source that fires it and a good
// twin (the same literal in a comment, a log string or a data value) that does not; the allow-list is closed and
// tested both directions; the blocking / report-only split is data and is honoured.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const X = await load('scripts/analysis/bylaw/exc-lit.mjs');

const BY = 'scripts/analysis/bylaw/fx-mod.mjs'; // a blocking path (McBylaw module)
const LEG = 'scripts/lib/compute/enrich-parcels.js'; // a legacy compute file (report-only, M-25)
const NEW = 'scripts/lib/compute/resolve-bylaw-fx.js'; // a new compute file (blocking: Layer 2/3 step code)
const TST = 'src/tests/fx.logic.test.ts'; // excluded (test suite)

const hits = (src: string, rel = BY): Json[] => X.scanSource(rel, src);
const kinds = (src: string, rel = BY): string[] => hits(src, rel).map((h) => `${h.kind}@${h.position}`).sort();
const run = (sources: Record<string, string>, opts: Json = {}): Json => X.checkExcLit({ sources, allow: [], ...opts });
const codes = (r: Json): string[] => [...new Set((r.violations as string[]).map((v) => v.split(':')[0] ?? v))].sort();

describe('G-EXC-LIT — module surface', () => {
  it('module loads', () => expect(X.importError).toBeUndefined());

  it('closed reason codes, positions, kinds, scope modes and allow reasons', () => {
    expect(X.REASON_CODES).toEqual([
      'allow_entry_invalid', 'allow_entry_orphan', 'exception_number_literal', 'parcel_id_literal',
      'regulation_id_literal', 'scope_rule_invalid', 'scope_rule_orphan', 'source_unparsed',
    ]);
    expect(X.POSITIONS).toEqual(['array_membership', 'comparison', 'key_lookup', 'map_key', 'object_key', 'regex', 'sql_compare', 'switch_case']);
    expect(X.KINDS).toEqual(['exception_number_literal', 'parcel_id_literal', 'regulation_id_literal']);
    expect(X.SCOPE_MODES).toEqual(['blocking', 'excluded', 'report_only']);
    expect(Object.isFrozen(X.SCOPE_RULES) && Object.isFrozen(X.ALLOW_LIST)).toBe(true);
  });

  it('selfTest(): passes, and covers every reason code and every position with a known-bad AND a good twin', () => {
    const r = X.selfTest();
    expect(r.results.filter((x: Json) => !x.ok).map((x: Json) => x.name)).toEqual([]);
    expect(r.pass).toBe(true);
    for (const code of [...X.REASON_CODES, ...X.POSITIONS]) {
      expect(r.results.some((x: Json) => x.covers === code && x.twin === 'bad'), `${code} known-bad`).toBe(true);
      expect(r.results.some((x: Json) => x.covers === code && x.twin === 'good'), `${code} good twin`).toBe(true);
    }
  });
});

describe('G-EXC-LIT — regulation ids in executable position (known-bad)', () => {
  it.each([
    ['comparison', "if (row.regulation_id === '10.20.40.70(1)') f();"],
    ['comparison (reversed, loose, relational)', "if ('900.3.10(5)' == id || id < '800.50(445)') f();"],
    ['switch_case', "switch (id) { case '150.7.60.70(1)': f(); }"],
    ['key_lookup', "const h = HANDLERS['10.20.40.10(1)'];"],
    ['object_key', "const HANDLERS = { '10.20.40.10(1)': () => 1 };"],
    ['map_key', "m.get('600.60.40(2)'); s.has('600.60.40(2)');"],
    ['array_membership', "if (['10.20.40.70(1)', '10.20.40.70(2)'].includes(id)) f();"],
    ['regex', 'if (/10\\.20\\.40\\.70\\(1\\)/.test(t)) f();'],
    ['sql_compare', "await db.query(`SELECT * FROM p WHERE regulation_id = '10.20.40.70(1)'`);"],
    ['clause unit id', "if (u.unit_id === '10.20.40.70(3)#band') f();"],
    ['template literal with a substitution', 'if (u.unit_id === `10.20.40.70(3)#(${c})`) f();'],
    ['article form', "if (id === '10.20.40.70#article') f();"],
  ])('%s', (_name, src) => {
    const h = hits(src);
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((x) => x.kind === 'regulation_id_literal')).toBe(true);
  });

  it('positions are named exactly', () => {
    expect(kinds("switch (id) { case '150.7.60.70(1)': f(); }")).toEqual(['regulation_id_literal@switch_case']);
    expect(kinds("m.get('600.60.40(2)');")).toEqual(['regulation_id_literal@map_key']);
    expect(kinds('if (/900\\.3\\.10\\(5\\)/.test(t)) f();')).toEqual(['regulation_id_literal@regex']);
    expect(kinds("q(`UPDATE t SET a = 1 WHERE regulation_id IN ('10.20.40.70(1)', '10.20.40.70(2)')`);")).toEqual(['regulation_id_literal@sql_compare', 'regulation_id_literal@sql_compare']);
  });

  it('a const alias used in an executable position is followed one hop (and the declaration alone is data)', () => {
    expect(kinds("const ID = '900.3.10(5)';")).toEqual([]);
    expect(kinds("const ID = '900.3.10(5)'; if (x === ID) f();")).toEqual(['regulation_id_literal@comparison']);
    expect(kinds("const IDS = ['900.3.10(5)', '900.3.10(6)']; if (IDS.includes(x)) f();")).toEqual(['regulation_id_literal@array_membership', 'regulation_id_literal@array_membership']);
    expect(kinds("const S = new Set(['900.3.10(5)']); if (S.has(x)) f();")).toEqual(['regulation_id_literal@array_membership']);
    expect(hits("const ID = '900.3.10(5)'; if (x === ID) f();")[0]?.via).toBe('const_alias');
  });
});

describe('G-EXC-LIT — exception numbers and parcel ids (known-bad)', () => {
  it.each([
    ["if (r.exception_number === 5) f();", 'exception_number_literal@comparison'],
    ["switch (exceptionNumber) { case 812: f(); }", 'exception_number_literal@switch_case'],
    ["const EXCEPTION_RULES = { 5: 1 };", 'exception_number_literal@object_key'],
    ["const v = EXCEPTION_RULES[5];", 'exception_number_literal@key_lookup'],
    ["if (zone.label === '(x5)') f();", 'exception_number_literal@comparison'],
    ["if ([5, 7].includes(row.exception_number)) f();", 'exception_number_literal@array_membership'],
    ["q('SELECT 1 FROM z WHERE exception_number = 812');", 'exception_number_literal@sql_compare'],
    ["if (p.parcel_id === '1234567') f();", 'parcel_id_literal@comparison'],
    ["if (parcel.id === 98765) f();", 'parcel_id_literal@comparison'],
    ["if (parcelIds.includes(98765)) f();", 'parcel_id_literal@array_membership'],
    ["q('UPDATE parcels SET x = 1 WHERE parcel_id IN (11, 12)');", 'parcel_id_literal@sql_compare'],
  ])('%s → %s', (src, want) => {
    expect(kinds(src)).toContain(want);
  });
});

describe('G-EXC-LIT — review-lens regressions (DeepSeek idempotency lens, adjudicated by execution)', () => {
  it('a parcel-named call receiver of .id is found (the pre-filter does not skip it)', () => {
    expect(X.mayHit('if (getParcel().id === 123456) f();')).toBe(true);
    expect(kinds('if (getParcel().id === 123456) f();')).toEqual(['parcel_id_literal@comparison']);
  });
  it('a scalar merely containing "exception" is not an exception number; a collection named so is', () => {
    expect(hits('if (exceptionCount === 3 || hasException === 1) f();')).toEqual([]);
    expect(kinds('const v = EXCEPTION_RULES[5];')).toEqual(['exception_number_literal@key_lookup']);
  });
  it('SQL-shaped text inside a log / error message is not executable; a real query is', () => {
    expect(hits("console.log(\"cannot select the regulation from the map where code = '10.20.40.70(1)'\");")).toEqual([]);
    expect(hits("throw new Error(\"select x from t where regulation_id = '10.20.40.70(1)'\");")).toEqual([]);
    expect(kinds("catalog.query(\"SELECT x FROM t WHERE regulation_id = '10.20.40.70(1)'\");")).toEqual(['regulation_id_literal@sql_compare']);
  });
  it('IN-list duplicates are each counted; numeric separators are ids, reported as written', () => {
    expect(kinds("q('UPDATE parcels SET x = 1 WHERE parcel_id IN (5, 5)');")).toEqual(['parcel_id_literal@sql_compare', 'parcel_id_literal@sql_compare']);
    expect(hits('if (p.parcel_id === 1_234_567) f();').map((h) => h.literal)).toEqual(['1_234_567']);
  });
  it('a method / accessor / class member named by an id is an object_key', () => {
    expect(kinds("const H = { '10.20.40.70(1)'() { return 1; } };")).toEqual(['regulation_id_literal@object_key']);
    expect(kinds("class H { '900.3.10(5)' = 1; }")).toEqual(['regulation_id_literal@object_key']);
    expect(kinds("const ID = '900.3.10(5)'; const H = { [ID]: 1, plain: 2 };")).toEqual(['regulation_id_literal@object_key']); // computed alias kept
    expect(hits("const H = { plain: '900.3.10(5)', other() { return 1; } };")).toEqual([]);
  });
  it('.mts / .cts files are scanned', () => {
    const base = Object.fromEntries(X.SCOPE_RULES.filter((r: Json) => r.path).map((r: Json) => [r.path, '']));
    const r = run({ ...base, 'scripts/analysis/bylaw/fx.mts': "if (x === '10.20.40.70(1)') f();" });
    expect(r.violations.some((v: string) => v.includes('fx.mts'))).toBe(true);
  });
  it('a null allow entry fails as allow_entry_invalid (never throws); no blocking file is vacuous (scope_rule_orphan)', () => {
    const base = Object.fromEntries(X.SCOPE_RULES.filter((r: Json) => r.path).map((r: Json) => [r.path, '']));
    expect(codes(run({ ...base, [BY]: '' }, { allow: [null] }))).toContain('allow_entry_invalid');
    const v = run({ 'src/a.ts': '' }, { scope: [{ prefix: 'src/', mode: 'report_only', reason: 'legacy_code_m25_hold' }] });
    expect(v.violations).toEqual(['scope_rule_orphan: no file is in blocking scope (the gate would pass vacuously)']);
  });
});

describe('G-EXC-LIT — review-lens regressions, round 2 (spec + error-paths lenses, adjudicated by execution)', () => {
  it.each([
    ['a range branch on an exception number', 'if (row.exception_number >= 445) f();', 'exception_number_literal@comparison'],
    ['an EXC_-named table', 'const v = EXC_RULES[445]; excMap.get(445);', 'exception_number_literal@key_lookup'],
    ['a bare article id against regulation_id', "if (row.regulation_id === '900.1.10') f();", 'regulation_id_literal@comparison'],
    ['a prefix branch on a unit id', "if (u.unit_id.startsWith('10.20.40.70')) f();", 'regulation_id_literal@comparison'],
    ['a literal on the left of a SQL comparison', "q(\"SELECT 1 FROM t WHERE '10.20.40.70(1)' = regulation_id\");", 'regulation_id_literal@sql_compare'],
    ['numeric ANY(ARRAY[…])', "q('SELECT 1 FROM z WHERE exception_number = ANY(ARRAY[445, 812])');", 'exception_number_literal@sql_compare'],
    ['an element of a parcel collection', 'if (parcels[0].id === 98765) f();', 'parcel_id_literal@comparison'],
    ['an escaped id (cooked text)', "if (x === '10.20.40.70\\u00281\\u0029') f();", 'regulation_id_literal@comparison'],
  ])('%s', (_n, src, want) => {
    expect(kinds(src)).toContain(want);
  });

  it('a SQL hit reports the line of the literal, not of the template start', () => {
    expect(hits("q(`SELECT 1\n  FROM t\n  WHERE regulation_id = '10.20.40.70(1)'`);").map((h) => h.line)).toEqual([3]);
  });

  it('a blocking file that does not parse fails as source_unparsed; a file no rule matches fails closed', () => {
    const base = Object.fromEntries(X.SCOPE_RULES.filter((r: Json) => r.path).map((r: Json) => [r.path, '']));
    expect(codes(run({ ...base, [BY]: "const a = ; if (x === '10.20.40.70(1)') f();" }))).toContain('source_unparsed');
    expect(codes(run({ ...base, 'tools/x.js': '' }, { scope: [...X.SCOPE_RULES] }))).toContain('scope_rule_invalid');
  });
});

describe('G-EXC-LIT — the parse pre-filter is sound', () => {
  it('every known-bad source used in this file passes mayHit (a file the pre-filter skips cannot hit)', () => {
    for (const src of [
      "if (x === '10.20.40.70(1)') f();", 'if (/10\\.20\\.40\\.70\\(1\\)/.test(t)) f();', "if (zone.label === '(x5)') f();",
      'if (r.exception_number === 5) f();', "if (parcel.id === 98765) f();", "if (parcelIds.includes(98765)) f();",
      "q('UPDATE parcels SET x = 1 WHERE parcel_id IN (11, 12)');", "const v = EXCEPTION_RULES[5];",
    ]) {
      expect(X.mayHit(src), src).toBe(true);
      expect(hits(src).length, src).toBeGreaterThan(0);
    }
  });

  it('a file with no id shape and no id-named counterpart is skipped', () => {
    expect(X.mayHit("if (row.storeys === 5) f(); console.log('front yard');")).toBe(false);
  });
});

describe('G-EXC-LIT — good twins (not executable, or not an id)', () => {
  it.each([
    ['comment', "// see 10.20.40.70(1) and exception 900.3.10(5)\n/* parcel_id === 12345 */ const a = 1;"],
    ['log string', "console.log('applying 10.20.40.70(1)'); logError('x', err, { reg: '900.3.10(5)' });"],
    ['thrown message', "throw new Error(`regulation 10.20.40.70(1) is not in the table`);"],
    ['data value / call argument', "regRow('10.20.40.70(1)', '(1) Front Yard ...'); const row = { regulation_id: '800.50(445)' };"],
    ['a shape regex, not a literal id', 'const RE = /\\d{1,3}(\\.\\d{1,3}){1,4}\\(\\d+\\)/; if (RE.test(t)) f(); if (/\\(x(\\d+)\\)/.test(z)) g();'],
    ['exception presence checks and sentinels', "if (r.exception_number != null && r.exception_number > 0) f(); if (r.exception_number === 0) g(); if (r.exception_number === -1) h();"],
    ['a number compared with a non-id name', "if (row.storeys === 5) f(); switch (n) { case 812: g(); }"],
    ['a parameterised SQL id', "q('SELECT * FROM parcels WHERE parcel_id = $1 AND exception_number = $2', [a, b]);"],
    ['an IPv4 address and a semver are not regulation ids', "if (host === '127.0.0.1' || v === '1.2.3') f();"],
    ['non-SQL template with an id', 'const msg = `see 10.20.40.70(1)`;'],
  ])('%s', (_n, src) => {
    expect(hits(src)).toEqual([]);
  });
});

describe('G-EXC-LIT — scope split (data) and pass/fail', () => {
  const BAD = "if (x === '10.20.40.70(1)') f();";

  it('a hit in a McBylaw module or a NEW compute file blocks; in legacy compute it is report-only; tests are excluded', () => {
    expect(X.classify(BY).mode).toBe('blocking');
    expect(X.classify('scripts/generate-bylaw-provisions.mjs').mode).toBe('blocking');
    expect(X.classify(NEW).mode).toBe('blocking');
    expect(X.classify(LEG).mode).toBe('report_only');
    expect(X.classify('src/lib/parcels/types.ts').mode).toBe('report_only');
    expect(X.classify(TST).mode).toBe('excluded');
    const base = Object.fromEntries(X.SCOPE_RULES.filter((r: Json) => r.path).map((r: Json) => [r.path, '']));
    expect(run({ ...base, [BY]: BAD }).pass).toBe(false);
    expect(run({ ...base, [NEW]: BAD }).pass).toBe(false);
    const leg = run({ ...base, [LEG]: BAD });
    expect(leg.pass).toBe(true);
    expect(leg.counts.report_only).toBe(1);
    expect(leg.findings[0]).toMatchObject({ file: LEG, mode: 'report_only', kind: 'regulation_id_literal', position: 'comparison' });
    const tst = run({ ...base, [TST]: BAD });
    expect(tst.pass).toBe(true);
    expect(tst.findings).toEqual([]);
  });

  it('every scope rule carries a closed mode and a reason; first match wins; a missing explicit path is scope_rule_orphan', () => {
    for (const r of X.SCOPE_RULES) {
      expect(X.SCOPE_MODES).toContain(r.mode);
      expect(X.SCOPE_REASONS).toContain(r.reason);
      expect(Boolean(r.path) !== Boolean(r.prefix)).toBe(true);
    }
    expect(codes(run({ [BY]: '' }))).toContain('scope_rule_orphan');
    expect(codes(run({ [BY]: '' }, { scope: [{ prefix: 'scripts/', mode: 'sometimes', reason: 'x' }] }))).toContain('scope_rule_invalid');
  });

  it('the blocking / report-only split is recorded on every finding and counted', () => {
    const base = Object.fromEntries(X.SCOPE_RULES.filter((r: Json) => r.path).map((r: Json) => [r.path, '']));
    const r = run({ ...base, [BY]: BAD, [LEG]: BAD });
    expect(r.counts).toMatchObject({ blocking: 1, report_only: 1, allowed: 0 });
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatch(/^regulation_id_literal: scripts\/analysis\/bylaw\/fx-mod\.mjs:1 comparison /);
  });
});

describe('G-EXC-LIT — the allow-list (closed, tested both directions)', () => {
  const base = (): Record<string, string> => Object.fromEntries(X.SCOPE_RULES.filter((r: Json) => r.path).map((r: Json) => [r.path, '']));
  const SRC = "export function selfTest() { return t.join() === '800.50(290)'; }\nexport function live(x) { return x === '800.50(290)'; }";

  it('an entry scoped to a function silences only that function', () => {
    const allow = [{ path: BY, function: 'selfTest', reason: 'self_test_fixture', note: 'known-bad / good-twin fixture data' }];
    const r = run({ ...base(), [BY]: SRC }, { allow });
    expect(r.counts.allowed).toBe(1);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toContain(':2 ');
  });

  it('direction 1 — removing the entry turns the silenced hit back into a violation', () => {
    const r = run({ ...base(), [BY]: SRC }, { allow: [] });
    expect(r.violations).toHaveLength(2);
  });

  it('direction 2 — an entry that silences nothing is allow_entry_orphan', () => {
    const allow = [{ path: BY, function: 'nothingHere', reason: 'self_test_fixture', note: 'x' }];
    expect(codes(run({ ...base(), [BY]: SRC }, { allow }))).toContain('allow_entry_orphan');
  });

  it('an entry with a reason outside the closed set, no note, or a non-blocking path is allow_entry_invalid', () => {
    for (const e of [
      { path: BY, function: 'selfTest', reason: 'because', note: 'x' },
      { path: BY, function: 'selfTest', reason: 'self_test_fixture' },
      { path: LEG, reason: 'authored_fixture_module', note: 'x' },
    ]) expect(codes(run({ ...base(), [BY]: SRC, [LEG]: SRC }, { allow: [e] }))).toContain('allow_entry_invalid');
  });

  it('the committed allow-list is closed: every entry has a closed reason and a note', () => {
    for (const e of X.ALLOW_LIST) {
      expect(X.ALLOW_REASONS).toContain(e.reason);
      expect(typeof e.note === 'string' && e.note.length > 10).toBe(true);
    }
  });
});
