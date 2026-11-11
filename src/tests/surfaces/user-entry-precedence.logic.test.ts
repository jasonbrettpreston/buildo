// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-20 (verified permit/plan facts outrank user entries; the user entry
//            is shown; earlier entries are kept in history so a bad entry can be reverted),
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.9 (dated notes 2026-11-11).
//
// MF-19 · the FE-20 lock (operator 2026-11-11 D-1..D-8 "all as recommmended"; plan fold F15):
//   (1) precedence: effectiveLotSize = a verified source > the active user entry > the City value. The verified list is closed and EMPTY
//       ('stated' and 'geom_backfill' are City values, migration 214), so today the active entry beats the City value;
//   (2) one entry, history kept: the read takes the ACTIVE row only (a reverted row is never effective), the partial unique index allows one
//       active row per lot and key, nothing deletes a row, and the revert is an UPDATE to reverted;
//   (3) the page (D-5, D-6): the box and sheet show only while the switch is on and nothing is entered; the after-entry line once entered; the
//       recalculated sentence only when the stored results carry the entry's stamp.
// Planted defects (each must fail): the order swapped (City first); 'stated' treated as verified; the read without the active filter.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { effectiveLotSize, lotSizePageFlags, VERIFIED_LOT_AREA_SOURCES, type EffectiveLotSize, type LotSizeRead } from '@/lib/parcels/lot-size-entry';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');
const AT = new Date('2026-11-10T19:00:00.000Z');
const lot = (o: Partial<LotSizeRead> = {}): LotSizeRead => ({ parcel_pk: 1, city_sqm: 400, city_source: 'stated', entry: null, ...o });
const entry = { id: '9', value_sqm: 289.86, source: 'user' as const, entered_at: AT };

/** The precedence cases any implementation must pass. */
const cases = (f: (r: LotSizeRead) => EffectiveLotSize): string[] => {
  const out: string[] = [];
  const eq = (a: unknown, b: unknown, why: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(why); };
  eq(f(lot({ entry })), { sqm: 289.86, provenance: 'user', entered_at: AT }, 'the active user entry beats the City value');
  eq(f(lot({ entry, city_source: 'geom_backfill' })), { sqm: 289.86, provenance: 'user', entered_at: AT }, 'geom_backfill is a City value, not verified');
  eq(f(lot()), { sqm: 400, provenance: 'estimated', entered_at: null }, 'no entry: the City value');
  eq(f(lot({ city_sqm: null })), null, 'nothing: null');
  eq(f(lot({ city_sqm: null, entry })), { sqm: 289.86, provenance: 'user', entered_at: AT }, 'an entry on a lot with no City value');
  return out;
};

describe('FE-20 (1) precedence: verified > the active user entry > the City value', () => {
  it('the real effectiveLotSize passes every case; the verified list is closed and empty', () => {
    expect(cases(effectiveLotSize)).toEqual([]);
    expect(VERIFIED_LOT_AREA_SOURCES).toEqual([]);
  });
  it('planted: the order swapped (City first) and stated read as verified are both caught', () => {
    const cityFirst = (r: LotSizeRead): EffectiveLotSize => (r.city_sqm !== null ? { sqm: r.city_sqm, provenance: 'estimated', entered_at: null } : effectiveLotSize(r));
    expect(cases(cityFirst)).toEqual(['the active user entry beats the City value', 'geom_backfill is a City value, not verified']);
    const statedVerified = (r: LotSizeRead): EffectiveLotSize => (r.city_source === 'stated' && r.city_sqm !== null ? { sqm: r.city_sqm, provenance: 'verified', entered_at: null } : effectiveLotSize(r));
    expect(cases(statedVerified)).toEqual(['the active user entry beats the City value', 'no entry: the City value']);
  });
});

describe('FE-20 (2) one active entry, history kept, a bad entry reverted', () => {
  const sql = read('migrations/305_parcel_user_inputs.sql');
  const lib = read('src/lib/parcels/lot-size-entry.ts');
  const activeOnly = (src: string): boolean => /LEFT JOIN parcel_user_inputs u\s+ON u\.parcel_id = p\.id AND u\.input_key = 'lot_area' AND u\.status = 'active'/.test(src);
  it('the read joins the active row only (planted: without the filter, caught)', () => {
    expect(activeOnly(lib)).toBe(true);
    expect(activeOnly(lib.replace(" AND u.status = 'active'", ''))).toBe(false);
  });
  it('one active row per lot and key; reverted rows stay; the status and reverted_at agree', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX uq_parcel_user_inputs_active\s+ON parcel_user_inputs \(parcel_id, input_key\) WHERE status = 'active';/);
    expect(sql).toMatch(/CHECK \(\(status = 'reverted'\) = \(reverted_at IS NOT NULL\)\)/);
    expect(sql).toMatch(/CREATE INDEX idx_parcel_user_inputs_history\s+ON parcel_user_inputs \(parcel_id, input_key, entered_at DESC\);/);
  });
  it('nothing in src deletes an entry; the revert is an UPDATE to reverted of the active row', () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'tests' ? [] : walk(path.join(d, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
    const hits = walk('src').filter((f) => /DELETE\s+FROM\s+parcel_user_inputs/i.test(read(f)));
    expect(hits).toEqual([]);
    expect(lib).toMatch(/UPDATE parcel_user_inputs SET status = 'reverted', reverted_at = NOW\(\), reverted_by = \$2\s+WHERE id = \$1::bigint AND status = 'active'/);
  });
});

describe('FE-20 (3) the page flags (D-5, D-6)', () => {
  const on = { enabled: true };
  const off = { enabled: false };
  it('off and nothing entered: no box, no sheet, no line (D-6)', () => {
    expect(lotSizePageFlags(lot(), off, null)).toEqual({ lot_size_entry_open: false, lot_size_entered: false, lot_size_entry_used: false });
  });
  it('on and nothing entered: the box and sheet', () => {
    expect(lotSizePageFlags(lot(), on, null)).toEqual({ lot_size_entry_open: true, lot_size_entered: false, lot_size_entry_used: false });
  });
  it('entered: the line, never the box (R-BTN); the recalculated sentence only with the matching results stamp', () => {
    expect(lotSizePageFlags(lot({ entry }), on, null)).toEqual({ lot_size_entry_open: false, lot_size_entered: true, lot_size_entry_used: false });
    expect(lotSizePageFlags(lot({ entry }), on, '2026-11-09T00:00:00.000Z').lot_size_entry_used).toBe(false);
    expect(lotSizePageFlags(lot({ entry }), on, AT.toISOString()).lot_size_entry_used).toBe(true);
  });
});
