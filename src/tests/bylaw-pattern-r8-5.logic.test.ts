// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-132 (phrasing-variant licence patterns), M-75 (corrections);
//            operator CHAT-76.R8-5 (2026-10-22-batch-z13#CHAT-76.R8-5): "minimum frontage" licenses required_lot_frontage_m; 900.3.10(120)(A) is the keyer-B reading
// Red first: before the pattern is added the phrase "minimum frontage" licenses no target (G-CLAUSE variable_unlicensed).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const ROOT = process.cwd();
const VOCAB = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const mod = (rel: string): Promise<Json> => import(pathToFileURL(path.join(ROOT, rel)).href);

describe('CHAT-76.R8-5: "minimum frontage" licenses required_lot_frontage_m', () => {
  const lic = (t: string): boolean => (VOCAB.dsl_target.required_lot_frontage_m.patterns as string[]).some((x) => t.toLowerCase().includes(x));
  it('the pattern is present and licenses the 120 (A) wording', () => {
    expect(VOCAB.dsl_target.required_lot_frontage_m.patterns).toContain('minimum frontage');
    expect(lic('The minimum frontage for a corner lot is 15.0 metres;')).toBe(true);
  });
  it('it does not license a maximum, a lot depth or a setback sentence', () => {
    expect(lic('The maximum frontage of a lot is 30 metres')).toBe(false);
    expect(lic('The minimum lot depth is 30 metres')).toBe(false);
    expect(lic('The minimum building setback from the front lot line is 6 metres')).toBe(false);
  });
  it('900.3.10(120)(A) resolves to LIMIT required_lot_frontage_m min 15.0 m under the corner_lot condition', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const ag = AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab });
    const u = AG.agreedUnits(ag).get('900.3.10(120)#(120)[SSP](A)');
    expect(u.archetype).toBe('LIMIT');
    expect(u.target).toBe('required_lot_frontage_m');
    expect(u.bound).toBe('min');
    expect(u.numeric_expression).toEqual(['required_lot_frontage_m = 15.0 m @(120)[SSP](A)']);
    expect(u.condition.tokens).toEqual(['corner_lot']);
  }, 120000);
});
