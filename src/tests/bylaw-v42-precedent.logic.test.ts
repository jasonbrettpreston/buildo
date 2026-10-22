// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-102, M-130, M-75; operator rulings 806 (C) / 540 (F), CHAT-81.FAM-ALL, CHAT-83.W-2
// verify-42 item 5/6: older operator rulings applied to the later-keyed units of the same wording (precedent contradictions). Red first.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const load = async (): Promise<Map<string, Json>> => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  return AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
};

// item 5a: "1.0 metres on one side only" is UNUSUAL (operator 806 (C) / 540 (F)): no per-side form in the DSL
const ONE_SIDE = ['900.3.10(806)#(806)[SSP](C)', '900.3.10(540)#(540)[SSP](F)', '900.3.10(841)#(841)[SSP](D)',
  '900.3.10(515)#(515)[SSP](E)', '900.3.10(541)#(541)[SSP](F)', '900.3.10(858)#(858)[SSP](C)', '900.3.10(588)#(588)[SSP](C)', '900.3.10(1049)#(1049)[SSP](E)',
  '900.3.10(553)#(553)[SSP](D)', '900.3.10(1031)#(1031)[SSP](D)', '900.3.10(357)#(357)[SSP](D)', '900.3.10(546)#(546)[SSP](D)', '900.3.10(713)#(713)[SSP](C)(ii)',
  '900.4.10(144)#(144)[SSP](D)', '900.3.10(586)#(586)[SSP](A)', '900.3.10(807)#(807)[SSP](C)', '900.3.10(584)#(584)[SSP](D)', '900.3.10(528)#(528)[SSP](D)'];

describe('verify-42 item 5a: a side setback minimum "on one side only" is UNUSUAL, as 806 (C) / 540 (F)', () => {
  it('all 18 units of that wording are UNUSUAL, name the 1.0 metres as limit_not_modelled and carry a disclosure', async () => {
    const U = await load();
    for (const id of ONE_SIDE) {
      const u = U.get(id) as Json;
      expect(u?.archetype, id).toBe('UNUSUAL');
      expect(u.literals_not_expressed.some((l: Json) => /^1\.0(\s*metres)?$/.test(l.literal) && l.reason === 'limit_not_modelled'), id).toBe(true);
      expect(typeof u.disclosure === 'string' && u.disclosure !== 'none', id).toBe(true);
    }
  }, 120000);
});

// item 5b: identical wording, identical reading
describe('verify-42 item 5b: 1461 (F) is PERMIT as 1460 (F); 1031 (G) is garage_entrance_setback_m as its R11-1 twins', () => {
  it('1461 (F) PERMIT, 1031 (G) LIMIT garage_entrance_setback_m min', async () => {
    const U = await load();
    expect((U.get('900.3.10(1461)#(1461)[SSP](F)') as Json).archetype).toBe('PERMIT');
    for (const id of ['900.3.10(1031)#(1031)[SSP](G)', '900.3.10(1049)#(1049)[SSP](G)', '900.3.10(357)#(357)[SSP](E)']) {
      const u = U.get(id) as Json;
      expect([id, u.archetype, u.target, u.bound]).toEqual([id, 'LIMIT', 'garage_entrance_setback_m', 'min']);
    }
  }, 120000);
});

