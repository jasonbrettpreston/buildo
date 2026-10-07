// SPEC LINK: docs/specs/01-pipeline/69_mcbylaw_policy.md M-21 (seed from the page; 12 UNVERIFIED legacy claims
//            retired; legacy C/L/G/H ids rewritten once to regulation_id; absence claims re-derived once);
//            docs/specs/01-pipeline/68_mcbylaw_standard.md §6 (unit id `regulation_id#clause_path`; no permanent alias
//            field), §6.1 (external.json refs), §9 (G-ALIAS cut → one-time S12/S13 migration);
//            docs/reports/mcbylaw-phase1-plan.md S12
//
// S12 unit tests (pure, synthetic inputs): the Spec 67 appendix parser, citation tokens, the page locator
// (unit vs row targets, ambiguity → authored pick, wrong citation → authored relocation), absence re-derivation,
// and one known-bad fixture per validateMap / driftViolations reason code with its good twin.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
// A missing module fails every test that uses it (red-first evidence records per-test failures), never silently passes.
const load = (rel: string): Promise<Json> => import(pathToFileURL(path.join(process.cwd(), rel)).href).catch((err: unknown) => ({ importError: String(err) }));
const L = await load('scripts/analysis/bylaw/legacy.mjs');

// ---- a synthetic page + slice -------------------------------------------------------------------------------
const PAGE = [
  '10.1.1 Setbacks',
  '(1) Front Yard The required front yard setback is 6.0 metres.',
  '(2) Rear Yard The required rear yard setback is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth.',
  '10.1.2 Height',
  '(1) Height The permitted height is: (A) the mapped value; or (B) if no value is mapped, 10.0 metres; (C) for a houseplex, 10.0 metres.',
  '10.1.3 Uses',
  '(1) Building Types A dwelling unit is permitted in: (A) Detached House; (B) (Deleted by By-law 1-2025)',
].join(' ');

type Clause = [path: string, leaf: boolean, text: string];
function row(regulationId: string, article: string, clauses: Clause[]): Json {
  const first = PAGE.indexOf(clauses[0]?.[2] ?? '');
  let cursor = first;
  const cs = clauses.map(([p, leaf, text]) => {
    const at = PAGE.indexOf(text, cursor);
    if (at < 0) throw new Error(`fixture text not on page: ${text}`);
    cursor = at + text.length;
    const ancestors = clauses.filter(([q, lf]) => !lf && q !== p && p.startsWith(q)).map(([q]) => q);
    return { ancestors, leaf, origin: 'cell', path: p, ranges: [[at - first, at - first + text.length]], text };
  });
  const end = cursor;
  return { article, clauses: cs, end, page: 'pg', regulation_id: regulationId, retired: false, start: first, verbatim: PAGE.slice(first, end) };
}
const ROWS = [
  row('10.1.1(1)', '10.1.1', [['(1)', true, '(1) Front Yard The required front yard setback is 6.0 metres.']]),
  row('10.1.1(2)', '10.1.1', [['(2)', false, '(2) Rear Yard The required rear yard setback is the greater of:'], ['(2)(A)', true, '(A) 7.5 metres; or'], ['(2)(B)', true, '(B) 25% of the lot depth.']]),
  row('10.1.2(1)', '10.1.2', [['(1)', false, '(1) Height The permitted height is:'], ['(1)(A)', true, '(A) the mapped value; or'], ['(1)(B)', true, '(B) if no value is mapped, 10.0 metres;'], ['(1)(C)', true, '(C) for a houseplex, 10.0 metres.']]),
  row('10.1.3(1)', '10.1.3', [['(1)', false, '(1) Building Types A dwelling unit is permitted in:'], ['(1)(A)', true, '(A) Detached House;'], ['(1)(B)', true, '(B) (Deleted by By-law 1-2025)']]),
];
const SLICE = { rows: ROWS, slicer_version: 'fixture' };
const PAGE_TEXT = { pg: PAGE };
const claim = (id: string, cited: string, quote: string, kind = 'verbatim'): Json => ({ cited, evidence: [{ page: null, text: quote }], family: id[0], kind, legacy_id: id, source_result: kind === 'unverified' ? 'UNVERIFIED' : 'VERIFIED' });
const build = (claims: Json[], decisions: Json = {}): Json => L.buildMap({ claims, decisions, pageText: PAGE_TEXT, slice: SLICE });
const frag = (m: Json, key: string): Json => m.fragments.find((f: Json) => f.key === key);

