// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-11, MF-62: the loading state "What we checked"),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-35 (this file is its lock), FE-05 (the server formats), FE-06 (honest),
//            docs/specs/02-web-admin/128_surface_standard_policy.md Rule 16 (no maths on screen), Rule 17 (honest display).
//
// MF-62 · McFrontend queue · lane E. The FE-35 lock (operator 2026-11-11 "Mf-62 - yes"; "x-1 a of course, x-2 a x-3 a x-4 a - build this into
// McFront-end specs and rulings and handbook"). Five parts, each with planted faults (in-memory copies, never a file edit):
//   C1 the contract: `what_we_checked` only on a loading response; the tree's root-only `checked` object only on a loading tree; the one-message-node
//      rule unchanged; closed keys; values are strings (FE-05); a template with {value} takes a value, one without takes none; every text is a
//      content template; the pace is server data (integers, skip <= minimum).
//   C2 the claims lock over the content labels AND every composed golden text: no digit in a label, no satellite or aerial, no updated or latest,
//      no live-progress word, no chatbot or AI comparison, the by-law rules line and its neighbours never "checked", the citywide order pinned,
//      the gated and not-evaluated lines never "checked" (X-3 a), heritage reads "designated" (X-2 a).
//   C3 the goldens: loading_checked carries every line; loading_checked_gated has no limits count.
//   C4 the web render: one role="log" region; opacity-only fade with server delays on paced rows; the skip a link only with an href on paced rows;
//      pdf and admin draw no skip and no delay; ReportView keeps no state.
//   C5 the stylesheet: reduce motion and print show every line and the skip at once; the skip is revealed by visibility, base style visible.
// Dated 2026-11-11 (MF-62 follow-up; operator, verbatim, "Processing demo + choose-lot": "after the each fact runs - we need to paude and then
// have somet the possibilities report for the address is ready and then transisiton"; "1. I like pulling by-law results.  2. Just your report is
// ready is sufficent"; Landing v9 R1 "The Building Possibilities Report"): each line carries its loading verb (content `verbs`) and its resolve
// time; the ready line names the report and the address; "Skip" from the start; "View report" on the reduce-motion path; the announcement is
// "Your report is ready."; loading verbs are allowed ONLY in `verbs` and only as "Loading / Pulling / Matching …"; the old name is banned.
// No DB, no network.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { ReportRenderError, assertTree, buildTree, viewOf } from '../../lib/surfaces/report/core';
import { reportCtx } from '../../lib/surfaces/report/data';
import { ReportView } from '../../components/report/ReportView';
import { TARGETS, lifecycleOfState } from '../../../scripts/surfaces/report-checks.mjs';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON under test
const ROOT = process.cwd();
const GOLD = path.join(ROOT, 'src/tests/fixtures/surfaces/report');
const golden = (s: string, t: string): Json => JSON.parse(fs.readFileSync(path.join(GOLD, `${s}.${t}.json`), 'utf8'));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const problemsOf = (fn: () => unknown): string[] => {
  try { fn(); } catch (e) { if (e instanceof ReportRenderError) return e.problems; throw e; }
  return [];
};
const has = (ps: string[], prefix: string): boolean => ps.some((p) => p.startsWith(prefix));
const CHECKED = (reportCtx.content as Json).states.checked as Json;

// A synthetic response in the producer's shape (src/lib/parcels/what-we-checked.ts); the values are made up and server-formatted strings.
const wwc = (): Json => ({
  groups: [
    { key: 'citywide', lines: [
      { key: 'lots', value: '1,111', delay_ms: 0, done_ms: 100 }, { key: 'regulations', value: '2,222', delay_ms: 100, done_ms: 200 },
      { key: 'buildings', value: '3,333', delay_ms: 200, done_ms: 300 }, { key: 'builds', value: '4,444', delay_ms: 300, done_ms: 400 },
      { key: 'map_areas', value: '5,555', delay_ms: 400, done_ms: 500 },
    ] },
    { key: 'lot', lines: [
      { key: 'area', value: '99 m²', delay_ms: 500, done_ms: 600 }, { key: 'limits', value: '42', types: '3', delay_ms: 600, done_ms: 700 },
      { key: 'ravine_out', delay_ms: 700, done_ms: 800 }, { key: 'heritage_out', delay_ms: 800, done_ms: 900 }, { key: 'decisions', value: '7', delay_ms: 900, done_ms: 1000 },
    ] },
  ],
  dates: { lines: [{ key: 'bylaw', value: '2026-01-02' }, { key: 'permits', value: '2026-01-03' }], delay_ms: 1000 },
  skip_after_ms: 0,
  ready_ms: 1100,
  address: '1 Test Ave',
  min_ms: 1300,
});
const loading = (w: unknown = wwc()): Json => ({ lifecycle: 'loading', what_we_checked: w });