// item 6: smaller precedent fixes
describe('verify-42 item 6: older rulings applied to the later-keyed units of the same wording', () => {
  it('144 (J) bay window projection is window_projection_encroachment_m (M-243)', async () => {
    const u = (await load()).get('900.4.10(144)#(144)[SSP](J)') as Json;
    expect([u.archetype, u.target, u.bound]).toEqual(['LIMIT', 'window_projection_encroachment_m', 'max']);
  }, 120000);
  it('the complement arms that are the smallest sibling (237 (A)(iv), 284 (D)(ii), 1057 (C)(ii)) are the partial form, as 1029 (C)(iii)', async () => {
    const U = await load();
    for (const id of ['900.3.10(1029)#(1029)[SSP](C)(iii)', '900.5.10(237)#(237)[SSP](A)(iv)', '900.4.10(284)#(284)[SSP](D)(ii)', '900.3.10(1057)#(1057)[SSP](C)(ii)']) {
      const u = U.get(id) as Json;
      expect([id, u.archetype, u.target, u.calculation_handling.status]).toEqual([id, 'LIMIT', 'street_setback_m', 'partially_modelled']);
    }
  }, 120000);
  it('the complement arms that are not the smallest sibling (812 (D)(iii), 202 (D)(iii), 900.5.10 200 (A)(iii)) are UNUSUAL', async () => {
    const U = await load();
    for (const id of ['900.3.10(812)#(812)[SSP](D)(iii)', '900.4.10(202)#(202)[SSP](D)(iii)', '900.5.10(200)#(200)[SSP](A)(iii)']) {
      const u = U.get(id) as Json;
      expect(u.archetype, id).toBe('UNUSUAL');
      expect(u.literals_not_expressed.some((l: Json) => l.literal === '6.0 metres' && l.reason === 'limit_not_modelled'), id).toBe(true);
    }
  }, 120000);
  it('1435 (D) and 1438 (D) are the exact 1436 (D) form: lot_conditions lawfully_existing', async () => {
    const U = await load();
    for (const id of ['900.3.10(1436)#(1436)[SSP](D)', '900.3.10(1435)#(1435)[SSP](D)', '900.3.10(1438)#(1438)[SSP](D)']) {
      const u = U.get(id) as Json;
      expect([id, u.application.lot_conditions]).toEqual([id, ['lawfully_existing']]);
      expect(u.application.evidence.lawfully_existing, id).toBeTruthy();
    }
  }, 120000);
  it('70 (D) and 69 (E) ancillary-building coverage is ancillary_coverage_pct (FAM-ANCCOV)', async () => {
    const U = await load();
    for (const id of ['900.3.10(971)#(971)[SSP](D)', '900.3.10(70)#(70)[SSP](D)', '900.3.10(69)#(69)[SSP](E)']) expect((U.get(id) as Json).target, id).toBe('ancillary_coverage_pct');
  }, 120000);
});

