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
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

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

  it('exactly 45 checks[] (42 + S0.3\'s 3), 8 plausibility[], 1 invariants[] (S0.3\'s validate_only on-lot-share row)', () => {
    expect(descriptor.checks).toHaveLength(45);
    expect(descriptor.plausibility).toHaveLength(8);
    expect(descriptor.invariants).toHaveLength(1);
    expect(descriptor.invariants[0].id).toBe('existing_structure_onlot_share_low');
    expect(descriptor.invariants[0].frequency).toBe('validate_only');
  });

  it('the 13 gate ids carry severity FAIL, the rest WARN or INFO (statusFor parity)', () => {
    const gateIds = new Set([
      'max_build_dim_below_floor', 'maxbuild_stories_basis_existing_retired',
      'bylaw_height_per_storey_impossible', 'max_build_dim_exceeds_lot_dim',
      'ravine_constrained_carries_priced_cost', 'opt_aor_gfa_gt_opt_coa_gfa',
      'new_build_cost_gt_coa_build_cost', 'footprint_gt_lot_x105', 'existing_floor_gt_lot_x105',
      'heritage_basis_footprint_gt_lot', 'cost_fb_on_footprint_gt_lot', 'opt_aor_gfa_gt_max_buildable_gfa',
      'ravine_constrained_carries_priced_reno',
    ]);
    expect(gateIds.size).toBe(13);
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

  it('37 logic_variables declared (35 new parcel_sanity_* + 2 reused), all on_invalid:"fail" — peel O1 (2026-09-22) RETIRED parcel_sanity_onlot_share_rd_min/_attached_min (declared-but-never-consumed by INVARIANT_ONLOT_SHARE_SQL)', () => {
    expect(descriptor.config.logic_variables).toHaveLength(37);
    const names = descriptor.config.logic_variables.map((v: { name: string }) => v.name);
    expect(names).toContain('max_build_min_dimension_m');
    expect(names).toContain('mislink_footprint_lot_tol');
    expect(names).not.toContain('parcel_sanity_onlot_share_rd_min');
    expect(names).not.toContain('parcel_sanity_onlot_share_attached_min');
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

// ---------------------------------------------------------------------------
// 1b. Descriptor generator drift lock (O2, batch2 P1.1 output-panel fold,
// 2026-09-18) — same-batch precedent: assert_global_coverage's own commit 8c/8x
// drift lock (src/tests/steps/assert_global_coverage/violations.test.ts). Both
// directions locked WITHOUT touching the committed descriptor.json file: "clean"
// regenerates in memory against the REAL fields module and byte-compares
// against the committed file; "not vacuous" mutates an in-memory CHECK_DEFS
// fixture and asserts the comparison actually differs. The CLI --check-against
// tests corrupt a DISPOSABLE TEMP FILE COPY only — the real committed descriptor
// is never opened for writing anywhere in this suite.
// ---------------------------------------------------------------------------
describe('assert_parcel_sanity — descriptor generator drift lock (both directions)', () => {
  const GENERATOR_PATH = path.join(ROOT, 'scripts/generate-assert-parcel-sanity-descriptor.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS generator
  const { buildDescriptor } = require(GENERATOR_PATH) as {
    buildDescriptor: (checkDefs: unknown[], logicVarDefs: unknown[], distDefs: unknown[], distMeasured: unknown, invariantDefs?: unknown[]) => unknown;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CHECK_DEFS, LOGIC_VAR_DEFS, DIST_DEFS, INVARIANT_DEFS } = require('../../../../scripts/lib/assert-parcel-sanity-fields.js') as {
    CHECK_DEFS: Array<{ id: string } & Record<string, unknown>>;
    LOGIC_VAR_DEFS: unknown[];
    DIST_DEFS: unknown[];
    INVARIANT_DEFS: unknown[];
  };
  const DIST_MEASURED_PATH = path.join(ROOT, 'scripts/quality/generated/assert-parcel-sanity.dist-measured.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const distMeasured = require(DIST_MEASURED_PATH);

  it('regenerating in memory against the REAL fields module byte-matches the committed descriptor.json (clean — no drift)', () => {
    const regenerated = `${JSON.stringify(buildDescriptor(CHECK_DEFS, LOGIC_VAR_DEFS, DIST_DEFS, distMeasured, INVARIANT_DEFS), null, 2)}\n`;
    const committed = fs.readFileSync(DESCRIPTOR_PATH, 'utf8');
    expect(regenerated).toBe(committed);
  });

  it('the drift lock is not vacuous: a mutated in-memory CHECK_DEFS fixture produces a descriptor that differs from the committed file', () => {
    const mutated = CHECK_DEFS.map((d, i) => (i === 0 ? { ...d, id: `${d.id}_mutated_for_drift_lock_test` } : d));
    const regenerated = `${JSON.stringify(buildDescriptor(mutated, LOGIC_VAR_DEFS, DIST_DEFS, distMeasured, INVARIANT_DEFS), null, 2)}\n`;
    const committed = fs.readFileSync(DESCRIPTOR_PATH, 'utf8');
    expect(regenerated).not.toBe(committed);
  });

  it('the CLI --check mode itself reports clean against the current committed descriptor (exit 0)', () => {
    expect(() => execFileSync('node', [GENERATOR_PATH, '--check'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })).not.toThrow();
  });

  it('the CLI --check mode is itself not vacuous: fires (exit non-zero) against a deliberately corrupted TEMP COPY, never the real committed file', () => {
    const original = fs.readFileSync(DESCRIPTOR_PATH, 'utf8');
    const tmpPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aps-drift-lock-')), 'assert-parcel-sanity.descriptor.json');
    try {
      fs.writeFileSync(tmpPath, `${original}\n// drift-lock self-test corruption\n`);
      let threw = false;
      try {
        execFileSync('node', [GENERATOR_PATH, '--check', `--check-against=${tmpPath}`], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      } catch {
        threw = true;
      }
      expect(threw, '--check --check-against=<corrupted temp copy> must exit non-zero').toBe(true);
      // Control: the SAME flag against the untouched real file must still report
      // clean — proves --check-against reads the override path, not silently
      // falling back to comparing the real file against itself either way.
      expect(() => execFileSync('node', [GENERATOR_PATH, '--check', `--check-against=${DESCRIPTOR_PATH}`], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })).not.toThrow();
    } finally {
      fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true });
    }
    // The real committed file was never opened for writing above — confirm it
    // still reads byte-identical to what this test started with.
    expect(fs.readFileSync(DESCRIPTOR_PATH, 'utf8')).toBe(original);
  });
});

describe('2. fields sidecar — 42 CHECK_DEFS / 35 LOGIC_VAR_DEFS / 8 DIST_DEFS (facts true today)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fields = require('../../../../scripts/lib/assert-parcel-sanity-fields.js');

  it('CHECK_DEFS has exactly 45 unique ids (42 + S0.3\'s 3), 13 gates (+1, ravine_constrained_carries_priced_reno)', () => {
    expect(fields.CHECK_DEFS).toHaveLength(45);
    const ids = fields.CHECK_DEFS.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(45);
    expect(fields.CHECK_DEFS.filter((c: { gate: boolean }) => c.gate)).toHaveLength(13);
  });

  it('S0.3 (WF3 existing-structure-area-artifacts, 2026-09-21) — the 3 new checks are declared with retighten_when (WARN, never FAIL) except the ravine-reno gate', () => {
    const shared = fields.CHECK_DEFS.find((c: { id: string }) => c.id === 'existing_structure_shared_with_other_parcel');
    const borrowed = fields.CHECK_DEFS.find((c: { id: string }) => c.id === 'existing_structure_borrowed_primary');
    const ravineReno = fields.CHECK_DEFS.find((c: { id: string }) => c.id === 'ravine_constrained_carries_priced_reno');
    expect(shared, 'existing_structure_shared_with_other_parcel must be declared').toBeTruthy();
    expect(shared.gate).toBe(false);
    expect(typeof shared.retightenWhen).toBe('string');
    expect(borrowed, 'existing_structure_borrowed_primary must be declared').toBeTruthy();
    expect(borrowed.gate).toBe(false);
    expect(typeof borrowed.retightenWhen).toBe('string');
    expect(ravineReno, 'ravine_constrained_carries_priced_reno must be declared').toBeTruthy();
    expect(ravineReno.gate).toBe(true);
    expect(ravineReno.sev).toBe('HIGH');
    // FOLD-RC3 — a SEPARATE id from its sibling, never a widening of it.
    const sibling = fields.CHECK_DEFS.find((c: { id: string }) => c.id === 'ravine_constrained_carries_priced_cost');
    expect(sibling).toBeTruthy();
    expect(sibling.id).not.toBe(ravineReno.id);
  });

  it('LOGIC_VAR_DEFS has exactly 35 entries, all prefixed parcel_sanity_ — peel O1 (2026-09-22) RETIRED the S0.3 onlot-share zone floors (0.90/0.50 now baked as documented, non-tunable literals in INVARIANT_ONLOT_SHARE_SQL, never a declared-but-dead logic variable)', () => {
    expect(fields.LOGIC_VAR_DEFS).toHaveLength(35);
    for (const v of fields.LOGIC_VAR_DEFS) expect(v.name.startsWith('parcel_sanity_'), v.name).toBe(true);
    expect(fields.LOGIC_VAR_DEFS.find((v: { name: string }) => v.name === 'parcel_sanity_onlot_share_rd_min')).toBeUndefined();
    expect(fields.LOGIC_VAR_DEFS.find((v: { name: string }) => v.name === 'parcel_sanity_onlot_share_attached_min')).toBeUndefined();
  });

  it('INVARIANT_DEFS has exactly 1 entry (existing_structure_onlot_share_low), frequency:"validate_only", real (non-invented) last_measured', () => {
    expect(fields.INVARIANT_DEFS).toHaveLength(1);
    const inv = fields.INVARIANT_DEFS[0];
    expect(inv.id).toBe('existing_structure_onlot_share_low');
    expect(inv.frequency).toBe('validate_only');
    expect(inv.severity).toBe('WARN');
    expect(typeof inv.sql).toBe('string');
    expect(inv.last_measured.value).toBeGreaterThan(0);
    expect(inv.last_measured.cost_ms).toBeGreaterThan(0);
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

  it('the surviving accept-list is descriptor DATA (Ask A2(a)): 24 numeric ids (COST_FB_GT15M_LEGIT, out of scope for S0.2 — no new-build $50M+ ids dissolved)', () => {
    expect(fields.COST_FB_GT15M_LEGIT).toHaveLength(24);
  });

  it('S0.4 (WF3, 2026-09-21/22) — COST_ADDITION_GT50M_LEGIT is RETIRED WHOLE: no longer exported, no longer an accept on cost_addition_gt_50m', () => {
    expect(fields.COST_ADDITION_GT50M_LEGIT).toBeUndefined();
    const def = fields.CHECK_DEFS.find((c: { id: string }) => c.id === 'cost_addition_gt_50m');
    expect(def, 'cost_addition_gt_50m must still be declared — the BOUND survives, only the accept-list is retired').toBeTruthy();
    expect(def.accept, 'the accept array itself must be gone, not merely emptied').toBeUndefined();
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
  it('the shell top level is exactly the frozen 7-statement form (no pipeline.run())', () => {
    const src = shellSrc();
    expect(src).toMatch(/require\(['"]\.\.\/lib\/pipeline['"]\)/);
    expect(src).toMatch(/require\(['"]\.\/assert-parcel-sanity\.descriptor\.json['"]\)/);
    expect(src).toMatch(/require\(['"]\.\.\/lib\/compute\/assert-parcel-sanity['"]\)/);
    expect(src).toMatch(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/);
    expect(src).not.toMatch(/pipeline\.run\(/);
  });

  it('module.exports is a plain {descriptor, compute, run} object (claim #86 — pipeline.step()\'s run is a NAMED METHOD the caller invokes; the pre-conversion pipeline.run() shell exported whatever the legacy SDK call returned, which carried neither name)', () => {
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

  it('verdict.js checkRow renders INFO for an explicit observation.inert, regardless of declared severity (closes the pop=0 gap for the CONVERTED runner)', () => {
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
