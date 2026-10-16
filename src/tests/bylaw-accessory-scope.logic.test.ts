// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6 (evaluator applicability);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-175 (accessory-structure use scope, operator 2026-10-15)
//
// Operator envelope review 2026-10-15: 10.5.60.20(8)(A) — the rear yard setback for an outdoor SWIMMING POOL (25.0 m on a
// through lot backing onto a frontage) — decided the MAIN building's rear setback on 14 of the 24 review example lots,
// because applies() never read `application.uses`. 66 units scoped to an accessory-structure use (vocab
// accessory_structure_use: pool, garage, deck/platform, energy device, portable classroom) are keyed to main-building
// envelope targets. A unit scoped to an accessory structure limits THAT structure, never the principal building.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped .mjs module surface
const E: Json = await import(pathToFileURL(path.join(process.cwd(), 'scripts/analysis/bylaw/evaluate.mjs')).href);
const VO: Json = await import(pathToFileURL(path.join(process.cwd(), 'scripts/analysis/bylaw/vocab.mjs')).href);
const VOCAB: Json = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
// The PRODUCTION path: validate.mjs / the review builder make the context from evaluatorVocab(vocab), not the raw
// vocab — a first fix that read only the raw vocab passed here and changed nothing in production (2026-10-15).
const C = E.makeContext(VO.evaluatorVocab(VOCAB));

const lot = { zone: 'RM', label: {}, overlays: {}, vars: { lot_frontage_m: 12.19, lot_depth_m: 36.58, lot_area_m2: 445.91 }, flags: {}, building_type: 'detached_house' };
const unit = (uses: unknown[]): Json => ({
  unit_id: '10.5.60.20(8)#(8)(A)', regulation_id: '10.5.60.20(8)', layer: 'base', archetype: 'LIMIT', bound: 'min', target: 'rear_setback_m',
  condition: 'none', applies_to: { part: 'whole' }, displaces: [],
  application: { zones: ['R', 'RD', 'RS', 'RT', 'RM'], building_types: ['any'], uses },
  numeric_expression: ['rear_setback_m = 25.0 m @(8)(A)(i)'],
});

describe('M-175 — a unit scoped to an accessory-structure use never limits the principal building', () => {
  it('the vocab names the accessory-structure uses the rule keys on', () => {
    expect(Object.keys(VOCAB.accessory_structure_use)).toEqual(expect.arrayContaining(['swimming_pool', 'private_garage', 'deck_or_platform']));
  });

  it('RED→GREEN: a swimming-pool rear setback does not apply to the main building', () => {
    const r = E.applies(lot, unit(['swimming_pool']), C);
    expect(r.ok).toBe(false);
    expect(String(r.why)).toMatch(/swimming_pool/);
  });

  it('a use given as a {token} object is read the same way', () => {
    expect(E.applies(lot, unit([{ token: 'private_garage' }]), C).ok).toBe(false);
  });

  it('a unit with no use, or a non-accessory use, still applies', () => {
    expect(E.applies(lot, unit([]), C).ok).toBe(true);
    expect(E.applies(lot, unit(['dwelling_unit']), C).ok).toBe(true);
  });
});
