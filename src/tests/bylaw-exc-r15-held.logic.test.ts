// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R15-1..R15-3 (recommendations on shards >= 85 percent agreement applied under lane-exc-r15-held; s90 agreed under 85 percent, only its ruled readings (M324-G, FAM-ABUT-NAMED) are applied).
// Lane EXC-R5 round 15: W2 shards s43 s88 s90 s96 s94 s54.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const OK = ["900.3.10(1209)","900.3.10(599)","900.3.10(1403)","900.3.10(200)","900.3.10(808)","900.3.10(1169)","900.3.10(305)","900.3.10(478)","900.4.10(145)","900.4.10(149)","900.4.10(163)","900.4.10(191)","900.4.10(230)","900.5.10(142)","900.5.10(154)","900.5.10(46)"];
const PENDING: Record<string, number> = {};

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
