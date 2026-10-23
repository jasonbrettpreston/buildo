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
// CHAT-95.X-4 (held pending CHAT-95 import): 714 (D)(i) is a side-lot-line arm and the join reads the frontage street only, so it is UNUSUAL, disclosed
const X4 = "900.3.10(714)#(714)[SSP](D)(i)";
// CHAT-96 NAMED-FAM (held pending CHAT-96 import): every side-lot-line arm of the family takes the X-4 form; 1169 (C)(ii), word-for-word 1168 (C)(i), joins the family
const SIDE = ["900.3.10(714)#(714)[SSP](D)(i)","900.3.10(854)#(854)[SSP](E)(i)","900.3.10(852)#(852)[SSP](E)(i)","900.4.10(202)#(202)[SSP](F)(i)","900.4.10(81)#(81)[SSP](H)(i)","900.5.10(200)#(200)[SSP](C)(i)","900.5.10(204)#(204)[SSP](E)(i)"];
const T1169 = "900.3.10(1169)#(1169)[SSP](C)(ii)";
// precedent sweep (preamble item 13): 1029 (C)(i),(ii) carry the token, are in the table and are word-for-word twins of 264 (A)(i),(ii) and 256 (D)(i),(ii);
// 1026 (C)(i) is word-for-word 255 (D)(i) (it was keyed with no token; it takes the token and the 255 (D)(i) table row)
const TWINS: [string, string][] = [["900.3.10(1026)#(1026)[SSP](C)(i)", "900.4.10(255)#(255)[SSP](D)(i)"], ["900.3.10(1029)#(1029)[SSP](C)(i)", "900.5.10(264)#(264)[SSP](A)(i)"], ["900.3.10(1029)#(1029)[SSP](C)(ii)", "900.5.10(264)#(264)[SSP](A)(ii)"]];
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
      if (SIDE.includes(id)) { expect(u?.archetype, id).toBe('UNUSUAL'); continue; } // CHAT-95.X-4 / CHAT-96 NAMED-FAM (newer ruling)
      expect([id, u?.archetype, u?.bound]).toEqual([id, 'LIMIT', 'min']); // disclosure: the pre-NAMED-1 value is restored as-is (b10bd225 precedent)
      expect(u.target, id).not.toBe('none');
      expect(u.condition?.tokens, id).toContain('abuts_named_street');
    }
  });

  it('no other unit carrying abuts_named_street is a LIMIT (the card is the 44, plus their three word-for-word twins)', () => {
    const left = [...U].filter(([id, x]) => /^900\.[2-6]\.10\(/.test(id) && x.archetype === 'LIMIT' && JSON.stringify(x.condition || '').includes('abuts_named_street'));
    expect(left.map(([id]) => id).sort()).toEqual([...ALL, ...TWINS.map(([t]) => t), T1169].filter((id) => !SIDE.includes(id)).sort());
  });

  it('identical clause text reads one way: 323 (C) = 325 (C), 1170 (A)(i) = 1168 (C)(i), 256 (D) = 264 (A) = 1029 (C), 255 (D)(i) = 1026 (C)(i)', () => {
    for (const [a, b] of [['900.3.10(323)#(323)[SSP](C)', '900.3.10(325)#(325)[SSP](C)'], ['900.3.10(1170)#(1170)[SSP](A)(i)', '900.3.10(1168)#(1168)[SSP](C)(i)'],
      ['900.4.10(256)#(256)[SSP](D)(i)', '900.5.10(264)#(264)[SSP](A)(i)'], ['900.4.10(256)#(256)[SSP](D)(ii)', '900.5.10(264)#(264)[SSP](A)(ii)'], ...TWINS.map(([t, r]) => [r, t])] as [string, string][]) {
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

// CHAT-91 (operator 2026-10-23 "B-1 to B-5 your recommendation is approved"; recorded 18aa1f7c on wf1/rulings-rec3: B-2 on M-350, B-3 on Spec 133 §m.285 (M-285)), cards B-2 and B-3.
// B-2: a restored named-road unit whose disclosure is now false — the M-285 join computes it — has disclosure none (as twin 325 (C) has).
// CHAT-93.E-1 (operator 2026-10-23, held pending CHAT-93 import): 316 (H) keeps its disclosure — its clause is limited to named addresses
// (3165-3185 Sheppard Ave. E., 5 and 6 Abbottsfield Gate) the unit does not hold, so "this named-address rule is not evaluated" is true.
// B-2 correction (verify each premise): 4 of the 9 first set none do NOT compute through the join, so their disclosure was true and is
// restored — 303 (D) (its table row names "Pharmacy Ave. Rd.", which no frontage street matches), 852 (C)(i),(E)(i) (applies_to
// named_addresses with street names as refs: no parcel address equals them) and 713 (C)(i) (applies_to map_area with street names as refs).
// B-3: a vocab.named_street row whose clause says "front lot line" / "front yard" is line front ($comment rule), as twin 1168 (C)(i) is.
// 1026 (C)(i) and its twin 255 (D)(i) say "a lot line that abuts a street ... where the lot line abuts", so they stay line any.
// Red first: docs/reports/red-evidence/bylaw/bylaw-chat91-named-red.txt
// CHAT-95 (newer ruling): X-1 / X-2 make 303 (D), 852 (C)(i) and 713 (C)(i) compute, so B-2 none applies to them; 852 (E)(i) is held (its re-key
// would compute a side-lot-line arm from the frontage street, which X-4 rules out: operator question); X-4 makes 714 (D)(i) UNUSUAL, disclosed.
const B2_NONE = ["900.3.10(323)#(323)[SSP](C)","900.3.10(1032)#(1032)[SSP](C)(i)","900.4.10(70)#(70)[SSP](A)(i)","900.3.10(714)#(714)[SSP](C)(i)","900.3.10(303)#(303)[SSP](D)","900.3.10(852)#(852)[SSP](C)(i)","900.3.10(713)#(713)[SSP](C)(i)"];
const B2_KEPT = ["900.3.10(316)#(316)[SSP](H)", ...SIDE]; // CHAT-93.E-1; the side-lot-line arms (CHAT-95.X-4, CHAT-96 NAMED-FAM)
const B3_FRONT = ["900.3.10(1170)#(1170)[SSP](A)(i)","900.3.10(560)#(560)[SSP](C)(i)","900.3.10(309)#(309)[SSP](C)(i)","900.4.10(70)#(70)[SSP](A)(i)","900.3.10(975)#(975)[SSP](A)(i)","900.3.10(975)#(975)[SSP](A)(ii)"];

describe('CHAT-91 B-2 / B-3: computed named-road units carry no stale disclosure; front-worded rows are line front', async () => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));

  it('B-2: the 7 computed units have disclosure none; 316 (H) (CHAT-93.E-1) and the side-lot-line arms (CHAT-95.X-4, CHAT-96) disclose; no other of the 44 does', () => {
    for (const id of B2_NONE) expect([id, (U.get(id) as Json).disclosure]).toEqual([id, 'none']);
    expect((U.get('900.3.10(316)#(316)[SSP](H)') as Json).disclosure).toMatch(/named-address rule is not evaluated/);
    expect((U.get('900.3.10(852)#(852)[SSP](E)(i)') as Json).disclosure).toMatch(/^Where a side lot line abuts Brimley Rd\. or Midland Ave\., .*not evaluated/);
    expect(ALL.filter((id) => (U.get(id) as Json).disclosure !== 'none').sort()).toEqual([...B2_KEPT].sort());
  });

  it('B-2 records cite the imported ruling (M-350, recorded 18aa1f7c), not "held pending CHAT-91 import"', async () => {
    const fs = await import('node:fs');
    const adj: Json[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/adjudications.json'), 'utf8')).adjudications;
    const mine = adj.filter((x) => /CHAT-91\.B-2/.test(x.rule));
    expect(mine.length).toBe(13); // 9 set none + 4 restored
    for (const x of mine) { expect(x.rule, x.id).not.toMatch(/held pending CHAT-91 import/); expect(x.rule, x.id).toContain('M-350 (CHAT-91.B-2 note, recorded 18aa1f7c'); }
  });

  it('B-3: the 6 front-worded rows are line front; 1026 (C)(i) and 255 (D)(i) stay line any', () => {
    for (const id of B3_FRONT) expect([id, I.vocab.named_street.units[id]?.line]).toEqual([id, 'front']);
    for (const id of ['900.3.10(1026)#(1026)[SSP](C)(i)', '900.4.10(255)#(255)[SSP](D)(i)']) expect([id, I.vocab.named_street.units[id]?.line]).toEqual([id, 'any']);
  });

  it('B-3: every computed front_setback_m unit in vocab.named_street is line front (a front setback is measured from the front lot line)', () => {
    const left = [...U].filter(([id, x]) => x.archetype === 'LIMIT' && x.target === 'front_setback_m' && I.vocab.named_street.units[id]?.line === 'any');
    expect(left.map(([id]) => id)).toEqual([]);
  });
});

describe('CHAT-91 B-3: 1170 (A)(i) reads as its twin 1168 (C)(i) off Conference Blvd.', async () => {
  const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
  const { E, units, C } = await AS.loadRealLotAssembly(ROOT);
  const lot = (exception: string, name: string): Json => ({
    zone: 'RD', label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], building_type: 'detached_house', exception, primary_frontage_street_name: name,
    flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false },
    vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5 },
  });
  const eff = (l: Json, t: string): Json => E.effective(l, t, E.loadCandidates(l, units).candidates, C);

  it('on Ravencliff Cres. 1170 answers a value as 1168 does (the named arm is refuted, not undecided); on Conference Blvd. it stays 7.5 m', () => {
    const r1170 = eff(lot('900.3.10(1170)', 'Ravencliff Cres'), 'front_setback_m'), r1168 = eff(lot('900.3.10(1168)', 'Ravencliff Cres'), 'front_setback_m');
    expect(r1168.status).toBe('value');
    expect([r1170.status, r1170.value]).toEqual(['value', r1168.value]);
    expect(eff(lot('900.3.10(1170)', 'Conference Blvd'), 'front_setback_m')).toMatchObject({ status: 'value', value: 7.5, winner: '900.3.10(1170)#(1170)[SSP](A)(i)' });
  });

  it('production path (a lot with its address and map areas, as the CoA scorer builds it): 323 (C), 714 (C)(i) and, after CHAT-95 X-1 / X-2, 303 (D), 852 (C)(i), 713 (C)(i) compute; 852 (E)(i) (held) and 714 (D)(i) (X-4) do not', () => {
    const real = (exception: string, street: string): Json => ({ ...lot(exception, street), address: '100 ' + street, map_areas: [] });
    const won = (exception: string, street: string, t: string, id: string): boolean => eff(real(exception, street), t).winner === id;
    expect(won('900.3.10(323)', 'HUNTINGWOOD DR', 'front_setback_m', '900.3.10(323)#(323)[SSP](C)')).toBe(true);
    expect(won('900.3.10(714)', 'ELLESMERE RD', 'front_setback_m', '900.3.10(714)#(714)[SSP](C)(i)')).toBe(true);
    expect(won('900.3.10(303)', 'PHARMACY AVE', 'front_setback_m', '900.3.10(303)#(303)[SSP](D)')).toBe(true);
    expect(won('900.3.10(852)', 'BRIMLEY RD', 'front_setback_m', '900.3.10(852)#(852)[SSP](C)(i)')).toBe(true);
    expect(won('900.3.10(852)', 'BRIMLEY RD', 'side_setback_street_m', '900.3.10(852)#(852)[SSP](E)(i)')).toBe(false);
    expect(won('900.3.10(713)', 'ELLESMERE RD', 'side_setback_m', '900.3.10(713)#(713)[SSP](C)(i)')).toBe(true);
    expect(won('900.3.10(714)', 'ELLESMERE RD', 'side_setback_street_m', X4)).toBe(false);
  });
});

