// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.1 (frozen shape)
//
// Regression lock: link_wsib must read its Tier 3 fuzzy-match similarity threshold from
// a registered logic variable rather than hardcoding it:
//   - wsib_fuzzy_match_threshold (E20): pg_trgm threshold and inline similarity() comparison
//
// ── RE-HOMED at the Spec 122 §5.1 conversion (C1 pilot 4, commit 7, 2026-08-28) ──────
// The two locks below asserted `logicVars.wsib_fuzzy_match_threshold` / `LOGIC_VARS_SCHEMA`
// / `loadMarketplaceConfigs` / `validateLogicVars` in scripts/link-wsib.js. All four
// strings LEFT that file — the frozen shape carries no config code at all — and moved to
// scripts/lib/step/config.js (generic) + the descriptor's declared config.logic_variables[]
// + scripts/lib/compute/link-wsib.js's `config.wsib_fuzzy_match_threshold` reads. Same
// "re-homed, not deleted, strictly stronger" treatment as link-massing.infra.test.ts.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const COMPUTE = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/compute/link-wsib.js'),
  'utf-8',
);
const STEP_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/link-wsib.js'),
  'utf-8',
);
const DESCRIPTOR = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/link-wsib.descriptor.json'), 'utf-8'),
) as { config: { logic_variables: Array<{ name: string; min: number; max: number; on_invalid: string }>; hoisted_above_gate: boolean } };
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8')
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('link_wsib — fuzzy match threshold externalization (§6.4)', () => {
  it('seed has wsib_fuzzy_match_threshold (default 0.6, bounds sane)', () => {
    const entry = SEED.wsib_fuzzy_match_threshold;
    if (!entry) throw new Error('wsib_fuzzy_match_threshold missing from seed JSON');
    expect(entry.default).toBe(0.6);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('the threshold is DECLARED in the descriptor with bounds, and the compute reads it via ctx.config (was: logicVars.<name> source-text check on the step file)', () => {
    const declared = DESCRIPTOR.config.logic_variables.find((v) => v.name === 'wsib_fuzzy_match_threshold');
    expect(declared, 'wsib_fuzzy_match_threshold not declared in config.logic_variables[]').toBeDefined();
    expect(declared?.on_invalid).toBe('fail');
    expect(COMPUTE).toMatch(/config\.wsib_fuzzy_match_threshold/);
    expect(COMPUTE).not.toMatch(/similarity_threshold\s*=\s*0\.6/);
    expect(COMPUTE).not.toMatch(/similarity\([^)]*\)\s*>\s*0\.6\b/);
  });

  it('config validation moved to the library — the frozen step file carries no config code at all (was: LOGIC_VARS_SCHEMA/loadMarketplaceConfigs/validateLogicVars source-text check)', () => {
    expect(STEP_SRC).not.toMatch(/LOGIC_VARS_SCHEMA|validateLogicVars|loadMarketplaceConfigs/);
    expect(DESCRIPTOR.config.hoisted_above_gate).toBe(true);
  });
});
