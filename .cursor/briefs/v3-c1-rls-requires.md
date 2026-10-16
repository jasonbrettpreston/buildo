---
write_scope:
- scripts/compute-centroids.descriptor.json
- scripts/compute-parcel-cost-estimates.descriptor.json
- scripts/enrich-centreline.descriptor.json
- scripts/enrich-heritage.descriptor.json
- scripts/enrich-parcels.descriptor.json
- scripts/enrich-ravines.descriptor.json
- scripts/geocode-permits.descriptor.json
- scripts/link-parcels.descriptor.json
- scripts/refresh-snapshot.descriptor.json
- scripts/quality/assert-engine-health.descriptor.json
---
## Goal
Spec 124 R-CT (2026-10-16): every write target on an RLS-enabled table declares `guards.requires {kind:"rls_bypass_or_policy"}`. Under a non-bypass role a Class B table (RLS on, zero policies) gives 0 rows and NO error, so the run reads PASS. `scripts/lib/step/write.js` `assertWritePrivileges` (~line 1380) only measures the tables a descriptor declares. Fifteen writers already declare it; these ten do not. This brief adds the missing entries, data only, in the existing fleet form.

## Reproduce
For each file in `write_scope`, `guards.requires` has no `rls_bypass_or_policy` entry for the table(s) below, although the table has RLS enabled (measured on the dev DB: `parcels`, `permits`, `data_quality_snapshots`, `engine_health_snapshots` all `relrowsecurity = t`).

| descriptor | add `name` |
|---|---|
| scripts/compute-centroids.descriptor.json | parcels |
| scripts/compute-parcel-cost-estimates.descriptor.json | parcels |
| scripts/enrich-centreline.descriptor.json | parcels |
| scripts/enrich-heritage.descriptor.json | parcels |
| scripts/enrich-parcels.descriptor.json | parcels (NOT `enrich_parcels_pass3_scope`, a temp table) |
| scripts/enrich-ravines.descriptor.json | parcels |
| scripts/geocode-permits.descriptor.json | permits |
| scripts/link-parcels.descriptor.json | permits (it already declares `permit_parcels`; keep that one) |
| scripts/refresh-snapshot.descriptor.json | data_quality_snapshots |
| scripts/quality/assert-engine-health.descriptor.json | engine_health_snapshots |

## Fix
In each file, append ONE object to the existing `guards.requires` array, in exactly this shape (copied from `scripts/load-coa-notices.descriptor.json`, the precedent). Use the file's own 2-space JSON indentation. Change nothing else.

```json
{
  "kind": "rls_bypass_or_policy",
  "name": "<table>",
  "on_missing": "fail",
  "why": {
    "text": "<table> has RLS enabled with ZERO policies (Spec 114 Class B). Under a non-bypass role this step's write affects 0 rows with NO error, so the counters read 0 and the verdict reads PASS. The bypass is the precondition, checked before the first read (Spec 124 R-CT; load_coa_notices precedent).",
    "liveness": { "kind": "table", "ref": "<table>" }
  }
}
```

Write `liveness` across lines the way the neighbouring entries in the same file do.

Invariants to KEEP (any change to these is a failure):
- Every existing `guards.requires` entry, its order and its text stay unchanged. The new entry goes LAST in the array.
- No other descriptor field changes: no reformatting, no key reordering, no line-ending change. Check the file's line endings first (some are CRLF) and keep them.
- Do NOT touch any `.js` file, test, schema, manifest, converted.json or census file.

## Gate answers
- `guards.requires[].kind` closed set includes `rls_bypass_or_policy` (`scripts/steps/_schema/step.schema.json`). It is owned by `write.assertWritePrivileges`, never catalog-probed (`scripts/lib/step/index.js` `REQUIREMENT_OWNED_ELSEWHERE`).
- `why` needs `text` + `liveness` (Rule: every `why` names its liveness). `liveness.kind: "table"` with `ref` = the table name is the precedent form.

## Green
Each must pass after the edits:
- `node -e "for (const f of process.argv.slice(1)) JSON.parse(require('fs').readFileSync(f,'utf8'))" <every file in write_scope>`
- `npx vitest run src/tests/step-conformance.infra.test.ts src/tests/cloud-pre-dispatch.logic.test.ts src/tests/steps/compute_centroids src/tests/steps/enrich_parcels src/tests/steps/link_parcels src/tests/steps/refresh_snapshot --poolOptions.forks.maxForks=4 --poolOptions.forks.minForks=1`

Pre-existing reds are possible in step-conformance: scorecard staleness ("drifted from a fresh --fast run") is expected after any descriptor change and is regenerated at landing. Report every red you see; do not try to fix scorecards.

## Commit
Do NOT commit. Leave the edits in the working tree for the orchestrator's review.