describe('C1 the contract (FE-35)', () => {
  it('a loading response with what_we_checked builds one message node and a root-only checked object of content texts', () => {
    const tree = buildTree(loading(), reportCtx);
    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0].field).toBe('status_text');
    expect('title' in tree.checked || 'log_label' in tree.checked).toBe(false); // operator 2026-11-11: no title, no section labels
    expect(tree.checked.groups.map((g: Json) => g.key)).toEqual(['citywide', 'lot']);
    expect('heading' in tree.checked.groups[0]).toBe(false);
    expect(tree.checked.groups[0].lines[0]).toEqual({ key: 'lots', text: CHECKED.lines.citywide.lots.replace('{value}', '1,111'), verb: CHECKED.verbs.citywide.lots, delay_ms: 0, done_ms: 100 });
    expect(tree.checked.groups[1].lines[2]).toEqual({ key: 'ravine_out', text: CHECKED.lines.lot.ravine_out, verb: CHECKED.verbs.lot.ravine_out, delay_ms: 700, done_ms: 800 });
    expect(tree.checked.groups[0].lines[1].verb).toBe('Pulling by-law results…'); // operator 2026-11-11: "I like pulling by-law results"
    expect(tree.checked.ready).toEqual({ text: 'The Building Possibilities Report for 1 Test Ave is ready.', at_ms: 1100 });
    expect(tree.checked.open).toEqual({ text: 'View report' });
    expect(tree.checked.dates).toEqual({ text: `${CHECKED.dates.bylaw.replace('{value}', '2026-01-02')} ${CHECKED.dates.permits.replace('{value}', '2026-01-03')}`, delay_ms: 1000 });
    expect(tree.checked.skip).toEqual({ text: 'Skip', after_ms: 0 }); // "Skip" from the start (WCAG 2.2.2); no "Show report" mid-animation
    expect(tree.checked.summary).toBe('Your report is ready.'); // the one announcement (accessibility audit 2026-11-11; operator "Just your report is ready is sufficent")
    expect(tree.checked.groups[1].lines[1].text).toBe(CHECKED.lines.lot.limits.replace('{value}', '42').replace('{types}', '3'));
    expect(tree.checked.min_ms).toBe(1300);
    expect(() => assertTree(tree, reportCtx)).not.toThrow();
  });
  it('the one lifecycle-of-state rule (report-checks.mjs, shared by surface-validate and the honest lock): a lifecycle value or its `<value>_` prefix', () => {
    expect(lifecycleOfState('loading')).toBe('loading');
    expect(lifecycleOfState('loading_checked')).toBe('loading');
    expect(lifecycleOfState('loading_checked_gated')).toBe('loading');
    expect(lifecycleOfState('miss_foo')).toBe('miss');
    for (const s of ['loadingx', 'permitted', 'images_present', 'xloading']) expect(lifecycleOfState(s)).toBeUndefined();
  });
  it('a plain loading response is unchanged (no checked object)', () => {
    expect(buildTree({ lifecycle: 'loading' }, reportCtx)).toEqual(golden('loading', 'web').rendered_tree);
  });
  it('what_we_checked on miss, error or a status response is refused', () => {
    expect(has(problemsOf(() => buildTree({ lifecycle: 'miss', what_we_checked: wwc() }, reportCtx)), 'RR-FIELD')).toBe(true);
    expect(has(problemsOf(() => buildTree({ lifecycle: 'error', what_we_checked: wwc() }, reportCtx)), 'RR-FIELD')).toBe(true);
    expect(has(problemsOf(() => buildTree({ status: 'permitted', what_we_checked: wwc() }, reportCtx)), 'RR-FIELD')).toBe(true);
  });
  it('a number value, a missing value, a value on a fixed line, an unknown key, an unknown group and a stray key are each refused', () => {
    const plant = (f: (w: Json) => void): string[] => { const w = wwc(); f(w); return problemsOf(() => buildTree(loading(w), reportCtx)); };
    expect(has(plant((w) => { w.groups[0].lines[0].value = 1111; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { delete w.groups[0].lines[0].value; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[1].lines[2].value = 'x'; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { delete w.groups[1].lines[1].types; }), 'RR-CHECKED')).toBe(true); // N-1: the house types are required
    expect(has(plant((w) => { w.groups[1].lines[1].types = 3; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[0].lines[0].types = '2'; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[1].lines[2].key = 'satellite'; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[0].key = 'world'; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.source = 'x'; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[0].lines[0].source = 'parcels'; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[1].lines = []; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.dates.lines[0].key = 'cost'; }), 'RR-CHECKED')).toBe(true);
  });
  it('the pace is server data: non-integer or negative delays, and a skip delay above the minimum, are refused', () => {
    const plant = (f: (w: Json) => void): string[] => { const w = wwc(); f(w); return problemsOf(() => buildTree(loading(w), reportCtx)); };
    expect(has(plant((w) => { w.groups[0].lines[0].delay_ms = 1.5; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[0].lines[0].delay_ms = -1; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.min_ms = '6000'; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.skip_after_ms = 5000; }), 'RR-CHECKED')).toBe(true);
  });
  it('the sequence is server data in order: a fact resolves after it shows, the ready line after every fact and by the minimum, the address a string', () => {
    const plant = (f: (w: Json) => void): string[] => { const w = wwc(); f(w); return problemsOf(() => buildTree(loading(w), reportCtx)); };
    expect(has(plant((w) => { delete w.groups[0].lines[0].done_ms; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.groups[0].lines[1].done_ms = 100; }), 'RR-CHECKED')).toBe(true); // not after its delay
    expect(has(plant((w) => { w.ready_ms = 900; }), 'RR-CHECKED')).toBe(true); // before the last fact resolves
    expect(has(plant((w) => { w.ready_ms = 1400; }), 'RR-CHECKED')).toBe(true); // after the report opens
    expect(has(plant((w) => { delete w.ready_ms; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.dates.delay_ms = 1200; }), 'RR-CHECKED')).toBe(true); // the dates after the ready line (code-reviewer CR-5)
    expect(has(plant((w) => { delete w.address; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.address = 48; }), 'RR-CHECKED')).toBe(true);
    expect(has(plant((w) => { w.address = ''; }), 'RR-CHECKED')).toBe(true);
  });
  it('assertTree: checked on a miss tree or a reading tree, checked beside a second node, and a text that is not a content template are refused', () => {
    const t = buildTree(loading(), reportCtx);
    const onMiss = { ...clone(golden('miss', 'web').rendered_tree), checked: clone(t.checked) };
    expect(has(problemsOf(() => assertTree(onMiss, reportCtx)), 'RR-LIFECYCLE')).toBe(true);
    const onReading = { ...clone(golden('permitted', 'web').rendered_tree), checked: clone(t.checked) };
    expect(has(problemsOf(() => assertTree(onReading, reportCtx)), 'RR-LIFECYCLE')).toBe(true);
    const two = clone(t);
    two.nodes.push(clone(two.nodes[0]));
    expect(has(problemsOf(() => assertTree(two, reportCtx)), 'RR-LIFECYCLE')).toBe(true);
    const free = clone(t);
    free.checked.groups[0].lines[1].text = '50,000 by-laws reviewed';
    expect(has(problemsOf(() => assertTree(free, reportCtx)), 'RR-CONTENT')).toBe(true);
    const title = clone(t); // a title or a section label is refused by the contract (operator 2026-11-11)
    title.checked.title = 'What we checked';
    expect(has(problemsOf(() => assertTree(title, reportCtx)), 'RR-SCHEMA')).toBe(true);
    const heading = clone(t);
    heading.checked.groups[0].heading = 'Across Toronto';
    expect(has(problemsOf(() => assertTree(heading, reportCtx)), 'RR-SCHEMA')).toBe(true);
    const summary = clone(t);
    summary.checked.summary = 'Reviewing your lot';
    expect(has(problemsOf(() => assertTree(summary, reportCtx)), 'RR-CONTENT')).toBe(true);
    const extra = clone(t);
    extra.checked.source = 'x';
    expect(has(problemsOf(() => assertTree(extra, reportCtx)), 'RR-SCHEMA')).toBe(true);
    const verb = clone(t);
    verb.checked.groups[0].lines[1].verb = 'Analysing 50,000 by-laws…';
    expect(has(problemsOf(() => assertTree(verb, reportCtx)), 'RR-CONTENT')).toBe(true);
    const ready = clone(t);
    ready.checked.ready.text = 'Your Build Possibilities report is ready.';
    expect(has(problemsOf(() => assertTree(ready, reportCtx)), 'RR-CONTENT')).toBe(true);
    const open = clone(t);
    open.checked.open.text = 'Open now';
    expect(has(problemsOf(() => assertTree(open, reportCtx)), 'RR-CONTENT')).toBe(true);
    const noVerb = clone(t);
    delete noVerb.checked.groups[0].lines[0].verb;
    expect(has(problemsOf(() => assertTree(noVerb, reportCtx)), 'RR-SCHEMA')).toBe(true);
    const strayReady = clone(t);
    strayReady.checked.ready.address = '1 Test Ave';
    expect(has(problemsOf(() => assertTree(strayReady, reportCtx)), 'RR-SCHEMA')).toBe(true);
  });
});

