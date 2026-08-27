// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/link-massing.js must read its building-classification
// heuristics from logicVars rather than hardcoding them:
//   - massing_shed_threshold_sqm    (E19): footprint below this → shed
//   - massing_garage_max_sqm        (E19): footprint at or below this → garage
//   - massing_nearest_max_distance_m (E19): nearest-building fallback distance cap
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/link-massing.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('link-massing.js — building-classification heuristic externalization (§6.4)', () => {
  it('seed has massing_shed_threshold_sqm (default 20, bounds sane)', () => {
    const entry = SEED.massing_shed_threshold_sqm;
    if (!entry) throw new Error('massing_shed_threshold_sqm missing from seed JSON');
    expect(entry.default).toBe(20);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThanOrEqual(20);
  });

  it('seed has massing_garage_max_sqm (default 60, bounds sane)', () => {
    const entry = SEED.massing_garage_max_sqm;
    if (!entry) throw new Error('massing_garage_max_sqm missing from seed JSON');
    expect(entry.default).toBe(60);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThanOrEqual(60);
  });

  it('seed has massing_nearest_max_distance_m (default 50, bounds sane)', () => {
    const entry = SEED.massing_nearest_max_distance_m;
    if (!entry) throw new Error('massing_nearest_max_distance_m missing from seed JSON');
    expect(entry.default).toBe(50);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThanOrEqual(50);
  });

  // ── RE-HOMED at the Spec 122 §5.1 conversion (pilot 3, commit 7) ───────────
  //
  // The two locks below asserted `logicVars.<name>` and `LOGIC_VARS_SCHEMA` /
  // `loadMarketplaceConfigs` / `validateLogicVars` in scripts/link-massing.js. All four
  // strings LEFT that file: the frozen shape carries no config code at all, and the
  // resolution moved to scripts/lib/step/config.js, which projects the DECLARED names,
  // bounds-checks them and freezes the result before the compute runs.
  //
  // ⚠️ RE-HOMED, NOT DELETED, AND THE NEW FORM IS STRICTLY STRONGER. The old assertion
  // was "the string `logicVars.massing_shed_threshold_sqm` appears somewhere in the
  // step" — which a comment would have satisfied. The new one walks the actual
  // externalization surface end to end: the variable is DECLARED in the descriptor with
  // its bounds, and it is READ by the compute through the one seam a compute may reach a
  // tunable through. A hardcoded threshold now fails both halves rather than neither.
  const DESCRIPTOR = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../scripts/link-massing.descriptor.json'), 'utf-8'),
  ) as { config: { logic_variables: Array<{ name: string; min: number; max: number }>; hoisted_above_gate: boolean } };
  const COMPUTE = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/lib/compute/link-massing.js'),
    'utf-8',
  );
  const HEURISTICS = ['massing_shed_threshold_sqm', 'massing_garage_max_sqm', 'massing_nearest_max_distance_m'];

  it('the three heuristics are DECLARED in the descriptor with their bounds (was: logicVars.<name> in the step source)', () => {
    const declared = Object.fromEntries(DESCRIPTOR.config.logic_variables.map((v) => [v.name, v]));
    for (const name of HEURISTICS) {
      expect(declared[name], `${name} is not declared in config.logic_variables[]`).toBeDefined();
      expect(declared[name]!.min, `${name} declares no lower bound`).toBe(SEED[name]!.min);
      expect(declared[name]!.max, `${name} declares no upper bound`).toBe(SEED[name]!.max);
    }
  });

  it('the compute READS all three through ctx.config, and hardcodes none of them', () => {
    for (const name of HEURISTICS) {
      expect(COMPUTE, `${name} is not read from config by the compute`).toMatch(new RegExp(`config\\.${name}`));
    }
    expect(COMPUTE).not.toMatch(/SHED_THRESHOLD_SQM\s*=/);
    expect(COMPUTE).not.toMatch(/GARAGE_MAX_SQM\s*=/);
    expect(COMPUTE).not.toMatch(/NEAREST_MAX_DISTANCE_M\s*=/);
    // The retired literals, by value: 20 / 60 / 50 as bare classification bounds.
    expect(COMPUTE).not.toMatch(/shedThreshold\s*=\s*20|garageMax\s*=\s*60/);
  });

  it('config validation is HOISTED ABOVE THE GATE (was: validateLogicVars inside the lock)', () => {
    // §1.3 / A-5 / B-13 — the OPPOSITE of the pre-conversion order, declared as a diff.
    // The step is SKIP-eligible (6 live lock-contention rows), and an invalid threshold
    // must never hide behind a green SKIPPED summary, so the refusal happens above the
    // advisory lock whether or not this process wins it.
    expect(DESCRIPTOR.config.hoisted_above_gate).toBe(true);
    expect(SRC, 'the frozen step file carries no config code at all').not.toMatch(/LOGIC_VARS_SCHEMA|validateLogicVars|loadMarketplaceConfigs/);
  });
});
