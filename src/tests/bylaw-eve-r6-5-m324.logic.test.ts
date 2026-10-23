// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-317 dated note 2 (CHAT-67.1434A twin form), M-324 (named yard decides the target);
//            operator EVE.R6-5 and EVE.M324-G (2026-10-22-page-eve)
// Red first: 1427 (A) and 937 (F) sit in a shard under 85 percent agreement and are pending until the ruled readings are applied.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

describe('ruled readings bind in a low-agreement shard', () => {
  it('1427 (A) is keyed like 1436 (D); 937 (F) takes side_setback_m', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
    const twin = U.get('900.3.10(1436)#(1436)[SSP](D)') as Json;
    const u = U.get('900.3.10(1427)#(1427)[SSP](A)') as Json;
    expect(u, '1427 (A)').toBeDefined();
    for (const f of ['archetype', 'requirement', 'calculation_handling', 'disclosure', 'condition']) expect(u[f], f).toEqual(twin[f]);
    expect(U.get('900.3.10(937)#(937)[SSP](F)')?.target).toBe('side_setback_m');
  }, 120000);
});
