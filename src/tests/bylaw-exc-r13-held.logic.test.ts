// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R13-1..R13-5 (recommendations on shards >= 85 percent agreement applied under lane-exc-r12-held, not operator-ruled).
// Lane EXC-R5 round 13: W2 shards s98 s67 s73 s74 s36 s34, application block required in keyer A. Every shard agreed at 85 percent or more.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const OK = ["900.2.10(438)","900.2.10(846)","900.2.10(927)","900.2.10(928)","900.3.10(1424)","900.3.10(714)","900.3.10(1168)","900.3.10(357)","900.3.10(546)","900.3.10(338)","900.3.10(516)","900.3.10(814)","900.4.10(165)","900.4.10(317)","900.5.10(109)","900.5.10(126)","900.5.10(134)"];
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
