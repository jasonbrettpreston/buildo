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

## Addendum: S-sbind pins 414 -> 418 (orchestrator request), commit 356d10b52
Cause: the four card-line keys in scripts/surfaces/parcel_product/F01/surfaces/mobile_parcel_disambiguation_map.content.json:5-8 (lot.lead.house, lot.lead.no_building, lot.lead.no_building_faces, lot.lead.house_faces; lot.letter at :4 predates). `git diff 2b01c2237^ 56e96eed5` on that file: 4 added, 0 removed (lot.lead.faces added in 2b01c2237, removed in 56e96eed5). The suite.log diff itself already showed 418 against 414 (suite.log:2995-3000).
Full-line comparison: real output "...S-screen ok (17 surfaces, 98 goldens) · S-sbind ok (17 surfaces, 418 strings)"; the FE-13 expected line differed only in 414 vs 418 (all other segments identical); C-1 expected the two notes, differing only in 414 vs 418.
Pins moved with dated comments in surface-validate.logic.test.ts and surface-conformance.logic.test.ts (earlier comments kept).
Related run in the hook executed both files: "Test Files 2 passed (2), Tests 95 passed (95)" (commit2.out).
| case | assertion in suite.log | what satisfies it now |
| consumer-registry T3 | checkRegistryFresh().fresh true (:2905) | consumer-registry.mjs --check "is fresh" |
| consumer-registry T5 | 980 vs 982 rows (:2924) | registry has 982 rows |
| contract-binding FE-32 b | sbindArm(ctx).findings equals [] (:2943) | S-sbind ok, no findings |
| mcfront-proof canary b control | green(runCli(GATE --check)) at test:174 exit 0 (:2965) | surface-validate --check rc=0; the three report locks (genOnly, binding, noMaths) carry no S-sbind count, not run: UNVERIFIED |
| surface-conformance C-1 | :247 notes (:2985) | 418 pin, hook related run passed |
| surface-validate FE-13 | whole line (:3012) | 418 pin, hook related run passed |
Still UNVERIFIED: the full suite (station only); contract-binding, gate-consumer-registry and mcfront-proof were not run by the hook (not related to the staged files).