describe('S12 parser: Spec 67 appendices → legacy claims', () => {
  const SPEC = [
    '# Spec 67', 'body cites G1 and L2', '',
    '## Appendix A — quoted by-law claims *(generated)*', '',
    '| Claim | Origin | Cited section(s) | Quote | Result | Page(s) | fetched_at | Page text |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| C1 | NF-1 · By-law claim | §10.1.1 | "the required front yard setback... is 6.0 metres" | VERIFIED (excerpt) | [pg](x) | t | — |',
    '| C2 | NF-2 · By-law claim | §10.1.2 | "a sentence nobody can find" | UNVERIFIED | [pg](x) | t | — |',
    '| C3 | NF-3 · By-law claim | (inherited) pg | "hard landscaping" | ABSENCE PHRASE (verified by count via ledger L3) | [pg](x) | t | — |', '',
    '## Appendix B — ledger', '',
    '| ID | Topic | Section | Verbatim text | URL | Verified |', '| :--- | :--- | :--- | :--- | :--- | :--- |',
    '| L1 | Rear | §10.1.1(2)(A)(B) | "(2) Rear Yard The required rear yard setback is the greater of: (A) 7.5 metres; or (B) 25% of the lot depth." | u | PASS |',
    '| L3 | Hard landscaping | Chapter 800 (absence) | *(absence claim)* The phrase "hard landscaping" does not occur. | u | PASS |', '',
    '**Corrections/additions to existing rows (ported verbatim):**', '',
    '| Existing row | What | Ledger ids |', '| :--- | :--- | :--- |', '| NF-12 | x | L1 |', '',
    '**Re-verification against this run\'s fetch *(generated)*:**', '',
    '| Ledger | Section | Kind | Re-verified | Pages / counts | URL | fetched_at |', '| --- | --- | --- | --- | --- | --- | --- |',
    '| L1 | §10.1.1(2) | verbatim | PASS | pg | u | t |',
    '| L3 | Chapter 800 (absence) | absence | PASS | hard landscaping@pg=0/0, \\bpatios?\\b@pg=0/0 | u | t |', '',
    '## Appendix C — grounding extracts G1–G1 and absence checks *(generated)*', '',
    '| G | Section | Topic | Verbatim | URL | fetched_at |', '| --- | --- | --- | --- | --- | --- |',
    '| G1 | §10.1.1(1)-(2) | setbacks | "10.1.1 Setbacks (1) Front Yard The required front yard setback is 6.0 metres. (2) Rear Yard" | u | t |', '',
    '| A | Claim | Result | Counts |', '| --- | --- | --- | --- |',
    '| A1 | No houseplex clause in 10.1.1 | PASS | "houseplex"@pg=1 (expect 1) |', '',
    '## Appendix D — vector self-check', '',
    '## Appendix E — provisions H1–H1 *(generated)*', '',
    '| H | Section | Topic | Verbatim | URL | fetched_at |', '| --- | --- | --- | --- | --- | --- |',
    '| H1 | §10.1.3(1) | types | "A dwelling unit is permitted in: (A) Detached House;" | u | t |', '',
  ].join('\n');

  it('reads every C/L/G/A/H row with its kind, and never the corrections or re-verification rows as claims', () => {
    const claims = L.parseLegacy(SPEC);
    expect(claims.map((c: Json) => `${c.legacy_id}:${c.kind}`)).toEqual(['A1:absence', 'C1:verbatim', 'C2:unverified', 'C3:absence', 'G1:verbatim', 'H1:verbatim', 'L1:verbatim', 'L3:absence']);
  });
  it('parses absence probes from the re-verification counts (L) and the A table (quoted literal)', () => {
    const claims = L.parseLegacy(SPEC);
    expect(claims.find((c: Json) => c.legacy_id === 'L3').probes).toEqual([
      { expect: 0, legacy_page: 'pg', pattern: 'hard landscaping', regex: true },
      { expect: 0, legacy_page: 'pg', pattern: '\\bpatios?\\b', regex: true },
    ]);
    expect(claims.find((c: Json) => c.legacy_id === 'A1').probes).toEqual([{ expect: 1, legacy_page: 'pg', pattern: 'houseplex', regex: false }]);
  });
  it('maps the whole synthetic inventory with no problems (C3 borrows the L3 probe by phrase)', () => {
    const claims = L.parseLegacy(SPEC);
    const m = build(claims);
    expect(m.problems).toEqual([]);
    expect(frag(m, 'C1@10.1.1(1)').target).toEqual({ id: '10.1.1(1)#(1)', kind: 'unit' });
    expect(frag(m, 'C2@10.1.2').target).toEqual({ kind: 'retired', reason: 'unverified_claim' });
    expect(frag(m, 'L1@10.1.1(2)').target).toEqual({ id: '10.1.1(2)', kind: 'row', units: ['10.1.1(2)#(2)(A)', '10.1.1(2)#(2)(B)'] });
    expect(frag(m, 'G1@10.1.1(1)').target.kind).toBe('unit');
    expect(frag(m, 'G1@10.1.1(2)').target).toEqual({ id: '10.1.1(2)', kind: 'row', units: [] });
    expect(m.absence.find((a: Json) => a.legacy_id === 'C3').probes.map((p: Json) => p.via)).toEqual(['L3']);
    expect(m.absence.every((a: Json) => a.holds)).toBe(true);
  });
});

