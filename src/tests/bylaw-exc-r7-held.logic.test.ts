// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R7-1, R7-2 (recommendations applied under the lane label lane-exc-r5-held, not operator-ruled).
// Lane EXC-R5 round 7: W2 shards s07 s08 s11 s12 s45 s18 double-keyed (A Claude, B DeepSeek).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const REGS = ["900.3.10(466)","900.3.10(368)","900.3.10(421)","900.3.10(586)","900.3.10(547)","900.3.10(809)","900.4.10(122)","900.4.10(176)","900.4.10(51)","900.3.10(355)","900.3.10(628)","900.3.10(157)","900.3.10(160)","900.3.10(550)","900.3.10(1060)","900.2.10(958)","900.2.10(957)","900.2.10(881)","900.2.10(805)"];

describe('EXC-R5 round 6: double-keyed exceptions', () => {
  it('every unit of the 19 exceptions is agreed or adjudicated (R7-1, R7-2 held)', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
    const st = (reg: string): string[] => [...ag.units].filter(([id]) => AU.splitUnitId(id).reg.replace(/~.*$/, '') === reg).map(([, r]) => r.state as string);
    for (const reg of REGS) {
      const s = st(reg);
      expect(s.length, reg).toBeGreaterThan(0);
      expect(s.every((x) => x === 'agreed' || x === 'adjudicated'), reg).toBe(true);
    }
  }, 120000);
});