// CHAT-84.NAMED-1b (operator 2026-10-23): the 12 units whose road is in vocab.named_street are LIMIT (computed by the M-285 join); the other 32 were UNUSUAL, disclosed.
// CHAT-87.NAMED-1c (operator 2026-10-22 "NAMED y", held pending CHAT-87 import): the other 32 are in the table too (c03aa135), so the rule as worded computes them: LIMIT.
describe('CHAT-87.NAMED-1c: the 32 named-road arms of NAMED-1b are computed', () => {
  it('the 12 table units are LIMIT; each of the other 32 is LIMIT again and its live record of every converted field cites CHAT-87.NAMED-1c', async () => {
    const fs = await import('node:fs');
    const U = await load();
    const adj: Json[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/adjudications.json'), 'utf8')).adjudications;
    const sup = new Set(adj.map((x) => x.supersedes).filter(Boolean));
    const live = (unit: string, field: string): Json | undefined => adj.filter((x) => x.kind === 'correction' && x.unit === unit && x.field === field && !sup.has(x.id)).pop();
    const twelve = ['900.3.10(309)#(309)[SSP](C)(i)', '900.3.10(303)#(303)[SSP](D)', '900.3.10(1057)#(1057)[SSP](C)(i)', '900.3.10(323)#(323)[SSP](C)', '900.3.10(316)#(316)[SSP](D)', '900.3.10(316)#(316)[SSP](H)',
      '900.3.10(560)#(560)[SSP](C)(i)', '900.3.10(1032)#(1032)[SSP](C)(i)', '900.3.10(1170)#(1170)[SSP](A)(i)', '900.4.10(256)#(256)[SSP](D)(i)', '900.4.10(256)#(256)[SSP](D)(ii)', '900.4.10(70)#(70)[SSP](A)(i)'];
    for (const t of twelve) expect(U.get(t)?.archetype, t).toBe('LIMIT');
    // the 32: every unit whose live archetype record was written for NAMED-1c (restoring the pre-NAMED-1 LIMIT the NAMED-1b records had replaced)
    const thirtyTwo = [...new Set(adj.filter((x) => x.kind === 'correction' && x.field === 'archetype' && /NAMED-1c/.test(x.rule) && !sup.has(x.id)).map((x) => x.unit))];
    expect(thirtyTwo.length).toBe(32);
    for (const id of thirtyTwo) {
      expect(U.get(id)?.archetype, id).toBe('LIMIT');
      for (const f of ['archetype', 'target', 'bound', 'numeric_expression', 'literals_not_expressed', 'calculation_handling', 'disclosure']) {
        const r = live(id, f) as Json;
        expect(r?.rule, id + ' ' + f).toContain('CHAT-87.NAMED-1c');
        expect(r.supersedes, id + ' ' + f).toBe(`COR-${id}/${f}~s1`); // supersedes the CHAT-84.NAMED-1b record
      }
    }
  }, 120000);
});

// CHAT-84.TWIN-1 (operator 2026-10-23): the newer family rulings win over older unit readings of identical text
describe('CHAT-84.TWIN-1: identical text, one reading', () => {
  it('1335 (A) and 1332 (A) take the FAM-HIST form of 900.2.10(621)(B) (building-history replacement permit: UNUSUAL, disclosed)', async () => {
    const U = await load();
    const ref = U.get('900.2.10(621)#(621)[SSP](B)') as Json;
    expect(ref.archetype).toBe('UNUSUAL');
    for (const id of ['900.3.10(1335)#(1335)[SSP](A)', '900.3.10(1332)#(1332)[SSP](A)', '900.3.10(1329)#(1329)[SSP](A)']) { // 1329 (A): found by the precedent sweep (identical text, same ruling)
      const u = U.get(id) as Json;
      expect([id, u.archetype, u.target, u.numeric_expression, u.condition]).toEqual([id, ref.archetype, ref.target, ref.numeric_expression, ref.condition]);
      expect(u.disclosure, id).not.toBe('none');
    }
    // 1419 (A): already UNUSUAL, but keyed with no lawfully_existing condition (reported in the verify-42 handback, not changed)
    expect((U.get('900.3.10(1419)#(1419)[SSP](A)') as Json).archetype).toBe('UNUSUAL');
  }, 120000);
  it('900.3.10(70) (B) takes the FAM-STEP form of 975 (B) (per-storey side yard: UNUSUAL, 1.8 and 0.6 limit_not_modelled)', async () => {
    const U = await load();
    const ref = U.get('900.3.10(975)#(975)[SSP](B)') as Json;
    const u = U.get('900.3.10(70)#(70)[SSP](B)') as Json;
    expect([u.archetype, u.target, u.bound]).toEqual([ref.archetype, ref.target, ref.bound]);
    const lits = (x: Json): string[] => x.literals_not_expressed.map((l: Json) => `${l.literal}:${l.reason}`).sort();
    expect(lits(u)).toEqual(lits(ref));
  }, 120000);
});

// CHAT-86.bay-window (operator 2026-10-23): the licence pattern "bay windows may project" for window_projection_encroachment_m, added with the 144 (J) retarget (4c15c682), is confirmed (M-132, M-243)
describe('CHAT-86.bay-window: the confirmed licence pattern', () => {
  it('licenses the 144 (J) wording and no neighbouring one', async () => {
    const fs = await import('node:fs');
    const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
    const pats: string[] = V.dsl_target.window_projection_encroachment_m.patterns;
    const lic = (t: string): boolean => pats.some((x) => t.toLowerCase().includes(x));
    expect(lic('Cantilevered bay windows may project a maximum distance of 0.6 metres into all yards')).toBe(true);
    expect(lic('A deck may project a maximum distance of 0.6 metres into all yards')).toBe(false);
    expect(lic('Bay windows are permitted on the second storey')).toBe(false);
  });
});
