// SPEC LINK: docs/specs/01-pipeline/131_compute_maxbld_scenarios.md (Layer 3 switchboard), Spec 122 section 1.2 (closed values, omission fails closed), Spec 124 section 2
//
// MB-27 increment 3 · CARD SWITCH-STATE-DEFAULT-ON (operator 2026-11-09, option (a)) · RED FIRST. The Layer 3 engine reads a switch state with
// `row.state === 'on' || 'off' ? row.state : 'on'` (rows.js), so a state such as "ON", "pending" or a typo would compute as ON silently. The closed
// set {on, off} is checked once, at load, by validateCatalogue; the engine never sees another value.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const CAT = req(path.join(ROOT, 'scripts/lib/compute/maxbld/catalogue.js'));
const seeds = (): Json => ({
  catalogue: readJson('scripts/seeds/bylaw/layer3-catalogue.json'),
  switchboard: readJson('scripts/seeds/bylaw/switchboard.json'),
  buildingTypes: readJson('scripts/seeds/bylaw/building-types.json'),
  vocab: readJson('scripts/seeds/bylaw/vocab.json'),
});

describe('switchboard state is the closed set {on, off} (validated at load)', () => {
  it('the seeded switchboard has no state outside {on, off}', () => {
    const bad = (seeds().switchboard.rows as Json[]).filter((r) => r.state !== 'on' && r.state !== 'off');
    expect(bad.map((r) => r.id)).toEqual([]);
    expect(CAT.validateCatalogue(seeds(), ['1', '2', '3']).filter((v: string) => /state/.test(v))).toEqual([]);
  });
  it.each(['ON', 'pending', 'onn', '', null, undefined, true])('a state of %j is a load-time finding naming the row', (state) => {
    const s = seeds();
    const row = (s.switchboard.rows as Json[])[0] as Json;
    row.state = state;
    const v = CAT.validateCatalogue(s, ['1', '2', '3']).join('\n');
    expect(v).toMatch(new RegExp(`switch ${row.id}: state .* is not one of on, off`));
  });
  it('a row with no state key is a finding too', () => {
    const s = seeds();
    const row = (s.switchboard.rows as Json[])[1] as Json;
    delete row.state;
    expect(CAT.validateCatalogue(s, ['1', '2', '3']).join('\n')).toMatch(new RegExp(`switch ${row.id}: state .* is not one of on, off`));
  });
});