// CHAT-93.E-2 (operator 2026-10-23, held pending CHAT-93 import): the calculation_handling gaps text of a CHAT-91.B-2 unit that says the
// named-street test is not held / not evaluated is corrected ONLY where it is now false because the unit computes through the M-285 join
// (premise checked on the production path above): 323 (C), 900.4.10 70 (A)(i), 714 (C)(i) — the front-line arms. 1032 (C)(i) and
// 714 (D)(i) keep theirs (true: which lot line abuts the road is not held; the join reads only the frontage street). Status and
// not_modelled_reason are unchanged (reported, not decided). Red first: docs/reports/red-evidence/bylaw/bylaw-chat93-e2-red.txt
describe('CHAT-93.E-2: computed front-line named-road arms say how the street test is read', async () => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
  const gaps = (id: string): string => (U.get(id) as Json).calculation_handling.gaps;

  it('323 (C), 70 (A)(i), 714 (C)(i): gaps names the M-285 join and no longer says the street is not held / not identified', () => {
    for (const id of ['900.3.10(323)#(323)[SSP](C)', '900.4.10(70)#(70)[SSP](A)(i)', '900.3.10(714)#(714)[SSP](C)(i)']) {
      expect(gaps(id), id).toMatch(/read from the lot's primary frontage street \(M-285 street-name join, vocab\.named_street line front\)/);
      expect(gaps(id), id).not.toMatch(/not held|not identified/);
    }
  });

  it('unchanged where the text is still true: 1032 (C)(i) and 316 (H) (CHAT-95 / CHAT-96 change the others)', () => {
    expect(gaps('900.3.10(1032)#(1032)[SSP](C)(i)')).toMatch(/^Which lot line abuts McCowan Rd\., Brimley Rd\. or Brimwood Blvd\. is not held/);
    expect(gaps('900.3.10(316)#(316)[SSP](H)')).toBe('Applies to named addresses only; the address list is not held as a lot set.');
  });
});

