// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6; docs/specs/01-pipeline/69a_mcbylaw_register.md M-15, M-75
// HELD on R8-1..R8-9 (recommendations applied under the lane label lane-exc-r5-held, not operator-ruled).
// Lane EXC-R5 round 8: W2 shards s21 s20 s24 s23 s82 s29 double-keyed (A Claude, B DeepSeek).
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const REGS = ["900.2.10(951)","900.2.10(591)","900.2.10(910)","900.3.10(269)","900.3.10(45)","900.3.10(120)","900.4.10(270)","900.4.10(267)","900.4.10(293)","900.3.10(807)","900.3.10(193)","900.3.10(394)","900.3.10(251)","900.3.10(128)","900.3.10(315)","900.2.10(418)","900.2.10(761)","900.2.10(903)","900.2.10(485)","900.2.10(683)"];

describe('EXC-R5 round 6: double-keyed exceptions', () => {
  it('every unit of the 20 exceptions is agreed or adjudicated (R8-1..R8-9 held)', async () => {
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
