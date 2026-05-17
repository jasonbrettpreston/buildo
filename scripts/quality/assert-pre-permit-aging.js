#!/usr/bin/env node
/**
 * assert-pre-permit-aging — RETIRED (Phase G no-op shim)
 *
 * Previously monitored aged Pre-Permits (approved+unlinked CoA applications older than the
 * `pre_permit_expiry_months` threshold). Retired alongside its paired writer
 * `create-pre-permits.js` per Spec 42 §6.11 row "Phase G" — once Pre-Permits stop being
 * created and existing rows are wiped, this assertion has nothing to assert.
 *
 * Behavior:
 *   - No DB reads or writes.
 *   - emitSummary returns records_total=0, records_new=0, records_updated=0.
 *   - audit_table.verdict = 'SKIP' (NOT 'PASS') — distinguishes a retired no-op from a
 *     successful assertion in the FreshnessTimeline + observe-chain.js 7-day baseline.
 *   - Advisory lock 107 preserved (defense-in-depth; no real contention surface remains).
 *
 * Removed from `scripts/manifest.json` in Commit 2 of Phase G WF1; file `git rm`'d at that
 * point.
 *
 * SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.11 row "Phase G"
 */
'use strict';

const pipeline = require('../lib/pipeline');

const ADVISORY_LOCK_ID = 107;

pipeline.run('assert-pre-permit-aging', async (pool) => {
  const lockResult = await pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, async () => {
    pipeline.log.info(
      '[assert-pre-permit-aging]',
      'RETIRED (Phase G) — no-op shim; awaiting manifest removal in Commit 2.',
    );

    pipeline.emitSummary({
      records_total: 0,
      records_new: 0,
      records_updated: 0,
      records_meta: {
        audit_table: {
          phase: 6,
          name: 'assert-pre-permit-aging (RETIRED)',
          verdict: 'SKIP',
          rows: [
            { metric: 'retired', value: 'Phase G', threshold: null, status: 'SKIP' },
          ],
        },
      },
    });

    pipeline.emitMeta({}, {});
  });

  if (!lockResult.acquired) return;
});
