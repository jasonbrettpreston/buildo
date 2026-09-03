// 🔗 SPEC LINK: docs/specs/01-pipeline/49_data_completeness_profiling.md (value-sanity layer) + Spec 48 §3.6
//
// Static infra checks for the assert_parcel_sanity observer step (WF2): lock id, records_total:1 Observer
// contract, the data-driven gate→verdict mapping (no per-check-id branching), reuse of the exported
// runSanity/verdictCascade (not a 5th copy), and the sources-chain wiring in the manifest. Mirrors
// assert-global-coverage.infra.test.ts. No DB.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/quality/assert-parcel-sanity.js');
const AUDIT = path.resolve(__dirname, '../../scripts/analysis/parcel-sanity-audit.js');
// R-T addendum, commit 2 — statusFor/verdictCascade/the distribution scan are extracted
// to scripts/lib/step/plausibility.js (Fold A-4d: "extract once, both sides import").
// parcel-sanity-audit.js now RE-IMPORTS rather than defining them locally.
const PLAUSIBILITY = path.resolve(__dirname, '../../scripts/lib/step/plausibility.js');
const MANIFEST = path.resolve(__dirname, '../../scripts/manifest.json');
const src = () => fs.readFileSync(SCRIPT, 'utf8');
const audit = () => fs.readFileSync(AUDIT, 'utf8');
const plausibility = () => fs.readFileSync(PLAUSIBILITY, 'utf8');

