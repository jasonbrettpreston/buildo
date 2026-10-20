// SPEC LINK: docs/reports/2026-09-12-batch1-i2-assert-data-bounds-assessment.md §2.4 IL-6; Spec 124 §2 Rule 1;
//            Spec 124 R-DF (EXTERNALIZED)
//
// assert_data_bounds IL-6 (operator y 2026-10-20: "y show which ruling authorixzes this or create aruling for
// each."). The IL-6 ruling (assessment :315) reads: "`COST_MAG_ACCEPT` (`e99ae61a`) is a **declared
// `accept_list`** (an audited exception list, not a threshold) — descriptor-declared, not a logic var". Before
// this lock the list shipped only as a compute-imported constant (`assert-data-bounds-fields.js`) and appeared in
// the descriptor only as prose inside two checks' `why`. Now each magnitude check declares it as
// `checks[].expect.accept_list`, and the compute binds the descriptor's list, never a module constant.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../');
const DESCRIPTOR = path.join(REPO_ROOT, 'scripts/quality/assert-data-bounds.descriptor.json');
const COMPUTE = path.join(REPO_ROOT, 'scripts/lib/compute/assert-data-bounds.js');
const IL6_LIST = ['04 202812 BLD', '07 129713 BLD', '06 196930 BLD'];
const IDS = ['cost_estimate_over_ceiling', 'modeled_gfa_over_ceiling'];

type Check = { id: string; expect?: { accept_list?: unknown } };
const descriptor = () => JSON.parse(fs.readFileSync(DESCRIPTOR, 'utf8')) as { checks: Check[] };
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS compute module
const computeModule = () => require(COMPUTE) as { declaredAcceptList?: (d: { checks: Check[] }, id: string) => string[] };

describe('IL-6 — the COST_MAG_ACCEPT list is descriptor-declared (`checks[].expect.accept_list`)', () => {
  it('both magnitude checks declare the 3-entry accept_list in the descriptor (data, not why-prose)', () => {
    for (const id of IDS) {
      const c = descriptor().checks.find((x) => x.id === id);
      expect(c?.expect?.accept_list, `${id}.expect.accept_list`).toEqual(IL6_LIST);
    }
  });

  it('the compute binds the descriptor\'s list (declaredAcceptList) and no longer imports a COST_MAG_ACCEPT constant', () => {
    const src = fs.readFileSync(COMPUTE, 'utf8');
    expect(src).not.toMatch(/COST_MAG_ACCEPT/);
    expect(src).toMatch(/declaredAcceptList\(ctx\.descriptor, 'cost_estimate_over_ceiling'\)/);
    expect(src).toMatch(/declaredAcceptList\(ctx\.descriptor, 'modeled_gfa_over_ceiling'\)/);
  });

  it('declaredAcceptList reads the list from the descriptor it is given, and fails closed when it is missing', () => {
    const fn = computeModule().declaredAcceptList;
    expect(typeof fn).toBe('function');
    const d = descriptor();
    expect(fn!(d, 'cost_estimate_over_ceiling')).toEqual(IL6_LIST);
    const edited = { checks: d.checks.map((c) => (c.id === 'modeled_gfa_over_ceiling' ? { ...c, expect: { ...c.expect, accept_list: ['X 1 BLD'] } } : c)) };
    expect(fn!(edited, 'modeled_gfa_over_ceiling')).toEqual(['X 1 BLD']);
    const stripped = { checks: d.checks.map((c) => (c.id === 'cost_estimate_over_ceiling' ? { ...c, expect: {} } : c)) };
    expect(() => fn!(stripped, 'cost_estimate_over_ceiling')).toThrow(/cost_estimate_over_ceiling.*accept_list/);
  });
});
