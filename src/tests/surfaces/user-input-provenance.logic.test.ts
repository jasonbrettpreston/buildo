// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-19 (user inputs are shared, not private: an entered fact updates
//            the shared database for every viewer and keeps provenance, source user and entered_at),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.4 (provenance), 11a.9 (user inputs; dated notes 2026-11-11).
//
// MF-19 · the FE-19 lock (operator 2026-11-11 D-1..D-8 "all as recommmended"; D-1 a own record, D-5 one neutral line, D-7 kept on erasure):
//   (1) the record: migration 305 pins source = 'user' and a NOT NULL entered_at from the DB clock; the insert carries 'user' and never a
//       client time; the author is a uuid FK ON DELETE SET NULL (erasure empties it, the entry stays);
//   (2) shared, never private: the response and the page values carry the value and the stamp, never the author or the typed value; the page
//       flags take no viewer (every viewer sees the same line), and the line is neutral ("from a survey", never "your");
//   (3) the binding: the after-entry line binds two declared report fields to the user_input source, whose contract file has landed.
// MF-19 plan v3 (operator 2026-11-15 "R-1 thru R-6 recommendations approved"): the entry is also width + depth; BOTH inserts (the width path and the area path)
//   carry source 'user' and never set entered_at; the response never carries a width, a depth or a typed value; migration 324 keeps the source CHECK (305) and adds the shape CHECK.
// Planted defects (each must fail): a payload with entered_by; a migration without the source CHECK; an insert without 'user'.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LotSizeEntryResponseSchema } from '@/app/api/parcels/lot-size/types';
import { entryView, lotSizeEntryValues, lotSizePageFlags, type LotSizeRead } from '@/lib/parcels/lot-size-entry';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- JSON files
const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p: string): Json => JSON.parse(read(p));
const MIG = 'migrations/305_parcel_user_inputs.sql';
const LIB = 'src/lib/parcels/lot-size-entry.ts';

const provenanceProblems = (sql: string, lib: string): string[] => {
  const out: string[] = [];
  if (!/CONSTRAINT chk_parcel_user_inputs_source\s+CHECK \(source = 'user'\)/.test(sql)) out.push('no source = user CHECK');
  if (!/entered_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT NOW\(\)/.test(sql)) out.push('entered_at is not NOT NULL DEFAULT NOW()');
  if (!/entered_by\s+UUID\s+NULL REFERENCES auth\.users\(id\) ON DELETE SET NULL/.test(sql)) out.push('entered_by is not a nullable SET NULL author');
  const inserts = [...lib.matchAll(/INSERT INTO parcel_user_inputs \(([^)]*)\)\s*VALUES \(([^)]*)\)/g)];
  if (inserts.length !== 2) out.push('expected exactly the two inserts (the width path and the area path)');
  for (const ins of inserts) {
    if (/entered_at/.test(ins[1]!)) out.push('the insert sets entered_at (it must be the DB clock)');
    if (!/'user'/.test(ins[2]!)) out.push("the insert does not carry 'user'");
  }
  return out;
};

const ENTRY = { id: '5', value_sqm: 289.86, source: 'user' as const, entered_at: new Date('2026-11-10T19:00:00.000Z') };
const READ: LotSizeRead = { parcel_pk: 77, city_sqm: 400, city_source: 'stated', entry: ENTRY };

describe('FE-19 (1) the record keeps provenance: source user and entered_at', () => {
  it('migration 305 and the insert', () => {
    expect(provenanceProblems(read(MIG), read(LIB))).toEqual([]);
  });
  it('planted: a migration without the source CHECK, an insert without user, an insert that sets entered_at — each found', () => {
    const sql = read(MIG);
    const lib = read(LIB);
    expect(provenanceProblems(sql.replace("CHECK (source = 'user')", 'CHECK (true)'), lib)).toEqual(['no source = user CHECK']);
    expect(provenanceProblems(sql, lib.replace("VALUES ($1, 'lot_area', $2, $3, $4, 'user', $5)", "VALUES ($1, 'lot_area', $2, $3, $4, $6, $5)"))).toEqual(["the insert does not carry 'user'"]);
    expect(provenanceProblems(sql, lib.replace('typed_unit, source, entered_by)', 'typed_unit, source, entered_at)'))).toEqual(['the insert sets entered_at (it must be the DB clock)']);
  });
});

