// 🔗 SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §3 item 11 (+ Spec 49 §2 boundary, Spec 122 §5.1 shape)
//
// batch2 P1.1 — assert_parcel_sanity conversion, compressed form (R-PACE-1). The whole
// red suite for this compressed conversion: every claim that only becomes true once the
// compute + frozen shell land is wrapped in `it.fails()` at commit 1 — flips to plain
// `it()` at commit 3 (cutover), never edited in between except the internal re-pointing
// commit 2b performs (mechanical precedent: I1-I5 / pilot 9).
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHELL_PATH = path.join(ROOT, 'scripts/quality/assert-parcel-sanity.js');
const DESCRIPTOR_PATH = path.join(ROOT, 'scripts/quality/assert-parcel-sanity.descriptor.json');
const COMPUTE_PATH = path.join(ROOT, 'scripts/lib/compute/assert-parcel-sanity.js');
const shellSrc = () => fs.readFileSync(SHELL_PATH, 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const stepSchema = require('../../../../scripts/steps/_schema/step.schema.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateDescriptor } = require('../../../../scripts/lib/step/validate');

describe('1. descriptor shape + Rule 3 (both facts true today at commit 1)', () => {
  const descriptor = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));

  it('descriptor validates against step.schema.json', () => {
    expect(() => validateDescriptor(descriptor)).not.toThrow();
  });

  it('identity.lock === 107 (the LOCK_ID_REGISTRY assert-family slot)', () => {
    expect(descriptor.identity.lock).toBe(107);
    expect(descriptor.identity.archetype).toBe('ASSERT');
  });

  it('exactly 42 checks[], 8 plausibility[], invariants "none" (Ask A1)', () => {
    expect(descriptor.checks).toHaveLength(42);
    expect(descriptor.plausibility).toHaveLength(8);
    expect(descriptor.invariants).toBe('none');
  });

  it('the 12 gate ids carry severity FAIL, the rest WARN or INFO (statusFor parity)', () => {
    const gateIds = new Set([
      'max_build_dim_below_floor', 'maxbuild_stories_basis_existing_retired',
      'bylaw_height_per_storey_impossible', 'max_build_dim_exceeds_lot_dim',
      'ravine_constrained_carries_priced_cost', 'opt_aor_gfa_gt_opt_coa_gfa',
      'new_build_cost_gt_coa_build_cost', 'footprint_gt_lot_x105', 'existing_floor_gt_lot_x105',
      'heritage_basis_footprint_gt_lot', 'cost_fb_on_footprint_gt_lot', 'opt_aor_gfa_gt_max_buildable_gfa',
    ]);
    expect(gateIds.size).toBe(12);
    for (const c of descriptor.checks) {
      if (gateIds.has(c.id)) expect(c.severity, c.id).toBe('FAIL');
      else expect(c.severity, c.id).not.toBe('FAIL');
    }
  });

  it('every checks[] row is blocking:false, when:"post" (never halts the chain — Spec 30 §5.4.1)', () => {
    for (const c of descriptor.checks) {
      expect(c.blocking, c.id).toBe(false);
      expect(c.when, c.id).toBe('post');
    }
  });

  it('37 logic_variables declared (35 new parcel_sanity_* + 2 reused), all on_invalid:"fail"', () => {
    expect(descriptor.config.logic_variables).toHaveLength(37);
    const names = descriptor.config.logic_variables.map((v: { name: string }) => v.name);
    expect(names).toContain('max_build_min_dimension_m');
    expect(names).toContain('mislink_footprint_lot_tol');
    expect(names.filter((n: string) => n.startsWith('parcel_sanity_'))).toHaveLength(35);
    for (const v of descriptor.config.logic_variables) expect(v.on_invalid, v.name).toBe('fail');
  });

  it('Rule 3 both directions: every declared logic_variables[].name has a seed row', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const seed = require('../../../../scripts/seeds/logic_variables.json');
    for (const v of descriptor.config.logic_variables) {
      expect(seed[v.name], `${v.name} missing from scripts/seeds/logic_variables.json`).toBeTruthy();
    }
  });

  it('no plausibility[] row declares severity FAIL (F4 — distribution rows never verdict-driving)', () => {
    for (const p of descriptor.plausibility) expect(p.severity, p.id).toBe('INFO');
  });

  it('checks[] kind is "bound" for every entry (step.schema.json allows it)', () => {
    expect(stepSchema.definitions.check.properties.kind.enum).toContain('bound');
    for (const c of descriptor.checks) expect(c.kind).toBe('bound');
  });
});

