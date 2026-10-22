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
