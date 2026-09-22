// 🔗 SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md §3 item 11 (+ Spec 49 §2 boundary, Spec 122 §5.1 shape)
//
// Static infra checks for the assert_parcel_sanity step: lock id, the frozen shell shape,
// the data-driven gate→verdict mapping (no per-check-id branching), reuse of the shared
// statusFor/deriveVerdict (not a 5th copy), and the sources-chain wiring in the manifest.
//
// ── batch2 P1.1 commit 2b (2026-09-18) — REPOINTED to the descriptor/compute/fields
//    files (Spec 122 §5.1 conversion). Mirrors assert-data-bounds.infra.test.ts's own
//    repoint at its commit 7: source-text assertions that keyed on the pre-conversion
//    hand-rolled shell now read the descriptor JSON + the compute module + the fields
//    sidecar instead of the (now 8-line) frozen shell. No DB.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/quality/assert-parcel-sanity.js');
const AUDIT = path.resolve(__dirname, '../../scripts/analysis/parcel-sanity-audit.js');
const COMPUTE = path.resolve(__dirname, '../../scripts/lib/compute/assert-parcel-sanity.js');
const FIELDS = path.resolve(__dirname, '../../scripts/lib/assert-parcel-sanity-fields.js');
const PLAUSIBILITY = path.resolve(__dirname, '../../scripts/lib/step/plausibility.js');
const VERDICT = path.resolve(__dirname, '../../scripts/lib/step/verdict.js');
const MANIFEST = path.resolve(__dirname, '../../scripts/manifest.json');
const DESCRIPTOR_PATH = path.resolve(__dirname, '../../scripts/quality/assert-parcel-sanity.descriptor.json');
const src = () => fs.readFileSync(SCRIPT, 'utf8');
const audit = () => fs.readFileSync(AUDIT, 'utf8');
const computeSrc = () => fs.readFileSync(COMPUTE, 'utf8');
const fields = () => fs.readFileSync(FIELDS, 'utf8');
const plausibility = () => fs.readFileSync(PLAUSIBILITY, 'utf8');
const verdictSrc = () => fs.readFileSync(VERDICT, 'utf8');
const DESCRIPTOR = JSON.parse(fs.readFileSync(DESCRIPTOR_PATH, 'utf8')) as {
  identity: { lock: number; archetype: string };
  checks: Array<{ id: string; severity: string; blocking: boolean; when: string }>;
  plausibility: Array<{ id: string; kind: string; severity: string }>;
  invariants: string | Array<{ id: string; frequency: string }>;
  config: { logic_variables: Array<{ name: string; on_invalid: string }>; validation: string };
};

