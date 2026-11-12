// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 (web_landing, dated note 2026-11-11 MF-76), §11b.2, §0b items 5, 8 and 11,
//            docs/specs/02-web-admin/128_surface_standard_policy.md §4 (dated note 2026-11-11: a STATIC page may read declared stored values on the
//            server), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-13, FE-34, FE-35, FE-36, FE-37,
//            docs/specs/01-pipeline/88_parcel_cost_model.md §3 (the cost sources), .cursor/MCBYLAWS-QUEUE.md (the increments table).
//
// MF-76 · McFrontend queue · lane E. The landing locks (plan ~/Buildo-scratch/mcfrontend/MF-46/plan.md v3 §4 T1-T15 as folded by §12, §13a, §13b;
// operator D-1 (a), D-2 (a), D-3 (a) "3 y", D-5 (a), D-6 (a), "include all the build scenarios", and the landing v9 rulings). Cases:
//   T1  the contract: the landing pages validate; degraded = static minus the citywide group and the demo; RED: a number as a value, an unknown
//       kind, a typed text, a value on a bare role, an href on a term, a two-parameter query, an off-origin href; the binding throws on an accent
//       before its title, a price without per and tax, a per without a price, a part outside a plan box and a bad read name;
//   T2  the claims lock (MF-62's lock words, ported) over the content and every server value text; no digit outside {value}, the ruled disclaimer
//       exempt as an exact string; RED: "AI-powered", a typed "34", "Processing 1 of 5";
//   T3  one source: the citywide figures are MF-62's templates filled from the stored row (and equal the demo's lines), the rules count is
//       universe.lock.json, the scenario count and list come from one declaration whose rows exist in the increments table, the cost sources are
//       the Spec 88 table's names, the allowances are the settings; a missing row or a zero leaves the whole group out; RED for each;
//   T4  pricing text: no price anywhere until the MF-47 reader exists; a price is always followed by "/ month" and "CAD, plus HST"; RED: "Plus GST",
//       a typed "$29";
//   T5  links: every href is a public host-table row with a page behind it, an anchor that exists, or a declared plan key; RED: /contact, a plan
//       not declared;
//   T7  the disclaimer: verbatim in the hero and the footer, from one key; RED: one changed character;
//   T8  the sample tree: rebuilt by the generator it equals the committed file; RED: a hand edit;
//   T9  reduced motion and the reveal: the CSS block of the sample (opacity only, one run, :target and reduce motion at once); RED: infinite,
//       display none;
//   T10 the route: the internal page is a static segment under (static), public, no gate, read per request;
//   T14 a reader that throws: the page still builds (degraded, no allowance parts), one logError per failed read, never a throw;
//   T15 no cookie for a signed-out GET / on maxbld.ca (the real session refresh, no session).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import Ajv2020Module from 'ajv/dist/2020.js';
import { matchMaxbldRoute } from '@/lib/auth/host-policy';
import * as logger from '@/lib/logger';
import { staticWebTree, type StaticPage } from '@/components/surfaces/web/StaticBinding';
import { citywideLines } from '@/lib/parcels/what-we-checked';
import { REPORT_CHECK_KEYS } from '@/lib/parcels/report-check-pace';
import { citywideTexts, fileValues, LANDING_READS, landingMetadata, readCitywide, readLanding, scenarioList } from '@/lib/surfaces/maxbld-landing';
import { captureLandingSample, LANDING_SAMPLE } from '../../../scripts/surfaces/report-page-capture';
import { FIXTURE_LIMITS, FIXTURE_ROW, fixtureDb } from './web-landing-fixture';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON documents
const ROOT = process.cwd();
const rj = (p: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DIR = 'scripts/surfaces/parcel_product/F06/surfaces';
const SCHEMA = rj('scripts/surfaces/_schema/static-page.schema.json');
const TABLE = rj('scripts/surfaces/_schema/static-page.json');
const CONTENT = rj(`${DIR}/web_landing.content.json`) as Record<string, string>;
const SCENARIOS = rj(`${DIR}/web_landing.scenarios.json`);
const SOURCES = rj(`${DIR}/web_landing.cost-sources.json`);
const PRESENTATION = rj('scripts/surfaces/_schema/report-presentation.json');
const UNIVERSE = rj('scripts/seeds/bylaw/universe.lock.json');
const STATIC = TABLE.pages.web_landing.static as StaticPage;
const DEGRADED = TABLE.pages.web_landing.degraded as StaticPage;
// Ruling L-R3 (landing v9 rulings R2, 2026-11-11, "2. add not legal advice as well"), verbatim.
const LEGAL = 'This is an estimate, not 100% accurate. Not legal advice. Confirm with a lot survey and the City.';
const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as new (o: Json) => { compile: (s: Json) => ((d: unknown) => boolean) & { errors?: unknown[] } };
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(SCHEMA);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const parts = (p: StaticPage): Json[] => p.sections.flatMap((s) => s.parts as Json[]);
afterEach(() => { vi.restoreAllMocks(); });

describe('T1 the contract (static page kinds, values as reads)', () => {
  it('the two landing pages validate; degraded is static without the citywide group and the demo', () => {
    expect([validate(TABLE), validate.errors ?? null]).toEqual([true, null]);
    const strip = clone(STATIC);
    for (const s of strip.sections) s.parts = s.parts.filter((p) => p.role !== 'checked' && p.role !== 'demo');
    expect(DEGRADED).toEqual(strip);
    expect(STATIC.sections.map((s) => s.kind)).toEqual(['hero', 'items', 'figures', 'items', 'plans', 'footer']);
  });
  it('every value a part names is a declared read', () => {
    const named = parts(STATIC).filter((p) => p.value !== undefined).map((p) => p.value as string);
    expect([...new Set(named)].sort()).toEqual([...LANDING_READS].sort());
  });
  it('RED: each planted contract defect is refused by the schema', () => {
    const hero = (t: Json): Json => t.pages.web_landing.static.sections[0].parts; // the parts array, untyped JSON
    const plants: Array<[string, (t: Json) => void]> = [
      ['a number as a value', (t) => { hero(t).find((p: Json) => p.value === 'trial_reports').value = 20; }],
      ['a price typed as a number', (t) => { hero(t)[5].content = 9.99; }],
      ['an unknown kind', (t) => { t.pages.web_landing.static.sections[1].kind = 'cards'; }],
      ['a typed text', (t) => { hero(t)[5].text = 'Lot Intelligence'; }],
      ['a value on a bare role', (t) => { hero(t).find((p: Json) => p.role === 'demo').value = 'scenarios'; }],
      ['content on a bare role', (t) => { hero(t).find((p: Json) => p.role === 'demo').content = 'hero.cta'; }],
      ['an href on a term', (t) => { hero(t).find((p: Json) => p.role === 'term').href = '/signup'; }],
      ['a link with two query parameters', (t) => { hero(t)[0].href = '/signup?plan=basic&x=1'; }],
      ['an off-origin href', (t) => { hero(t)[0].href = '//evil.com'; }],
      ['a group off the checked role', (t) => { hero(t)[5].group = 'citywide'; }],
    ];
    for (const [why, f] of plants) { const t = clone(TABLE); f(t); expect([why, validate(t)]).toEqual([why, false]); }
  });
  it('RED: the binding refuses an accent before its title, a price without per and tax, a per without a price, a part outside a box, a bad read', () => {
    const page = (f: (p: Json) => void): (() => unknown) => { const p = clone(STATIC) as unknown as Json; f(p); return () => staticWebTree(p as StaticPage); };
    const plans = (p: Json): Json[] => p.sections[4].parts;
    expect(page((p) => { const h = p.sections[0].parts; const t = h.findIndex((x: Json) => x.role === 'title'); [h[t], h[t + 1]] = [h[t + 1], h[t]]; })).toThrow('an accent follows the title');
    expect(page((p) => { plans(p).splice(2, 0, { role: 'price', content: 'plans.trial.name', value: 'trial_reports' }); })).toThrow('a price is followed by its per and tax parts');
    expect(page((p) => { plans(p).splice(2, 0, { role: 'per', content: 'plans.trial.name' }); })).toThrow('a per sits between its price and its tax');
    expect(page((p) => { plans(p).splice(1, 0, { role: 'tick', content: 'plans.trial.tick', value: 'trial_reports' }); })).toThrow('a tick outside a box');
    expect(page((p) => { p.sections[0].parts[8].value = 'Trial-Reports'; })).toThrow('is not a declared read name');
    // The good order passes: price, per, tax.
    expect(page((p) => { plans(p).splice(2, 0, { role: 'price', content: 'plans.trial.tick', value: 'trial_reports' }, { role: 'per', content: 'plans.trial.name' }, { role: 'tax', content: 'plans.trial.note' }); })).not.toThrow();
  });
});

// ---- T2 the claims lock (MF-62's lock words, src/tests/surfaces/report-checked.logic.test.ts C2, ported; Competition Act s.74.01) -----------------
const BANNED: Array<[string, RegExp]> = [
  ['satellite or aerial (D-3 a: no imagery held)', /satellite|aerial|orthoimag/i],
  ['updated or latest (cost rates are dated, not updated)', /\bupdated?\b|\blatest\b|\bup[- ]to[- ]date\b/i],
  ['live-progress word (past tense only; the work was done before)', /\b(checking|reviewing|scanning|analy[sz]ing|searching|examining|measuring|loading|real[- ]time|live)\b/i],
  ['chatbot or AI comparison (no prior test, s.74.01(1)(b))', /\bAI\b|\bA\.I\.|artificial intelligence|chat ?bot|chatgpt|\bGPT\b|\bLLM\b|machine learning|more (accurate|trustworthy|reliable) than/i],
  ['endorsement or guarantee (no City endorsement, no guarantee, s.74.01(1)(a))', /certified|official|approved by|endorsed|guarantee|verified|100 ?%|accurate/i],
  ['progress verb (past tense only)', /\b(processing|calculating|verifying|inspecting|computing|crunching)\b/i],
  ['freshness claim (data is dated, not current)', /\bcurrent\b|\brefreshed\b|\bfresh\b|\bnew data\b/i],
  ['imagery or survey claim (none held, D-3 a)', /drone|survey|imagery|street ?view|camera/i],
  ['the old report name (R1: The Building Possibilities Report)', /\bBuild Possibilities\b/i],
  // The landing's own (plan v3 §3.6): no "every scenario", no "high confidence", no coverage claim beyond Toronto lots.
  ['every-scenario or confidence claim', /every scenario|all scenarios|high confidence|any (Toronto )?lot\b/i],
];
export const claimsProblems = (texts: Record<string, string>): string[] => {
  const out: string[] = [];
  for (const [k, t] of Object.entries(texts)) {
    if (t === LEGAL) continue; // the ruled disclaimer, exempt as an exact string only (plan v3 §12 fold 24)
    for (const [why, re] of BANNED) if (re.test(t)) out.push(`${k}: ${why}`);
    if (/\d/.test(t.split('{value}').join(''))) out.push(`${k}: a digit outside {value} (FE-05: numbers are read, never typed)`);
  }
  return out;
};
describe('T2 the claims lock', () => {
  it('the content and every server text of the page (values excluded from the digit rule) are clean', async () => {
    expect(claimsProblems(CONTENT)).toEqual([]);
    const l = await readLanding(fixtureDb('ok'));
    const words = Object.fromEntries(Object.entries(l.values).map(([k, v]) => [k, v.replace(/[\d,]+/g, '{value}')]));
    expect(claimsProblems(words)).toEqual([]);
  });
  it('MF-76 OUTPUT compliance F12: the sample report texts carry no banned claim word (the report keeps its ruled confidence words)', () => {
    const sample = fs.readFileSync(path.join(ROOT, 'scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json'), 'utf8');
    const texts = [...sample.matchAll(/"text": "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] as string);
    expect(texts.length).toBeGreaterThan(20);
    const banned = /\b(AI|satellite|aerial|every scenario|updated|latest|guarantee|guaranteed|more accurate than|ChatGPT|LLM)\b/i;
    expect(texts.filter((t) => banned.test(t))).toEqual([]);
    expect(banned.test('AI estimate')).toBe(true);
  });
  it('RED: "AI-powered", a typed 34, "Processing 1 of 5", a changed disclaimer losing its exemption', () => {
    expect(claimsProblems({
      a: 'AI-powered lot reports', b: '34 cost sources researched', c: 'Processing 1 of 5', d: LEGAL.replace('City.', 'City'),
    })).toEqual([
      'a: chatbot or AI comparison (no prior test, s.74.01(1)(b))',
      'b: a digit outside {value} (FE-05: numbers are read, never typed)',
      'c: progress verb (past tense only)', 'c: a digit outside {value} (FE-05: numbers are read, never typed)',
      'd: endorsement or guarantee (no City endorsement, no guarantee, s.74.01(1)(a))', 'd: imagery or survey claim (none held, D-3 a)',
      'd: a digit outside {value} (FE-05: numbers are read, never typed)',
    ]);
  });
});

// ---- T3 one source --------------------------------------------------------------------------------------------------------------------------
const INC_TABLE = (): Set<string> => {
  const q = fs.readFileSync(path.join(ROOT, '.cursor/MCBYLAWS-QUEUE.md'), 'utf8').split('\n');
  const at = q.findIndex((l) => l.startsWith('## Increments'));
  const rows = new Set<string>();
  for (let i = at + 1; i < q.length && !q[i]?.startsWith('## '); i++) { const m = /^\| (\w+) \|/.exec(q[i] ?? ''); if (m && m[1] !== '#') rows.add(m[1] as string); }
  return rows;
};
export const scenarioProblems = (doc: Json, rows: Set<string>): string[] => {
  const out: string[] = [];
  for (const s of doc.scenarios as Json[]) {
    const ids = String(s.increment).split('-');
    for (const id of ids) if (!rows.has(id)) out.push(`${s.key}: increment row ${id} is not in the increments table`);
    if (typeof s.label !== 'string' || s.label === '' || /\d/.test(s.label)) out.push(`${s.key}: a label is words`);
  }
  return out;
};
const specSources = (): Array<{ name: string; lines: string[] }> => {
  const t = fs.readFileSync(path.join(ROOT, 'docs/specs/01-pipeline/88_parcel_cost_model.md'), 'utf8').split('\n');
  const i = t.findIndex((l) => l.includes('| Primary sources (2025–26) |'));
  const m = new Map<string, string[]>();
  for (let j = i + 2; t[j]?.startsWith('|'); j++) {
    const cells = (t[j] as string).split('|');
    const line = (cells[1] ?? '').trim();
    for (const n of (cells[5] ?? '').replace(/\([^)]*\)/g, '').split(/[;,]/).map((x) => x.replace(/^\s*\+\s*/, '').trim()).filter((x) => /^[A-Z0-9]/.test(x))) {
      m.set(n, [...(m.get(n) ?? []), line]);
    }
  }
  return [...m].map(([name, lines]) => ({ name, lines }));
};
describe('T3 one source per number', () => {
  it('the citywide figures are MF-62 templates filled from the stored row, equal to the demo lines; the rules count is universe.lock.json', async () => {
    const lines = citywideLines(FIXTURE_ROW, UNIVERSE.rows);
    const texts = citywideTexts(lines);
    const tpl = PRESENTATION.states.checked.lines.citywide as Record<string, string>;
    expect(Object.keys(texts)).toEqual(Object.keys(tpl).map((k) => `checked.citywide.${k}`));
    expect(texts['checked.citywide.regulations']).toBe(String(tpl.regulations).replace('{value}', Number(UNIVERSE.rows).toLocaleString('en-CA')));
    const l = await readLanding(fixtureDb('ok'));
    const demo = (l.report.demo?.checked?.groups[0]?.lines ?? []).map((x) => [`checked.citywide.${x.key}`, x.text]);
    expect(Object.fromEntries(demo)).toEqual(texts);
    // The labels are not copied into the landing's content (one home).
    for (const t of Object.values(tpl)) expect(Object.values(CONTENT)).not.toContain(t);
  });
  it('a missing row, a zero value or a partial row leaves the WHOLE group out (and the demo); RED: a partial row never renders 4 lines', async () => {
    for (const mode of ['no_row', 'zero'] as const) {
      vi.spyOn(logger, 'logWarn').mockImplementation(() => undefined);
      const l = await readLanding(fixtureDb(mode));
      expect([mode, l.state, Object.keys(l.values).filter((k) => k.startsWith('checked.')), l.report.demo]).toEqual([mode, 'degraded', [], undefined]);
      expect(parts(l.page).some((p) => p.role === 'checked' || p.role === 'demo')).toBe(false);
    }
    expect(citywideLines({ ...FIXTURE_ROW, coa_total: null }, UNIVERSE.rows)).toEqual([]);
    expect(await readCitywide(fixtureDb('zero'))).toEqual([]);
  });
  it('the scenario count and the hero list come from one declaration; every entry names an existing increments-table row', () => {
    const v = fileValues();
    expect(v.scenarios).toBe(String(SCENARIOS.scenarios.length));
    expect(v.scenario_list).toBe('detached houses, houseplexes, secondary suites, garden and laneway suites, and renovations');
    expect(scenarioList()).toBe(v.scenario_list);
    expect(scenarioProblems(SCENARIOS, INC_TABLE())).toEqual([]);
    expect(SCENARIOS.scenarios.map((s: Json) => s.increment)).toEqual(['1-2', '1-2', '3', '4', '5', '6']);
  });
  it('RED: an entry with increment 9b, a hero label not in the file, a typed count', () => {
    const bad = clone(SCENARIOS); bad.scenarios[2].increment = '9b';
    expect(scenarioProblems(bad, INC_TABLE())).toEqual(['houseplex: increment row 9b is not in the increments table']);
    expect(scenarioList([{ label: 'houseplexes' }, { label: 'mansions' }])).not.toBe(fileValues().scenario_list);
    expect(scenarioList(SCENARIOS.scenarios).split(', ').every((w: string) => SCENARIOS.scenarios.some((s: Json) => w.replace(/^and /, '') === s.label))).toBe(true);
    expect(Object.values(CONTENT).some((t) => /\b6\b/.test(t))).toBe(false);
  });
  it('the cost sources are the named sources of the Spec 88 section 3 table, each with its rate rows', () => {
    expect(SOURCES.sources).toEqual(specSources());
    expect(fileValues().cost_sources).toBe(String(specSources().length));
  });
  it('the allowances are the settings (migration 303 keys), server-formatted', async () => {
    const l = await readLanding(fixtureDb('ok'));
    expect([l.values.trial_reports, l.values.plan_reports]).toEqual([String(FIXTURE_LIMITS.parcel_tool_report_limit_trial), String(FIXTURE_LIMITS.parcel_tool_report_limit_plan)]);
  });
});

// ---- T4 pricing text ------------------------------------------------------------------------------------------------------------------------
export const pricingProblems = (content: Record<string, string>, page: StaticPage): string[] => {
  const out: string[] = [];
  for (const [k, t] of Object.entries(content)) {
    if (/\$|\bCAD\b|\/ month|\bGST\b|\bHST\b/.test(t) && !/^plans\.|^hero\.after$/.test(k)) out.push(`${k}: price text outside the plans section and the hero post-trial line`);
    if (/\$\s*\d/.test(t)) out.push(`${k}: a typed price`);
    if (/\bGST\b|plus tax/i.test(t)) out.push(`${k}: the tax words are "CAD, plus HST" (L-R4)`);
  }
  for (const s of page.sections) s.parts.forEach((p, i) => {
    if (p.role !== 'price') return;
    if (content[s.parts[i + 1]?.content ?? ''] !== '/ month' || content[s.parts[i + 2]?.content ?? ''] !== 'CAD, plus HST') out.push(`${s.id}: a price without "/ month" and "CAD, plus HST"`);
    if (p.value === undefined) out.push(`${s.id}: a price that is not a server read`);
  });
  return out;
};
describe('T4 pricing text', () => {
  it('no price is shown until the MF-47 Stripe reader exists (no typed price, no price part, no post-trial line)', () => {
    expect(pricingProblems(CONTENT, STATIC)).toEqual([]);
    expect(parts(STATIC).filter((p) => ['price', 'per', 'tax'].includes(p.role as string))).toEqual([]);
    expect(Object.keys(CONTENT).filter((k) => /price|after/.test(k))).toEqual([]);
  });
  it('RED: "Plus GST", a typed "$29", a price with no tax line', () => {
    const c = { ...CONTENT, 'plans.basic.price': '{value}', 'plans.basic.per': '/ month', 'plans.basic.tax': 'Plus GST', 'hero.term.card': 'From $29' };
    const p = clone(STATIC);
    (p.sections[4] as Json).parts.splice(6, 0, { role: 'price', content: 'plans.basic.price', value: 'plan_reports' }, { role: 'per', content: 'plans.basic.per' }, { role: 'tax', content: 'plans.basic.tax' });
    expect(pricingProblems(c, p)).toEqual([
      'hero.term.card: price text outside the plans section and the hero post-trial line', 'hero.term.card: a typed price',
      'plans.basic.tax: the tax words are "CAD, plus HST" (L-R4)',
      'pricing: a price without "/ month" and "CAD, plus HST"',
    ]);
  });
});

// ---- T5 links -------------------------------------------------------------------------------------------------------------------------------
const PAGES_ROOT = 'src/app/(maxbld)/parcel-tool';
const pageExists = (internal: string): boolean => {
  const rel = internal.replace(/^\/parcel-tool/, '');
  return [path.join(ROOT, PAGES_ROOT, rel, 'page.tsx'), path.join(ROOT, PAGES_ROOT, '(static)', rel, 'page.tsx')].some((f) => fs.existsSync(f));
};
export const linkProblems = (page: StaticPage): string[] => {
  const out: string[] = [];
  const anchors = new Set([...page.sections.map((s) => s.id), ...(parts(page).some((p) => p.role === 'sample') ? ['sample'] : [])]);
  const plans = new Set(Object.keys(CONTENT).filter((k) => /^plans\.\w+\.name$/.test(k)).map((k) => k.split('.')[1]));
  for (const p of parts(page).filter((x) => x.href !== undefined)) {
    const u = new URL(p.href as string, 'https://maxbld.ca');
    const row = matchMaxbldRoute(u.pathname);
    if (!row || row.routeClass !== 'public' || !row.internal || !pageExists(row.internal)) { out.push(`${p.href}: not a public host-table row with a page`); continue; }
    if (u.pathname === '/' && u.hash && !anchors.has(u.hash.slice(1))) out.push(`${p.href}: no such anchor on the page`);
    if (u.pathname === '/help' && u.hash && u.hash !== '#topic=enterprise') out.push(`${p.href}: not a help topic`);
    for (const [k, v] of u.searchParams) if (k !== 'plan' || u.pathname !== '/signup' || !plans.has(v)) out.push(`${p.href}: ${k}=${v} is not a declared plan key on /signup`);
  }
  return out;
};
describe('T5 every control is a real link', () => {
  it('every href is a public host-table row with a page behind it, an anchor that exists, or a declared plan key', () => {
    expect(linkProblems(STATIC)).toEqual([]);
    expect(linkProblems(DEGRADED)).toEqual([]);
    const hrefs = [...new Set(parts(STATIC).filter((p) => p.href).map((p) => p.href as string))].sort();
    expect(hrefs).toEqual(['/', '/#how', '/#pricing', '/help', '/help#topic=enterprise', '/login', '/privacy', '/signup', '/signup?plan=basic', '/signup?plan=pro', '/terms']);
  });
  it('RED: /contact, a plan that is not declared, an anchor that does not exist', () => {
    const p = clone(STATIC);
    const links = (p.sections[4] as Json).parts.filter((x: Json) => x.role === 'link');
    links[0].href = '/contact'; links[1].href = '/signup?plan=gold'; (p.sections[0] as Json).parts[1].href = '/#faq';
    expect(linkProblems(p)).toEqual(['/#faq: no such anchor on the page', '/contact: not a public host-table row with a page', '/signup?plan=gold: plan=gold is not a declared plan key on /signup']);
  });
});

describe('T7 the disclaimer, verbatim, from one key', () => {
  it('the hero and the footer show footer.legal, which is the ruled short line', () => {
    expect(CONTENT['footer.legal']).toBe(LEGAL);
    const legal = parts(STATIC).filter((p) => p.role === 'legal');
    expect(legal.map((p) => p.content)).toEqual(['footer.legal', 'footer.legal']);
    expect(Object.entries(CONTENT).filter(([, t]) => /legal advice/i.test(t)).map(([k]) => k)).toEqual(['footer.legal']);
  });
  it('RED: one changed character is not the ruled line', () => {
    expect(LEGAL.replace('City.', 'City!')).not.toBe(CONTENT['footer.legal']);
  });
});

describe('T8 the sample tree is regenerated, never hand-edited', () => {
  it('the generator rebuilds the committed file byte for byte; the made-up address; the caption follows the sample', () => {
    expect(captureLandingSample(ROOT)).toBe(fs.readFileSync(path.join(ROOT, LANDING_SAMPLE), 'utf8'));
    const s = rj(LANDING_SAMPLE);
    expect([s.address, s.response_fixture.synthetic, s.surface]).toEqual(['24 Sample Avenue', true, 'web_landing']);
    const hero = parts(STATIC).map((p) => p.role);
    expect(hero[hero.indexOf('sample') + 1]).toBe('caption');
    expect(CONTENT['sample.caption']).toBe('Sample report. Address and figures are illustrative.');
  });
  it('RED: a hand edit of the committed tree differs from a rebuild', () => {
    const s = rj(LANDING_SAMPLE);
    s.rendered_tree.sections[0].parts[0].text = 'Edited';
    expect(`${JSON.stringify(s, null, 2)}\n`).not.toBe(captureLandingSample(ROOT));
  });
});

// ---- T9 the reveal and reduced motion -------------------------------------------------------------------------------------------------------
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
export const revealProblems = (css: string): string[] => {
  const out: string[] = [];
  const at = css.indexOf('.landing-sample {');
  const all = at < 0 ? '' : css.slice(at);
  const base = block(all, /\.landing-sample\s*\{/);
  if (!/animation:[^;]*report-check-in[^;]*backwards/.test(base) || !/animation-delay:\s*var\(--reveal/.test(base)) out.push('sample: fades in at the server minimum --reveal, fill backwards');
  if (/infinite/.test(all)) out.push('no infinite animation');
  if (/display:\s*none|visibility:\s*hidden/.test(all)) out.push('opacity only (the sample stays in the accessibility tree)');
  // MF-76 OUTPUT compliance F2 (WCAG 2.4.7, 2.4.11): one rule for :target and :focus-within, so a focused sample is never invisible.
  if (!/animation:\s*none/.test(block(all, /\.landing-sample:target,\s*\.landing-sample:focus-within\s*\{/))) out.push('Skip (#sample) and a focus inside show it at once');
  if (!/\.landing-sample\s*\{\s*animation:\s*none/.test(block(all, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/))) out.push('reduce motion shows it at once');
  return out;
};
describe('T9 the reveal and reduced motion', () => {
  const CSS = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
  it('the sample block: opacity only, one run, at once on :target and under reduce motion', () => {
    expect(revealProblems(CSS)).toEqual([]);
  });
  it('RED: an infinite pulse, a display none, no reduce-motion rule', () => {
    expect(revealProblems(CSS.replace('animation: report-check-in 400ms ease-out backwards;\n  animation-delay: var(--reveal', 'animation: report-check-in 400ms ease-out backwards infinite;\n  animation-delay: var(--reveal'))).toEqual(['no infinite animation']);
    expect(revealProblems(CSS.replace('.landing-sample:focus-within {\n  animation: none;', '.landing-sample:focus-within {\n  display: none;'))).toEqual(['opacity only (the sample stays in the accessibility tree)', 'Skip (#sample) and a focus inside show it at once']);
    expect(revealProblems(CSS.replace('.landing-sample:target,\n.landing-sample:focus-within {', '.landing-sample:target {'))).toEqual(['Skip (#sample) and a focus inside show it at once']);
    expect(revealProblems(CSS.replace('@media (prefers-reduced-motion: reduce) {\n  .landing-sample { animation: none; }\n}', ''))).toEqual(['reduce motion shows it at once']);
  });
});

describe('T10 the route', () => {
  const MOUNT = 'src/app/(maxbld)/parcel-tool/(static)/home/page.tsx';
  it('the landing is a static segment under (static) (it wins over [parcelId]), public, no gate, read per request; its metadata is from content', () => {
    const text = fs.readFileSync(path.join(ROOT, MOUNT), 'utf8');
    expect(matchMaxbldRoute('/')).toEqual({ path: '/', match: 'exact', routeClass: 'public', internal: '/parcel-tool/home' });
    expect(pageExists('/parcel-tool/home')).toBe(true);
    const code = text.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // code lines only (the header names what the page never calls)
    expect(/require-parcel-tool-page|requireParcelToolPage|next\/headers|cookies\(/.test(code)).toBe(false);
    expect(/require-parcel-tool-page/.test("import { requireParcelToolPage } from '@/lib/auth/require-parcel-tool-page';")).toBe(true); // the scan is live
    expect(text).toMatch(/export const dynamic = 'force-dynamic';/);
    expect(landingMetadata()).toEqual({ title: 'MaxBLD Lot Intelligence', description: `Costed MaxBLD scenarios for the specific lot you enter: ${fileValues().scenario_list}.` });
  });
});

describe('T14b the demo failure branches (OUTPUT code reviewer 1; compliance F3 a)', () => {
  const demoOut = async (db: ReturnType<typeof fixtureDb>): Promise<{ demo: boolean; state: string; warns: number; errors: unknown[] }> => {
    const warn = vi.spyOn(logger, 'logWarn').mockImplementation(() => undefined);
    const err = vi.spyOn(logger, 'logError').mockImplementation(() => undefined);
    const l = await readLanding(db);
    return { demo: l.report.demo !== undefined, state: l.state, warns: warn.mock.calls.length, errors: err.mock.calls.map((c) => (c[2] as Json).read) };
  };
  it('a missing pace setting, a pace that leaves no room, a Skip delay above 0 and a throwing pace read each leave the demo out, page static, logged once', async () => {
    expect(await demoOut(fixtureDb('ok', { pace: { [REPORT_CHECK_KEYS.minMs]: undefined } }))).toEqual({ demo: false, state: 'static', warns: 1, errors: [] });
    vi.restoreAllMocks();
    expect(await demoOut(fixtureDb('ok', { pace: { [REPORT_CHECK_KEYS.minMs]: 1501, [REPORT_CHECK_KEYS.readyHoldMs]: 1500 } }))).toEqual({ demo: false, state: 'static', warns: 1, errors: [] });
    vi.restoreAllMocks();
    expect(await demoOut(fixtureDb('ok', { pace: { [REPORT_CHECK_KEYS.skipAfterMs]: 5000 } }))).toEqual({ demo: false, state: 'static', warns: 1, errors: [] });
    vi.restoreAllMocks();
    expect(await demoOut(fixtureDb('ok', { paceThrows: true }))).toEqual({ demo: false, state: 'static', warns: 0, errors: ['demo'] });
    vi.restoreAllMocks();
    expect(await demoOut(fixtureDb('ok'))).toEqual({ demo: true, state: 'static', warns: 0, errors: [] });
  });
});

describe('T14 a reader that throws', () => {
  it('the page still builds (degraded, no allowance parts), one logError per failed read, never a throw', async () => {
    const err = vi.spyOn(logger, 'logError').mockImplementation(() => undefined);
    const db = fixtureDb('throws');
    const l = await readLanding(db);
    expect(l.state).toBe('degraded');
    expect(Object.keys(l.values).sort()).toEqual(['cost_sources', 'scenario_list', 'scenarios']);
    expect(parts(l.page).filter((p) => p.value === 'trial_reports' || p.value === 'plan_reports')).toEqual([]);
    expect(err.mock.calls.map((c) => (c[2] as Json).read).sort()).toEqual(['citywide', 'report_limits']);
    expect(() => staticWebTree(l.page)).not.toThrow();
  });
  it('RED: with the readers healthy the allowance parts and the citywide group are there', async () => {
    const l = await readLanding(fixtureDb('ok'));
    expect([l.state, parts(l.page).filter((p) => p.value === 'trial_reports').length, parts(l.page).some((p) => p.role === 'checked')]).toEqual(['static', 2, true]);
  });
});

describe('T15 no cookie for a signed-out GET / on maxbld.ca', () => {
  it('the real middleware (session refresh included, no session) sets no cookie and rewrites to the landing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
    const { middleware } = await import('@/middleware');
    const res = await middleware(new NextRequest('https://maxbld.ca/', { headers: { host: 'maxbld.ca' } }));
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.cookies.getAll()).toEqual([]);
    expect(new URL(res.headers.get('x-middleware-rewrite') ?? 'https://x.invalid/').pathname).toBe('/parcel-tool/home');
    vi.unstubAllEnvs();
  });
});
