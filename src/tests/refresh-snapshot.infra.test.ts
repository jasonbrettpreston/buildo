// SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §6.4
// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §1.10 (RECORDER), R-G
//
// Regression lock: the CoA snapshot confidence thresholds are externalized, never
// hardcoded literals in the query text:
//   - snapshot_coa_conf_high  (E17): >= this = high_confidence in CoA snapshot
//   - coa_match_conf_medium   (E17): < this = low_confidence in CoA snapshot
//
// RETARGETED pilot 8 commit 7 (2026-08-31, RECORDER conversion): the OLD script's
// own manual `LOGIC_VARS_SCHEMA`/`loadMarketplaceConfigs`/`validateLogicVars` call
// pattern is RETIRED — config resolution + `on_invalid:"fail"` bound-checking is
// now a GENERIC library mechanism (scripts/lib/step/config.js), driven entirely by
// the descriptor's own `config.logic_variables[]` declaration (R-G). This file's
// job narrows to: (a) the descriptor declares both vars at `on_invalid:"fail"`,
// (b) the compute's own coa query genuinely binds them as `$1`/`$2` params, never
// a literal threshold.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const DESCRIPTOR = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/refresh-snapshot.descriptor.json'), 'utf-8'),
) as { config: 'none' | { logic_variables: Array<{ name: string; on_invalid: string }> } };
const COMPUTE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/compute/refresh-snapshot.js'),
  'utf-8',
);
const SEED = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../scripts/seeds/logic_variables.json'), 'utf-8'),
) as Record<string, { default: number; type: string; min?: number; max?: number }>;

describe('refresh_snapshot — CoA confidence threshold externalization (§6.4, R-G)', () => {
  it('seed has snapshot_coa_conf_high (default 0.80, bounds sane)', () => {
    const entry = SEED.snapshot_coa_conf_high;
    if (!entry) throw new Error('snapshot_coa_conf_high missing from seed JSON');
    expect(entry.default).toBe(0.80);
    expect(entry.type).toBe('number');
    expect(entry.min).toBeGreaterThan(0);
    expect(entry.max).toBeLessThanOrEqual(1.0);
  });

  it('the descriptor declares both vars at R-G\'s mandatory on_invalid:"fail" (write-affecting, not verdict-affecting)', () => {
    expect(DESCRIPTOR.config, 'config must declare T1-T2').not.toBe('none');
    const cfg = DESCRIPTOR.config as Exclude<typeof DESCRIPTOR.config, 'none'>;
    for (const name of ['snapshot_coa_conf_high', 'coa_match_conf_medium']) {
      const v = cfg.logic_variables.find((x) => x.name === name);
      expect(v, `${name} not declared in config.logic_variables[]`).toBeDefined();
      expect(v!.on_invalid).toBe('fail');
    }
  });

  it('the compute module\'s coa query binds both thresholds as $1/$2 params — no hardcoded 0.80 or 0.50 literal', () => {
    expect(COMPUTE_SRC).toMatch(/linked_confidence >= \$1/);
    expect(COMPUTE_SRC).toMatch(/linked_confidence < \$2/);
    expect(COMPUTE_SRC).not.toMatch(/linked_confidence >= 0\.80\b/);
    expect(COMPUTE_SRC).not.toMatch(/linked_confidence < 0\.50\b/);
  });

  it('buildReads(config) genuinely reads the two config keys by name, not a positional/renamed lookup', () => {
    expect(COMPUTE_SRC).toMatch(/config\[T1_VAR\]/);
    expect(COMPUTE_SRC).toMatch(/config\[T2_VAR\]/);
    expect(COMPUTE_SRC).toMatch(/T1_VAR = 'snapshot_coa_conf_high'/);
    expect(COMPUTE_SRC).toMatch(/T2_VAR = 'coa_match_conf_medium'/);
  });
});
