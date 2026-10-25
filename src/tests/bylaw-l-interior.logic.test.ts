// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-285 (Spec 133 §m.285), M-60 (Spec 68 §7.5), M-350 (CHAT-98.L-UNITS);
//            operator CHAT-100.L-INTERIOR (2026-10-23 "L-Interior - Option B", `2026-10-23-batch-u#CHAT-100.L-INTERIOR`), HELD pending CHAT-100 integrate
// CHAT-100.L-INTERIOR: in the M-285 street-name join (scripts/analysis/bylaw/evaluate.mjs namedStreetJoin), a vocab.named_street row with line any
// whose streets do not include the lot's frontage street reads false (not undecided) when flags.corner_lot === false AND flags.through_lot === false.
// Corner, through, or unknown-flag lots stay undecided under M-60. Effect: 900.4.10(256) (D)(ii), 900.5.10(264) (A)(ii), 900.3.10(1029) (C)(ii)
// answer 6.0 m on an interior lot on Alexmuir Blvd., and the "any other street" arms answer 3.6 m.
// Red first: docs/reports/red-evidence/bylaw/bylaw-chat100-l-interior-red.txt
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const Z: Record<string, string> = { '900.3.10': 'RD', '900.4.10': 'RS', '900.5.10': 'RT' };
// [exception, named arm (Alexmuir family), "any other street" arm]
const L3: [string, string, string, string][] = [
  ['900.4.10(256)', '900.4.10(256)#(256)[SSP](D)(i)', '900.4.10(256)#(256)[SSP](D)(ii)', '900.4.10(256)#(256)[SSP](D)(iii)'],
  ['900.5.10(264)', '900.5.10(264)#(264)[SSP](A)(i)', '900.5.10(264)#(264)[SSP](A)(ii)', '900.5.10(264)#(264)[SSP](A)(iii)'],
  ['900.3.10(1029)', '900.3.10(1029)#(1029)[SSP](C)(i)', '900.3.10(1029)#(1029)[SSP](C)(ii)', '900.3.10(1029)#(1029)[SSP](C)(iii)'],
];
const INTERIOR = { corner_lot: false, through_lot: false };

describe('CHAT-100.L-INTERIOR: a line-any named-road arm whose streets miss the frontage street does not apply on an interior lot', async () => {
  const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
  const { E, units, C } = await AS.loadRealLotAssembly(ROOT);
  const lot = (exception: string, name: string, f: Json): Json => ({
    zone: Z[exception.slice(0, 8)], label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], address: '100 ' + name, building_type: 'detached_house', exception, primary_frontage_street_name: name,
    flags: { lawfully_existing: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false, ...f },
    vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5 },
  });
  const run = (exception: string, name: string, f: Json): Json => { const l = lot(exception, name, f); return E.effective(l, 'street_setback_m', E.loadCandidates(l, units).candidates, C); };
  const unit = (id: string): Json => { const u = units.find((x: Json) => (x.unit_id ?? x.u?.unit_id) === id); return u.u ?? u; };
  const join = (id: string, name: string, f: Json): boolean | null => E.applies(lot(id.slice(0, id.indexOf('#')), name, f), unit(id), C).ok;

  it('the join: interior lot, streets miss → false; streets hit → true; corner, through or unknown flags → undecided', () => {
    for (const [, , named] of L3) {
      expect([named, join(named, 'Ravencliff Cres', INTERIOR)]).toEqual([named, false]);
      expect([named, join(named, 'Alexmuir Blvd', INTERIOR)]).toEqual([named, true]);
      expect([named, join(named, 'Ravencliff Cres', { corner_lot: true, through_lot: false })]).toEqual([named, null]);
      expect([named, join(named, 'Ravencliff Cres', { corner_lot: false, through_lot: true })]).toEqual([named, null]);
      expect([named, join(named, 'Ravencliff Cres', {})]).toEqual([named, null]);
      expect([named, join(named, 'Ravencliff Cres', { corner_lot: false })]).toEqual([named, null]);
      expect([named, join(named, 'Ravencliff Cres', { through_lot: false })]).toEqual([named, null]); // verify-48a LOW: corner unknown

    }
  });

  it('production path: on an interior lot each L arm answers on its own street (6.0 m), the other-street arm answers (3.6 m), the Finch arm still 7.5 m', () => {
    for (const [ex, finch, named, other] of L3) {
      const a = run(ex, 'Alexmuir Blvd', INTERIOR), r = run(ex, 'Ravencliff Cres', INTERIOR), f = run(ex, 'Finch Ave', INTERIOR);
      expect([named, a.status, a.value, a.winner]).toEqual([named, 'value', 6, named]);
      expect([other, r.status, r.value, r.winner]).toEqual([other, 'value', 3.6, other]);
      expect([finch, f.status, f.value, f.winner]).toEqual([finch, 'value', 7.5, finch]);
    }
  });

  it('production path: corner, through and unknown-flag lots stay undecided (M-60 blocks), as before', () => {
    for (const [ex] of L3) {
      for (const f of [{ corner_lot: true, through_lot: false }, { corner_lot: false, through_lot: true }, {}]) {
        const a = run(ex, 'Alexmuir Blvd', f);
        expect([ex, JSON.stringify(f), a.status, a.reason]).toEqual([ex, JSON.stringify(f), 'not_evaluated', 'condition_unknown:abuts_named_street']);
      }
    }
  });
});