describe('S12 citation tokens', () => {
  it.each([
    ['§10.20.40.70, §10.40.40.70', [['article', '10.20.40.70'], ['article', '10.40.40.70']]],
    ['§10.20.40.70(1)-(3)', [['regulation', '10.20.40.70(1)'], ['regulation', '10.20.40.70(2)'], ['regulation', '10.20.40.70(3)']]],
    ['§800.50(100)/(105)', [['regulation', '800.50(100)'], ['regulation', '800.50(105)']]],
    ['§10.5.100.1(1)(A)-(D)', [['regulation', '10.5.100.1(1)']]],
    ['§10.20.80.1(1)(D) (same text §10.40.80.1(1)(D))', [['regulation', '10.20.80.1(1)'], ['regulation', '10.40.80.1(1)']]],
    ['(inherited) ch10_60, ch10_80', [['page', 'ch10_60'], ['page', 'ch10_80']]],
    ['Zoning_readme.txt (City open data)', []],
  ])('%s', (cited, expected) => {
    expect(L.citationTokens(cited).map((t: Json) => [t.kind, t.id])).toEqual(expected);
  });
});

describe('S12 locator: seeded from the page', () => {
  it('splits a quote on ellipses and drops trailing punctuation (the legacy verifier\'s rule)', () => {
    expect(L.piecesOf('"if regulation (1) does not apply... is 6.0 metres."'.replace(/"/g, ''))).toEqual(['if regulation (1) does not apply', 'is 6.0 metres']);
  });
  it('overlaps: containment either way, or a ≥ 20-char prefix/suffix overlap; nothing shorter', () => {
    const hay = L.squeeze('(B) 25% of the lot depth and some more words here').s;
    expect(L.overlaps(L.squeeze('25% of the lot depth').s, hay)).toBe(true);
    expect(L.overlaps(L.squeeze('the greater of: (A) 7.5 metres; or (B) 25% of the lot depth and').s, hay)).toBe(true);
    expect(L.overlaps(L.squeeze('a sentence about nothing at all here').s, hay)).toBe(false);
  });
  it('a quote matching two leaves is ambiguous until an authored pick chooses one of the matches', () => {
    const c = claim('C9', '§10.1.2', '...10.0 metres');
    const open = build([c]);
    expect(open.problems).toEqual([expect.stringMatching(/^fragment_ambiguous: C9@pg .*10\.1\.2\(1\)#\(1\)\(B\) \| 10\.1\.2\(1\)#\(1\)\(C\)/)]);
    expect(frag(open, 'C9@pg').target.kind).toBe('unlocated');
    const picked = build([c], { picks: { 'C9@pg': '10.1.2(1)#(1)(B)' } });
    expect(picked.problems).toEqual([]);
    expect(frag(picked, 'C9@10.1.2(1)').target).toEqual({ id: '10.1.2(1)#(1)(B)', kind: 'unit' });
    const wrong = build([c], { picks: { 'C9@pg': '10.1.1(1)#(1)' } });
    expect(wrong.problems).toEqual([expect.stringMatching(/^fragment_ambiguous: .*decision 10\.1\.1\(1\)#\(1\) not among them/), 'decision_unused: picks C9@pg was not applied (stale or unnecessary)']);
  });
  it('a quote outside its cited article is never relocated silently; an authored relocation is accepted and flagged', () => {
    const c = claim('H9', '§10.1.1(1)', 'A dwelling unit is permitted in: (A) Detached House;');
    const open = build([c]);
    expect(open.problems).toEqual([expect.stringMatching(/^fragment_not_located: H9@pg — not in the cited article; found elsewhere on the page: \[10\.1\.3\(1\)#\(1\)\(A\)\]/)]);
    const ok = build([c], { relocate: { 'H9@pg': '10.1.3(1)#(1)(A)' } });
    expect(ok.problems).toEqual([]);
    expect(frag(ok, 'H9@10.1.3(1)')).toMatchObject({ relocated: true, target: { id: '10.1.3(1)#(1)(A)', kind: 'unit' }, token: '10.1.1(1)' });
  });
  it('an authored retirement replaces the fragment; a quote found nowhere is not_located', () => {
    const r = build([claim('C8', '§10.1.1, §10.1.2', 'no such words anywhere')], { retire: { 'C8@10.1.1': { reason: 'quote_not_in_cited_article', why: 'w' } } });
    expect(frag(r, 'C8@10.1.1').target).toEqual({ kind: 'retired', reason: 'quote_not_in_cited_article' });
    expect(r.problems).toEqual(['fragment_not_located: C8@10.1.2 — quote not found on the current page']);
  });
  it('a claim with no by-law citation is not located unless an external decision maps it', () => {
    const c = claim('H8', 'Zoning_readme.txt', 'STAND_SET = something');
    expect(build([c]).problems).toEqual([expect.stringMatching(/^fragment_not_located: H8@whole/)]);
    expect(frag(build([c], { external: { H8: 'REF-1' } }), 'H8@whole').target).toEqual({ id: 'REF-1', kind: 'external' });
  });
  it('re-derives absence probes on the current page: a changed count is absence_not_holding', () => {
    const a: Json = { cited: '(absence)', evidence: [], family: 'A', kind: 'absence', legacy_id: 'A9', probes: [{ expect: 0, legacy_page: 'pg', pattern: 'houseplex', regex: false }], statement: 's' };
    const m = build([a]);
    expect(m.absence[0]).toMatchObject({ holds: false, probes: [{ count: 1, holds: false }] });
    expect(m.problems).toEqual(['absence_not_holding: A9 houseplex@pg=1 (expect 0)']);
    expect(build([{ ...a, probes: [{ ...a.probes[0], expect: 1 }] }]).problems).toEqual([]);
  });
  it('a failed absence is not a retirement (stays unlocated); a malformed pattern or unparsed entry never holds', () => {
    const a: Json = { cited: '(absence)', evidence: [], family: 'A', kind: 'absence', legacy_id: 'A9', probes: [{ expect: 0, legacy_page: 'pg', pattern: '(unclosed', regex: true }], statement: 's' };
    const m = build([a]);
    expect(frag(m, 'A9@absence').target).toEqual({ kind: 'unlocated' });
    expect(m.absence[0].probes[0]).toMatchObject({ count: null, holds: false });
    expect(L.parseProbes('x@pg=0/0, y@pg=0/0').length).toBe(2);
    expect(L.parseProbes('x@pg=0/0, y"@pg=0/0').some((p: Json) => p.parse_error)).toBe(true);
  });
  it('decision_unused: an authored decision the build never applies is reported (both directions)', () => {
    const c = claim('C1', '§10.1.1', 'the required front yard setback is 6.0 metres');
    expect(build([c]).problems).toEqual([]);
    expect(build([c], { picks: { 'C1@pg': '10.1.1(1)#(1)' } }).problems).toEqual(['decision_unused: picks C1@pg was not applied (stale or unnecessary)']);
    expect(build([c], { retire: { 'C1@10.9.9': { reason: 'quote_not_in_cited_article' } } }).problems).toEqual(['decision_unused: retire C1@10.9.9 was not applied (stale or unnecessary)']);
  });
  it('a §<article> (absence) claim counts only inside that article', () => {
    const a: Json = { cited: '§10.1.1 (absence)', evidence: [], family: 'L', kind: 'absence', legacy_id: 'L9', probes: [{ expect: 0, legacy_page: 'pg', pattern: 'houseplex', regex: true }], statement: 's' };
    expect(build([a]).absence[0].holds).toBe(true);
  });
});

// ---- validateMap: one known-bad fixture per reason code + the good twin ---------------------------------------
describe('S12 validateMap reason codes (both directions)', () => {
  const CLAIMS = [claim('C1', '§10.1.1', 'the required front yard setback is 6.0 metres'), claim('C2', '§10.1.2', 'gone', 'unverified')];
  const DECISIONS: Json = { adoption_id: 'adoption-x', proposed_refs: [{ id: 'REF-1' }] };
  const goodDoc = (): Json => {
    const built = L.buildMap({ claims: CLAIMS, decisions: DECISIONS, pageText: PAGE_TEXT, slice: SLICE });
    return L.assembleMap({ built, claims: CLAIMS, decisions: DECISIONS, references: { 'spec67 body': { C1: 1 } }, slicerVersion: 'fixture' });
  };
  const check = (doc: Json, extra: Json = {}): string[] => L.validateMap({ claims: CLAIMS, decisions: DECISIONS, doc, external: { entries: [] }, slice: SLICE, ...extra }).violations.map((v: string) => v.split(':')[0]);
  const mutate = (fn: (d: Json) => void): Json => { const d = goodDoc(); fn(d); return d; };

  it('good twin passes', () => {
    expect(check(goodDoc())).toEqual([]);
  });
  it.each([
    ['legacy_source_mismatch', (d: Json) => { d.adoption_id = 'adoption-y'; }],
    ['legacy_id_unmapped', (d: Json) => { d.fragments = d.fragments.filter((f: Json) => f.legacy_id !== 'C1'); }],
    ['legacy_id_unknown', (d: Json) => { d.references = { 'spec58 §13': { C99: 1 } }; }],
    ['fragment_duplicate', (d: Json) => { d.fragments.push({ ...d.fragments[0] }); }],
    ['fragment_target_invalid', (d: Json) => { d.fragments[0].target = { id: '10.9.9(9)#(9)', kind: 'unit' }; }],
    ['fragment_target_invalid', (d: Json) => { d.fragments[0].target = { id: 'REF-9', kind: 'external' }; }],
    ['fragment_target_invalid', (d: Json) => { d.fragments[0].target = { id: 'x', kind: 'alias' }; }],
    ['fragment_evidence_missing', (d: Json) => { d.fragments[0].target = { id: '10.1.2(1)#(1)(A)', kind: 'unit' }; }],
    ['fragment_ambiguous', (d: Json) => { d.fragments[0].target = { kind: 'unlocated' }; d.fragments[0].candidates = ['a', 'b']; }],
    ['fragment_not_located', (d: Json) => { d.fragments[0].target = { kind: 'unlocated' }; }],
    ['retire_reason_invalid', (d: Json) => { d.fragments[1].target = { kind: 'retired', reason: 'because' }; }],
    ['retire_reason_invalid', (d: Json) => { d.fragments[0].target = { kind: 'retired', reason: 'unverified_claim' }; }],
    ['retire_reason_invalid', (d: Json) => { d.fragments[1].target = { id: '10.1.1(1)#(1)', kind: 'unit' }; d.fragments[1].evidence = ['the required front yard setback is 6.0 metres']; }],
    ['absence_not_holding', (d: Json) => { d.absence = [{ holds: false, legacy_id: 'C1', probes: [] }]; }],
  ])('%s', (code, fn) => {
    expect(check(mutate(fn as (d: Json) => void))).toContain(code);
  });
  it('legacy_id_unknown on a decision that names no inventory id', () => {
    expect(L.validateMap({ claims: CLAIMS, decisions: { ...DECISIONS, picks: { 'C77@pg': 'x' } }, doc: goodDoc(), external: { entries: [] }, slice: SLICE }).violations).toEqual(['legacy_id_unknown: decision C77@pg']);
  });
  it('map_drift: the committed text must equal the canonical regeneration (JSON and MD), both directions', () => {
    const d = goodDoc();
    expect(L.driftViolations({ doc: d, json: L.canonical(d), md: L.renderMap(d) })).toEqual([]);
    expect(L.driftViolations({ doc: d, json: L.canonical(d).replace('"C1"', '"C01"'), md: L.renderMap(d) })).toEqual([expect.stringMatching(/^map_drift: .*\.json/)]);
    expect(L.driftViolations({ doc: d, json: L.canonical(d), md: null })).toEqual([expect.stringMatching(/^map_drift: .*\.md/)]);
  });
  it('canonical() is deterministic: sorted keys, LF, one trailing newline', () => {
    const t = L.canonical({ b: 1, a: { d: 2, c: 3 } });
    expect(t).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  });
});
