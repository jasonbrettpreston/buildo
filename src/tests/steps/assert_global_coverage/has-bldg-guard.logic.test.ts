// SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md §2 Rule 4 ("A rule kept in compute rather than declared
//            data must still be written down — as a check's `why`, not a comment."); 124a §B19 item 3 (4) and
//            REFREEZE-BUNDLE-1 item (4) (124a:457), split by R-II; defect AGC-D8.
//
// AGC-D8 (REFREEZE-BUNDLE-1 item (4)): the IL-11/IL-12 residential-with-building scoping, `has_bldg`, is a DECLARED
// check guard — the form the IL-11 ruling asked for (batch1 I1 assessment §2 IL-11: "ACCEPT the `has_bldg EXISTS`
// scoping as a declared guard") — with its rule in each guarded check's `why`. Locked both directions: every check
// whose denominator is a has_bldg count declares the guard and no other check does; the guard is the expression the
// compute's two SQL sites run (byte-equal), so the declaration cannot drift from the code that applies it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
/* eslint-disable @typescript-eslint/no-require-imports */
const fields = require(path.join(REPO_ROOT, 'scripts/lib/assert-global-coverage-fields.js')) as {
  CHECK_DEFS: Array<{ id: string; denom: string | null; guard?: { name: string; sql: string; scope: string } }>;
  HAS_BLDG_GUARD?: { name: string; sql: string; scope: string };
};
const DESCRIPTOR = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/quality/assert-global-coverage.descriptor.json'), 'utf8')) as {
  checks: Array<{ id: string; expect: { guard?: unknown }; why: { text: string } }>;
};
/* eslint-enable @typescript-eslint/no-require-imports */
const COMPUTE = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/compute/assert-global-coverage.js'), 'utf8');
const HAS_BLDG_DENOMS = new Set(['residWithBldgEnv', 'residWithBldg']);
const GUARDED = ['src_max_buildable_footprint_sqm', 'src_max_buildable_gfa_sqm', 'src_max_build_stories', 'src_opt_aor_gfa_sqm', 'src_parcel_cost_menu_resid_bldg'];

describe('AGC-D8 — has_bldg is a declared check guard on the IL-11/IL-12 checks (Spec 124 §2 Rule 4)', () => {
  it('the fields module declares one guard: name has_bldg, the EXISTS expression, and its scope', () => {
    expect(fields.HAS_BLDG_GUARD).toEqual({
      name: 'has_bldg',
      sql: 'EXISTS (SELECT 1 FROM parcel_buildings pb WHERE pb.parcel_id = p.id)',
      scope: "residential parcels (zoning_class IS NOT NULL AND upper(zoning_class) LIKE 'R%') with at least one linked building; a building-less lot is outside both numerator and denominator",
    });
  });

  it('both directions: exactly the checks whose denominator is a has_bldg count declare the guard', () => {
    const byDenom = fields.CHECK_DEFS.filter((d) => d.denom !== null && HAS_BLDG_DENOMS.has(d.denom)).map((d) => d.id).sort();
    const declared = fields.CHECK_DEFS.filter((d) => d.guard !== undefined).map((d) => d.id).sort();
    expect(byDenom).toEqual([...GUARDED].sort());
    expect(declared).toEqual([...GUARDED].sort());
  });

  it('the generated descriptor carries the guard in each guarded check\'s expect, and the rule in its why', () => {
    for (const id of GUARDED) {
      const c = DESCRIPTOR.checks.find((k) => k.id === id);
      expect(c?.expect.guard, id).toEqual(fields.HAS_BLDG_GUARD);
      expect(c?.why.text, id).toContain('declared guard `has_bldg`');
    }
    for (const c of DESCRIPTOR.checks.filter((k) => !GUARDED.includes(k.id))) expect(c.expect.guard, c.id).toBeUndefined();
  });

  it('the declared expression is the one the compute runs, at both has_bldg sites (mbc, pcm)', () => {
    const sql = fields.HAS_BLDG_GUARD?.sql ?? '<none>';
    expect(COMPUTE.split(`${sql} AS has_bldg`).length - 1).toBe(2);
    expect(COMPUTE.split('AS has_bldg').length - 1).toBe(2);
  });
});