// ---- C2 the claims lock --------------------------------------------------------------------------------------------------------------------
const BANNED: Array<[string, RegExp]> = [
  ['satellite or aerial (D-3 a: no imagery held)', /satellite|aerial|orthoimag/i],
  ['updated or latest (cost rates are dated, not updated)', /\bupdated?\b|\blatest\b|\bup[- ]to[- ]date\b/i],
  ['live-progress word (past tense only; the work was done before)', /\b(checking|reviewing|scanning|analy[sz]ing|searching|examining|measuring|loading|real[- ]time|live)\b/i],
  ['chatbot or AI comparison (no prior test, s.74.01(1)(b))', /\bAI\b|\bA\.I\.|artificial intelligence|chat ?bot|chatgpt|\bGPT\b|\bLLM\b|machine learning|more (accurate|trustworthy|reliable) than/i],
  // OUTPUT panel N-3 (2026-11-11): the misleading families the first list missed.
  ['endorsement or guarantee (no City endorsement, no guarantee, s.74.01(1)(a))', /certified|official|approved by|endorsed|guarantee|verified|100 ?%|accurate/i],
  ['progress verb (past tense only)', /\b(processing|calculating|verifying|inspecting|computing|crunching)\b/i],
  ['freshness claim (data is dated, not current)', /\bcurrent\b|\brefreshed\b|\bfresh\b|\bnew data\b/i],
  ['imagery or survey claim (none held, D-3 a)', /drone|survey|imagery|street ?view|camera/i],
  // Landing v9 R1 (operator 2026-11-11, "1. y"): the report is "The Building Possibilities Report" everywhere; the old name is banned.
  ['the old report name (R1: The Building Possibilities Report)', /\bBuild Possibilities\b/i],
];
// R-VERB (operator 2026-11-11, verbatim "I like pulling by-law results"; open-questions.md "1. I like pulling by-law results.  2. Just your
// report is ready is sufficent") supersedes the live-progress ban for the verbs ONLY: a loading verb is allowed only in `verbs`, only as one of
// the stored-data verbs (the data is stored; the verb stages the read of it; nothing is measured, analysed or checked while the screen runs:
// plan section 6 general impression), one ellipsis, no digit. The exemption is the FIRST word only: the rest of a verb passes every banned
// family (plan-panel RG-1). The live-progress and progress-verb families stay on every other text. Residual risk for the lawyer check.
const VERB_RE = /^(Loading|Pulling|Matching) [a-z][a-z -]*[a-z]…$/;
/** Every problem of one verb: the allowed shape, then the full banned list over the words after the allowed first word. */
const verbProblems = (k: string, v: unknown): string[] => {
  if (typeof v !== 'string' || !VERB_RE.test(v)) return [`${k}: not a stored-data loading verb ("Loading / Pulling / Matching …")`];
  const rest = v.slice(v.indexOf(' ') + 1);
  return BANNED.filter(([, re]) => re.test(rest)).map(([why]) => `${k}: ${why}`);
};
// The ruled texts (verbatim): the ready line (R-SEQ + R1), the one announcement (R-VERB 2), the quiet skip (R-SEQ), the reduce-motion action.
const RULED = {
  ready: 'The Building Possibilities Report for {address} is ready.',
  summary: 'Your report is ready.',
  skip: 'Skip',
  open: 'View report',
};
const CHECKED_WORD = /\bchecked\b/i;
/** Every problem of one checked content block (labels only). */
export const contentProblems = (c: Json): string[] => {
  const out: string[] = [];
  const texts: Array<[string, string]> = [
    ['skip', c.skip], ['summary', c.summary], ['open', c.open], ['ready', c.ready],
    ...Object.entries(c.lines?.citywide ?? {}).map(([k, v]) => [`lines.citywide.${k}`, v] as [string, string]),
    ...Object.entries(c.lines?.lot ?? {}).map(([k, v]) => [`lines.lot.${k}`, v] as [string, string]),
    ...Object.entries(c.dates ?? {}).map(([k, v]) => [`dates.${k}`, v] as [string, string]),
  ];
  for (const [k, t] of texts) {
    if (typeof t !== 'string' || t.trim() === '') { out.push(`${k}: missing`); continue; }
    if (/\d/.test(t.replace(/\{(value|types|address)\}/g, ''))) out.push(`${k}: a digit in a label (numbers come from data)`);
    for (const [why, re] of BANNED) if (re.test(t)) out.push(`${k}: ${why}`);
  }
  for (const [k, want] of Object.entries(RULED)) if (c[k] !== want) out.push(`${k}: not the ruled text "${want}"`);
  for (const g of ['citywide', 'lot']) {
    const lines = Object.keys(c.lines?.[g] ?? {});
    const verbs = c.verbs?.[g] ?? {};
    for (const k of lines) if (typeof verbs[k] !== 'string') out.push(`verbs.${g}.${k}: missing (every line has its loading verb)`);
    for (const [k, v] of Object.entries(verbs)) {
      if (!lines.includes(k)) out.push(`verbs.${g}.${k}: no such line`);
      out.push(...verbProblems(`verbs.${g}.${k}`, v));
    }
  }
  const city = Object.keys(c.lines?.citywide ?? {});
  if (JSON.stringify(city) !== JSON.stringify(['lots', 'regulations', 'buildings', 'builds', 'map_areas'])) out.push(`lines.citywide: order ${city.join(',')}`);
  const at = city.indexOf('regulations');
  for (const k of [city[at - 1], 'regulations', city[at + 1]]) if (k && CHECKED_WORD.test(String(c.lines.citywide[k]))) out.push(`lines.citywide.${k}: "checked" beside the by-law rules count`);
  for (const k of ['limits_gated', 'limits_not_evaluated']) if (CHECKED_WORD.test(String(c.lines?.lot?.[k]))) out.push(`lines.lot.${k}: a gated or not-evaluated lot reads "checked"`);
  if (!/not yet evaluated/i.test(String(c.lines?.lot?.limits_not_evaluated))) out.push('lines.lot.limits_not_evaluated: not the ruled text (X-3 a)');
  // N-1 (b, operator 2026-11-11 "b just keep the bigger number for now and we can revisit"): the per-building-type count always names its house types.
  if (!/\{value\}.*\bacross \{types\} house types\b/.test(String(c.lines?.lot?.limits))) out.push('lines.lot.limits: the count must read across {types} house types (N-1 b)');
  if (!/not yet modelled/i.test(String(c.lines?.lot?.limits_gated))) out.push('lines.lot.limits_gated: not the ruled text');
  for (const k of ['heritage_in', 'heritage_out']) if (!/designated/i.test(String(c.lines?.lot?.[k])) || /listed/i.test(String(c.lines?.lot?.[k]))) out.push(`lines.lot.${k}: heritage reads "designated" (X-2 a)`);
  return out;
};
/** Every problem of the composed texts of one tree (the golden or a built tree). */
const treeProblems = (tree: Json): string[] => {
  const out: string[] = [];
  const ch = tree.checked;
  if (!ch) return out;
  const all: Array<[string, string]> = [['summary', ch.summary], ['skip', ch.skip.text], ['open', ch.open.text], ['ready', ch.ready.text], ...(ch.dates ? [['dates', ch.dates.text] as [string, string]] : [])];
  for (const g of ch.groups) for (const l of g.lines) all.push([`${g.key}.${l.key}`, l.text]);
  for (const [k, t] of all) for (const [why, re] of BANNED) if (re.test(t)) out.push(`${k}: ${why}`);
  for (const g of ch.groups) for (const l of g.lines) out.push(...verbProblems(`${g.key}.${l.key}.verb`, l.verb));
  const city: Json[] = ch.groups.find((g: Json) => g.key === 'citywide')?.lines ?? [];
  const at = city.findIndex((l) => l.key === 'regulations');
  if (at >= 0) for (const l of [city[at - 1], city[at], city[at + 1]]) if (l && CHECKED_WORD.test(l.text)) out.push(`citywide.${l.key}: "checked" beside the by-law rules count`);
  for (const l of ch.groups.find((g: Json) => g.key === 'lot')?.lines ?? []) if (['limits_gated', 'limits_not_evaluated'].includes(l.key) && CHECKED_WORD.test(l.text)) out.push(`lot.${l.key}: reads "checked"`);
  for (const l of ch.groups.find((g: Json) => g.key === 'lot')?.lines ?? []) if (l.key === 'limits' && !/ across \S+ house types$/.test(l.text)) out.push('lot.limits: the count does not name its house types (N-1 b)');
  // OUTPUT panel N-4: a by-law results date never sits beside a gated or not-evaluated by-law line.
  const bylawDate = new RegExp(`^${String(CHECKED.dates.bylaw).split('{value}')[0]}`);
  const gated = (ch.groups.find((g: Json) => g.key === 'lot')?.lines ?? []).some((l: Json) => ['limits_gated', 'limits_not_evaluated'].includes(l.key));
  if (gated && ch.dates && bylawDate.test(ch.dates.text)) out.push('dates: a by-law results date beside a gated or not-evaluated lot');
  return out;
};