describe('FE-19 (1b) plan v3: the width path keeps the same provenance', () => {
  it('the width-path insert names width_m, depth_m, typed_width, typed_depth and carries user; migration 324 adds the shape CHECK and keeps 305\'s source CHECK', () => {
    const lib = read(LIB);
    const dims = [...lib.matchAll(/INSERT INTO parcel_user_inputs \(([^)]*)\)\s*VALUES \(([^)]*)\)/g)].find((m) => /width_m/.test(m[1]!))!;
    expect(dims[1]!.split(',').map((s) => s.trim())).toEqual(['parcel_id', 'input_key', 'value_sqm', 'width_m', 'depth_m', 'typed_width', 'typed_depth', 'typed_unit', 'source', 'entered_by']);
    expect(dims[2]).toMatch(/'lot_area'.*'user'/);
    expect(read('migrations/324_parcel_user_inputs_width_depth.sql')).toMatch(/ADD CONSTRAINT chk_parcel_user_inputs_shape CHECK/);
    expect(read(MIG)).toMatch(/CONSTRAINT chk_parcel_user_inputs_source\s+CHECK \(source = 'user'\)/);
  });
  it('planted: a width-path insert that sets entered_at, or drops user, is found', () => {
    const lib = read(LIB);
    expect(provenanceProblems(read(MIG), lib.replace("'lot_area', $2, $3, $4, $5, $6, $7, 'user', $8)", "'lot_area', $2, $3, $4, $5, $6, $7, $9, $8)"))).toEqual(["the insert does not carry 'user'"]);
    expect(provenanceProblems(read(MIG), lib.replace('typed_depth, typed_unit, source, entered_by)', 'typed_depth, typed_unit, source, entered_at)'))).toEqual(['the insert sets entered_at (it must be the DB clock)']);
  });
});

describe('FE-19 (2) shared, never private', () => {
  it('the response is the value and the stamp, source user; never the author or the typed value (planted entered_by fails)', () => {
    const lot_size = entryView(ENTRY);
    expect(LotSizeEntryResponseSchema.parse({ lot_size })).toEqual({ lot_size: { sqm: 289.86, display: '3,120 sq ft · 290 m²', entered_at: '2026-11-10T19:00:00.000Z', entered_at_display: '10 Nov 2026', source: 'user' } });
    expect(() => LotSizeEntryResponseSchema.parse({ lot_size: { ...lot_size, entered_by: 'u' } })).toThrow();
    expect(() => LotSizeEntryResponseSchema.parse({ lot_size: { ...lot_size, typed_value: 3120 } })).toThrow();
    for (const k of ['width_m', 'depth_m', 'typed_width', 'typed_depth']) expect(() => LotSizeEntryResponseSchema.parse({ lot_size: { ...lot_size, [k]: 12 } })).toThrow(); // plan v3: never a side
  });
  it('every viewer gets the same flags and values: the functions take no viewer, and the page values carry no author', () => {
    // OUTPUT fold CR-4: the same read gives the same flags and values on every call (nothing per viewer can enter).
    expect(lotSizePageFlags(READ, { enabled: true }, null)).toEqual(lotSizePageFlags(structuredClone(READ), { enabled: true }, null));
    expect(lotSizeEntryValues(READ)).toEqual(lotSizeEntryValues(structuredClone(READ)));
    expect(lotSizeEntryValues(READ)).toEqual({ 'entered.value': '3,120 sq ft · 290 m²', 'entered.date': '10 Nov 2026' });
    expect(lotSizePageFlags(READ, { enabled: false }, null)).toEqual({ lot_size_entry_open: false, lot_size_entered: true, lot_size_entry_used: false });
  });
  it('D-5: the after-entry words are neutral ("from a survey"), never "your survey"', () => {
    const page = json('scripts/surfaces/_schema/report-presentation.json').page as Record<string, string>;
    expect(page['entered.source']).toBe('· from a survey, entered');
    expect(page['entered.source']).not.toMatch(/\byour\b/i);
    expect(page['entered.recalc']).toBe('Every option is recalculated with it.');
  });
});

describe('FE-19 (3) the binding: the after-entry line binds the user_input source', () => {
  it('binding-sources names the landed input contract; the two report fields bind user_input members of it', () => {
    const bs = json('scripts/surfaces/_schema/binding-sources.json').sources.user_input;
    expect(bs.file).toBe('scripts/surfaces/_schema/lot-size-entry-contract.json');
    const members = json(bs.file).members as string[];
    const states = (json('scripts/surfaces/_schema/report-v2.decl.json').sections as Json[]).find((s) => s.id === 'states')!.fields as Json[];
    const bound = states.filter((f) => String(f.source).startsWith('user_input:')).map((f) => [f.name, f.source]);
    expect(bound).toEqual([['lot_size_entry', 'user_input:lot_area'], ['lot_size_entered_at', 'user_input:entered_at']]);
    for (const [, s] of bound) expect(members).toContain(String(s).split(':')[1]);
  });
  it('the page table binds the C2 value and date parts to those two fields, server-formatted', () => {
    const c2 = (json('scripts/surfaces/_schema/report-page.json').sections as Json[]).find((s) => s.kind === 'lot_size_entered')!;
    expect(c2.parts.filter((p: Json) => p.field).map((p: Json) => [p.role, p.field, p.rule, p.key])).toEqual([
      ['value', 'lot_size_entry', 'area_sqft_m2_dot', 'entered.value'],
      ['date', 'lot_size_entered_at', 'date_dmy', 'entered.date'],
    ]);
  });
});
