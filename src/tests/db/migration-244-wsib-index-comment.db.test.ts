// SPEC LINK: docs/specs/01-pipeline/41_chain_permits.md (link_wsib step)
// SPEC LINK: docs/specs/01-pipeline/43_chain_sources.md (link_wsib step)
//
// F4 (B3 output-panel remediation) — migration 243's COMMENT ON INDEX
// idx_wsib_registry_unlinked overstated what the index serves ("all three
// matching tiers + the probe"). EXPLAIN against the live schema shows the
// three matching-tier CTEs still seq-scan (88.5% selectivity + uncovered
// columns) — only the unlinked-count probe is actually served. Migration 244
// corrects the comment WITHOUT editing 243 in place (already applied to dev).
// Skipped unless BUILDO_TEST_DB=1 / DATABASE_URL.

import { describe, expect, it } from 'vitest';
import { dbAvailable, getTestPool } from './setup-testcontainer';

const pool = getTestPool();

describe.skipIf(!dbAvailable())('migration 244 — corrected idx_wsib_registry_unlinked comment', () => {
  it('the index still exists (244 does not touch the index itself, only its comment)', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'wsib_registry' AND indexname = 'idx_wsib_registry_unlinked'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toMatch(/linked_entity_id IS NULL/);
  });

  it('the comment no longer claims the index serves "all three matching tiers"', async () => {
    if (!pool) return;
    const { rows } = await pool.query(
      `SELECT obj_description('idx_wsib_registry_unlinked'::regclass, 'pg_class') AS comment`,
    );
    const comment: string | null = rows[0]?.comment ?? null;
    expect(comment).not.toBeNull();
    expect(comment).not.toMatch(/all three matching tiers/);
    expect(comment).toMatch(/unlinked-count probe/);
    expect(comment).toMatch(/Does NOT serve the three matching-tier CTEs/);
  });

  // NOTE: an EXPLAIN-based behavioral proof of "the Tier 3 CTE seq-scans, not
  // index-scans" was tried here and REMOVED — it does not reproduce in this
  // testcontainer. wsib_registry starts empty (pipeline-ingested data, not
  // migration-seeded); against a near-empty table Postgres's planner picks
  // the (nearly free) index scan regardless, the OPPOSITE of the 88.5%-
  // selectivity/121K-row production behavior the comment documents. Proving
  // this would require seeding a production-scale fixture, disproportionate
  // for a comment-only migration. The comment-text corrections above are the
  // load-bearing assertions for F4.
});