describe('assert-parcel-sanity.js — frozen shell + descriptor contract', () => {
  it('script exists and is the frozen 8-line shell shape (Spec 122 §5.1)', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    expect(src()).toMatch(/require\(['"]\.\.\/lib\/pipeline['"]\)/);
    expect(src()).toMatch(/require\(['"]\.\/assert-parcel-sanity\.descriptor\.json['"]\)/);
    expect(src()).toMatch(/require\(['"]\.\.\/lib\/compute\/assert-parcel-sanity['"]\)/);
    expect(src()).toMatch(/module\.exports\s*=\s*pipeline\.step\(descriptor,\s*compute\)/);
    expect(src()).not.toMatch(/pipeline\.run\(/);
  });

  it('uses ADVISORY_LOCK_ID = 107 (the free assert-family slot), matching identity.lock', () => {
    expect(src()).toMatch(/ADVISORY_LOCK_ID\s*=\s*107\b/);
    expect(DESCRIPTOR.identity.lock).toBe(107);
  });

  // WF3 S0.3 (2026-09-21, Spec 43 step #25) added 3 checks[] rows (existing_structure_
  // shared_with_other_parcel, existing_structure_borrowed_primary, ravine_constrained_
  // carries_priced_reno — 42 -> 45) and 1 validate_only invariants[] entry
  // (existing_structure_onlot_share_low — "none" -> a 1-entry array), per
  // scripts/lib/assert-parcel-sanity-fields.js CHECK_DEFS/INVARIANT_DEFS. plausibility[]
  // (the 8 dist_* rows) is unaffected by S0.3. Pin updated here (pre-push full-suite
  // rejection, 2026-09-22) — this file was not repointed at S0.3's own commit.
  it('archetype is ASSERT with exactly 45 checks[] (42 + S0.3\'s 3) and 8 plausibility[] rows, 1 validate_only invariant (S0.3\'s existing_structure_onlot_share_low)', () => {
    expect(DESCRIPTOR.identity.archetype).toBe('ASSERT');
    expect(DESCRIPTOR.checks).toHaveLength(45);
    expect(DESCRIPTOR.plausibility).toHaveLength(8);
    expect(Array.isArray(DESCRIPTOR.invariants)).toBe(true);
    const invariants = DESCRIPTOR.invariants as Array<{ id: string }>;
    expect(invariants).toHaveLength(1);
    expect(invariants[0]?.id).toBe('existing_structure_onlot_share_low');
  });

  it('every checks[] row is blocking:false, when:"post" (Spec 30 §5.4.1 non-halting-by-design, all 45 read FINAL enriched values)', () => {
    for (const c of DESCRIPTOR.checks) {
      expect(c.blocking, c.id).toBe(false);
      expect(c.when, c.id).toBe('post');
    }
  });

  it('every plausibility[] row is severity INFO, kind distribution (F4 — never verdict-driving)', () => {
    for (const p of DESCRIPTOR.plausibility) {
      expect(p.severity, p.id).toBe('INFO');
      expect(p.kind, p.id).toBe('distribution');
    }
  });

  it('37 logic_variables declared, strict validation, all on_invalid:"fail"', () => {
    expect(DESCRIPTOR.config.validation).toBe('strict');
    expect(DESCRIPTOR.config.logic_variables).toHaveLength(37);
    for (const v of DESCRIPTOR.config.logic_variables) expect(v.on_invalid, v.name).toBe('fail');
  });

  it('REUSES the shared statusFor/deriveVerdict cascade (no local copy) — Rule 10', () => {
    expect(computeSrc()).not.toMatch(/function statusFor/);
    expect(computeSrc()).not.toMatch(/function verdictCascade/);
    expect(computeSrc()).not.toMatch(/function deriveVerdict/);
  });
});

describe('scripts/lib/step/plausibility.js — data-driven gate mapping (Spec 48 §3.6)', () => {
  it('statusFor derives FAIL/WARN/INFO/PASS purely from gate + sev + count + pop (no per-check-id branching)', () => {
    const p = plausibility();
    expect(p).toMatch(/function statusFor\(check, viol, pop\)/);
    expect(p).toMatch(/if \(pop === 0\) return 'INFO'/);
    expect(p).toMatch(/check\.gate && viol > 0 \? 'FAIL'\s*:\s*check\.sev === 'INFO' \? 'INFO'\s*:\s*viol > 0 \? 'WARN' : 'PASS'/);
    expect(p).not.toMatch(/status[^\n]*\bcheck\.id ===/);
  });

  it('runDistributionEntries (Fold B-7 wiring) reuses runDistributionScan — no duplicated percentile SQL', () => {
    const p = plausibility();
    expect(p).toMatch(/function runDistributionEntries/);
    // batch2 P1.1 fix (2026-09-18, Rule 3): runDistributionEntries now threads the
    // resolved percentile/medianMultiplier/medianFloor into runDistributionScan's
    // 5th (opts) argument — the call site is still a direct pass-through.
    expect(p).toMatch(/runDistributionScan\(pool, fields, resScope, zoneExpr, \{ percentile, medianMultiplier, medianFloor \}\)/);
  });

  it('verdict.js checkRow renders INFO for an explicit observation.inert (F5 / D-E 4), regardless of severity', () => {
    const v = verdictSrc();
    expect(v).toMatch(/observation\.inert === true/);
  });

  it('exports runDistributionEntries alongside statusFor/runDistributionScan for reuse', () => {
    const p = plausibility();
    expect(p).toMatch(/module\.exports = \{[^}]*runDistributionEntries[^}]*\}/);
  });

  it('the gated (zero-baseline) checks carry gate:true in the fields sidecar (12 gates)', () => {
    const f = fields();
    const gateIds = [
      'max_build_dim_below_floor', 'maxbuild_stories_basis_existing_retired',
      'bylaw_height_per_storey_impossible', 'max_build_dim_exceeds_lot_dim',
      'ravine_constrained_carries_priced_cost', 'opt_aor_gfa_gt_opt_coa_gfa',
      'new_build_cost_gt_coa_build_cost', 'footprint_gt_lot_x105', 'existing_floor_gt_lot_x105',
      'heritage_basis_footprint_gt_lot', 'cost_fb_on_footprint_gt_lot', 'opt_aor_gfa_gt_max_buildable_gfa',
    ];
    for (const id of gateIds) {
      const re = new RegExp(`id: '${id}'[^\\n]*gate: true`);
      expect(f, id).toMatch(re);
    }
    // a KNOWN non-zero residual must NOT be gated (would wrongly RED the chain)
    expect(f).not.toMatch(/id: 'footprint_coverage_gt_65pct'[^\n]*gate: true/);
  });
});

describe('parcel-sanity-audit.js — statusFor / deriveVerdict behaviour (unit, re-exported)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { statusFor, deriveVerdict } = require('../../scripts/analysis/parcel-sanity-audit.js');

  it('a gated check that goes non-zero → FAIL', () => {
    expect(statusFor({ gate: true, sev: 'HIGH' }, 1)).toBe('FAIL');
  });
  it('a gated check at 0 → PASS (does not RED the chain on clean data)', () => {
    expect(statusFor({ gate: true, sev: 'HIGH' }, 0)).toBe('PASS');
  });
  it('a non-gated HIGH residual that is non-zero → WARN (not FAIL)', () => {
    expect(statusFor({ sev: 'HIGH' }, 1209)).toBe('WARN');
  });
  it('an INFO check → INFO regardless of count (visibility, never verdict-driving)', () => {
    expect(statusFor({ sev: 'INFO' }, 3260)).toBe('INFO');
  });
  it('D-E 4: an EMPTY population is inert-INFO, never a green PASS — even on a gated check', () => {
    expect(statusFor({ gate: true, sev: 'HIGH' }, 0, 0)).toBe('INFO');
    expect(statusFor({ sev: 'MED' }, 0, 0)).toBe('INFO');
    expect(statusFor({ gate: true, sev: 'HIGH' }, 0)).toBe('PASS');
  });
  it('deriveVerdict (the single verdict cascade, Rule 10) is row-derived: FAIL > WARN > PASS', () => {
    expect(deriveVerdict([{ status: 'PASS' }, { status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(deriveVerdict([{ status: 'PASS' }, { status: 'WARN' }, { status: 'INFO' }])).toBe('WARN');
    expect(deriveVerdict([{ status: 'PASS' }, { status: 'INFO' }])).toBe('PASS');
  });
});

describe('manifest.json — assert_parcel_sanity wiring (unchanged by the conversion)', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

  it('registered in scripts', () => {
    expect(manifest.scripts.assert_parcel_sanity?.file).toBe('scripts/quality/assert-parcel-sanity.js');
  });

  it('runs in the sources chain, immediately after assert_global_coverage, before refresh_snapshot', () => {
    const chain: string[] = manifest.chains.sources;
    expect(chain).toContain('assert_parcel_sanity');
    const i = chain.indexOf('assert_parcel_sanity');
    expect(chain[i - 1]).toBe('assert_global_coverage');
    expect(chain[i + 1]).toBe('refresh_snapshot');
    expect(chain).toHaveLength(28);
  });
});
