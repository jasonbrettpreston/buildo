// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-132 (phrasing-variant licence patterns), M-75 (corrections);
//            operator EVE.R6-1, EVE.R6-2, EVE.R9-1 (2026-10-22-page-eve): one pattern-growth ruling for "one dwelling unit", "front lot line that abuts a street", "from a front line"
// Red first: before the patterns exist the three clause wordings license no target (G-CLAUSE variable_unlicensed) and the units stay UNUSUAL.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const lic = (target: string, t: string): boolean => (VOCAB.dsl_target[target].patterns as string[]).some((x) => t.toLowerCase().includes(x));

describe('EVE.R6-1 / R6-2 / R9-1: pattern growth', () => {
  it('the three wordings are licensed', () => {
    expect(lic('dwelling_units_max', 'There is a maximum of one dwelling unit on each lot;')).toBe(true);
    expect(lic('front_setback_m', '6.0 metres from any other front lot line that abuts a street; and')).toBe(true);
    expect(lic('front_setback_m', 'The minimum building setback from a front line is 3.0 metres;')).toBe(true);
  });
  it('they do not license neighbouring wordings', () => {
    expect(lic('front_setback_m', 'the front lot line that abuts a lane is the rear line')).toBe(false);
    expect(lic('front_setback_m', 'the average elevation of the ground along the front line')).toBe(false);
  });
  it('324 (C), 324 (D)(ii) and 331 (C) resolve to LIMITs', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
    const want: Record<string, [string, string, string, string[]]> = {
      '900.5.10(324)#(324)[SSP](C)': ['dwelling_units_max', 'max', 'dwelling_units_max = 1 units @(324)[SSP](C)', []],
      '900.5.10(324)#(324)[SSP](D)(ii)': ['front_setback_m', 'min', 'front_setback_m = 6.0 m @(324)[SSP](D)(ii)', []],
      '900.3.10(331)#(331)[SSP](C)': ['front_setback_m', 'min', 'front_setback_m = 3.0 m @(331)[SSP](C)', []],
    };
    for (const [id, [target, bound, expr]] of Object.entries(want)) {
      const u = U.get(id) as Json;
      expect([u.archetype, u.target, u.bound, u.numeric_expression], id).toEqual(['LIMIT', target, bound, [expr]]);
    }
  }, 120000);
});
