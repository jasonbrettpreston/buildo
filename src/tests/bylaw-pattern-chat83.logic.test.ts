// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-132 (phrasing-variant licence patterns), M-75 (corrections); operator CHAT-83.W-2 (2026-10-23-batch-d): four wording variants
// Red first: before the wordings exist the five clause texts license no target and the units stay UNUSUAL / pending.
// Each wording also has a negative test: it must not license a neighbouring phrase.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);
const lic = (target: string, t: string): boolean => (VOCAB.dsl_target[target].patterns as string[]).some((x) => t.toLowerCase().includes(x));

describe('CHAT-83.W-2: four wording variants', () => {
  it('each ruled wording is licensed', () => {
    expect(lic('front_setback_m', 'the minimum front yard building setback is 7.5 metres.')).toBe(true);
    expect(lic('side_setback_street_m', 'if the side lot line abuts a street, the minimum is 2.4 metres')).toBe(true);
    expect(lic('side_setback_street_m', 'the minimum building setback from a side lot line that abuts a road is 3 metres;')).toBe(true);
    expect(lic('separation_m', 'A garage must be a minimum of 6.0 metres from the main walls of the residential building; and')).toBe(true);
  });
  it('they do not license neighbouring phrases', () => {
    expect(lic('front_setback_m', 'the front yard building height is 9 metres')).toBe(false);
    expect(lic('side_setback_street_m', 'the side lot line abuts a lane')).toBe(false);
    expect(lic('side_setback_street_m', 'the rear lot line that abuts a road')).toBe(false);
    expect(lic('separation_m', 'the main walls of the building are clad in brick')).toBe(false);
  });
  it('929 (F), 200 (C)(ii), 317 (B)(i), 159 (B) and 1 (F) resolve to LIMITs', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
    const want: Record<string, [string, string]> = {
      '900.3.10(929)#(929)[SSP](F)': ['front_setback_m', 'min'],
      '900.4.10(200)#(200)[SSP](C)(ii)': ['side_setback_street_m', 'min'],
      '900.4.10(317)#(317)[SSP](B)(i)': ['side_setback_street_m', 'min'],
      '900.5.10(159)#(159)[SSP](B)': ['separation_m', 'min'],
      '900.4.10(1)#(1)[SSP](F)': ['side_setback_street_m', 'min'],
    };
    for (const [id, [target, bound]] of Object.entries(want)) {
      const u = U.get(id) as Json;
      expect([u?.archetype, u?.target, u?.bound], id).toEqual(['LIMIT', target, bound]);
    }
  }, 120000);
});
