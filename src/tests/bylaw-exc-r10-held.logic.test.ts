// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R10-1..R10-5 (recommendations applied under the lane label lane-exc-r5-held, not operator-ruled).
// Lane EXC-R5 round 10: W2 shards s70 s46 s41 s47 s48 s81 double-keyed (A Claude, B DeepSeek).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const REGS = ["900.4.10(144)","900.4.10(142)","900.4.10(222)","900.3.10(191)","900.3.10(328)","900.3.10(397)","900.3.10(858)","900.3.10(24)","900.3.10(1001)","900.3.10(47)","900.3.10(253)","900.3.10(230)","900.2.10(989)","900.2.10(988)","900.2.10(802)","900.2.10(313)","900.3.10(561)","900.3.10(393)","900.3.10(893)","900.3.10(44)"];

describe('EXC-R5 round 6: double-keyed exceptions', () => {
  it('every unit of the 20 exceptions is agreed or adjudicated (R10-1..R10-5 held)', async () => {
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
