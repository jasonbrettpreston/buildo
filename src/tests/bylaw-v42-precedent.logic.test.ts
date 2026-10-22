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