describe('C2 the claims lock (content and composed texts)', () => {
  it('the committed content block is clean', () => {
    expect(contentProblems(CHECKED)).toEqual([]);
  });
  const plants: Array<[string, (c: Json) => void]> = [
    ['a digit in a label', (c) => { c.lines.citywide.regulations = '50,000 by-law rules searched'; }],
    ['satellite', (c) => { c.lines.citywide.buildings = '{value} buildings measured from satellite'; }],
    ['aerial', (c) => { c.summary = 'Aerial review done. Show report.'; }],
    ['updated', (c) => { c.dates.permits = 'Permits updated {value}.'; }],
    ['latest', (c) => { c.dates.bylaw = 'Latest by-law results {value}.'; }],
    ['live-progress word', (c) => { c.summary = 'Checking your lot'; }],
    ['AI comparison', (c) => { c.skip = 'More accurate than AI'; }],
    ['chatbot', (c) => { c.summary = 'Better than a chatbot'; }],
    ['GPT', (c) => { c.skip = 'Not GPT'; }],
    ['the rules line reads checked', (c) => { c.lines.citywide.regulations = '{value} by-law rules checked'; }],
    ['checked beside the rules line', (c) => { c.lines.citywide.buildings = '{value} buildings checked'; }],
    ['the citywide order moved', (c) => { const { map_areas, ...rest } = c.lines.citywide; c.lines.citywide = { map_areas, ...rest }; }],
    ['a gated lot reads checked', (c) => { c.lines.lot.limits_gated = 'Site exception checked'; }],
    ['a not-evaluated lot reads checked', (c) => { c.lines.lot.limits_not_evaluated = 'By-law limits checked'; }],
    ['heritage reads listed', (c) => { c.lines.lot.heritage_out = 'Not heritage listed'; }],
    ['N-1: limits checked without the house types', (c) => { c.lines.lot.limits = '{value} by-law limits checked'; }],
    ['N-1: the house types dropped', (c) => { c.lines.lot.limits = '{value} by-law checks'; }],
    ['the summary claims an endorsement', (c) => { c.summary = 'Officially verified. Show report.'; }],
    // OUTPUT panel N-3: one planted fault per new family.
    ['endorsement', (c) => { c.summary = 'Certified by the City'; }],
    ['official', (c) => { c.summary = 'Official zoning review'; }],
    ['approved by', (c) => { c.skip = 'Approved by the City'; }],
    ['guarantee', (c) => { c.lines.lot.limits = 'Guaranteed buildable: {value}'; }],
    ['verified', (c) => { c.lines.citywide.lots = '{value} lots verified'; }],
    ['100%', (c) => { c.skip = '100% accurate'; }],
    ['progress verb', (c) => { c.summary = 'Processing your lot'; }],
    ['calculating', (c) => { c.skip = 'Calculating'; }],
    ['current as of', (c) => { c.dates.zoning = 'Zoning maps current as of {value}.'; }],
    ['refreshed', (c) => { c.dates.permits = 'Permits refreshed {value}.'; }],
    ['fresh data', (c) => { c.summary = 'Fresh data'; }],
    ['drone', (c) => { c.lines.citywide.buildings = '{value} buildings from a drone survey'; }],
    ['machine learning', (c) => { c.summary = 'Machine learning review'; }],
    // MF-62 follow-up (2026-11-11): the sequence texts and the verbs.
    ['a measuring verb (nothing is measured while the screen runs)', (c) => { c.verbs.lot.area = 'Measuring the lot…'; }],
    ['an analysing verb', (c) => { c.verbs.citywide.regulations = 'Analyzing by-law results…'; }],
    ['a checking verb', (c) => { c.verbs.lot.ravine_out = 'Checking ravine areas…'; }],
    ['a verb with a digit', (c) => { c.verbs.citywide.lots = 'Loading 496,536 lots…'; }],
    ['a verb with a banned family', (c) => { c.verbs.citywide.buildings = 'Loading satellite images…'; }],
    ['a verb without its ellipsis', (c) => { c.verbs.citywide.builds = 'Loading permits'; }],
    ['a live claim after the allowed word', (c) => { c.verbs.citywide.map_areas = 'Loading live zoning maps…'; }],
    ['a progress word after the allowed word', (c) => { c.verbs.lot.limits = 'Matching processing results…'; }],
    ['a calculating verb', (c) => { c.verbs.lot.limits_gated = 'Calculating…'; }],
    ['a processing verb (held for the mock)', (c) => { c.verbs.lot.heritage_out = 'Processing heritage records…'; }],
    ['a loading verb as the skip', (c) => { c.skip = 'Loading…'; }],
    ['a loading verb in the view action', (c) => { c.open = 'Loading report…'; }],
    ['a loading verb in the ready line', (c) => { c.ready = 'Loading the Building Possibilities Report for {address}…'; }],
    ['a line without a verb', (c) => { delete c.verbs.lot.decisions; }],
    ['a verb for no line', (c) => { c.verbs.lot.cost = 'Loading costs…'; }],
    ['a loading verb in a resolved line', (c) => { c.lines.citywide.lots = 'Loading {value} lots'; }],
    ['a loading verb in the announcement', (c) => { c.summary = 'Loading your report'; }],
    ['the ready line with the old name', (c) => { c.ready = 'The Build Possibilities Report for {address} is ready.'; }],
    ['the ready line without the address', (c) => { c.ready = 'The Building Possibilities Report is ready.'; }],
    ['the announcement reworded', (c) => { c.summary = 'Everything we checked is shown.'; }],
    ['the skip back to a button word', (c) => { c.skip = 'Show report'; }],
    ['the view action reworded', (c) => { c.open = 'Open'; }],
  ];
  for (const [name, plant] of plants) {
    it(`RED on a planted fault: ${name}`, () => {
      const c = clone(CHECKED);
      plant(c);
      expect(contentProblems(c).length).toBeGreaterThan(0);
    });
  }
  it('"said" does not trip the AI rule (whole word)', () => {
    const c = clone(CHECKED);
    c.skip = 'As said, show report';
    expect(contentProblems(c).filter((p) => p.includes('AI'))).toEqual([]);
  });
  for (const s of ['loading_checked', 'loading_checked_gated']) {
    it(`${s}: every composed text of the golden is clean, and planted faults in the golden are RED`, () => {
      const tree = golden(s, 'web').rendered_tree;
      expect(treeProblems(tree)).toEqual([]);
      const a = clone(tree);
      a.checked.groups[0].lines[1].text = '4,356 by-law rules checked';
      expect(treeProblems(a).length).toBeGreaterThan(0);
      const b = clone(tree);
      b.checked.groups[1].lines[1] = { key: 'limits_gated', text: 'Site exception checked', delay_ms: 0 };
      expect(treeProblems(b).length).toBeGreaterThan(0);
      const d = clone(tree); // N-1 in composed text
      const li = d.checked.groups[1].lines.findIndex((l: Json) => l.key === 'limits');
      if (li >= 0) { d.checked.groups[1].lines[li].text = '169 by-law limits checked'; expect(treeProblems(d).length).toBeGreaterThan(0); }
      const c = clone(tree); // N-3 in composed text: a digit claim that is not a label digit
      c.checked.groups[0].lines[0].text = '496,536 lots scanned, 100% accurate';
      expect(treeProblems(c).length).toBeGreaterThan(0);
    });
  }
});

