// SPEC LINK: docs/specs/01-pipeline/65_parcel_zoning_enrichment.md; docs/specs/01-pipeline/78_optimal_lot_configuration.md (EP-D14 pass-5 D4' recovery backlog)
//
// RED-FIRST (FLEET-2, MQ-A1 follow-up). MQ-A1 (a) scores every when:"pre_write" check from the
// pre-write gate pass. enrich_parcels' `pending_scope_parcels` backlog only exists at pass-5 start
// (consumePendingScope captures stats.pending_scope_count before the recovery runs; cloud measured
// 439,130), so a gate-pass score reads matched {} = 0 — a false green. The check must be declared
// when:"post", where the final pass carries the real pre-recovery count.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface Check { id: string; when: string; order_guarantee?: unknown }
const ROOT = process.cwd();
const descriptor = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/enrich-parcels.descriptor.json'), 'utf8')) as { checks: Check[] };
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the CJS compute under test
const compute = require('../../../../scripts/lib/compute/enrich-parcels.js') as {
  checks: Record<string, (ctx: { matched: Record<string, unknown>; report: (id: string, obs: { violations: number }) => void }) => void>;
};

function observe(matched: Record<string, unknown>): number {
  let v = -1;
  compute.checks.pending_scope_parcels!({ matched, report: (_id, obs) => { v = obs.violations; } });
  return v;
}

describe('enrich_parcels pending_scope_parcels — observed at pass-5 start, so declared when:"post"', () => {
  it('the gate pass has no pass-5 value: the check reads 0 from matched {} (the false green a pre_write score would record)', () => {
    expect(observe({})).toBe(0);
    expect(observe({ pending_scope_parcels: 439130 })).toBe(439130);
  });

  it('the descriptor declares it when:"post" and carries no pre_write order_guarantee', () => {
    const c = descriptor.checks.find((x) => x.id === 'pending_scope_parcels');
    expect(c, 'pending_scope_parcels is not declared').toBeDefined();
    expect(c?.when).toBe('post');
    expect(c?.order_guarantee, 'order_guarantee is the pre_write Rule 11 field; a post check does not carry it').toBeUndefined();
  });
});
