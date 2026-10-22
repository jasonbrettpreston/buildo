// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-130, M-136; operator CHAT-81.FAM-ALL (FAM-ABUT-NAMED) and CHAT-83.NAMED-1 (2026-10-23-batch-d)
// CHAT-84.NAMED-1b (operator 2026-10-23) ruled this variant: the 12 table units are LIMIT, the other 32 UNUSUAL and disclosed; no longer held.
// (was) HELD on NAMED-1: the family is 44 older LIMIT units carrying abuts_named_street, not the ~8 of the card. FAM-ABUT-NAMED applied uniformly: UNUSUAL, disclosed.
// Red first: before the variant these units are LIMIT (partially modelled or not).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const NAMED = ["900.3.10(325)#(325)[SSP](C)","900.3.10(1156)#(1156)[SSP](C)(i)","900.3.10(936)#(936)[SSP](C)(i)","900.3.10(1091)#(1091)[SSP](C)(i)","900.3.10(1120)#(1120)[SSP](C)(i)","900.3.10(714)#(714)[SSP](C)(i)","900.3.10(714)#(714)[SSP](D)(i)","900.3.10(397)#(397)[SSP](B)","900.3.10(975)#(975)[SSP](A)(i)","900.3.10(975)#(975)[SSP](A)(ii)","900.3.10(812)#(812)[SSP](D)(i)","900.3.10(1168)#(1168)[SSP](C)(i)","900.3.10(516)#(516)[SSP](C)(i)","900.3.10(516)#(516)[SSP](C)(ii)","900.3.10(516)#(516)[SSP](C)(iii)","900.3.10(854)#(854)[SSP](C)(i)","900.3.10(854)#(854)[SSP](E)(i)","900.3.10(852)#(852)[SSP](C)(i)","900.3.10(852)#(852)[SSP](E)(i)","900.3.10(713)#(713)[SSP](C)(i)","900.4.10(255)#(255)[SSP](D)(i)","900.4.10(202)#(202)[SSP](D)(i)","900.4.10(202)#(202)[SSP](F)(i)","900.4.10(295)#(295)[SSP](D)(i)","900.4.10(284)#(284)[SSP](D)(i)","900.4.10(81)#(81)[SSP](H)(i)","900.5.10(264)#(264)[SSP](A)(i)","900.5.10(264)#(264)[SSP](A)(ii)","900.5.10(200)#(200)[SSP](A)(i)","900.5.10(200)#(200)[SSP](C)(i)","900.5.10(204)#(204)[SSP](C)(i)","900.5.10(204)#(204)[SSP](E)(i)"];
const TABLE_UNITS = ["900.3.10(309)#(309)[SSP](C)(i)","900.3.10(303)#(303)[SSP](D)","900.3.10(1057)#(1057)[SSP](C)(i)","900.3.10(323)#(323)[SSP](C)","900.3.10(316)#(316)[SSP](D)","900.3.10(316)#(316)[SSP](H)","900.3.10(560)#(560)[SSP](C)(i)","900.3.10(1032)#(1032)[SSP](C)(i)","900.3.10(1170)#(1170)[SSP](A)(i)","900.4.10(256)#(256)[SSP](D)(i)","900.4.10(256)#(256)[SSP](D)(ii)","900.4.10(70)#(70)[SSP](A)(i)"]; // the 12 units in vocab.named_street keep their LIMIT: the M-285 street-name join gives them correct values (verify-42 item 2)

describe('HELD on NAMED-1: named-road setback arms are one family', () => {
  it('every LIMIT unit that applies only on named roads and is not an M-285 table unit is UNUSUAL', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
    for (const id of NAMED) expect((U.get(id) as Json)?.archetype, id).toBe('UNUSUAL');
    const left = [...U].filter(([id, x]) => /^900\.[2-6]\.10\(/.test(id) && x.archetype === 'LIMIT' && JSON.stringify(x.condition || '').includes('abuts_named_street'));
    expect(left.map(([id]) => id).sort(), 'only the M-285 table units keep a LIMIT with abuts_named_street').toEqual([...TABLE_UNITS].sort());
  }, 120000);
});