// R1 (Landing v9, operator 2026-11-11 "1. y"): the old name nowhere in the report's content or its authored inputs.
const NAME_FILES = ['scripts/surfaces/_schema/report-presentation.json', 'scripts/surfaces/_schema/report-v2-seed/page-text.json', 'scripts/surfaces/_schema/report-v2-seed/checked-text.json'];
export const nameProblems = (files: Record<string, string>): string[] => Object.entries(files).flatMap(([p, t]) => {
  const out: string[] = [];
  const body = (JSON.parse(t) as Json);
  delete body.$comment; // the authored-input comment quotes rulings verbatim; the shown texts are the rest
  if (/\bBuild Possibilities\b/i.test(JSON.stringify(body))) out.push(`${p}: the old name "Build Possibilities"`);
  return out;
});
describe('C2b the report name (R1)', () => {
  const files = Object.fromEntries(NAME_FILES.map((p) => [p, fs.readFileSync(path.join(ROOT, p), 'utf8')]));
  it('the page title is "The Building Possibilities Report" and the old name is nowhere in the report content', () => {
    expect((reportCtx.content as Json).page['page.title']).toBe('The Building Possibilities Report');
    expect(nameProblems(files)).toEqual([]);
  });
  it('RED: the old name planted in the page title', () => {
    const p = NAME_FILES[1] as string;
    expect(nameProblems({ [p]: String(files[p]).replace('The Building Possibilities Report', 'Build Possibilities') }).length).toBeGreaterThan(0);
  });
});

