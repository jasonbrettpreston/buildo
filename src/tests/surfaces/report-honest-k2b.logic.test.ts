// SPEC LINK: docs/specs/01-pipeline/78_optimal_lot_configuration.md section 6.6 rules 1, 5, 8 (null is "—"; the reason in See details);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-481 (confidence beside each reading); docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-34.
//
// K2 honesty bundle, code part (operator 2026-11-13: "approved - ... a new yes/no page rule ... reuses the existing formatter pattern, with no new component").
// The page shows heritage, ravine and corner as Yes / No from the stored parcels columns (a null column, and a never-enriched lot, stay "—"),
// each option's confidence as the weakest stored reading it rests on, and a not-evaluated option's stored reason in See details. Pure: no DB.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatTextRule, TEXT_RULES } from '@/lib/admin/report-preview-live/format';
import { CURRENT_SEED_SHAS } from '@/lib/admin/report-preview-live/seed-shas';
import { pageBindings, projectStoredPage, type StoredRow } from '@/lib/admin/report-preview-live/project';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- page table JSON
const ROOT = process.cwd();
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const PAGE = readJson('scripts/surfaces/_schema/report-page.json');
const part = (section: string, role: string): Json => (PAGE.sections as Json[]).find((s) => s.id === section)!.parts.find((p: Json) => p.role === role);
const keyOf = (section: string, role: string): string => part(section, role).key;
const STAMP = { lot_gate: null, table_version: 'tv', evaluator_version: 'ev' };
const row = (bt: string, field: string, over: Partial<StoredRow> = {}): StoredRow => ({
  building_type: bt, field_id: field, increment: 1, status: 'computed', value: 250, unit: 'm2', reason: null, flags: [],
  content_sha: null, catalogue_sha: CURRENT_SEED_SHAS.catalogue_sha, switchboard_sha: CURRENT_SEED_SHAS.switchboard_sha, settings_sha: null, layer2_table_version: 'tv', switches: [], ...over,
});
const run = (columns: Record<string, unknown>, rows: StoredRow[]) => projectStoredPage({ lot: { id: 1, parcel_id: 'p', address: null, zoning: null, columns }, stamp: STAMP, rows, current: CURRENT_SEED_SHAS }).response.values;
const permitted = (bt: string): StoredRow => row(bt, 'permitted', { status: 'permitted', value: null });

describe('K2 yes/no page rule (formatter pattern, no new component)', () => {
  it('the text rules are closed: yes_no and confidence; booleans and words only', () => {
    expect([...TEXT_RULES].sort()).toEqual(['confidence', 'yes_no']);
    expect(formatTextRule('yes_no', true)).toBe('Yes');
    expect(formatTextRule('yes_no', false)).toBe('No');
    expect(formatTextRule('yes_no', null)).toBeNull();
    expect(formatTextRule('yes_no', 'true')).toBeNull();
    expect(formatTextRule('yes_no', 1)).toBeNull();
    expect(formatTextRule('confidence', 'medium-low')).toBe('Medium-low confidence');
    expect(formatTextRule('confidence', 'made_up')).toBeNull();
    expect(formatTextRule('no_such_rule', true)).toBeNull();
  });
  it('the three lot-fact parts are bound parcels columns with the yes_no rule (no longer pending)', () => {
    const b = pageBindings().filter((x) => x.section === 'lot' && x.rule === 'yes_no');
    expect(b.map((x) => (x.source.kind === 'parcels' ? x.source.column : '')).sort()).toEqual(['is_corner_lot', 'is_heritage_designated', 'is_in_ravine_protection_area']);
  });
  it('a lot sends Yes / No for heritage, ravine, corner; a null column sends nothing (the face shows the dash)', () => {
    const cols = { is_heritage_designated: true, is_in_ravine_protection_area: false, is_corner_lot: null };
    const v = run(cols, []);
    const bound = pageBindings().filter((x) => x.rule === 'yes_no');
    const byCol = Object.fromEntries(bound.map((x) => [(x.source as Json).column, x.key]));
    expect(v[byCol.is_heritage_designated as string]).toBe('Yes');
    expect(v[byCol.is_in_ravine_protection_area as string]).toBe('No');
    expect(v[byCol.is_corner_lot as string]).toBeUndefined();
  });
});

