// SPEC LINK: docs/specs/01-pipeline/122_pipeline_step_optimization.md §5.5 (seams, G2' precursor)
// SPEC LINK: docs/specs/01-pipeline/123_step_opt_assessment_validation.md §7 (commit 7 — descriptor +
//   compute verbatim)
//
// Pilot 9 commit 7c — the SQL byte-verbatim lock. Rendered every SQL-builder function pair (legacy
// scripts/enrich-parcels.js vs the new scripts/lib/compute/enrich-parcels.js) with EQUIVALENT
// inputs, asserting the rendered SQL strings were IDENTICAL (modulo the ONE declared Fold G3
// clock-seam substitution) — proving the compute port was a genuine no-op before anything else in
// this pilot depended on that fact.
//
// RETIRED at pilot 9 commit 7e/2 (2026-09-07, ENRICHER thin-shell conversion): scripts/enrich-
// parcels.js became the thin pipeline.step(descriptor, compute) shell this same commit — the
// legacy SQL-builder functions this file's `legacy` side required (buildUpdateSql,
// buildEnrichmentSql, buildMaxBuildSql, buildCompCandidatesSql, buildComparableBuildsUpdateSql,
// buildOptConfigSelectSql, …) no longer exist on that module, so the comparison this file existed
// to make is no longer POSSIBLE, not merely inconvenient — there is nothing left to compare
// compute against. Its job was already DONE: the port was proven byte-verbatim at commit 7c, before
// the shell ever replaced the legacy body, and nothing has re-touched those SQL strings since
// (verified this commit — the only compute.js SQL-builder change was buildCompCandidatesSql's
// CREATE INDEX/ANALYZE statements moving into a sibling function, buildCompCandidatesIndexSql,
// to fix a genuine "cannot insert multiple commands into a prepared statement" bug found running
// this same commit's own G2' golden capture — the SELECT text itself is untouched).
//
// Per-function SQL-shape regression coverage against the LIVE compute module (not a legacy
// comparison) continues in the individual src/tests/enrich-parcels-*.logic.test.ts files
// (retargeted the same commit) and src/tests/max-build.logic.test.ts — each already asserts the
// specific fragments/literals this file's own per-builder tests checked, so no coverage is lost;
// only the legacy-vs-compute DIFFERENTIAL mechanism (meaningful only during the 7c-to-thin-shell
// transition window) is retired. File kept, not deleted, per "nothing hidden" — this header is
// the record of why it is now inert.

import { describe, it, expect } from 'vitest';

describe('SQL byte-verbatim lock (retired, pilot 9 commit 7e/2)', () => {
  it('is intentionally inert — see the file header for why the legacy-vs-compute comparison is retired, not merely skipped', () => {
    expect(true).toBe(true);
  });
});
