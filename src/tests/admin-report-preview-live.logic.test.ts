// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05 (the server formats; no maths in the report folders), FE-34 (the v21
//            page contract), FE-18 (every displayed field binds to a source in the closed set); docs/specs/01-pipeline/69a_mcbylaw_register.md M-384
//            (Layer 3 stored tables); docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7; docs/specs/02-web-admin/33_web_admin_engineering_protocol.md section 8.
//
// MB-93 · the internal preview producer (operator 2026-11-11 "D-1 b and D-2 to D-8 a"; plan ~/Buildo-scratch/mcfrontend/PREVIEW/plan.md sections 3-6
// with the section 9 folds). Locks, red first (docs/reports/red-evidence/MB-93/producer-red.txt):
//   F   the FE-05 formatter: the v21 golden strings, the pinned grouping, parity with the mobile helpers, honest refusals, its directory and no imports;
//   G25 the golden-25 key equals the producer's payload wherever the key states a Layer 3 value the page binds (rows from the step's own compute);
//   L4  every payload passes buildPage, never carries `synthetic`, only page-table keys;
//   ST  option states (permitted / hidden / not_evaluated / not_modelled / gated / no rows / table absent) and freshness verdicts;
//   INV the cross-field invariants on the 25 (fold 7);
//   L3/L6 the DB side: an invalid id or the switch off / missing / garbage / errored reads no lot data; id resolution parcel_id -> parcels.id;
//   L1  the import fence: no customer route or mobile file imports the producer; the producer imports no meter, entitlement or consumer lookup.
// task-442 (FINAL.7, plan section 3; operator RR-0385 "interface between the frontend and databse"), red first through the real hooks:
//   B1  fe.05, fe.18: every number in an option section is a McBylaws row the engine writes for that section's building type.
//   B2  fe.05: no number reaches the page through a content text of the `page` block, except the three listed entries.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { formatPageRule as formatPageRuleWith, PAGE_RULES, TEXT_RULES } from '@/lib/report-projection/format';
import { CURRENT_SEED_SHAS } from '@/lib/report-projection/seed-shas';
import { pageBindings, pageOptions, projectStoredPage, SQFT_PER_M2, type StoredRow, type LotStamp } from '@/lib/report-projection/project';
// FIX.PROJ (task-372): the formatter takes the factor as a parameter (it imports nothing); the page reads it once in project.ts.
const formatPageRule = (rule: string, n: number) => formatPageRuleWith(rule, n, SQFT_PER_M2);
import { readPreviewSwitch, storedPageResponse, PREVIEW_SWITCH_KEY, type Queryable } from '@/lib/admin/report-preview-live/stored-page';
import { buildPage } from '@/lib/surfaces/report/core';
import { reportCtx } from '@/lib/surfaces/report/data';
import { logError, logInfo } from '@/lib/logger';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface and fixture JSON
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readJsonl = (rel: string): Json[] => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
const DIR = 'src/lib/admin/report-preview-live';
// MB-44 W share-out (task-123): the pure core (project, format, seed-shas) and the stored read moved here, shared by the admin preview and the customer read module.
const PROJ = 'src/lib/report-projection';
const PAGE = readJson('scripts/surfaces/_schema/report-page.json');
const PAGE_KEYS = new Set<string>((PAGE.sections as Json[]).flatMap((s) => [...(s.field ? [s.field] : []), ...((s.parts ?? []) as Json[]).filter((p) => p.field).map((p) => p.key)]));