describe('2. fields sidecar — 42 CHECK_DEFS / 35 LOGIC_VAR_DEFS / 8 DIST_DEFS (facts true today)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fields = require('../../../../scripts/lib/assert-parcel-sanity-fields.js');

  it('CHECK_DEFS has exactly 42 unique ids, 12 gates', () => {
    expect(fields.CHECK_DEFS).toHaveLength(42);
    const ids = fields.CHECK_DEFS.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(42);
    expect(fields.CHECK_DEFS.filter((c: { gate: boolean }) => c.gate)).toHaveLength(12);
  });

  it('LOGIC_VAR_DEFS has exactly 35 entries, all prefixed parcel_sanity_', () => {
    expect(fields.LOGIC_VAR_DEFS).toHaveLength(35);
    for (const v of fields.LOGIC_VAR_DEFS) expect(v.name.startsWith('parcel_sanity_'), v.name).toBe(true);
  });

  it('every applies()/bad() function is callable given a full config object', () => {
    const cfg: Record<string, number> = Object.fromEntries(fields.LOGIC_VAR_DEFS.map((v: { name: string; default: number }) => [v.name, v.default]));
    cfg.max_build_min_dimension_m = 3;
    cfg.mislink_footprint_lot_tol = 0.05;
    for (const def of fields.CHECK_DEFS) {
      expect(() => def.applies(cfg)).not.toThrow();
      expect(() => def.bad(cfg)).not.toThrow();
    }
  });

  it('the accept-lists are descriptor DATA (Ask A2(a)): 24 + 42 numeric ids', () => {
    expect(fields.COST_FB_GT15M_LEGIT).toHaveLength(24);
    expect(fields.COST_ADDITION_GT50M_LEGIT).toHaveLength(42);
  });

  it('DIST_DEFS has exactly 8 entries', () => {
    expect(fields.DIST_DEFS).toHaveLength(8);
  });
});

