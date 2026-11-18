// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-211(1), M-169, M-481; docs/specs/01-pipeline/78_optimal_lot_configuration.md P5.1 (the relief)
// MB-27 increment 6 · lane INC6-BUILD · the 10.5.40.71(1) precondition: the 71(3) relief applies only to a lawfully existing building whose lawful setback is less
// than required. Lawful status is not stored; it is taken as holding (M-169) and disclosed. Written after the module (build step 7; the red evidence for this file
// is the missing-module state of the other five increment-6 files, docs/reports/red-evidence/bylaw/inc6-*-red.txt).
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
const e1 = (): Json => JSON.parse(JSON.stringify((FIX.examples as Json[]).find((e) => e.id === 'E1')));

const withStatus = (status: string | undefined): Json => {
  const input = e1().input;
  if (status !== undefined) input.owner.lawfully_existing_status = status;
  return RV.renovationResults(input, settings()) as Json;
};

describe('increment 6: the owner answer lawfully_existing_status governs the 71(3) relief (operator 2026-11-16 "3 y", "4 recommended"; M-192, M-176)', () => {
  it('unanswered: the relief applies and both lines are disclosed (taken as holding, M-192)', () => {
    const out = withStatus(undefined);
    expect(out.RA.relief_applied).toBe(true);
    expect(out.disclosures).toEqual(expect.arrayContaining(['relief_applied', 'relief_71_1_precondition_taken_as_holding']));
  });
  it('answered yes: the relief applies, no taken-as-holding line (the owner said so)', () => {
    const out = withStatus('yes');
    expect(out.RA.relief_applied).toBe(true);
    expect(out.disclosures).toContain('relief_applied');
    expect(out.disclosures).not.toContain('relief_71_1_precondition_taken_as_holding');
  });
  it('answered no: no relief, no relief line, the plate is min(footprint, F), and RA, RE and binds are unchanged (F-1)', () => {
    const hold = withStatus(undefined);
    const fail = withStatus('no');
    expect(fail.RA.relief_applied).toBe(false);
    expect(fail.disclosures).not.toContain('relief_applied');
    expect(fail.disclosures).not.toContain('relief_71_1_precondition_taken_as_holding');
    expect(fail.RA.up_plate).toBeCloseTo(e1().input.envelope.F_m2, 4);
    expect(fail.RA.addition_gfa).toBeCloseTo(hold.RA.addition_gfa, 4);
    expect(fail.RE.gain).toBeCloseTo(hold.RE.gain, 4);
    expect(fail.RA.binds).toBe(hold.RA.binds);
  });
  it('the setting compute_maxbld_scenarios_relief_frontage_max_m is the clause literal: seed 12.2 pinned (min = max) and the 10.5.40.71(3) condition text of the Layer 1 input carries the same number', () => {
    const v = readJson('scripts/seeds/logic_variables.json').compute_maxbld_scenarios_relief_frontage_max_m as Json;
    expect([v.default, v.min, v.max]).toEqual([12.2, 12.2, 12.2]);
    const doc = fs.readFileSync(path.join(ROOT, 'docs/reference/bylaw-layer2-input.json'), 'utf8');
    const at = doc.indexOf('"unit_id":"10.5.40.71(3)#whole"');
    expect(at).toBeGreaterThan(0);
    expect(doc.slice(at, at + 800)).toContain(`lot_frontage_m ≤ ${v.default} m`);
    expect(String(v.description)).toContain('10.5.40.71(3)');
    expect(String(v.description)).toContain('M-404');
  });
  it('the reading rows reading:reno_relief_71_1_precondition and reading:reno_relief_71_3_frontage_is_a_cited_setting exist: medium, with evidence', () => {
    const rows = readJson('scripts/seeds/bylaw/switchboard.json').rows as Json[];
    for (const id of ['reading:reno_relief_71_1_precondition', 'reading:reno_relief_71_3_frontage_is_a_cited_setting']) {
      const row = rows.find((r) => r.id === id) as Json;
      expect([id, row?.kind, row?.confidence]).toEqual([id, 'reading', 'medium']);
      expect(String(row?.evidence).length).toBeGreaterThan(0);
    }
  });
});
