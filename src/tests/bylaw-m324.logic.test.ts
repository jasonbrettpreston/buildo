// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-324 (family: a garage or ancillary-structure setback is keyed to the yard target the clause names);
//            operator EVE.M324-G (2026-10-22-page-eve): the named yard decides the target
// Red first: before the adjudications the four units are pending (keyer A side/rear target vs keyer B lot_line_setback_m).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

describe('EVE.M324-G: the named yard decides the target of a garage or ancillary setback', () => {
  it('1120 (F), (G)(i), (G)(ii) and 929 (D) take side_setback_m / rear_setback_m', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
    const want: Record<string, string> = {
      '900.3.10(1120)#(1120)[SSP](F)': 'side_setback_m',
      '900.3.10(1120)#(1120)[SSP](G)(i)': 'rear_setback_m',
      '900.3.10(1120)#(1120)[SSP](G)(ii)': 'side_setback_m',
      '900.3.10(929)#(929)[SSP](D)': 'side_setback_m',
    };
    for (const [id, target] of Object.entries(want)) expect(U.get(id)?.target, id).toBe(target);
  }, 120000);
});