// ---- the golden-25 stored rows: the step's OWN compute on the fixture inputs (the golden-25.logic.test.ts loader, unchanged) ----
const FIX = 'src/tests/fixtures/layer3/golden-25';
const SEEDS: Json = {
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  logicVariables: readJson('scripts/seeds/logic_variables.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
  layer2Classes: readJson('scripts/seeds/bylaw/layer2-scope.json').classes,
  layer2Options: readJson('scripts/seeds/bylaw/layer2-scope.json').options,
};
const META = { layer2_table_version: 'golden-25', settings_sha: 'golden-25' };
const toCell = (c: Json): Json => {
  if (c.status === 'not_evaluated') return { s: 'not_evaluated', kind: null, value: null, clause: null, reason: c.reason };
  if (c.status === 'not_applicable') return { s: 'not_applicable', clause: c.clause, reason: null };
  return { s: 'applies', kind: c.kind, value: c.value, clause: c.clause, reason: null };
};
const optionRow = (o: Json, cls: string): Json => ({
  class: cls, structure: 'principal', target: o.target, option: o.option, shared_with_base: o.shared === true, status: o.status,
  value_kind: o.kind === '' ? null : o.kind, value: o.value, reason: o.reason === '' ? null : o.reason, winner_unit_id: o.clause === '' ? null : o.clause,
});
const parcelInput = (line: Json, parcelId: number, hp: boolean): Json => {
  const C = req(path.join(ROOT, 'scripts/lib/compute/maxbld/layer2-cells.js')) as Json;
  const MZ = req(path.join(ROOT, 'scripts/lib/bylaw-materialize.js')) as Json;
  const cls = hp ? 'detached_houseplex' : 'detached_house';
  const l2Options = C.decodeOptionCells(((hp ? line.phase2_options_houseplex : line.phase2_options) || []).map((o: Json) => optionRow(o, cls)), cls, 'principal', { designOptions: SEEDS.vocab.design_options, notAbove: MZ.withNotAbove });
  const parcel = line.parcel || {};
  const l2: Json = {};
  for (const [t, c] of Object.entries((hp ? line.phase2_houseplex : line.phase2) || {})) l2[t] = toCell(c as Json);
  const neighbours = (line.abutments || []).map((a: Json) => ({ same_street: a.sameStreet, residential: a.res, bldg_m: a.bldg, est: a.est, est_status: a.st }));
  const street = line.street_pool ? line.street_pool.values.map((v: number, i: number) => ({ id: i + 1, est: v })) : [];
  return {
    parcel_id: parcelId, l2, l2Options, perm: { code: line.permitted_word.code, gate: line.permitted_word.gate },
    geometry: { lot_frontage_m: parcel.frontage, lot_depth_m: parcel.depth, lot_area_m2: parcel.area }, flags: { corner_lot: parcel.corner },
    neighbours: { user: [], neighbours, own: null, street, zone: [], ring: [], bt_units: hp ? 4 : 1 },
  };
};
const S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
const CASES = readJsonl(`${FIX}/inputs.jsonl`);
const KEY = readJsonl(`${FIX}/expected.jsonl`);
const PARCELS = readJson(`${FIX}/parcels-rows.json`) as unknown as Json[];
/** As stored: the detached house rows of the house run and the houseplex rows of the houseplex run (what golden-25.logic.test.ts checks). */
const storedRowsOf = (k: Json): StoredRow[] => {
  const line = CASES.find((c) => c.case === k.case) as Json;
  const house = (S.buildParcelRows(parcelInput(line, k.parcel_id, false), SEEDS, META) as Json[]).filter((r) => r.building_type === 'detached_house');
  const hp = (S.buildParcelRows(parcelInput(line, k.parcel_id, true), SEEDS, META) as Json[]).filter((r) => r.building_type === 'detached_houseplex');
  // pg returns NUMERIC as a string: store the value the way the read returns it
  return [...house, ...hp].map((r) => ({ ...r, value: r.value === null ? null : String(r.value) }) as StoredRow);
};
const lotOf = (k: Json) => {
  const p = PARCELS.find((x) => Number(x.id) === Number(k.parcel_id)) as Json;
  return { id: Number(p.id), parcel_id: String(p.parcel_id), address: k.addr as string, zoning: String(p.zoning_zn_string), columns: { lot_size_sqm: p.lot_size_sqm } };
};
const STAMP: LotStamp = { lot_gate: null, table_version: 'golden-25', evaluator_version: 'golden-25' };
const fmt = (rule: string, n: number, unit = false): string => {
  const f = formatPageRule(rule, n) as { value: string; unit?: string };
  return (unit ? f.unit : f.value) as string;
};

describe('F: the FE-05 server formatter (outside the no-maths directories)', () => {
  it('gives the v21 synthetic golden strings', () => {
    expect(formatPageRule('area_sqft', 248.05)).toEqual({ value: '2,670', unit: 'sq ft' });
    expect(formatPageRule('area_m2', 248.05)).toEqual({ value: '248 m²' });
    expect(formatPageRule('area_sqft_m2_paren', 248.05)).toEqual({ value: '2,670 sq ft (248 m²)' });
    expect(formatPageRule('area_sqft_m2_paren', 120)).toEqual({ value: '1,292 sq ft (120 m²)' });
    expect(formatPageRule('area_sqft_m2_paren', 68.65)).toEqual({ value: '739 sq ft (69 m²)' });
    expect(formatPageRule('area_sqft_m2_dot', 284)).toEqual({ value: '3,057 sq ft · 284 m²' });
    expect(formatPageRule('int', 3)).toEqual({ value: '3' });
    expect(formatPageRule('int', 12)).toEqual({ value: '12' });
  });
  it('pins the grouping, formats a stored 0 as "0", and refuses honestly', () => {
    expect(formatPageRule('area_sqft', 1076 / SQFT_PER_M2)?.value).toBe('1,076');
    expect(formatPageRule('int', 1234567)?.value).toBe('1,234,567');
    expect(formatPageRule('area_m2', 0)?.value).toBe('0 m²');
    expect(formatPageRule('int', 0)?.value).toBe('0');
    expect(formatPageRule('int', 2.5)).toBeNull();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) expect(formatPageRule('area_m2', bad)).toBeNull();
    expect(formatPageRule('pct0', 3)).toBeNull();
  });
  it('the five page rules are exactly the rules the page table binds; the 15 flagged rules stay pending', () => {
    // D-46 (dated 2026-11-11): a user_input field is never formatted by the preview (never a value), so its rule (date_dmy on entered.date) is not a preview rule.
    const bound = new Set(pageBindings().filter((b) => b.source.kind !== 'user_input').map((b) => b.rule));
    expect([...bound].sort()).toEqual([...PAGE_RULES, ...TEXT_RULES, 'reason_text'].sort()); // K2: the closed text rules and the reason rule (project.ts)
    for (const r of PAGE.fe05_flagged_rules as string[]) expect(bound.has(r)).toBe(false);
  });
  it('matches the mobile helpers digit for digit on shared samples (parity; mobile untouched)', async () => {
    // a runtime path: the root tsconfig excludes mobile/ (its @/ alias is the app's); vitest loads the file and erases its type-only import
    const MOBILE = path.join(ROOT, 'mobile/src/lib/parcelCostFormat.ts');
    const { formatSqft, formatSqm } = (await import(MOBILE)) as { formatSqft: (m: number) => string | null; formatSqm: (m: number) => string | null };
    for (const m of [0, 1, 9.29, 99.96, 120, 248.05, 284, 395.6, 1000, 5000, 92903.04]) {
      expect(`${fmt('area_sqft', m)} sq ft`).toBe(formatSqft(m));
      expect(fmt('area_m2', m)).toBe(formatSqm(m));
    }
  });
  it('lives outside the four directories the no-maths lock scans, and the formatter imports nothing', () => {
    const lock = fs.readFileSync('src/tests/surfaces/report-no-maths.logic.test.ts', 'utf8');
    const dirs = JSON.parse(((/const DIRS = (\[[^\]]*\])/.exec(lock) as RegExpExecArray)[1] as string).replace(/'/g, '"')) as string[];
    expect(dirs.length).toBe(4);
    for (const d of dirs) { expect(DIR.startsWith(d)).toBe(false); expect(PROJ.startsWith(d)).toBe(false); }
    expect(fs.readFileSync(`${PROJ}/format.ts`, 'utf8')).not.toMatch(/^\s*import\b|require\(/m);
    expect(fs.existsSync(`${PROJ}/format.ts`)).toBe(true);
  });
});

// B1 (task-442 T1; fe.05 "every number from McBylaws", fe.18 the closed binding set, 136:46 and 136:85). The rows are the engine's own stored rows
// from this file's harness (storedRowsOf), so the check copies no rule of the generator and reads no switch. pageBindings emits three source kinds:
// catalogue (checked here), parcels (task-442 T2, customer-report-read.logic.test.ts) and user_input (the lot-size entry, a design exception by fe.18).
// Not checked here: the declared half (RS-1 and RS-3, scripts/analysis/report-schema.mjs:148-203), one declared field per effective-ON row
// (src/tests/surfaces/report-generator-fields.logic.test.ts:83), and the design option of o1 and o2 (the type before the slash only, as project.ts does).
type Bindings = ReturnType<typeof pageBindings>;
/** One finding `<section> <field_id> <building_type>` per catalogue-bound option pair whose row the engine did not write, or wrote switched off. */
const unwritten = (bindings: Bindings, rows: StoredRow[]): { findings: string[]; checked: number } => {
  const pairs = new Map<string, { field_id: string; building_type: string }>();
  for (const b of bindings) {
    if (b.building_type === null || b.source.kind !== 'catalogue') continue;
    pairs.set(`${b.section} ${b.source.field_id} ${b.building_type}`, { field_id: b.source.field_id, building_type: b.building_type });
  }
  const findings: string[] = [];
  for (const [pair, p] of pairs) {
    const r = rows.find((x) => x.building_type === p.building_type && x.field_id === p.field_id);
    // no row: the catalogue row is missing, does not list the type, or is off with an increment other than 1 (rows.js:511 drops it);
    // switched_off: an increment-1 row that is off is still written, as not_evaluated (rows.js:402)
    if (!r || String(r.reason ?? '').startsWith('switched_off:')) findings.push(pair);
  }
  return { findings, checked: pairs.size };
};

describe('B1: every number in an option section is a McBylaws row the engine writes for that section\'s building type (fe.05, fe.18)', () => {
  const k = KEY[0] as Json;
  it('(a) control: the committed page and seeds give no finding, over at least 17 checked pairs (non-vacuous)', () => {
    const rows = storedRowsOf(k);
    const { findings, checked } = unwritten(pageBindings(), rows);
    expect(findings).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(17);
  });
  it('(b) a copy of the rows without the gfa_max_m2 row of detached_houseplex gives exactly one finding, in o3', () => {
    const rows = storedRowsOf(k).filter((r) => !(r.building_type === 'detached_houseplex' && r.field_id === 'gfa_max_m2'));
    expect(unwritten(pageBindings(), rows).findings).toEqual(['o3 gfa_max_m2 detached_houseplex']);
  });
  it('(c) a copy of the rows whose storeys_max row of detached_house is switched off gives a finding for o1 and o2', () => {
    const rows = storedRowsOf(k).map((r) => (r.building_type === 'detached_house' && r.field_id === 'storeys_max' ? { ...r, status: 'not_evaluated', value: null, reason: 'switched_off:formula:storeys_max' } : r));
    expect(unwritten(pageBindings(), rows).findings).toEqual(['o1 storeys_max detached_house', 'o2 storeys_max detached_house']);
  });
  it('(d) a copy of the rows without any detached_houseplex row gives one finding per o3 pair', () => {
    const o3Pairs = new Set(pageBindings().flatMap((b) => (b.section === 'o3' && b.source.kind === 'catalogue' ? [b.source.field_id] : []))).size;
    const rows = storedRowsOf(k).filter((r) => r.building_type !== 'detached_houseplex');
    const { findings } = unwritten(pageBindings(), rows);
    expect(o3Pairs).toBeGreaterThanOrEqual(1);
    expect(findings).toHaveLength(o3Pairs);
    expect(findings.every((f) => f.startsWith('o3 ') && f.endsWith(' detached_houseplex'))).toBe(true);
  });
});

// B2 (task-442 T3; fe.05 "every number from McBylaws", 136:46). Every key of the presentation registry's `page` block is scanned (all 90 today),
// so a key no page part names is covered too. A text holding a digit is a finding keyed by its content key, counted in digit runs. The list below
// is fail-closed both ways (the nav-by-route.logic.test.ts form): a finding no entry explains fails, and an entry whose count differs (a stale
// entry: 0) fails; the list only shrinks. Limits: digits only (a number written in words passes); the other registry blocks (status_text,
// display_label, disclosure_texts, trust_label and the rest) are the next round of this card for fe.05: today their digits are notes, ids and
// ruling labels, plus one shown status text (not_evaluated:coa_factor_unfitted:suite) that cites Q-4. No renderer code is scanned (task-367, fe.45).
interface DigitText { key: string; count: number; kind: 'legal' | 'input_hint' | 'exception'; why: string }
const DIGIT_TEXTS: DigitText[] = [
  { key: 'legal.line', count: 1, kind: 'legal', why: 'legal copy is a content field (fe.18, 136:85)' },
  { key: 'sheet.width_placeholder', count: 1, kind: 'input_hint', why: 'an example hint of the lot-size entry box; it shows no value of the lot and is help text, a content field by fe.18 (136:85)' },
  { key: 'sheet.depth_placeholder', count: 1, kind: 'input_hint', why: 'an example hint of the lot-size entry box; it shows no value of the lot and is help text, a content field by fe.18 (136:85)' },
];
/** Every problem of a `page` text block against the list: an unexplained digit text, or an entry whose count does not match (stale = 0). */
const digitAudit = (texts: Record<string, string>, list: DigitText[]): { problems: string[]; scanned: number } => {
  const found = new Map<string, number>();
  for (const [key, text] of Object.entries(texts)) {
    const runs = String(text).match(/\d+/g)?.length ?? 0;
    if (runs > 0) found.set(key, runs);
  }
  const problems: string[] = [];
  for (const [key, runs] of found) if (!list.some((e) => e.key === key)) problems.push(`unexplained: ${key} (${runs} digit run${runs === 1 ? '' : 's'})`);
  for (const e of list) if ((found.get(e.key) ?? 0) !== e.count) problems.push(`stale: ${e.key} (listed ${e.count}, found ${found.get(e.key) ?? 0})`);
  return { problems, scanned: Object.keys(texts).length };
};
const PAGE_TEXT = readJson('scripts/surfaces/_schema/report-presentation.json').page as Record<string, string>;

describe('B2: no number reaches the page through a content text, except the listed entries (fe.05)', () => {
  it('(a) every digit text is explained by an entry, every entry matches exactly its count, and every key of `page` is scanned', () => {
    const texts = { ...PAGE_TEXT };
    const { problems, scanned } = digitAudit(texts, DIGIT_TEXTS);
    expect(problems).toEqual([]);
    expect(scanned).toBe(Object.keys(PAGE_TEXT).length);
    expect(scanned).toBeGreaterThanOrEqual(90);
  });
  it('(b) a page-text copy with "5 m" added to row.unit_size_basis fails, naming that key; a stale entry fails too', () => {
    const planted = { ...PAGE_TEXT, 'row.unit_size_basis': `${PAGE_TEXT['row.unit_size_basis']} 5 m` };
    expect(digitAudit(planted, DIGIT_TEXTS).problems).toEqual(['unexplained: row.unit_size_basis (1 digit run)']);
    const stale: DigitText = { key: 'row.unit_size_basis', count: 1, kind: 'legal', why: 'planted stale entry' };
    expect(digitAudit(PAGE_TEXT, [...DIGIT_TEXTS, stale]).problems).toEqual(['stale: row.unit_size_basis (listed 1, found 0)']);
  });
  it('(c) the list holds exactly three entries, none of kind exception, each with a why (the list only shrinks)', () => {
    expect(DIGIT_TEXTS.map((e) => e.key)).toEqual(['legal.line', 'sheet.width_placeholder', 'sheet.depth_placeholder']);
    expect(DIGIT_TEXTS.filter((e) => e.kind === 'exception')).toEqual([]);
    for (const e of DIGIT_TEXTS) expect(e.why.length, e.key).toBeGreaterThan(20);
  });
});

describe('the current seed hashes equal the step\'s own (twin parity)', () => {
  it('catalogue and switchboard', () => {
    const cat = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js')) as Json;
    const theirs = cat.seedShas(SEEDS);
    expect(CURRENT_SEED_SHAS).toEqual({ catalogue_sha: theirs.catalogue_sha, switchboard_sha: theirs.switchboard_sha });
  });
});

describe('G25: the golden-25 key equals the producer payload wherever the key states a bound Layer 3 value', () => {
  let compared = 0;
  for (const k of KEY) {
    it(`case ${k.case}`, () => {
      const { response, lineage } = projectStoredPage({ lot: lotOf(k), stamp: STAMP, rows: storedRowsOf(k), current: CURRENT_SEED_SHAS });
      expect(() => buildPage(response, reportCtx)).not.toThrow();
      expect(lineage.freshness.verdict).toBe('current');
      const v = response.values;
      const expectKey = (key: string, want: string | undefined): void => {
        compared += 1;
        expect(v[key], `${k.case} ${key}`).toBe(want);
      };
      // the detached house (o1 pitched, o2 flat): permitted, storeys, footprint, units; the gfa headline names its variant
      expect(k.permitted.s).toBe('permitted');
      for (const o of ['o1', 'o2']) {
        expect(response.hidden).not.toContain(o);
        expect(response.not_evaluated).not.toContain(o);
        expectKey(`${o}.row.storeys`, k.storeys.s === 'number' ? fmt('int', k.storeys.v) : undefined);
        expectKey(`${o}.row.footprint`, k.footprint.s === 'number' ? fmt('area_sqft_m2_paren', k.footprint.v) : undefined);
        expectKey(`${o}.row.homes`, k.units.s === 'number' ? fmt('int', k.units.v) : undefined);
      }
      const head = ((k.gfa.flags ?? []) as string[]).find((f) => f.startsWith('headline:'));
      const o = head === 'headline:gfa_flat_m2' ? 'o2' : head === 'headline:gfa_pitched_m2' ? 'o1' : null;
      if (o && k.gfa.s === 'number') {
        expectKey(`${o}.size.value`, fmt('area_sqft', k.gfa.v));
        expectKey(`${o}.size.unit`, 'sq ft');
        expectKey(`${o}.size.m2`, fmt('area_m2', k.gfa.v));
        expectKey(`${o}.row.max`, fmt('area_sqft_m2_paren', k.gfa.v));
      }
      // the detached houseplex (o3): gfa, storeys, units where the key states them
      const hp: Json = k.houseplex ?? {};
      const hpPermitted = lineage.options.o3?.stored_status === 'permitted';
      if (hpPermitted) {
        if (hp.gfa) {
          expectKey('o3.size.value', hp.gfa.s === 'number' ? fmt('area_sqft', hp.gfa.v) : undefined);
          expectKey('o3.row.max', hp.gfa.s === 'number' ? fmt('area_sqft_m2_paren', hp.gfa.v) : undefined);
        }
        if (hp.storeys) expectKey('o3.row.storeys', hp.storeys.s === 'number' ? fmt('int', hp.storeys.v) : undefined);
        if (hp.units) expectKey('o3.row.units', hp.units.s === 'number' ? fmt('int', hp.units.v) : undefined);
      } else {
        expect([...response.hidden, ...response.not_evaluated]).toContain('o3');
      }
      // the lot size from the parcels row
      const lot = Number(lotOf(k).columns.lot_size_sqm);
      expectKey('lot.size', fmt('area_sqft_m2_dot', lot));
      expectKey('sheet.record', fmt('area_sqft_m2_dot', lot));
    });
  }
  it('compared cells were counted (non-vacuous)', () => {
    expect(compared).toBeGreaterThan(25 * 10);
  });
});

describe('INV: cross-field invariants of the stored values on the 25 (fold 7)', () => {
  for (const k of KEY) {
    it(`case ${k.case}`, () => {
      const rows = storedRowsOf(k);
      const n = (bt: string, f: string): number | null => {
        const r = rows.find((x) => x.building_type === bt && x.field_id === f);
        return r && r.status === 'computed' ? Number(r.value) : null;
      };
      const lot = Number(lotOf(k).columns.lot_size_sqm);
      for (const bt of ['detached_house', 'detached_houseplex']) {
        const fp = n(bt, 'footprint_max_m2');
        if (fp !== null) expect(fp, `${k.case} ${bt} footprint <= lot`).toBeLessThanOrEqual(lot);
        const um = n(bt, 'units_max');
        if (um !== null) expect(um, `${k.case} ${bt} units_max >= 1`).toBeGreaterThanOrEqual(1);
      }
      const uc = n('detached_houseplex', 'unit_count');
      const um = n('detached_houseplex', 'units_max');
      const ua = n('detached_houseplex', 'unit_area_m2');
      const gm = n('detached_houseplex', 'gfa_max_m2');
      const fh = n('detached_houseplex', 'footprint_max_m2');
      if (uc !== null && um !== null) expect(uc, `${k.case} unit_count <= units_max`).toBeLessThanOrEqual(um);
      // The catalogue row unit_area_m2 (layer3-catalogue.json, M-496) counts the basement: (1 - circulation) x (gfa_max + footprint) / unit_count.
      // So the ruled bound is gfa_max + footprint, not gfa_max alone (the plan fold 7 / reality F-6 wording; measured: 24 of 25 exceed gfa_max alone).
      if (uc !== null && ua !== null && gm !== null && fh !== null) expect(uc * ua, `${k.case} unit_count x unit_area <= gfa_max + footprint`).toBeLessThanOrEqual(gm + fh + 0.01);
    });
  }
});

describe('L4 and ST: the payload contract and the option states', () => {
  const k = KEY[0] as Json;
  const base = (): StoredRow[] => storedRowsOf(k);
  const run = (rows: StoredRow[] | null, stamp: LotStamp | null = STAMP) => projectStoredPage({ lot: lotOf(k), stamp, rows, current: CURRENT_SEED_SHAS });
  const withPermitted = (bt: string, status: string): StoredRow[] => base().map((r) => (r.building_type === bt && r.field_id === 'permitted' ? { ...r, status } : r));
  const optionKeys = (o: string, values: Record<string, string>): string[] => Object.keys(values).filter((x) => x.startsWith(`${o}.`));

  it('never sends synthetic; only page keys; only the page response keys; buildPage passes', () => {
    for (const rows of [base(), [], null]) {
      const { response } = run(rows);
      expect(Object.keys(response).sort()).toEqual(['hidden', 'not_evaluated', 'page', 'values']);
      expect('synthetic' in response).toBe(false);
      for (const key of Object.keys(response.values)) expect(PAGE_KEYS.has(key), key).toBe(true);
      expect(() => buildPage(response, reportCtx)).not.toThrow();
    }
  });
  it('the table absent: every option not evaluated, only the lot size sent, verdict not stored', () => {
    const { response, lineage } = run(null);
    expect(response.not_evaluated).toEqual(pageOptions().map((o) => o.id));
    expect(response.hidden).toEqual([]);
    // named re-pin (MB-94 (c), Spec 126 11a.3 dated note 2026-11-12 R-2): was ['lot.size', 'sheet.record']; each option now also sends its reason sentence (See details), "Not yet evaluated"
    expect(Object.keys(response.values).sort()).toEqual(['lot.size', 'o1.panel.reason', 'o2.panel.reason', 'o3.panel.reason', 'sheet.record']);
    expect(lineage.freshness).toMatchObject({ verdict: 'not_stored', not_stored_reason: 'table_absent' });
  });
  // MB-94 (c) RED FIRST, Spec 126 11a.3 dated note 2026-11-12 (R-2 literal): the reason is the state of EVERY option on a lot that has no stored Layer 3 rows,
  // whatever its stamp or gate (the staged tree also required a stamp and no gate: recut, task-121); a lot WITH rows is unchanged.
  describe('R-2 not_in_engine_population on every no-row lot', () => {
    const SENTENCE = 'Not yet evaluated';
    const reasonKeys = ['o1.panel.reason', 'o2.panel.reason', 'o3.panel.reason'];
    const noRowLots: Array<[string, StoredRow[] | null, LotStamp | null]> = [
      ['table absent', null, STAMP],
      ['no rows', [], STAMP],
      ['unstamped lot, table absent', null, null],
      ['unstamped lot, no rows', [], null],
      ['gated lot, no rows', [], { ...STAMP, lot_gate: 'G-TEST' } as LotStamp],
      ['gated lot, table absent', null, { ...STAMP, lot_gate: 'G-TEST' } as LotStamp],
    ];
    it.each(noRowLots)('%s: every option carries the reason and its sentence; no number is sent', (_n, rows, stamp) => {
      const { response, lineage } = run(rows, stamp);
      expect(response.not_evaluated).toEqual(pageOptions().map((o) => o.id));
      for (const o of pageOptions()) expect(lineage.options[o.id]).toMatchObject({ shown_as: 'not_evaluated', reason: 'not_in_engine_population' });
      for (const key of reasonKeys) expect(response.values[key]).toBe(SENTENCE);
      expect(Object.keys(response.values).filter((x) => !reasonKeys.includes(x)).sort()).toEqual(['lot.size', 'sheet.record']);
      expect(() => buildPage(response, reportCtx)).not.toThrow();
    });
    it('a gated no-row lot keeps its gate verdict; the reason refines it, never replaces it', () => {
      expect(run([], { ...STAMP, lot_gate: 'G-TEST' } as LotStamp).lineage.freshness).toMatchObject({ verdict: 'gated', gate: 'G-TEST' });
      expect(run(null, null).lineage.freshness).toMatchObject({ verdict: 'not_stored', not_stored_reason: 'no_layer2_stamp' });
    });
    it('a lot with rows is never labelled by the producer: a stored not_evaluated option has reason null here (its own reason stays in fields)', () => {
      const { response, lineage } = run(withPermitted('detached_house', 'not_evaluated'));
      for (const o of pageOptions()) expect(lineage.options[o.id]?.reason).toBeNull();
      for (const key of reasonKeys) expect(response.values[key]).not.toBe(SENTENCE);
    });
    it('a lot with rows keeps its values: the reason keys are absent for the permitted options', () => {
      const { response } = run(base());
      for (const key of reasonKeys) expect(response.values[key]).toBeUndefined();
    });
  });
  it('no rows for the lot, or no Layer 2 stamp: not stored', () => {
    expect(run([]).lineage.freshness).toMatchObject({ verdict: 'not_stored', not_stored_reason: 'no_rows' });
    expect(run(base(), null).lineage.freshness).toMatchObject({ verdict: 'not_stored', not_stored_reason: 'no_layer2_stamp' });
    expect(run(null, null).lineage.freshness).toMatchObject({ verdict: 'not_stored', not_stored_reason: 'no_layer2_stamp' });
  });
  it('a hidden status hides the card and sends none of its numbers', () => {
    for (const status of ['not_permitted', 'not_applicable', 'not_buildable']) {
      const { response } = run(withPermitted('detached_houseplex', status));
      expect(response.hidden).toEqual(['o3']);
      expect(optionKeys('o3', response.values)).toEqual([]);
      expect(() => buildPage(response, reportCtx)).not.toThrow();
    }
  });
  it('not_evaluated, not_modelled (D-4 a) and an unknown status show the card as not evaluated, with no numbers', () => {
    for (const status of ['not_evaluated', 'not_modelled', 'zzz_unknown']) {
      const { response, lineage } = run(withPermitted('detached_house', status));
      expect(response.not_evaluated).toEqual(['o1', 'o2']);
      expect(optionKeys('o1', response.values)).toEqual([]);
      expect(lineage.options.o1).toMatchObject({ stored_status: status, shown_as: 'not_evaluated' });
    }
  });
  it('a gated lot: every option not evaluated, the gate printed, the lot size still sent', () => {
    const { response, lineage } = run(base(), { ...STAMP, lot_gate: 'exception_not_authored' });
    expect(response.not_evaluated).toEqual(['o1', 'o2', 'o3']);
    expect(Object.keys(response.values).sort()).toEqual(['lot.size', 'sheet.record']);
    expect(lineage.freshness).toMatchObject({ verdict: 'gated', gate: 'exception_not_authored' });
  });
  it('a non-computed value or an unparsable number is left out (the null dash), its true status kept in the lineage', () => {
    const rows = base().map((r) => (r.building_type === 'detached_house' && r.field_id === 'storeys_max' ? { ...r, status: 'unlimited', value: null } : r.building_type === 'detached_house' && r.field_id === 'units_max' ? { ...r, value: 'abc' } : r));
    const { response, lineage } = run(rows);
    expect(response.values['o1.row.storeys']).toBeUndefined();
    expect(response.values['o1.row.homes']).toBeUndefined();
    expect(lineage.fields.find((f) => f.building_type === 'detached_house' && f.field_id === 'storeys_max')?.status).toBe('unlimited');
  });
  it('freshness: Layer 2 moved, catalogue or switchboard changed -> out of date, naming each and what is lost', () => {
    const { lineage } = projectStoredPage({ lot: lotOf(k), stamp: { ...STAMP, table_version: 'newer' }, rows: base(), current: { catalogue_sha: 'x', switchboard_sha: CURRENT_SEED_SHAS.switchboard_sha } });
    expect(lineage.freshness.verdict).toBe('out_of_date');
    expect(lineage.freshness.moved).toEqual(['layer2', 'catalogue']);
    expect(lineage.freshness.lost.join(' ')).toMatch(/increment 4, the disclosure words and the suite rows/);
  });
  it('a type the v21 page has no card for (the suite, D-5 a) is listed, not shown', () => {
    const suite = base().filter((r) => r.building_type === 'detached_house').map((r) => ({ ...r, building_type: 'house_with_secondary_suite' }));
    const { response, lineage } = run([...base(), ...suite]);
    expect(lineage.unbound_types).toEqual(['house_with_secondary_suite']);
    expect(lineage.fields.some((f) => f.building_type === 'house_with_secondary_suite')).toBe(true);
    expect(() => buildPage(response, reportCtx)).not.toThrow();
  });
  it('the implausible lot-size flag (under 50 or over 5,000 m², D-7 a)', () => {
    const at = (m: number) => projectStoredPage({ lot: { ...lotOf(k), columns: { lot_size_sqm: String(m) } }, stamp: STAMP, rows: null, current: CURRENT_SEED_SHAS }).lineage.lot_size_implausible;
    expect([at(49.9), at(50), at(395.6), at(5000), at(5000.1)]).toEqual([true, false, false, false, true]);
  });
});

// ---- the DB side, on a scripted fake handle (no database) ----
type Call = { sql: string; values?: unknown[] | undefined };
const fakeDb = (answers: Array<(c: Call) => unknown>) => {
  const calls: Call[] = [];
  const db: Queryable = {
    query: (async (sql: string, values?: unknown[]) => {
      const c = { sql, values };
      calls.push(c);
      const a = answers[calls.length - 1];
      if (!a) throw new Error(`unexpected query ${calls.length}: ${sql}`);
      const out = a(c);
      if (out instanceof Error) throw out;
      return { rows: out as unknown[] };
    }) as Queryable['query'],
  };
  return { db, calls };
};
const ON = () => [{ variable_value: '1' }];
const k0 = KEY[0] as Json;
const P0 = PARCELS.find((x) => Number(x.id) === Number(k0.parcel_id)) as Json;

describe('L3 and L6: the switch and the id gate read no lot data when they refuse', () => {
  beforeEach(() => vi.clearAllMocks());
  it('an invalid id reads nothing at all', async () => {
    for (const bad of [undefined, '', '   ', 'x'.repeat(33), 42, ['1']]) {
      const { db, calls } = fakeDb([]);
      expect(await storedPageResponse(db, bad)).toEqual({ outcome: 'invalid_id' });
      expect(calls).toEqual([]);
    }
  });
  it('the switch is on only for the exact value 1; off, missing, garbage or an error read no lot data', async () => {
    const offs: Array<() => unknown> = [() => [{ variable_value: '0' }], () => [], () => [{ variable_value: null }], () => [{ variable_value: '2' }], () => [{ variable_value: '0.999' }], () => new Error('db down')];
    for (const answer of offs) {
      const { db, calls } = fakeDb([answer]);
      expect(await storedPageResponse(db, '5253282')).toEqual({ outcome: 'off' });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.sql).toMatch(/FROM logic_variables WHERE variable_key = \$1/);
      expect(calls[0]?.values).toEqual([PREVIEW_SWITCH_KEY]);
    }
    expect(vi.mocked(logError)).toHaveBeenCalledTimes(1);
    expect(await readPreviewSwitch(fakeDb([() => [{ variable_value: 1 }]]).db)).toBe(true);
  });
  it('switch on: resolves parcel_id -> parcels.id once, reads stamp and rows by the integer id; the table absent refuses cleanly', async () => {
    const { db, calls } = fakeDb([
      ON,
      () => [{ id: P0.id, parcel_id: P0.parcel_id, zoning_zn_string: P0.zoning_zn_string, address: '1 Test St', lot_size_sqm: String(P0.lot_size_sqm) }],
      () => [{ lot_gate: null, table_version: 'v', evaluator_version: 'e' }],
      () => [{ present: false }],
    ]);
    const out = await storedPageResponse(db, ` ${P0.parcel_id} `, { uid: 'u1' });
    expect(out.outcome).toBe('ok');
    expect(calls).toHaveLength(4);
    expect(calls[1]?.values).toEqual([String(P0.parcel_id)]);
    expect(calls[1]?.sql).toMatch(/FROM parcels WHERE parcel_id = \$1/);
    expect(calls[2]?.values).toEqual([Number(P0.id)]);
    expect(calls[2]?.sql).toMatch(/FROM bylaw_resolution_lot_stamps WHERE parcel_id = \$1/);
    expect(calls[3]?.sql).toMatch(/to_regclass\('public\.parcel_maxbld_scenarios'\)/);
    if (out.outcome !== 'ok') throw new Error('not ok');
    expect(out.lineage.freshness.verdict).toBe('not_stored');
    expect(out.response.not_evaluated).toEqual(['o1', 'o2', 'o3']);
    expect(vi.mocked(logInfo)).toHaveBeenCalledWith('[admin/report-preview]', 'maxbld_internal_preview_view', expect.objectContaining({ uid: 'u1', outcome: 'ok', parcelId: String(P0.parcel_id) }));
  });
  it('switch on with stored rows: the rows are read by parcels.id and projected', async () => {
    const rows = storedRowsOf(k0);
    const { db, calls } = fakeDb([
      ON,
      () => [{ id: P0.id, parcel_id: P0.parcel_id, zoning_zn_string: P0.zoning_zn_string, address: null, lot_size_sqm: String(P0.lot_size_sqm) }],
      () => [STAMP],
      () => [{ present: true }],
      () => rows,
    ]);
    const out = await storedPageResponse(db, String(P0.parcel_id));
    expect(calls[4]?.values).toEqual([Number(P0.id)]);
    expect(calls[4]?.sql).toMatch(/FROM parcel_maxbld_scenarios WHERE parcel_id = \$1/);
    if (out.outcome !== 'ok') throw new Error('not ok');
    expect(out.lineage.freshness.verdict).toBe('current');
    expect(out.response.values['o1.row.storeys']).toBe(fmt('int', k0.storeys.v));
  });
  it('an unknown parcel is not_found; a read error is logged and rethrown', async () => {
    expect(await storedPageResponse(fakeDb([ON, () => []]).db, '999')).toEqual({ outcome: 'not_found', parcelId: '999' });
    await expect(storedPageResponse(fakeDb([ON, () => new Error('boom')]).db, '999')).rejects.toThrow('boom');
    expect(vi.mocked(logError)).toHaveBeenCalledWith('[admin/report-preview]', expect.any(Error), expect.objectContaining({ stage: 'stored-page-read' }));
  });
  it('every SQL text is static and parameterised (no lot value is spliced into the text)', async () => {
    const { db, calls } = fakeDb([ON, () => [{ id: 7, parcel_id: "1'; DROP", zoning_zn_string: null, address: null, lot_size_sqm: null }], () => [], () => [{ present: true }], () => []]);
    await storedPageResponse(db, "1'; DROP");
    for (const c of calls) expect(c.sql).not.toContain('DROP');
  });
});

describe('L1: the import fence (the producer stays admin-only and unmetered)', () => {
  const walk = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : /\.(ts|tsx|js|mjs)$/.test(e.name) ? [path.join(d, e.name)] : [])) : []);
  const IMPORTS_PRODUCER = /report-preview-live/;
  it('no customer route, consumer API route or mobile source imports the producer', () => {
    const files = [...walk('src/app/(maxbld)'), ...walk('src/app/api/parcels'), ...walk('mobile/src'), ...walk('mobile/app')];
    expect(files.length).toBeGreaterThan(5);
    expect(files.filter((f) => IMPORTS_PRODUCER.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
    // security OUTPUT seat F1: every app file outside the admin area (src/app/admin, src/app/api/admin) is fenced, not an allowlist of folders
    const app = walk('src/app').filter((f) => !f.startsWith(path.join('src/app/admin') + path.sep) && !f.startsWith(path.join('src/app/api/admin') + path.sep));
    expect(app.length).toBeGreaterThan(50);
    expect(app.filter((f) => IMPORTS_PRODUCER.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });
  it('the producer imports no meter, entitlement, usage or consumer lookup module, and writes nothing', () => {
    for (const f of [...walk(DIR), ...walk(PROJ)]) {
      const src = fs.readFileSync(f, 'utf8');
      const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1] as string);
      for (const i of imports) expect(i, `${f} imports ${i}`).not.toMatch(/entitlement|usage|openReport|consumer-lookup|api\/parcels\/lookup|parcel-tool/);
      expect(src, f).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s/);
    }
  });
  it('the fence is not vacuous: a planted import is caught', () => {
    expect(IMPORTS_PRODUCER.test("import { storedPageResponse } from '@/lib/admin/report-preview-live/stored-page';")).toBe(true);
  });
});

