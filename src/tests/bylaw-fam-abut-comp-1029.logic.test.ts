// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-130 (a partly modelled LIMIT is a true necessary bound); operator CHAT-81.FAM-ALL, FAM-ABUT-COMP
// Rule as approved: a complement arm ("all other / any other street") is a LIMIT when it is the smallest of its sibling arms for the same target.
// 1029 (C): arms 7.5 (named roads), 6.0 (named roads), 3.6 (any other street): (iii) is the smallest, so it is a partially modelled LIMIT.
// (i) and (ii) name roads: UNUSUAL under FAM-ABUT-NAMED until CHAT-87.NAMED-1c; now LIMIT, as their word-for-word twins 264 (A)(i),(ii) (M-285 join).
// Red first: (iii) was filed with the named-road arms in the card and stayed UNUSUAL.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

describe('CHAT-81.FAM-ALL FAM-ABUT-COMP: 1029 (C)', () => {
  it('(iii) 3.6 m is a partially modelled LIMIT on street_setback_m; the named-road arms are computed (CHAT-87.NAMED-1c)', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
    const iii = U.get('900.3.10(1029)#(1029)[SSP](C)(iii)') as Json;
    expect([iii.archetype, iii.target, iii.bound, iii.numeric_expression]).toEqual(['LIMIT', 'street_setback_m', 'min', ['street_setback_m = 3.6 m @(1029)[SSP](C)(iii)']]);
    expect(iii.calculation_handling.status).toBe('partially_modelled');
    for (const p of ['(i)', '(ii)']) expect((U.get(`900.3.10(1029)#(1029)[SSP](C)${p}`) as Json).archetype, p).toBe('LIMIT');
  }, 120000);
});
