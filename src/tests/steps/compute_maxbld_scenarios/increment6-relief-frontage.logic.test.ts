// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-211(1), M-481; docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.1; 10.5.40.71(3), 800.50(445)
// MB-27 increment 6 · lane INC6-BUILD · the relief reads the STORED frontage_m: a null or missing frontage never applies it and shows no relief line (the 28-lot
// defect, Q-2); exactly 12.2 and 12.19 are ON, 12.21 OFF (stored as decimal); a through or corner lot reads the same stored measure (Q-1); the relief changes the
// intermediate plate rows but no RA, RE or binds number (F-1). Written after the module; see the red-evidence note in increment6-relief-precondition.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped CommonJS module surface
const ROOT = process.cwd();
const req = createRequire(path.join(ROOT, 'package.json'));
const readJson = (rel: string): Json => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const FIX = readJson('src/tests/fixtures/layer3/increment-6/examples.json');
const RV = req(path.join(ROOT, 'scripts/lib/compute/maxbld/renovation.js')) as Json;
const settings = (): Json => ({
  houseplex_circulation_share: FIX.settings.circulation,
  houseplex_unit_min_net_m2: FIX.settings.unit_min,
  compute_maxbld_scenarios_reno_basement_livable_share: FIX.settings.reno_basement_livable_share,
  compute_maxbld_scenarios_suite_interior_gfa_share: FIX.settings.suite_interior_gfa_share,
  compute_maxbld_scenarios_relief_frontage_max_m: (readJson('scripts/seeds/logic_variables.json').compute_maxbld_scenarios_relief_frontage_max_m as Json).default,
  suite_share_of_interior: 0.45,
  extension_window: { rd: [12.0, 18.0], rsrm: [12.0, 12.0] },
});
const withFrontage = (frontage: number | null | undefined, extra: Json = {}): Json => {
  const input = JSON.parse(JSON.stringify((FIX.examples as Json[]).find((e) => e.id === 'E1')?.input)) as Json;
  if (frontage === undefined) delete input.lot.frontage_m;
  else input.lot.frontage_m = frontage;
  Object.assign(input.lot, extra);
  return RV.renovationResults(input, settings()) as Json;
};

describe('increment 6: the relief frontage test', () => {
  it('null or missing frontage: no relief, no relief disclosure', () => {
    for (const f of [null, undefined]) {
      const out = withFrontage(f);
      expect([f, out.RA.relief_applied]).toEqual([f, false]);
      expect([f, out.disclosures.includes('relief_applied')]).toEqual([f, false]);
    }
  });
  it('12.2 and 12.19 are ON, 12.21 is OFF', () => {
    expect(withFrontage(12.2).RA.relief_applied).toBe(true);
    expect(withFrontage(12.19).RA.relief_applied).toBe(true);
    expect(withFrontage(12.21).RA.relief_applied).toBe(false);
  });
  it('a through or a corner lot reads the same stored frontage', () => {
    const plain = withFrontage(12.2);
    for (const extra of [{ corner: true }, { through: true }]) expect(withFrontage(12.2, extra).RA).toEqual(plain.RA);
  });
  it('the relief changes the plate rows but not the addition, RE or binds (F-1): E1 plate 80 against 69.36', () => {
    const on = withFrontage(5.88);
    const off = withFrontage(null);
    expect([on.RA.up_plate, off.RA.up_plate]).toEqual([80, 69.36]);
    expect(on.RA.addition_gfa).toBeCloseTo(off.RA.addition_gfa, 4);
    expect(on.RE.gain).toBeCloseTo(off.RE.gain, 4);
    expect(on.RA.binds).toBe(off.RA.binds);
  });
  it('the readings reno_relief_needs_known_frontage and lot_frontage_single_stored_measure exist with a confidence', () => {
    const rows = readJson('scripts/seeds/bylaw/switchboard.json').rows as Json[];
    for (const id of ['reading:reno_relief_needs_known_frontage', 'reading:lot_frontage_single_stored_measure', 'reading:reno_relief_71_3_setback_only']) {
      const row = rows.find((r) => r.id === id) as Json;
      expect([id, row?.kind, ['high', 'medium'].includes(row?.confidence)]).toEqual([id, 'reading', true]);
    }
  });
});