// CHAT-95 (operator 2026-10-23 "approved recos", held pending CHAT-95 import; CHAT-93.condition), cards X-1..X-5.
// X-1: the 303 (D) row names "Pharmacy Ave." (the clause's words; was "Pharmacy Ave. Rd.", matched by no frontage street).
// X-2: 852 (C)(i) and 713 (C)(i) take the twin form of 204 (C)(i): applies_to whole (the street names were keyed as named addresses /
// map areas, which no parcel matches); they now compute. 852 (E)(i) is held: its twin form computes a side-lot-line arm from the frontage street.
// X-3 / X-2 / X-1: a computed named-road arm reads partially_modelled / needs_data_we_lack (the form of 21 of the 44, twin 325 (C) included),
// and its gaps says how the street test is read. X-5: 325 (C) takes 323 (C)'s gaps. X-4: 714 (D)(i) is UNUSUAL, disclosed (the CHAT-84.NAMED-1b
// form for a road that cannot be determined). Red first: docs/reports/red-evidence/bylaw/bylaw-chat95-red.txt
describe('CHAT-95 X-1..X-5: named-road keying defects fixed; each unit reads what it does', async () => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
  const ch = (id: string): Json => (U.get(id) as Json).calculation_handling;
  const FRONT = (road: string): string => `Whether the front lot line abuts ${road} is read from the lot's primary frontage street (M-285 street-name join, vocab.named_street line front).`;

  it('X-1: the 303 (D) row names Pharmacy Ave.', () => {
    expect(I.vocab.named_street.units['900.3.10(303)#(303)[SSP](D)']).toEqual({ streets: ['Pharmacy Ave.'], line: 'front' });
  });

  it('X-2: 852 (C)(i) and 713 (C)(i) apply to the whole exception, as 204 (C)(i) does (852 (E)(i) too since CHAT-96)', () => {
    for (const id of ['900.3.10(852)#(852)[SSP](C)(i)', '900.3.10(713)#(713)[SSP](C)(i)', '900.5.10(204)#(204)[SSP](C)(i)']) expect([id, (U.get(id) as Json).applies_to]).toEqual([id, { part: 'whole', refs: [] }]);
    expect((U.get('900.3.10(852)#(852)[SSP](E)(i)') as Json).applies_to.part).toBe('whole');
  });

  it('X-1 / X-2 / X-3 / X-5: the computed arms read partially_modelled / needs_data_we_lack and say how the street test is read', () => {
    const want: [string, string][] = [['900.3.10(303)#(303)[SSP](D)', FRONT('Pharmacy Ave.')], ['900.3.10(323)#(323)[SSP](C)', FRONT('Huntingwood Dr.')], ['900.3.10(325)#(325)[SSP](C)', FRONT('Huntingwood Dr.')],
      ['900.3.10(852)#(852)[SSP](C)(i)', FRONT('Brimley Rd. or Midland Ave.')], ['900.3.10(714)#(714)[SSP](C)(i)', FRONT('a named street')],
      ['900.3.10(713)#(713)[SSP](C)(i)', "Whether the lot fronts on a named street is read from the lot's primary frontage street (M-285 street-name join, vocab.named_street line front)."]]; // 713: line front since CHAT-96 ("fronts on")
    for (const [id, gaps] of want) expect([id, ch(id).status, ch(id).not_modelled_reason, ch(id).gaps]).toEqual([id, 'partially_modelled', 'needs_data_we_lack', gaps]);
  });

  it('X-4: 714 (D)(i) is UNUSUAL and its disclosure says why (which street a side lot line abuts is not held)', () => {
    const u = U.get(X4) as Json;
    expect([u.archetype, u.target, u.bound, u.numeric_expression]).toEqual(['UNUSUAL', 'none', 'none', 'none']);
    expect(u.literals_not_expressed).toEqual([{ clause: '(714)[SSP](D)(i)', literal: '4.5 metres', reason: 'limit_not_modelled' }]);
    expect(u.disclosure).toMatch(/side lot line.*4\.5 metres.*not evaluated.*which street a side lot line abuts is not held/);
    expect([u.calculation_handling.status, u.calculation_handling.not_modelled_reason]).toEqual(['not_modelled', 'needs_data_we_lack']);
  });
});

