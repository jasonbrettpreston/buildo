// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-130, M-136, M-285; operator CHAT-81.FAM-ALL (FAM-ABUT-NAMED), CHAT-83.NAMED-1, CHAT-84.NAMED-1b, CHAT-87.NAMED-1c (2026-10-22)
// CHAT-87.NAMED-1c (operator "NAMED y", held pending CHAT-87 import): the NAMED-1b rule as worded — compute where the road is in
// vocab.named_street, disclose where it is not — and every one of the 44 named-road units is in the table (c03aa135), so all 44 are LIMIT
// and the M-285 street-name join computes them. Supersedes the 12 LIMIT / 32 UNUSUAL split of CHAT-84.NAMED-1b (1a7efd1b).
// (was) HELD on NAMED-1 (4a95ae6a): all 44 UNUSUAL; reverted for 12 in b10bd225 (verify-42 item 2), for the other 32 here.
// Red first: before the fix the 32 are UNUSUAL (docs/reports/red-evidence/bylaw/bylaw-chat87-named1c-red.txt).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const NAMED = ["900.3.10(325)#(325)[SSP](C)","900.3.10(1156)#(1156)[SSP](C)(i)","900.3.10(936)#(936)[SSP](C)(i)","900.3.10(1091)#(1091)[SSP](C)(i)","900.3.10(1120)#(1120)[SSP](C)(i)","900.3.10(714)#(714)[SSP](C)(i)","900.3.10(714)#(714)[SSP](D)(i)","900.3.10(397)#(397)[SSP](B)","900.3.10(975)#(975)[SSP](A)(i)","900.3.10(975)#(975)[SSP](A)(ii)","900.3.10(812)#(812)[SSP](D)(i)","900.3.10(1168)#(1168)[SSP](C)(i)","900.3.10(516)#(516)[SSP](C)(i)","900.3.10(516)#(516)[SSP](C)(ii)","900.3.10(516)#(516)[SSP](C)(iii)","900.3.10(854)#(854)[SSP](C)(i)","900.3.10(854)#(854)[SSP](E)(i)","900.3.10(852)#(852)[SSP](C)(i)","900.3.10(852)#(852)[SSP](E)(i)","900.3.10(713)#(713)[SSP](C)(i)","900.4.10(255)#(255)[SSP](D)(i)","900.4.10(202)#(202)[SSP](D)(i)","900.4.10(202)#(202)[SSP](F)(i)","900.4.10(295)#(295)[SSP](D)(i)","900.4.10(284)#(284)[SSP](D)(i)","900.4.10(81)#(81)[SSP](H)(i)","900.5.10(264)#(264)[SSP](A)(i)","900.5.10(264)#(264)[SSP](A)(ii)","900.5.10(200)#(200)[SSP](A)(i)","900.5.10(200)#(200)[SSP](C)(i)","900.5.10(204)#(204)[SSP](C)(i)","900.5.10(204)#(204)[SSP](E)(i)"];
const TABLE_UNITS = ["900.3.10(309)#(309)[SSP](C)(i)","900.3.10(303)#(303)[SSP](D)","900.3.10(1057)#(1057)[SSP](C)(i)","900.3.10(323)#(323)[SSP](C)","900.3.10(316)#(316)[SSP](D)","900.3.10(316)#(316)[SSP](H)","900.3.10(560)#(560)[SSP](C)(i)","900.3.10(1032)#(1032)[SSP](C)(i)","900.3.10(1170)#(1170)[SSP](A)(i)","900.4.10(256)#(256)[SSP](D)(i)","900.4.10(256)#(256)[SSP](D)(ii)","900.4.10(70)#(70)[SSP](A)(i)"]; // LIMIT since b10bd225
const ALL = [...TABLE_UNITS, ...NAMED];
// value of a numeric expression without its clause citation, to compare identical-text twins
const val = (u: Json): string => JSON.stringify(u.numeric_expression).replace(/\s*@[^"]*/g, '');

describe('CHAT-87.NAMED-1c: all 44 named-road units are computed (LIMIT, M-285 join)', async () => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));

  it('each of the 44 is in vocab.named_street and is a LIMIT with a target and a minimum', () => {
    expect(ALL.length).toBe(44);
    for (const id of ALL) {
      const u = U.get(id) as Json;
      expect(I.vocab.named_street.units[id]?.streets?.length, id).toBeGreaterThan(0);
      expect([id, u?.archetype, u?.bound]).toEqual([id, 'LIMIT', 'min']); // disclosure: the pre-NAMED-1 value is restored as-is (b10bd225 precedent)
      expect(u.target, id).not.toBe('none');
      expect(u.condition?.tokens, id).toContain('abuts_named_street');
    }
  });

  it('no other unit carrying abuts_named_street is a LIMIT (the card is the 44, no unit beyond it)', () => {
    const left = [...U].filter(([id, x]) => /^900\.[2-6]\.10\(/.test(id) && x.archetype === 'LIMIT' && JSON.stringify(x.condition || '').includes('abuts_named_street'));
    expect(left.map(([id]) => id).sort()).toEqual([...ALL].sort());
  });

  it('identical clause text reads one way: 323 (C) = 325 (C), 1170 (A)(i) = 1168 (C)(i), 256 (D) = 264 (A)', () => {
    for (const [a, b] of [['900.3.10(323)#(323)[SSP](C)', '900.3.10(325)#(325)[SSP](C)'], ['900.3.10(1170)#(1170)[SSP](A)(i)', '900.3.10(1168)#(1168)[SSP](C)(i)'],
      ['900.4.10(256)#(256)[SSP](D)(i)', '900.5.10(264)#(264)[SSP](A)(i)'], ['900.4.10(256)#(256)[SSP](D)(ii)', '900.5.10(264)#(264)[SSP](A)(ii)']] as [string, string][]) {
      const x = U.get(a) as Json, y = U.get(b) as Json;
      expect([b, y.archetype, y.target, y.bound, val(y)]).toEqual([b, x.archetype, x.target, x.bound, val(x)]);
    }
  });
});

// The M-285 join computes the newly LIMIT units on the production path (assembly + evaluate), as it does 323 (C) in bylaw-fix-6.
describe('CHAT-87.NAMED-1c: the M-285 join computes 325 (C) and 1168 (C)(i)', async () => {
  const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
  const { E, units, C } = await AS.loadRealLotAssembly(ROOT);
  const lot = (exception: string, name: string): Json => ({
    zone: 'RD', label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house', exception, primary_frontage_street_name: name,
    flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false },
    vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5 },
  });
  const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

  it('a parcel on Huntingwood Dr. in exception 325 takes the 7.5 m front setback of 325 (C); a parcel on Ravencliff Cres. does not', () => {
    expect(eff(lot('900.3.10(325)', 'Huntingwood Dr'), 'front_setback_m')).toMatchObject({ status: 'value', value: 7.5, winner: '900.3.10(325)#(325)[SSP](C)' });
    expect(eff(lot('900.3.10(325)', 'Ravencliff Cres'), 'front_setback_m').winner).not.toBe('900.3.10(325)#(325)[SSP](C)');
  });

  it('a parcel on Conference Boulevard in exception 1168 takes the 7.5 m front setback of 1168 (C)(i)', () => {
    expect(eff(lot('900.3.10(1168)', 'Conference Blvd'), 'front_setback_m')).toMatchObject({ status: 'value', value: 7.5, winner: '900.3.10(1168)#(1168)[SSP](C)(i)' });
  });
});
