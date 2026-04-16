// SPEC LINK: docs/specs/pipeline/47_pipeline_script_protocol.md §6.4
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

  it('reads heuristics from logicVars — no hardcoded SHED_THRESHOLD_SQM, GARAGE_MAX_SQM, or NEAREST_MAX_DISTANCE_M', () => {
    expect(SRC).toMatch(/logicVars\.massing_shed_threshold_sqm/);
    expect(SRC).toMatch(/logicVars\.massing_garage_max_sqm/);
    expect(SRC).toMatch(/logicVars\.massing_nearest_max_distance_m/);
    expect(SRC).not.toMatch(/SHED_THRESHOLD_SQM\s*=/);
    expect(SRC).not.toMatch(/GARAGE_MAX_SQM\s*=/);
    expect(SRC).not.toMatch(/NEAREST_MAX_DISTANCE_M\s*=/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