describe('C3 the goldens', () => {
  it('loading_checked carries the five citywide lines in order, the five lot lines, the dates and the skip', () => {
    const ch = golden('loading_checked', 'web').rendered_tree.checked;
    expect(ch.groups[0].lines.map((l: Json) => l.key)).toEqual(['lots', 'regulations', 'buildings', 'builds', 'map_areas']);
    expect(ch.groups[1].lines.map((l: Json) => l.key)).toEqual(['area', 'limits', 'ravine_out', 'heritage_out', 'decisions']);
    expect(ch.dates.text).toContain('2026-');
    expect(ch.skip.text).toBe('Skip');
    expect(ch.skip.after_ms).toBe(0);
    expect(ch.ready.text).toMatch(/^The Building Possibilities Report for .+ is ready\.$/);
    expect(ch.open.text).toBe('View report');
    for (const g of ch.groups) for (const l of g.lines) expect(l.done_ms).toBeGreaterThan(l.delay_ms);
  });
  it('loading_checked_gated: an exception_not_authored lot carries the gated line and no limits count', () => {
    const lines = golden('loading_checked_gated', 'web').rendered_tree.checked.groups[1].lines.map((l: Json) => l.key);
    expect(lines).toContain('limits_gated');
    expect(lines).not.toContain('limits');
  });
  it('N-4: the gated golden carries no by-law results date; planting one is RED', () => {
    const tree = golden('loading_checked_gated', 'web').rendered_tree;
    expect(tree.checked.dates.text).not.toContain(String(CHECKED.dates.bylaw).split('{value}')[0]);
    const p = clone(tree);
    p.checked.dates.text = `${CHECKED.dates.bylaw.replace('{value}', '2026-11-10')} ${p.checked.dates.text}`;
    expect(treeProblems(p).length).toBeGreaterThan(0);
  });
});

