// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
//
// Regression lock: scripts/link-parcels.js must read its spatial-match
// constants from logicVars rather than hardcoding them:
//   - spatial_match_max_distance_m (E18): max metres for Strategy 3 spatial match
//   - spatial_match_confidence     (E18): confidence score for spatial match
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/link-parcels.js'),
  'utf-8'
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('link-parcels.js — spatial match constant externalization (§6.4)', () => {
  it('seed has spatial_match_max_distance_m (default 100, bounds sane)', () => {
    const entry = SEED.spatial_match_max_distance_m;
    if (!entry) throw new Error('spatial_match_max_distance_m missing from seed JSON');
    expect(entry.default).toBe(100);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeGreaterThanOrEqual(100);
  });

  it('seed has spatial_match_confidence (default 0.65, bounds sane)', () => {
    const entry = SEED.spatial_match_confidence;
    if (!entry) throw new Error('spatial_match_confidence missing from seed JSON');
    expect(entry.default).toBe(0.65);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('reads constants from logicVars — no hardcoded SPATIAL_MAX_DISTANCE_M or SPATIAL_CONFIDENCE', () => {
    expect(SRC).toMatch(/logicVars\.spatial_match_max_distance_m/);
    expect(SRC).toMatch(/logicVars\.spatial_match_confidence/);
    expect(SRC).not.toMatch(/SPATIAL_MAX_DISTANCE_M\s*=/);
    expect(SRC).not.toMatch(/SPATIAL_CONFIDENCE\s*=/);
  });

  it('uses LOGIC_VARS_SCHEMA for validation', () => {
    expect(SRC).toMatch(/LOGIC_VARS_SCHEMA/);
    expect(SRC).toMatch(/loadMarketplaceConfigs/);
    expect(SRC).toMatch(/validateLogicVars/);
  });
});
