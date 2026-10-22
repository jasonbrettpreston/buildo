// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-75 (corrections), M-130 (partial LIMIT), M-317 dated note 2 (CHAT-67.1434A twin form), operator ruling R5-Q7b-464 (subordinate_reference)
// HELD (verify-40, not operator-ruled): the verify-40 findings 2, 3, 4 and 7 as assertions on the resolved units.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

describe('verify-40 fixes on the resolved units', async () => {
  const V = await mod('scripts/analysis/bylaw/validate.mjs');
  const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs');
  const I = V.loadInputs({ root: ROOT });
  const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
  const get = (id: string): Json => U.get(id) as Json;

  it('finding 2: "Despite (X)" naming a sibling clause of the same exception is subordinate_reference (R5-Q7b-464)', () => {
    for (const id of ['900.2.10(958)#(958)[SSP](C)', '900.2.10(958)#(958)[SSP](D)', '900.2.10(958)#(958)[SSP](E)', '900.2.10(951)#(951)[SSP](C)', '900.2.10(951)#(951)[SSP](D)', '900.2.10(951)#(951)[SSP](E)']) {
      expect(get(id).not_an_override, id).toEqual([{ phrase: 'Despite', reason: 'subordinate_reference' }]);
    }
  });
  it('finding 3: 324 (J)(i) is UNUSUAL (the clause applies only to below-grade parking structures)', () => {
    const u = get('900.5.10(324)#(324)[SSP](J)(i)');
    expect([u.archetype, u.target, u.bound]).toEqual(['UNUSUAL', 'none', 'none']);
  });
  it('finding 4: 1429 (A), 591 (A) and 910 (A) are keyed like the ruled twin 1436 (D)', () => {
    const twin = get('900.3.10(1436)#(1436)[SSP](D)');
    for (const id of ['900.3.10(1429)#(1429)[SSP](A)', '900.2.10(591)#(591)[SSP](A)', '900.2.10(910)#(910)[SSP](A)']) {
      const u = get(id);
      expect(u.calculation_handling, id).toEqual(twin.calculation_handling);
      expect(u.disclosure, id).toBe('none');
      expect([u.archetype, u.requirement], id).toEqual([twin.archetype, twin.requirement]);
    }
  });
  it('finding 7: 45 (E) carries an arm-not-modelled literal, so it is partially_modelled with gaps (M-130)', () => {
    const u = get('900.3.10(45)#(45)[SSP](E)');
    expect(u.calculation_handling.status).toBe('partially_modelled');
    expect(u.calculation_handling.gaps).not.toBe('none');
  });
});