// ---- C4 the web render ---------------------------------------------------------------------------------------------------------------------
const render = (target: string, href?: string): HTMLElement => {
  const tree = golden('loading_checked', target).rendered_tree;
  const view = viewOf(tree, { scenario: null, target, ...(href ? { reportHref: href } : {}) }, reportCtx);
  const box = document.createElement('div');
  box.innerHTML = renderToStaticMarkup(createElement(ReportView, { view: view as never }));
  return box;
};
const PACED = (TARGETS as string[]).filter((t) => (reportCtx.layout as Json).targets[t].details === 'collapsed');
const STILL = (TARGETS as string[]).filter((t) => !PACED.includes(t));

describe('C4 the web render', () => {
  it('the layout table gives paced rows (mobile, web) and still rows (admin, pdf)', () => {
    expect(PACED.sort()).toEqual(['mobile', 'web']);
    expect(STILL.sort()).toEqual(['admin', 'pdf']);
  });
  it('web: no title and no section labels (operator 2026-11-11), one role="log" region holding every line, a server delay per line, the skip link from its delay', () => {
    const box = render('web', '/report');
    expect(box.querySelector('[data-block="checked"] h1, [data-block="checked"] h2')).toBeNull();
    expect(box.querySelector('[data-block="checked"]')?.textContent).not.toMatch(/what we checked|across toronto|your lot/i);
    const logs = box.querySelectorAll('[role="log"]');
    expect(logs).toHaveLength(1);
    const lines = [...box.querySelectorAll('[data-check]')];
    expect(lines).toHaveLength(10);
    for (const l of lines) expect(logs[0]?.contains(l)).toBe(true);
    for (const l of lines) expect((l as HTMLElement).getAttribute('style')).toMatch(/--d:\d+ms;--done:\d+ms/);
    const skip = box.querySelector('a[data-block="checked-skip"]') as HTMLAnchorElement;
    expect(skip.getAttribute('href')).toBe('/report');
    expect(skip.textContent).toBe('Skip');
    expect(skip.getAttribute('style')).toMatch(/--skip:0ms;--ready:\d+ms/); // "Skip" from the start, gone when the ready line shows
    expect(box.querySelector('[data-block="checked-dates"]')?.textContent).toContain('2026-');
  });
  it('web: each paced line is its loading verb (hidden from assistive tech) then its fact; the ready line and "View report" at the ready time; no timer, no auto-open (plan-panel RG-2)', () => {
    const box = render('web', '/report');
    const tree = golden('loading_checked', 'web').rendered_tree;
    const first = box.querySelector('[data-check="citywide.lots"]') as HTMLElement;
    const verb = first.querySelector('[data-verb]') as HTMLElement;
    expect(verb.getAttribute('aria-hidden')).toBe('true');
    expect(verb.textContent).toBe(tree.checked.groups[0].lines[0].verb);
    expect(first.querySelector('[data-fact]')?.textContent).toBe(tree.checked.groups[0].lines[0].text);
    const ready = box.querySelector('[data-block="checked-ready"]') as HTMLElement;
    expect(ready.textContent).toBe(tree.checked.ready.text);
    expect(ready.getAttribute('style')).toBe(`--ready:${tree.checked.ready.at_ms}ms`);
    const view = box.querySelector('a[data-block="checked-open"]') as HTMLAnchorElement;
    expect(view.getAttribute('href')).toBe('/report');
    expect(view.textContent).toBe('View report');
    expect(view.getAttribute('style')).toBe(`--ready:${tree.checked.ready.at_ms}ms`);
    expect(box.querySelectorAll('[role="status"]')).toHaveLength(0); // one announcement only: the app's (summary); the web adds no status region
    expect(box.innerHTML).not.toContain(tree.checked.summary);
  });
  it('the lifecycle message stays in the DOM for screen readers but is not drawn over the checked screen', () => {
    const reason = render('web', '/report').querySelector('[data-block="reason"]');
    expect(reason?.textContent).toBe('Loading the report…');
    expect(reason?.className).toContain('sr-only');
  });
  it('N-7: only a same-origin path is a skip target (an absolute or protocol-relative URL draws no skip)', () => {
    for (const bad of ['//evil.example/x', 'https://evil.example/x', 'javascript:alert(1)', 'report']) expect(render('web', bad).querySelector('[data-block="checked-skip"]')).toBeNull();
    expect(render('web', '/admin/report-preview?view=page').querySelector('[data-block="checked-skip"]')).not.toBeNull();
  });
  it('no href: no skip and no view control at all (never an inert button)', () => {
    const box = render('web');
    expect(box.querySelector('[data-block="checked-skip"]')).toBeNull();
    expect(box.querySelector('[data-block="checked-open"]')).toBeNull();
    expect(box.querySelector('button')).toBeNull();
  });
  for (const t of STILL) {
    it(`${t}: every fact and the ready line shown at once, no verb, no delay, no skip, no view`, () => {
      const box = render(t, '/report');
      expect(box.querySelectorAll('[data-check]')).toHaveLength(10);
      expect(box.querySelector('[data-verb]')).toBeNull();
      expect(box.querySelector('[data-block="checked-ready"]')?.textContent).toMatch(/^The Building Possibilities Report for .+ is ready\.$/);
      expect(box.innerHTML).not.toMatch(/--d:|--skip:|--ready:|--done:/);
      expect(box.querySelector('[data-block="checked-skip"]')).toBeNull();
      expect(box.querySelector('[data-block="checked-open"]')).toBeNull();
    });
  }
  it('no part of the report components opens the report by a timer (plan-panel RG-2; OUTPUT panel RG-L2): no setTimeout, setInterval, useEffect, router.push or location.assign', () => {
    const dir = path.join(ROOT, 'src/components/report');
    for (const f of fs.readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect([f, /\bset(Timeout|Interval)\b|\buseEffect\b|router\.(push|replace)|location\.(assign|replace|href\s*=)/.test(src)]).toEqual([f, false]);
    }
  });
  it('ReportView keeps no state: no "use client", no hooks, no click handler', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/components/report/ReportView.tsx'), 'utf8');
    expect(src).not.toMatch(/['"]use client['"]/);
    expect(src).not.toMatch(/\buse(State|Effect|Ref|Reducer|LayoutEffect)\b/);
    expect(src).not.toMatch(/\bon[A-Z]\w*=/);
  });
});

// ---- C5 the stylesheet ---------------------------------------------------------------------------------------------------------------------
const CSS = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const block = (css: string, start: RegExp): string => {
  const m = start.exec(css);
  if (!m) return '';
  let depth = 0;
  for (let i = css.indexOf('{', m.index); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(m.index, i + 1);
  }
  return '';
};
export const cssProblems = (css: string): string[] => {
  const out: string[] = [];
  const line = block(css, /\.report-check-line\s*\{/);
  const skip = block(css, /\.report-check-skip\s*\{/);
  const verb = block(css, /\.report-check-verb\s*\{/);
  const fact = block(css, /\.report-check-fact\s*\{/);
  const ready = block(css, /\.report-check-ready\s*\{/);
  // MF-62 follow-up: the verb gives way to its fact at --done; the ready line and "View report" show at --ready; "Skip" leaves at --ready.
  const view = block(css, /\.report-check-view\s*\{/);
  if (!/report-check-out/.test(verb) || !/var\(--done/.test(verb)) out.push('verb: leaves at the server resolve time --done');
  if (!/report-check-skip-in/.test(view) || !/var\(--ready/.test(view)) out.push('view: revealed by visibility at --ready (not focusable while unseen)');
  if (!/report-check-in/.test(fact) || !/var\(--done/.test(fact)) out.push('fact: shows at the server resolve time --done');
  if (!/report-check-in/.test(ready) || !/var\(--ready/.test(ready)) out.push('ready line and view: show at the server ready time --ready');
  if (!/report-check-skip-out/.test(skip) || !/var\(--ready/.test(skip)) out.push('skip: leaves at the server ready time --ready');
  const fade = block(css, /@keyframes report-check-in\s*\{/);
  const reveal = block(css, /@keyframes report-check-skip-in\s*\{/);
  if (!/animation:[^;]*report-check-in[^;]*backwards/.test(line) || !/animation-delay:\s*var\(--d/.test(line)) out.push('line: fade with the server delay, fill backwards');
  if (!/animation:[^;]*report-check-skip-in[^;]*backwards/.test(skip) || !/animation-delay:\s*var\(--skip/.test(skip)) out.push('skip: reveal with the server delay, fill backwards');
  if (/visibility:\s*hidden|opacity:\s*0|display:\s*none/.test(line.replace(/animation[^;]*;/g, '')) || /visibility:\s*hidden|opacity:\s*0|display:\s*none/.test(skip.replace(/animation[^;]*;/g, ''))) out.push('base style hidden: animation none would hide it for good');
  if (/visibility/.test(fade) || !/opacity/.test(fade)) out.push('line keyframes: opacity only (stays in the accessibility tree)');
  if (!/visibility:\s*hidden/.test(reveal) || !/visibility:\s*visible/.test(reveal)) out.push('skip keyframes: visibility, so it is not focusable while unseen');
  for (const q of [/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/, /@media\s+print\s*\{/]) {
    const m = block(css, q);
    if (!/\.report-check-line/.test(m) || !/\.report-check-fact/.test(m) || !/\.report-check-ready/.test(m) || !/animation:\s*none/.test(m)) out.push(`${q.source}: every fact and the ready line at once`);
    if (!/\.report-check-verb[^{]*\{[^}]*display:\s*none/.test(m)) out.push(`${q.source}: no verb`);
    if (!/\.report-check-skip[^{]*\{[^}]*display:\s*none/.test(m)) out.push(`${q.source}: no Skip (the end state has "View report")`);
  }
  return out;
};

describe('C5 the stylesheet (globals.css)', () => {
  it('the committed rules are complete', () => {
    expect(cssProblems(CSS)).toEqual([]);
  });
  it('RED: no reduce-motion rule', () => {
    expect(cssProblems(CSS.replace(/prefers-reduced-motion:\s*reduce\)\s*\{[^}]*report-check[^}]*\}/, 'prefers-reduced-motion: no-preference) {}')).length).toBeGreaterThan(0);
  });
  it('RED: the skip revealed by opacity only', () => {
    expect(cssProblems(CSS.replace(/(@keyframes report-check-skip-in\s*\{[^]*?)visibility:\s*hidden;?/, '$1')).length).toBeGreaterThan(0);
  });
  it('RED: the verb never leaves (no resolve time)', () => {
    expect(cssProblems(CSS.replace(/(\.report-check-verb\s*\{[^}]*?)var\(--done[^)]*\)/, '$1 0ms')).length).toBeGreaterThan(0);
  });
  it('RED: reduce motion keeps the verb', () => {
    expect(cssProblems(CSS.replace(/(@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^]*?)\.report-check-verb[^{]*\{[^}]*display:\s*none;?\s*\}/, '$1')).length).toBeGreaterThan(0);
  });
  it('RED: a hidden base style', () => {
    expect(cssProblems(CSS.replace(/(\.report-check-skip\s*\{)/, '$1 visibility: hidden;')).length).toBeGreaterThan(0);
  });
});
