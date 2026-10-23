// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-132 (phrasing-variant licence patterns), M-75 (corrections);
//            operator CHAT-81.R10-ALL (four wordings) and CHAT-81.R11-1 ("entrance to a parking space") (2026-10-23-batch-b)
// Red first: before the wordings exist the seven clause texts license no target (G-CLAUSE variable_unlicensed) and their units stay UNUSUAL.
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

describe('CHAT-81.R10-ALL / R11-1: wordings', () => {
  it('each ruled wording is licensed', () => {
    expect(lic('side_setback_street_m', 'On a corner lot the minimum building setback is 3.0 metres where the side lot line abuts the street; and')).toBe(true);
    expect(lic('side_setback_street_m', 'The minimum side yard setback for a lot that abuts a street is 1.5 metres;')).toBe(true);
    expect(lic('side_setback_m', 'The minimum side yard is 1.2 metres;')).toBe(true);
    expect(lic('encroachment_m', 'Cantilevered bay windows may project a maximum distance of 0.6 metres into all yards; and')).toBe(true);
    expect(lic('garage_entrance_setback_m', 'The portion of main wall with the entrance to a parking space must be set back a minimum of 6.0 metres')).toBe(true);
  });
  it('they do not license neighbouring phrases', () => {
    expect(lic('side_setback_street_m', 'the side lot line abuts a lane')).toBe(false);
    expect(lic('side_setback_m', 'the maximum side yard is landscaped')).toBe(false);
    expect(lic('side_setback_m', 'the minimum rear yard is 7.5 metres')).toBe(false);
    expect(lic('encroachment_m', 'a bay window may not project into the yard')).toBe(false);
    expect(lic('garage_entrance_setback_m', 'the entrance to a parking structure below grade')).toBe(false);
    expect(lic('garage_entrance_setback_m', 'the entrance to a building')).toBe(false);
  });
  it('the seven units resolve to the keyer-B LIMITs', async () => {
    const V = await mod('scripts/analysis/bylaw/validate.mjs');
    const AU = await mod('scripts/analysis/bylaw/authored.mjs');
    const AG = await mod('scripts/analysis/bylaw/agree.mjs');
    const I = V.loadInputs({ root: ROOT });
    const U: Map<string, Json> = AG.agreedUnits(AG.checkAgree({ shards: AU.loadAuthored(ROOT), adjudications: I.adjudications, vocab: I.vocab }));
    const want: Record<string, [string, string, number]> = {
      '900.3.10(1001)#(1001)[SSP](C)': ['side_setback_m', 'min', 1.2],
      '900.3.10(1001)#(1001)[SSP](D)': ['side_setback_street_m', 'min', 1.5],
      '900.4.10(144)#(144)[SSP](J)': ['window_projection_encroachment_m', 'max', 0.6], // M-243 (verify-42 item 6)
      '900.4.10(144)#(144)[SSP](E)(i)': ['side_setback_street_m', 'min', 3.0],
      '900.3.10(1049)#(1049)[SSP](G)': ['garage_entrance_setback_m', 'min', 6.0],
      '900.3.10(357)#(357)[SSP](E)': ['garage_entrance_setback_m', 'min', 6.0],
      '900.5.10(331)#(331)[SSP](D)': ['garage_entrance_setback_m', 'min', 6.0],
    };
    for (const [id, [target, bound, v]] of Object.entries(want)) {
      const u = U.get(id) as Json;
      expect([u.archetype, u.target, u.bound], id).toEqual(['LIMIT', target, bound]);
      expect(u.numeric_expression.join(' '), id).toContain(String(v.toFixed(1)));
    }
  }, 120000);
});