// D-46 (orchestrator pre-approved 2026-11-11, option a; MB-93 restack onto MF-19): MF-19 declared the first page field with a `user_input:` source
// (lot_size_entry <- user_input:lot_area, the Add lot size entry, switch off). The preview reads no user input: such a field is accepted and
// projected as not evaluated (never a value; the lineage names it), and any OTHER unknown source kind is still refused. Red evidence
// docs/reports/red-evidence/MB-93/user-input-red.txt (before the fix the module threw on load).
describe('D-46: a user_input source is projected as not evaluated; any other unknown source kind is refused', () => {
  const k = KEY[0] as Json;
  const userInputs = pageBindings().filter((b) => b.source.kind === 'user_input');
  it('the real page table binds the two MF-19 entry fields to user_input sources', () => {
    expect(userInputs.map((b) => [b.field, b.key, b.source.kind])).toEqual([['lot_size_entry', 'entered.value', 'user_input'], ['lot_size_entered_at', 'entered.date', 'user_input']]);
    expect(userInputs[0]?.source).toEqual({ kind: 'user_input', member: 'lot_area' });
  });
  it('no value is ever sent for a user_input field, even when a parcels column of that name exists; the lineage names it not evaluated', () => {
    const lot = lotOf(k);
    const { response, lineage } = projectStoredPage({ lot: { ...lot, columns: { ...lot.columns, lot_area: 500 } }, stamp: STAMP, rows: storedRowsOf(k), current: CURRENT_SEED_SHAS });
    expect([response.values['entered.value'], response.values['entered.date']]).toEqual([undefined, undefined]);
    expect(lineage.user_inputs_not_evaluated).toEqual(['lot_size_entered_at', 'lot_size_entry']);
    expect(() => buildPage(response, reportCtx)).not.toThrow();
  });
  it('RED: an unknown source kind still throws (fail closed), and a user_input source with no member throws', () => {
    const page = { sections: [{ id: 'x', kind: 'lot_size_entered', parts: [{ role: 'value', field: 'f', rule: 'area_sqft_m2_dot', key: 'x.value' }] }] };
    const fields = (source: string) => [{ name: 'f', source, path: 'x' }];
    expect(() => pageBindings(page, fields('mystery:lot_area'))).toThrow('MB-93: page field f has a source the preview cannot read: mystery:lot_area');
    expect(() => pageBindings(page, fields('user_input:'))).toThrow('MB-93: page field f has a source the preview cannot read: user_input:');
    expect(pageBindings(page, fields('user_input:lot_area')).map((b) => b.source)).toEqual([{ kind: 'user_input', member: 'lot_area' }]);
  });
});
