// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD (round 14): no recommendation applied; shards s38, s42 and s39 agreed under 85 percent and keep their disagreement units PENDING.
// Updated after CHAT-81.FAM-ALL: the family readings settle the pending units named in docs/reports/bylaw/2026-10-23-families-pending.json.
// Lane EXC-R5 round 14: W2 shards s79 s80 s39 s38 s42 s83, application block required in keyer A.
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const OK = ["900.3.10(541)","900.3.10(198)","900.3.10(551)","900.3.10(852)","900.4.10(276)","900.4.10(271)","900.4.10(67)","900.4.10(82)","900.5.10(125)","900.5.10(145)","900.5.10(163)","900.3.10(9)","900.3.10(971)","900.3.10(350)"];
const PENDING: Record<string, number> = {"900.4.10(200)":1};

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
