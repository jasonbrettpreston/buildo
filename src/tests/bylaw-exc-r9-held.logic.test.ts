// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R9-x and R9-5 (citation-only fields adjudicated B for rule 29; recommendations on shards >= 85 percent agreement applied under the lane label lane-exc-r5-held, not operator-ruled).
// Updated after CHAT-81.FAM-ALL: the family readings settle the pending units named in docs/reports/bylaw/2026-10-23-families-pending.json.
// Lane EXC-R5 round 9: W2 shards s33 s35 s86 s40 s97 s71. Shards s33, s86, s40 agreed under 85 percent: their disagreements stay PENDING for the operator.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const OK = ["900.2.10(403)","900.2.10(516)","900.2.10(772)","900.2.10(784)","900.3.10(415)","900.3.10(1345)","900.3.10(272)","900.3.10(331)","900.3.10(1216)","900.3.10(304)","900.3.10(424)","900.3.10(584)","900.3.10(1404)","900.3.10(171)","900.3.10(195)","900.3.10(203)","900.3.10(448)","900.5.10(127)","900.5.10(40)","900.2.10(621)","900.3.10(1120)","900.5.10(278)"];
const PENDING: Record<string, number> = {"900.3.10(929)":1};

describe('EXC-R5 round 9: double-keyed exceptions', () => {
  it('the resolved exceptions are agreed or adjudicated; the split shards keep exactly their pending units', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
    const st = (reg: string): string[] => [...ag.units].filter(([id]) => AU.splitUnitId(id).reg.replace(/~.*$/, '') === reg).map(([, r]) => r.state as string);
    for (const reg of OK) {
      const s = st(reg);
      expect(s.length, reg).toBeGreaterThan(0);
      expect(s.every((x) => x === 'agreed' || x === 'adjudicated'), reg).toBe(true);
    }
    for (const [reg, n] of Object.entries(PENDING)) expect(st(reg).filter((x) => x === 'pending').length, reg).toBe(n);
  }, 120000);
});
