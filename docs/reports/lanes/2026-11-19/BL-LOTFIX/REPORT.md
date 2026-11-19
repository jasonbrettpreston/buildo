# REPORT BL-LOTFIX task-338 (SRCH.LOTCARD suite repair, Increment 1·B)
Status line (Spec 137 rule 3): the lot-map fields are declared and the registry regenerated; the fix commit is 05142fc74 on wf1/inc1b-lotfix (unpushed).

## Cause (confirmed on head afd6852da before any change)
- SV-SBIND: screen-checks.mjs:356 checks a golden contract ref name by name against inputs.field_whitelist of the contract descriptor (whitelistOf). contract_parcels_lookup.descriptor.json had neither frontageStreet nor hasFootprint (types.ts:111-112 added both). Before: `node scripts/surfaces/surface-validate.mjs --check` printed the two SV-SBIND lines (multi_parcel_2 lots.0.frontageStreet, multi_parcel_3plus lots.1.frontageStreet).
- Registry: `consumer-registry.mjs --check` printed "STALE ... index 650 ... lot-map.ts parcels.primary_frontage_street_name" (src-sql-ledger itself fresh).

## Cause table
| failing case | suite.log diff | fix | proving output (checks.out) |
| gate-consumer-registry T3, T5 | expected 980 to be 982 (suite.log:2925) | consumer-registry.mjs --write: 982 rows, numstat 16 0, exactly 2 added rows (lot-map.ts: parcels.primary_frontage_street_name / enrich_centreline; parcel_buildings.parcel_id / link_massing) | "scripts/steps/_schema/consumer-registry.json is fresh" |
| contract-binding FE-32 b, surface-conformance C-1, surface-validate FE-13 | two SV-SBIND lines (suite.log:2951-2952) | both names added to inputs.field_whitelist (descriptor and census/contracts.json mirror) | "surface-validate current; S-gen ok ... S-desc ok ... S-screen ok (17 surfaces, 98 goldens) · S-sbind ok (17 surfaces, 418 strings)" |
| mcfront-proof canary b | generator --check and gate --check exit 1 | same | seed-report-v2.mjs --check rc=0, surface-validate --check rc=0 |
hasFootprint is declared as well: it is a field of the same lots[] object (types.ts:112) and the descriptor whitelist lists every response field; not bound in a golden today.

## Extra found by the hooks (not in the station list)
The pre-commit hook refused the first attempt: generated Target Files blocks of docs/specs/01-pipeline/56_source_massing.md and 62_source_centreline.md were stale (they list registry consumers). Regenerated with `node scripts/analysis/generate-target-files.mjs` (one consumers line each); its --check is clean. The station suite's fast invariant #43 would have hit the same.

## Proof
checks.out: every generator --check (seed-report-v2, report-schema, emit-mobile-theme, emit-mobile-surfaces, generate-surface-registry, src-sql-ledger, consumer-registry, generate-target-files), surface-validate --check all arms ok, typecheck rc=0. commit.out: hooks passed; commit 05142fc74. No golden or generated file hand-edited; census/contracts.json is a hand-kept data mirror of the descriptor (no generator owns it: grep found none), edited by two lines to stay equal.

## Review
r1-plan.txt, TRIAGE.md: KEPT the before/after generator capture and the mechanical row check (done); the rest rejected with opened lines.
Follow-up for the orchestrator (not done, scope): no lockstep test ties types.ts lot fields to the whitelist (the cause of this class).

## UNVERIFIED
- The full suite (only the station runs it); the five named test files were not run (rule 18), proved by their generator and gate commands.
- The pre-commit related run was skipped by the hook ("no staged src/ or scripts/ source files"), so AC3's "related run green" is the hook set passing, not a test run.
- The census mirror equality is by my diff only; no lock test seen.
- Task file Files: line added after the fix commit (the hook warned on the commit).