describe('assert-parcel-sanity.js — observer contract', () => {
  it('script exists', () => { expect(fs.existsSync(SCRIPT)).toBe(true); });

  it('uses ADVISORY_LOCK_ID = 107 (the free assert-family slot)', () => {
    expect(src()).toMatch(/ADVISORY_LOCK_ID\s*=\s*107\b/);
  });

  it('emits records_total: 1 (Observer — never a DB entity count)', () => {
    expect(src()).toMatch(/records_total:\s*1\b/);
  });

  it('is a read-only Observer — emitMeta reads parcels, writes {}', () => {
    expect(src()).toMatch(/emitMeta\(\s*\{\s*parcels:/);
    expect(src()).toMatch(/\},\s*\{\}\s*\)/); // empty writes object
  });

  it('REUSES the exported runSanity + deriveVerdict (no 5th local cascade copy) — Rule 10, WF2 C1', () => {
    expect(src()).toMatch(/require\(['"]\.\/\.\.\/analysis\/parcel-sanity-audit['"]\)/);
    expect(src()).toMatch(/\brunSanity\b/);
    expect(src()).toMatch(/\bderiveVerdict\b/);
    // it must NOT define its own cascade, nor the retired verdictCascade duplicate
    expect(src()).not.toMatch(/function verdictCascade/);
    expect(src()).not.toMatch(/\bverdictCascade\b/);
  });

  it('records_meta.audit_table has the row-derived verdict via deriveVerdict(rows) (the single verdict cascade — Rule 10)', () => {
    expect(src()).toMatch(/verdict:\s*deriveVerdict\(rows\)/);
  });
});

describe('scripts/lib/step/plausibility.js — data-driven gate mapping (Spec 48 §3.6)', () => {
  it('statusFor derives FAIL/WARN/INFO/PASS purely from gate + sev + count + pop (no per-check-id branching) — R-T addendum, commit 2: lives in plausibility.js, not parcel-sanity-audit.js', () => {
    const p = plausibility();
    // WF3 Phase 1 D-E 4: signature gains `pop` — an empty population is inert-INFO, never a green PASS.
    expect(p).toMatch(/function statusFor\(check, viol, pop\)/);
    expect(p).toMatch(/if \(pop === 0\) return 'INFO'/);
    // the exact data-driven mapping — gate first, then INFO, then WARN, else PASS
    expect(p).toMatch(/check\.gate && viol > 0 \? 'FAIL'\s*:\s*check\.sev === 'INFO' \? 'INFO'\s*:\s*viol > 0 \? 'WARN' : 'PASS'/);
    // no `check.id ===` branching anywhere near the status logic (would be a parallel boolean)
    expect(p).not.toMatch(/status[^\n]*\bcheck\.id ===/);
  });

  it('parcel-sanity-audit.js does NOT define statusFor locally, and no longer carries the retired verdictCascade duplicate — it re-imports statusFor from plausibility.js and deriveVerdict from verdict.js (Fold A-4d + Rule 10)', () => {
    const a = audit();
    expect(a).not.toMatch(/function statusFor/);
    expect(a).not.toMatch(/function verdictCascade/);
    expect(a).toMatch(/require\(['"]\.\.\/lib\/step\/plausibility['"]\)/);
    expect(a).toMatch(/\{\s*statusFor,\s*runDistributionScan\s*\}/);
    expect(a).toMatch(/require\(['"]\.\.\/lib\/step\/verdict['"]\)/);
    expect(a).toMatch(/\{\s*deriveVerdict\s*\}/);
  });

  it('exports runSanity + deriveVerdict + statusFor (parcel-sanity-audit.js re-exports the imported names)', () => {
    expect(audit()).toMatch(/module\.exports = \{[^}]*runSanity[^}]*deriveVerdict[^}]*\}/);
  });

  it('plausibility.js exports statusFor, runDistributionScan for reuse (Fold B-7) — no verdictCascade EXPORT (Rule 10 retired it; the identifier may still appear in the file\'s own retirement-explanation prose)', () => {
    const p = plausibility();
    expect(p).toMatch(/module\.exports = \{[^}]*statusFor[^}]*runDistributionScan[^}]*\}/);
    expect(p).not.toMatch(/function verdictCascade/);
    const exportsBlock = p.slice(p.indexOf('module.exports = {'));
    expect(exportsBlock).not.toMatch(/\bverdictCascade\b/);
  });

  it('the gated (zero-baseline) invariants carry gate:true', () => {
    const a = audit();
    for (const id of ['bylaw_height_per_storey_impossible', 'maxbuild_stories_basis_existing_retired',
      'opt_aor_gfa_gt_opt_coa_gfa', 'new_build_cost_gt_coa_build_cost', 'footprint_gt_lot_x105',
      // F2 promotion (Phase 1 step 15): armed after dev+cloud measured 0 post-fix.
      'opt_aor_gfa_gt_max_buildable_gfa',
      // WF3 Phase 1 D-E: the high-side lot bound + the D-C withheld-envelope tripwire + below-floor vacancy.
      'max_build_dim_exceeds_lot_dim', 'ravine_constrained_carries_priced_cost', 'max_build_dim_below_floor']) {
      // Line-scoped (every CHECK is a one-liner): `[^}]*` would stop at a `${…}` interpolation brace.
      const re = new RegExp(`id: '${id}'[^\\n]*gate: true`);
      expect(a).toMatch(re);
    }
    // a KNOWN non-zero residual must NOT be gated (would wrongly RED the chain)
    expect(a).not.toMatch(/id: 'footprint_coverage_gt_65pct'[^\n]*gate: true/);
  });
});

describe('parcel-sanity-audit.js — statusFor / deriveVerdict behaviour (unit)', () => {
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
    // pop undefined (population unknown, unit-altitude call) keeps the historic mapping
    expect(statusFor({ gate: true, sev: 'HIGH' }, 0)).toBe('PASS');
  });
  it('deriveVerdict (the single verdict cascade, Rule 10) is row-derived: FAIL > WARN > PASS', () => {
    expect(deriveVerdict([{ status: 'PASS' }, { status: 'WARN' }, { status: 'FAIL' }])).toBe('FAIL');
    expect(deriveVerdict([{ status: 'PASS' }, { status: 'WARN' }, { status: 'INFO' }])).toBe('WARN');
    expect(deriveVerdict([{ status: 'PASS' }, { status: 'INFO' }])).toBe('PASS');
  });
});

describe('manifest.json — assert_parcel_sanity wiring', () => {
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
    // +assert_parcel_sanity (WF2 value-sanity gate)
    // +reconcile (Spec 122 §7.4 / A3, S3 2026-08-24): Step-0 reaper at the chain HEAD.
    expect(chain).toHaveLength(28);
  });
});
