/**
 * KNOWN-BAD closure module for the compute PURITY fixture (CP-B4).
 *
 * Its single purpose is to prove the gate follows `require()` closures: the G1
 * rule (raw control/ledger table read through ctx.pool.query) must fire HERE,
 * not only in the requiring file's own body. Fixtures are never executed —
 * this file is AST-scanned as a closure of bad-compute-purity.js.
 *
 * SPEC LINK: docs/specs/01-pipeline/124_step_standard_policy.md Rule 2 (gate E/CP)
 */

// ── G1 — raw read of the ledger table (sync_runs) from inside a closure ─────────
async function readSyncRuns(ctx, datasetVersion) {
  return ctx.pool.query('SELECT id FROM sync_runs WHERE dataset_version = $1', [datasetVersion]); // expect: G1
}

module.exports = { readSyncRuns };
