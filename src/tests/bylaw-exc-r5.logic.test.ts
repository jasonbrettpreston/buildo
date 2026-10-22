// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5-6 (double keying, G-AGREE);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-15 (wave membership by lots), M-105 (rules 27-31), M-317 (rule 31), M-75 (corrections)
//
// Lane EXC-R5 (2026-10-22): the next by-law exception round, W2 shards s25 s10 s26 s27 s31 s22 keyed by A (Claude) and B (DeepSeek).
// Red first: before the shards exist these exceptions are not authored (evaluator ruling (d): exception_not_authored).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

const AUTHORED = ['900.2.10(72)', '900.2.10(338)', '900.2.10(868)', '900.2.10(860)', '900.2.10(815)', '900.5.10(103)', '900.5.10(297)', '900.5.10(234)', '900.5.10(346)',
  '900.3.10(130)', '900.3.10(125)', '900.3.10(419)', '900.3.10(543)', '900.3.10(718)', '900.3.10(242)', '900.3.10(349)', '900.3.10(408)', '900.3.10(1091)', '900.3.10(559)',
  '900.6.10(70)', '900.6.10(33)'];
const PARTIAL = ['900.3.10(1429)', '900.6.10(478)']; // one pending disagreement each, waiting for the operator; shard s06 is held back (see the lane report)

describe('EXC-R5 round: double-keyed exceptions', () => {
  it('every unit of the 21 fully agreed exceptions is agreed or adjudicated; the two held units stay pending', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
    const st = (reg: string): string[] => [...ag.units].filter(([id]) => AU.splitUnitId(id).reg.replace(/~.*$/, '') === reg).map(([, r]) => r.state as string);
    for (const reg of AUTHORED) {
      const s = st(reg);
      expect(s.length, reg).toBeGreaterThan(0);
      expect(s.every((x) => x === 'agreed' || x === 'adjudicated'), reg).toBe(true);
    }
    for (const reg of PARTIAL) expect(st(reg).filter((x) => x === 'pending').length, reg).toBe(1);
  }, 120000);
  it('the six mechanical M-75 corrections are recorded under the lane label', () => {
    const adj = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/adjudications.json'), 'utf8')).adjudications as Json[];
    const mine = adj.filter((a) => a.adjudicator === 'lane-exc-r5');
    expect(mine.length).toBe(6);
    expect(mine.every((a) => a.kind === 'correction' && a.field === 'literals_not_expressed' && /M-82/.test(a.rule))).toBe(true);
  });
});