describe('K2 confidence: the weakest stored reading the option rests on', () => {
  const size = (sec: string) => (PAGE.sections as Json[]).find((s) => s.id === sec)!.parts.find((p: Json) => p.role === 'size.badge');
  it('size.badge of each option is a bound value part with the confidence rule', () => {
    for (const sec of ['o1', 'o2', 'o3']) expect(size(sec).rule, sec).toBe('confidence');
  });
  it('the badge shows the lowest confidence among the row switches; no reading with a confidence sends nothing', () => {
    const f = size('o1').field as string;
    const sw = (c: string | null) => ({ id: 'reading:x', state: 'on', confidence: c, evidence: null });
    const key = size('o1').key as string;
    const withSw = (switches: Json[]) => run({}, [permitted('detached_house'), row('detached_house', f, { switches })]);
    expect(withSw([sw('high'), sw('medium-low'), sw('medium')])[key]).toBe('Medium-low confidence');
    expect(withSw([sw('low')])[key]).toBe('Low confidence');
    expect(withSw([sw(null)])[key]).toBeUndefined();
    expect(withSw([])[key]).toBeUndefined();
  });
});

describe('K2 not-evaluated: the stored reason in See details, the dash on the face (Spec 78 6.6 rule 5)', () => {
  const notes = (sec: string) => (PAGE.sections as Json[]).find((s) => s.id === sec)!.parts.find((p: Json) => p.role === 'size.panel.notes');
  it('size.panel.notes is a bound value part with the reason_text rule on the permitted field', () => {
    for (const sec of ['o1', 'o2', 'o3']) expect([notes(sec).field, notes(sec).rule], sec).toEqual(['permitted', 'reason_text']);
  });
  it('a not_evaluated option with a worded reason sends the ruled sentence; no number reaches the face', () => {
    const v = run({}, [row('detached_house', 'permitted', { status: 'not_evaluated', value: null, reason: 'exception_not_authored' })]);
    expect(v[notes('o1').key as string]).toBe('A site-specific exception applies; not yet evaluated.');
    expect(v[keyOf('o1', 'size.value')]).toBeUndefined();
  });
  it('an unworded reason, or a permitted option, sends nothing (never an invented reason)', () => {
    const k = notes('o1').key as string;
    expect(run({}, [row('detached_house', 'permitted', { status: 'not_evaluated', value: null, reason: 'made_up_reason' })])[k]).toBeUndefined();
    expect(run({}, [permitted('detached_house')])[k]).toBeUndefined();
  });
});

describe('K2 folds (OUTPUT panel): closed rules fail at load; an unknown confidence word fails closed', () => {
  it('a page part with an unknown rule, or reason_text on another field, throws at load', () => {
    const page = (rule: string, field: string) => ({ sections: [{ id: 'o1', kind: 'option', scenario: 'detached_house/pitched', parts: [{ role: 'size.value', brief: 'B6', field, rule, key: 'k' }] }] });
    expect(() => pageBindings(page('yes-no', 'gfa_pitched_m2'))).toThrow(/cannot format/);
    expect(() => pageBindings(page('reason_text', 'gfa_pitched_m2'))).toThrow(/permitted field only/);
    expect(() => pageBindings(page('area_m2', 'gfa_pitched_m2'))).not.toThrow();
  });
  it('a row whose readings include a word the register does not know sends no confidence', () => {
    const key = (PAGE.sections as Json[]).find((s) => s.id === 'o1')!.parts.find((p: Json) => p.role === 'size.badge').key as string;
    const f = (PAGE.sections as Json[]).find((s) => s.id === 'o1')!.parts.find((p: Json) => p.role === 'size.badge').field as string;
    const sw = (c: string) => ({ id: 'reading:x', confidence: c });
    expect(run({}, [permitted('detached_house'), row('detached_house', f, { switches: [sw('low'), sw('medium-high')] })])[key]).toBeUndefined();
  });
});