// CHAT-96 NAMED-FAM (operator 2026-10-23 "NAMED-FAM y: close the named-road family in one pass", held pending CHAT-96 import; CHAT-93.condition):
// the 44 named-road units and their word-for-word twins, by the clause's wording — F front lot line / front yard / fronts on: computed by the
// M-285 join, row line front; L "a lot line that abuts a street": computed, row line any (unchanged); S side lot line: UNUSUAL, disclosed (X-4 form);
// every computed unit reads partially_modelled / needs_data_we_lack with no "not held" / "not evaluated" text about the street test (1032 (C)(i)'s
// "which lot line abuts ... is not held; rule 4a" is true and kept). 316 (H) (named addresses) is outside the classes (CHAT-93.E-1).
// Red first: docs/reports/red-evidence/bylaw/bylaw-chat96-namedfam-red.txt
const FAM_F = ["900.3.10(309)#(309)[SSP](C)(i)","900.3.10(303)#(303)[SSP](D)","900.3.10(323)#(323)[SSP](C)","900.3.10(316)#(316)[SSP](D)","900.3.10(560)#(560)[SSP](C)(i)","900.3.10(1170)#(1170)[SSP](A)(i)","900.4.10(70)#(70)[SSP](A)(i)","900.3.10(325)#(325)[SSP](C)","900.3.10(1156)#(1156)[SSP](C)(i)","900.3.10(936)#(936)[SSP](C)(i)","900.3.10(1091)#(1091)[SSP](C)(i)","900.3.10(714)#(714)[SSP](C)(i)","900.3.10(397)#(397)[SSP](B)","900.3.10(975)#(975)[SSP](A)(i)","900.3.10(975)#(975)[SSP](A)(ii)","900.3.10(812)#(812)[SSP](D)(i)","900.3.10(1168)#(1168)[SSP](C)(i)","900.3.10(516)#(516)[SSP](C)(i)","900.3.10(516)#(516)[SSP](C)(ii)","900.3.10(516)#(516)[SSP](C)(iii)","900.3.10(854)#(854)[SSP](C)(i)","900.3.10(852)#(852)[SSP](C)(i)","900.3.10(713)#(713)[SSP](C)(i)","900.4.10(202)#(202)[SSP](D)(i)","900.5.10(200)#(200)[SSP](A)(i)","900.5.10(204)#(204)[SSP](C)(i)","T1169"].map((x) => (x === 'T1169' ? T1169 : x));
const FAM_L = ["900.3.10(1057)#(1057)[SSP](C)(i)","900.3.10(1032)#(1032)[SSP](C)(i)","900.4.10(256)#(256)[SSP](D)(i)","900.4.10(256)#(256)[SSP](D)(ii)","900.3.10(1120)#(1120)[SSP](C)(i)","900.4.10(255)#(255)[SSP](D)(i)","900.4.10(295)#(295)[SSP](D)(i)","900.4.10(284)#(284)[SSP](D)(i)","900.5.10(264)#(264)[SSP](A)(i)","900.5.10(264)#(264)[SSP](A)(ii)","900.3.10(1029)#(1029)[SSP](C)(i)","900.3.10(1029)#(1029)[SSP](C)(ii)","900.3.10(1026)#(1026)[SSP](C)(i)"];
const FAM_WIN: [string, string][] = [["900.3.10(309)#(309)[SSP](C)(i)","Birchmount Rd"],["900.3.10(303)#(303)[SSP](D)","Pharmacy Ave"],["900.3.10(1057)#(1057)[SSP](C)(i)","Huntingwood Dr"],["900.3.10(323)#(323)[SSP](C)","Huntingwood Dr"],["900.3.10(316)#(316)[SSP](D)","Pharmacy Ave"],["900.3.10(560)#(560)[SSP](C)(i)","Warden Ave"],["900.3.10(1032)#(1032)[SSP](C)(i)","McCowan Rd"],["900.3.10(1170)#(1170)[SSP](A)(i)","Conference Boulevard"],["900.4.10(256)#(256)[SSP](D)(i)","Finch Ave"],["900.4.10(70)#(70)[SSP](A)(i)","Birchmount Rd"],["900.3.10(325)#(325)[SSP](C)","Huntingwood Dr"],["900.3.10(1156)#(1156)[SSP](C)(i)","Lawson Rd"],["900.3.10(936)#(936)[SSP](C)(i)","Huntingwood Dr"],["900.3.10(1091)#(1091)[SSP](C)(i)","Corinthian Boulevard"],["900.3.10(1120)#(1120)[SSP](C)(i)","Kennedy Rd"],["900.3.10(714)#(714)[SSP](C)(i)","Ellesmere Rd"],["900.3.10(397)#(397)[SSP](B)","Mason Rd"],["900.3.10(975)#(975)[SSP](A)(i)","Fifeshire Rd"],["900.3.10(975)#(975)[SSP](A)(ii)","Bayview Ave"],["900.3.10(812)#(812)[SSP](D)(i)","Middlefield Rd"],["900.3.10(1168)#(1168)[SSP](C)(i)","Conference Boulevard"],["900.3.10(516)#(516)[SSP](C)(i)","Sheppard Ave"],["900.3.10(516)#(516)[SSP](C)(ii)","Milner Ave"],["900.3.10(516)#(516)[SSP](C)(iii)","Murison Blvd"],["900.3.10(854)#(854)[SSP](C)(i)","Middlefield Rd"],["900.3.10(852)#(852)[SSP](C)(i)","Brimley Rd"],["900.3.10(713)#(713)[SSP](C)(i)","Ellesmere Rd"],["900.4.10(255)#(255)[SSP](D)(i)","Finch Ave"],["900.4.10(202)#(202)[SSP](D)(i)","Middlefield Rd"],["900.4.10(295)#(295)[SSP](D)(i)","Corinthian Boulevard"],["900.4.10(284)#(284)[SSP](D)(i)","Birchmount Rd"],["900.5.10(264)#(264)[SSP](A)(i)","Finch Ave"],["900.5.10(200)#(200)[SSP](A)(i)","Middlefield Rd"],["900.5.10(204)#(204)[SSP](C)(i)","Brimley Rd"],["900.3.10(1029)#(1029)[SSP](C)(i)","Finch Ave"],["900.3.10(1026)#(1026)[SSP](C)(i)","Finch Ave"]];
describe('CHAT-96 NAMED-FAM: the named-road family reads by its wording', async () => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
  const AS = await mod('scripts/analysis/bylaw-validation/assembly.mjs');
  const { E, units, C } = await AS.loadRealLotAssembly(ROOT);
  const Z: Record<string, string> = { '900.2.10': 'R', '900.3.10': 'RD', '900.4.10': 'RS', '900.5.10': 'RT' };
  const real = (exception: string, name: string): Json => ({
    zone: Z[exception.slice(0, 8)], label: { f: 12, d: 0.6 }, overlays: {}, map_areas: [], address: '100 ' + name, building_type: 'detached_house', exception, primary_frontage_street_name: name,
    flags: { lawfully_existing: false, corner_lot: false, through_lot: false, major_street: false, front_averaging_not_applicable: true, abuts_lane: false, suite_wall_openings: false, flat_or_shallow_roof: false },
    vars: { lot_frontage_m: 12, lot_depth_m: 40, lot_area_m2: 480, proposed_height_m: 4, distance_to_residential_m: 5 },
  });
  const winner = (id: string, street: string, target: string): string | undefined => { const l = real(id.slice(0, id.indexOf('#')), street); return E.effective(l, target, E.loadCandidates(l, units).candidates, C).winner; };
  const stale = /not held|not evaluated|not a held|not checked|cannot|not identified|not yet|needs street-name|depends on/i;

  it('F and L: LIMIT, partially_modelled / needs_data_we_lack, F rows line front, L rows line any, no stale street-test text, disclosure none', () => {
    for (const id of [...FAM_F, ...FAM_L]) {
      const u = U.get(id) as Json, h = u.calculation_handling;
      expect([id, u.archetype, h.status, h.not_modelled_reason, u.disclosure]).toEqual([id, 'LIMIT', 'partially_modelled', 'needs_data_we_lack', 'none']);
      expect([id, I.vocab.named_street.units[id]?.line]).toEqual([id, FAM_F.includes(id) ? 'front' : 'any']);
      expect(stale.test(h.description), id + ' description').toBe(false);
      if (id !== '900.3.10(1032)#(1032)[SSP](C)(i)') expect(h.gaps, id).toMatch(/M-285 street-name join/);
    }
  });

  it('S: every side-lot-line arm is UNUSUAL and says the side street is not held', () => {
    expect(SIDE.length).toBe(7);
    for (const id of SIDE) {
      const u = U.get(id) as Json;
      expect([id, u.archetype, u.target, u.numeric_expression, u.calculation_handling.status]).toEqual([id, 'UNUSUAL', 'none', 'none', 'not_modelled']);
      expect(u.disclosure, id).toMatch(/^Where a side lot line abuts .*not evaluated, because which street a side lot line abuts is not held/);
      expect(u.literals_not_expressed?.[0]?.reason, id).toBe('limit_not_modelled');
    }
  });

  it('production path: each computed arm wins on its named frontage street; no side arm wins; 1169 (C)(ii) wins 7.5 m on Conference Blvd.', () => {
    for (const [id, st] of FAM_WIN) expect([id, winner(id, st, (U.get(id) as Json).target)]).toEqual([id, id]);
    for (const id of SIDE) expect(winner(id, I.vocab.named_street.units[id].streets[0].replace(/\.$/, ''), 'side_setback_street_m'), id).not.toBe(id);
    expect(winner(T1169, 'Conference Boulevard', 'front_setback_m')).toBe(T1169);
    expect(I.vocab.named_street.units[T1169]).toEqual({ streets: ['Conference Boulevard'], line: 'front' });
  });
});
