// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R6-1..R6-4 (recommendations applied under the lane label lane-exc-r5-held, not operator-ruled).
// Lane EXC-R5 round 6: W2 shards s01 s03 s30 s02 s05 s51 double-keyed (A Claude, B DeepSeek).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const REGS = ["900.2.10(82)","900.2.10(324)","900.2.10(769)","900.5.10(324)","900.5.10(4)","900.5.10(7)","900.3.10(1056)","900.3.10(248)","900.3.10(288)","900.3.10(196)","900.3.10(1066)","900.3.10(440)","900.5.10(102)","900.5.10(155)","900.5.10(259)","900.5.10(100)","900.2.10(731)","900.2.10(407)","900.2.10(766)","900.2.10(285)","900.2.10(850)"];

describe('EXC-R5 round 6: double-keyed exceptions', () => {
  it('every unit of the 21 exceptions is agreed or adjudicated (R6-1..R6-4 held)', async () => {
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
