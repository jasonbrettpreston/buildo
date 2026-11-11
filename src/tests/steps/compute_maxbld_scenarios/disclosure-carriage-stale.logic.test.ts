// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-386 (R3-02 flags propagate: every disclosure on an input is inherited by
//            every row that reads it) and its 2026-11-06 dated note (D-8 carriage, D-6 a stale form); M-379 dated note 2026-11-11 (D-6
//            condition 3: the A0179 attic carriage gap gets a card and a red-first lock before increment 4 closes, MCINC-6)
//
// MB-27 increment 4 · McBylaws queue · lane E · card ~/Buildo-scratch/mcbylaws/inc4/cards/CARD-A0179-CARRIAGE.md. The guard the
// current lock lacks (D-6 condition 1): the 25 golden lots with EVERY stamp stale in the DC-1 form (table_version 'ffffffff'), for every
// building type of building-types.json, collect-all (never stop at the first miss): every row whose trace reads a Layer 2 target carries
// the stale word; and with current stamps, every carried word on a target reaches every row that reads it.
import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { goldenLotsWithEnv, parcelInput, seeds, META, readJson, req, ROOT, type Json } from './golden25-harness';

const FAMILIES = readJson('scripts/lib/compute/maxbld/disclosure-families.json');
let S: Json;
let LOTS: Map<string, Json>;
let ENV: Json;

/** Every (lot, type, row, target, word) where a row reads a Layer 2 target but lacks a word carried on it. */
/** OUTPUT panel fold (M-386 R3-02): every gain row of the lot carries every flag of the rows it compares. */
function gainMisses(stale: boolean): string[] {
  const s = seeds();
  const out: string[] = [];
  for (const [name, lot] of LOTS) {
    const perType: Record<string, Json> = {};
    for (const bt of s.buildingTypes.rows as Json[]) {
      const src = stale ? { ...lot.source, lot: { ...lot.source.lot, table_version: 'ffffffff' } } : lot.source;
      const input = parcelInput(lot, bt);
      const words = S.disclosureWords(src, bt, Object.keys(input.l2), { layer1Env: ENV });
      const full = { ...input, l2Flags: words.l2Flags, permFlags: words.permFlags };
      perType[bt.id] = { input: full, rows: S.buildParcelRows(full, s, META) };
    }
    for (const g of S.gainRows(lot.parcel_id, perType, s, META) as Json[]) {
      for (const t of (g.trace as Json[]).filter((x) => x && x.kind === 'row')) {
        const src = ((perType[t.building_type] as Json).rows as Json[]).find((r) => r.field_id === t.id) as Json;
        for (const w of src.flags as string[]) if (!(g.flags as string[]).includes(w)) out.push(`${name} ${g.field_id} ${t.building_type}.${t.id} ${w}`);
      }
    }
  }
  return out;
}

function misses(stale: boolean): string[] {
  const s = seeds();
  const out: string[] = [];
  for (const [name, lot] of LOTS) {
    for (const bt of s.buildingTypes.rows as Json[]) {
      const src = stale ? { ...lot.source, lot: { ...lot.source.lot, table_version: 'ffffffff' } } : lot.source;
      const input = parcelInput(lot, bt);
      const words = S.disclosureWords(src, bt, Object.keys(input.l2), { layer1Env: ENV });
      const rows = S.buildParcelRows({ ...input, l2Flags: words.l2Flags, permFlags: words.permFlags }, s, META) as Json[];
      for (const row of rows) {
        const read = new Set((row.trace as Json[]).filter((t) => t && t.kind === 'l2').map((t) => t.id));
        for (const [t, list] of Object.entries(words.l2Flags as Json)) {
          if (!read.has(t)) continue;
          for (const w of list as string[]) if (!(row.flags as string[]).includes(w)) out.push(`${name} ${bt.id} ${row.field_id} ${t} ${w}`);
        }
      }
    }
  }
  return out;
}

beforeAll(() => {
  S = req(path.join(ROOT, 'scripts/lib/compute/compute-maxbld-scenarios.js')) as Json;
  const g = goldenLotsWithEnv();
  LOTS = g.lots;
  ENV = g.env;
});

describe('A0179 carriage (card CARD-A0179-CARRIAGE): R3-02 under stale stamps, collect-all', () => {
  it('stale stamps: every row that reads a Layer 2 target carries the stale word (all lots, all building types)', () => {
    expect(misses(true)).toEqual([]);
  });
  it('current stamps: every carried word on a target appears on every row that reads it (all lots, all building types)', () => {
    expect(misses(false)).toEqual([]);
  });
  it('the LC-33 gain rows carry every flag of the two rows they compare, stale and current (OUTPUT panel fold)', () => {
    expect(gainMisses(true)).toEqual([]);
    expect(gainMisses(false)).toEqual([]);
  });
  it('a stale stamp carries only the stale word on a target, and recomputes nothing (the D-6 a form)', () => {
    const lot = LOTS.get('A0179') as Json;
    const w = S.disclosureWords({ ...lot.source, lot: { ...lot.source.lot, table_version: 'ffffffff' } }, (seeds().buildingTypes.rows as Json[])[0], ['attic_qualifying_area_m2'], { layer1Env: ENV });
    expect(w.l2Flags).toEqual({ attic_qualifying_area_m2: [FAMILIES.stale_word] });
  });
});