describe('3b. compute module (safe to require — pure library, no eager DB dial; lands with the descriptor per this compressed conversion\'s actual sequencing, ahead of the shell/CLI cutover in 3/4)', () => {
  it('scripts/lib/compute/assert-parcel-sanity.js exports compute + DISTRIBUTION_SCOPE {resScope, zoneExpr}', () => {
    expect(fs.existsSync(COMPUTE_PATH)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../../scripts/lib/compute/assert-parcel-sanity.js');
    expect(typeof mod.compute).toBe('function');
    expect(mod.DISTRIBUTION_SCOPE).toBeTruthy();
    expect(typeof mod.DISTRIBUTION_SCOPE.resScope).toBe('string');
    expect(typeof mod.DISTRIBUTION_SCOPE.zoneExpr).toBe('string');
  });
});

describe('3. G-shape + frozen shell (RED until commit 2b)', () => {
  it.fails('the shell top level is exactly the frozen 7-statement form (no pipeline.run())', () => { // flips at: commit 3
    const src = shellSrc();
    expect(src).toMatch(/require\(['"]\.\.\/lib\/pipeline['"]\)/);
    expect(src).toMatch(/require\(['"]\.\/assert-parcel-sanity\.descriptor\.json['"]\)/);
    expect(src).toMatch(/require\(['"]\.\.\/lib\/compute\/assert-parcel-sanity['"]\)/);
    expect(src).toMatch(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/);
    expect(src).not.toMatch(/pipeline\.run\(/);
  });

  it.fails('module.exports is a plain {descriptor, compute, run} object (claim #86 — pipeline.step()\'s run is a NAMED METHOD the caller invokes; the pre-conversion pipeline.run() shell exports whatever the legacy SDK call returns, which carries neither name; this suite never requires() the eagerly-executing legacy shell — it dials the DB at require time with no require.main guard, unlike pipeline.step()\'s scheduleAutoRun)', () => { // flips at: commit 3
    const descriptor = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
    // Static, source-text only — this suite never requires the eagerly-executing
    // legacy pipeline.run() shell directly (it dials the DB at require time with no
    // require.main guard, unlike pipeline.step()'s scheduleAutoRun).
    expect(shellSrc()).toMatch(/module\.exports\.descriptor\s*=\s*descriptor/);
    expect(shellSrc()).toMatch(/module\.exports\.compute\s*=\s*compute/);
    expect(descriptor.identity.name).toBe('assert_parcel_sanity');
  });
});

describe('4. verdict-parity regression lock (proven RED both directions)', () => {
  it('legacy statusFor + the new descriptor severity mapping agree on the 12-gate set (fact, both sides read the same fields file)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { statusFor } = require('../../../../scripts/lib/step/plausibility.js');
    // RED-1: a gate that goes non-zero must FAIL.
    expect(statusFor({ gate: true, sev: 'HIGH' }, 1)).toBe('FAIL');
    // Flip: a NON-gate at count 1 must NOT fail (WARN instead).
    expect(statusFor({ gate: false, sev: 'HIGH' }, 1)).toBe('WARN');
  });

  it('RED-2: pop=0 forces INFO even for a gated check (D-E 4 inert rule) — statusFor already does this', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { statusFor } = require('../../../../scripts/lib/step/plausibility.js');
    expect(statusFor({ gate: true, sev: 'HIGH' }, 0, 0)).toBe('INFO');
  });

  it.fails('verdict.js checkRow renders INFO for an explicit observation.inert, regardless of declared severity (closes the pop=0 gap for the CONVERTED runner)', () => { // flips at: commit 3
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkRow } = require('../../../../scripts/lib/step/verdict.js');
    const check = { id: 'x', limit: 'viol == 0', severity: 'FAIL', blocking: false };
    const row = checkRow(check, { violations: 0, inert: true }, 'fail_step', {});
    expect(row!.status).toBe('INFO');
  });
});

describe('5. unhappy paths (descriptor-declared facts true at commit 1; runtime proof at commit 2b)', () => {
  it('lock-held terminal is DECLARED: records_meta {skipped, reason}, no audit_table shape', () => {
    const descriptor = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
    const terminal = descriptor.terminals.find((t: { id: string }) => t.id === 'lock_held_elsewhere');
    expect(terminal).toBeTruthy();
    expect(terminal.records_meta).toEqual({ skipped: 'bool', reason: 'string' });
  });

  it('an unseeded declared variable makes config.js THROW (LM-D15) — never silently default (shared library, unaffected by this conversion\'s commit boundary)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveConfig } = require('../../../../scripts/lib/step/config.js');
    const descriptor = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8'));
    const badDescriptor = {
      ...descriptor,
      config: { ...descriptor.config, logic_variables: [{ name: 'parcel_sanity_totally_unseeded_var_xyz', min: 0, max: 1, on_invalid: 'fail' }] },
    };
    const fakePool = { query: async () => ({ rows: [] }) };
    await expect(resolveConfig(fakePool, badDescriptor)).rejects.toThrow();
  });
});

describe('6. chain wiring (fact, unchanged by this conversion)', () => {
  it('chain.logic ordering + length are untouched: compute_parcel_cost_estimates < assert_global_coverage < assert_parcel_sanity < refresh_snapshot, length 28', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require('../../../../scripts/manifest.json');
    const chain: string[] = manifest.chains.sources;
    expect(chain).toHaveLength(28);
    const idx = (s: string) => chain.indexOf(s);
    expect(idx('compute_parcel_cost_estimates')).toBeLessThan(idx('assert_global_coverage'));
    expect(idx('assert_global_coverage')).toBeLessThan(idx('assert_parcel_sanity'));
    expect(idx('assert_parcel_sanity')).toBeLessThan(idx('refresh_snapshot'));
  });
});
