// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R11-1 (recommendation on shards >= 85 percent agreement applied under lane-exc-r11-held, not operator-ruled).
// Lane EXC-R5 round 11: W2 shards s50 s52 s84 s16 s60 (s57 left out of the tree: its keyer-A application field is empty on 9 units). Shards s50, s52 and s16 agreed under 85 percent: their disagreements stay PENDING for the operator.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const OK = ["900.3.10(588)","900.3.10(241)","900.3.10(1049)","900.3.10(113)","900.3.10(377)","900.3.10(112)","900.3.10(295)","900.3.10(431)","900.3.10(616)"];
const PENDING: Record<string, number> = {"900.3.10(1029)":3,"900.3.10(1121)":2,"900.3.10(937)":2,"900.3.10(1401)":2,"900.3.10(975)":2};

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
