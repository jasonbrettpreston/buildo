// WF3 `wf3_enrich_parcels_cloud_stall` — hardening landed regardless of the H4-vs-H5 ruling
// (premise verification: H4 confirmed with real numbers — successful cloud runs measure
// 107-126 min total, pass2 ~47-48 min the dominant single pass; H6 refuted at the code+manifest
// level; H5/H3 remain undetermined pending a live capture).
//
// SPEC LINK: docs/specs/01-pipeline/65_enrich_parcels.md
// SPEC LINK: docs/specs/01-pipeline/48_pipeline_observability.md §3.6/§3.7/§3.10
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §2.2 (fail-safe-loud)
//
// RETIRED at pilot 9 commit 7e/2 (2026-09-07, ENRICHER thin-shell conversion): this file's own
// "WF3 enrich_parcels stall commit 1" describe block (SRC-text-scanned scripts/enrich-parcels.js
// for LOGIC_VARS_SCHEMA/main()'s resolution of the two timeout vars, and unit-tested the legacy
// per-pass `runPass(name, fn)` wrapper's LOUD 57014/55P03 rethrow) no longer has a subject: the
// hand-rolled Zod schema and main() are gone (replaced by the generic config.logic_variables[]
// + resolveConfig mechanism), and runPass is inlined into runEnrichPhase's own shared-phase loop.
// The LOUD-rethrow + unrelated-error-passthrough behaviours are now proven against the real
// runEnrichPhase in src/tests/steps/enrich_parcels/violations.test.ts ("a 57014.../a 55P03.../an
// unrelated pass error..." tests); the seed-bounds/schema-declaration checks are superseded by
// the fast invariants (step-validate.mjs) + violations.test.ts's "P4 declared-tunables ⊆
// registry" test. Only the admin-visibility check below survives verbatim — it is not about
// enrich-parcels' own internals, just that the two tunables still render in the operator UI.

import { describe, expect, it } from 'vitest';
import { GROUPS } from '@/features/admin-controls/components/GlobalConfigCard';

describe('admin GROUPS — WF3 enrich_parcels stall knobs are visible to operators', () => {
  it('GlobalConfigCard GROUPS includes both new keys', () => {
    const allKeys = GROUPS.flatMap((g) => g.keys);
    expect(allKeys).toContain('enrich_parcels_pass_statement_timeout_minutes');
    expect(allKeys).toContain('enrich_parcels_lock_timeout_ms');
  });
});
