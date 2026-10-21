# VERIFY-28 (read-only, R-EZ), 2026-10-21

Targets: wf1/layer2-prereq-1 (lane C, 10ead5bf) and wf1/coa-tools-2 (lane D, 8ea488df), both on edd18529.
Method: throwaway detached worktrees under verify-28/ (removed without --force), no repo edits, no DB.

## Verdicts
- Lane C, wf1/layer2-prereq-1: PASS-WITH-NOTES
- Lane D, wf1/coa-tools-2: PASS-WITH-NOTES

## Checks run on each tip (all clean)
- decision-log --check: C clean (101 decisions), D clean (108).
- spec-split-check --check: clean on both.
- generate-bylaw-layer2-input --check: clean on both. generate-bylaw-provisions --check: exit 0 on C. generate-step-handbook --check: up to date on D.
- Lane C vitest: bylaw-losers (11), bylaw-exception-closure (7), bylaw-layer2-vocab (12), bylaw-eval-perf (4), decision-log (42), bylaw-golden-lots (cases.json fresh); the whole `src/tests/bylaw*` + spec134 set: 82 files, 3335 passed.
- Lane D vitest: coa-scorecard (8), decision-log (43), handbook-rule-map (26), spec132-handbook-roles (18), all pass.
- Merged lanes A+C in a throwaway tree (docs conflicts left unresolved, code merged): closure, losers, vocab, eval-perf, bylaw-fix-4d-a, golden-lots all pass.

## Lane C findings
1. Ruling fidelity. L2-LOSERS, L2-CLOSURE, L2-CHAPTERS are exactly what the cards say. L2-CLASSES is a grounded reading, not an overreach, but the register row overstates it.
   - The card said "needs definition ... rule on the five-class list and which are new" and the operator clicked approve with only "completed teh rulings - proceed" (page-4d.json has no operator_note). So the lane inferred the answer.
   - The inference is sound. Layer 2 plan:253-255 and Spec 78 P5.1 (78:723) name the five classes; four already existed in vocab scenario_class_units; only house_with_secondary_suite was missing. The plan's "three suite classes" is contradicted by its own list.
   - house_units 2 is grounded: EXT-prov-1 (external.json:39-43, excerpt at :41) is Planning Act s.35.1(1)(a) "two residential units in a detached house ... if all ancillary buildings contain no more than one unit". The suite is inside the house, so 2, ancillary 0.
   - NOTE: M-298's status says "RULED ... five-class list confirmed". The operator never defined it. house_units = 2 is the lane's reading (laneC/NOTES.md says it is a one-line change to 1, plus the sha pin). Suggest the row say "reading adopted, operator to confirm house_units 2". It is also read by provincial scope (evaluate.mjs:658 unit_configurations), so it is not cosmetic.
2. losers[] is additive. Nothing named `losers` existed at edd18529 (git grep empty).
   - The eval-perf pin 3815ff0a is unchanged; the test only drops the key `losers` (JSON replacer, any depth). It cannot hide another change.
   - Corroboration: layer2-input body_sha256 is unchanged (8261886...; only table_version and evaluator_version moved, as expected), cases.json golden is fresh (contains no `losers`), and the 82-file by-law suite is green.
   - Merge rule: commonLosers (evaluate.mjs ~1021) keeps only entries (unit, dropped_by, by, arg) that every building type or every undecided resolution agrees on; a missing list counts as empty. It is deterministic and conservative (an entry that differs by type is dropped, not guessed).
   - Minor: the rule2_arg_displaced entry is recorded without a valueSet.has(v) check, unlike rule2_displaced and condition_false. Harmless today.
3. exceptionClosure. On the C tip behaviour is identical: the gate's old inline BFS is replaced by the shared walk (same order, same cycle handling, same excOf rule via excOfUnit).
   - Probe on the real assembly at C: 0 INCLUDE units carry include_ref, so every real lot's closure is [lot.exception] and gate outcomes cannot differ. Golden cases.json is fresh.
   - Lane A (3f85ed1c) adds include_ref in assembly.mjs for INCLUDEs resolving to 900.[2-6].10(n) rows. Probe on the A+C merge: 64 INCLUDE units now link (for example 900.2.10(851) -> closure [851, 4, 7]).
   - Prediction: the combined effect is a deliberate widening. The gate, and Layer 2's closure, now walk the included exceptions, so a lot whose included exception is unauthored or pending now reports exception_not_authored:<included id>. That is lane A's intended fix.
   - No double derivation: C only reads u.include_ref and A only generates it. A+C merge is textually clean on evaluate.mjs and assembly.mjs. Worth one post-merge golden regeneration run to confirm cases.json stays fresh (it did in the throwaway merge).
4. M-297. vocab.exception_chapter = {R:2, RD:3, RS:4, RT:5, RM:6}. The test checks the keys equal the zone vocabulary, the migration-280 population list is covered, and the authored 900.n exception chapters equal the mapped set. pull-oracle.cjs now reads the vocab (no literal table).
   - NOTE: the two-way lock reads docs/reports/layer2-measure/pending-migrations/280_resolve_bylaws_logic_variables.sql, a hard path. It breaks when migration 280 moves at commit (1). The lane flagged this; the test must follow the file.
5. M-298 cellKey test is real: it uses bylaw-resolution.js cellKey with the real read paths. House vs houseplex differ via building_type; house vs house_with_secondary_suite differ via flags.has_secondary_suite; a read set without building_type collides (the hazard). The sha pin is bcb00d6a... .
6. Conflict prediction involving C (merge-tested pairwise in a throwaway tree):
   - A+B conflicts: layer2-input, provisions (json and md), code-findings, field-inventory (json and md), 69a, adjudications.json, vocab.json, decision-log test.
   - A+C: layer2-input, field-inventory (json and md), 69a, decision-log test.
   - B+C: the same set as A+C.
   - A+D, B+D, C+D: only 69a and the decision-log test.
   - evaluate.mjs and bylaw-eval-perf.logic.test.ts merge without conflict across A, B and C. B re-pins eval-perf to 751d494c; C's noLosers hunk is in a different region. After the merge the B pin should still hold, because the hash is computed with losers stripped and B adds none. Re-run eval-perf after merge to confirm.
   - Generated files (layer2-input, field-inventory, provisions, code-findings) must be regenerated, not hand-merged.
   - Decision-log pin: each lane sets its own count (A 109, B 108, C 101, D 108, base 97). The merged value is 97 + 12 + 11 + 4 + 11 = 135 before integrate-20's own additions; integrate-20 already has a UU on decision-log.logic.test.ts.
   - Migration-number collision: C's pending migration 280 and D's parked ward migration 280 (named in R-JB).
   - Next-free counters: no lane moved a "next free" line. Ids are disjoint: C M-295..298; D M-305..312.
   - None of A, B, C, D touches precommit-budget.json or .husky, so integrate-20's UU on precommit-budget.json is its own. Integrate-20 also has UUs on 124a, 132, rule-map.json, decision-log test, 69a; D touches the first four of those, C touches 69a and the decision-log test, A and B touch 69a and the decision-log test.

## Lane D findings
1. Items against decisions: M-305 (D-TOOLS "ratify as written") matches. M-306 matches F-4D-13 (scorer only; A0486 (E)(ii) city_value 1.8). M-307 matches F-4D-20. M-309 (Kirknewton A0428/26TEY) and M-310 (basement) are data-folder entries (lot-files.json, not-coa-testable.json exist, values only), outside git. M-311 matches CHAT-45 (keep semi-detached; regex now accepts "semi-detached building").
   - M-308 covers F-4D-8/9/14 as a flag only. The "data fix" the operator approved for F-4D-9 (merge half-parcel) and F-4D-14 (frontage) is not made. F-4D-14 stays DIFFER because the survey frontage is not held. M-312 records the calculator override as OWED. This is stated, not hidden.
2. Scorecard reproduced exactly (rows and lots identical to laneD/scorecard-172-4d-lane-d.json). Baseline 330 M / 40 D / 113 NA / 42 DATA -> 329 / 39 / 111 / 21 DATA + 25 NOT SCORABLE. Accurate = M/(M+D) 89.2 -> 89.4; answered 66.1 -> 66.2 (denominator excludes DATA, NOT MODELLED, NOT SCORABLE). Flagged lots 34 of 172; 111 lots hold survey dimensions.
   - Index-aligned row diff vs scorecard-172-ee: exactly 5 non-trivial class changes plus 25 DATA -> NOT SCORABLE. Two DIFFER -> DATA (A0118, A0375), two NO ANSWER -> DATA (A0257, A0562), one MATCH -> DIFFER (A0247). Only one regression (A0247), as claimed. (My first pass showed more only because clause keys repeat within A0245; row-index comparison shows none there.)
3. Honesty of survey preference. DATA-explained rows are not counted as matches: the code sets class DATA, survey_flag, class_on_survey MATCH, and DATA is excluded from both percentages. The 4 relabelled rows therefore lift accuracy by removing misses, not by adding matches. The trade-off to report: 2 true DIFFERs left the numerator and denominator; one new DIFFER was added.
   - Survey dims are used for every lot with plan facts (111), not only flagged ones, so it is a scoring-input change, not only a flag. The asymmetry is by design: a row that matched on parcel dims but differs on survey dims stays DIFFER (that is A0247).
4. A0247/26NY (24 Balding Crt, 10.5.50.10(1)(C)). Survey frontage 14.6 m is an arc ("lot_shape_note": arc A=14.60, chord C=14.22, R=18.29); parcel frontage 27.84 m. The rule is threshold-based: 10.5.50.10(1)(B) 50% for frontage 6.0 m to less than 15.0 m; (C) 60% for 15.0 m or greater. With 14.6 we say 50%; the City says 60%.
   - By-law text, Ch.800.50 (445), ch800_50.txt: "Lot Frontage means the horizontal distance between the side lot lines of a lot, or the projection of the side lot lines, measured along a straight line drawn perpendicular to the lot centreline at the required minimum front yard setback."
   - It is a straight-line width between the side lot lines at the required minimum front yard setback, not the length of the street-line arc. A court bulb typically flares, so a width measured at the setback can exceed the arc or chord at the street line. The City's 60% implies it measured at least 15 m. The arc 14.6 is not the defined measure. Decision for the operator: what plan-facts "lot_frontage_m" should hold for irregular lots. Not decided here.
5. Tests. `coa-scorecard.mjs --check expected-4d.json` still passes only as CHECK INFO ("tree moved on from ac78d5dd"). expected-4d.json was NOT re-pinned (mtime 14:11, still ac78d5dd, DATA 29, MATCH 246). My run on the 123-notice set gives MATCH 245, NO ANSWER 68, DATA 19, NOT SCORABLE 12.
   - Consequence: the old lock is inert on any tree after ac78d5dd (it exits 0 whatever the totals). M-305(3) says so openly. The new 4D tests (F-4D-13, -20, -9, -8/9/14, CHAT-45) are real assertions but skip when the out-of-git data folder is absent (describe.skipIf), so CI without it enforces nothing. Suggest noting this, or pinning a 172 totals file.
6. R-JB (D-WARD). The ward patch is NOT in the branch: no change to scripts/lib, scripts/load-coa.js or migrations vs the merge base (git diff empty), and no captures or ledger touched. The parked patch stays in scratch (d-ward-parked.patch).
   - R-JB exists in 124a, the rule-map and handbook line ingestor.6. The statement says PARKED. But rule-map status is "active" with enforcement "lock" (the decision-log test, which only locks that the row exists), so the handbook now counts 249 locks and 364 rules, as if ward padding were enforced.
   - Allocated-but-unused is acceptable under the lane brief (R-JB..R-JE reserved), but I recommend marking it honestly: status "process" or a `unenforced` entry with "owed: capture night", as R-ES/R-HE do in prose. R-JB names migrations/280_coa_ward_two_digits.sql, which will collide with C's migration 280; the note says renumber at integration.
7. Lane D leaves no repo change to the pipeline: only the scorer, tests, register/ledger/rule-map text and the decision logs.

## Notes for the operator (ranked)
1. Confirm house_units 2 for house_with_secondary_suite, and soften M-298's wording from "confirmed" to "adopted".
2. A0247: the by-law's frontage is a straight-line width at the required minimum front yard setback; decide what survey frontage the plan facts should store for court lots.
3. Mark R-JB parked in the rule-map, not "active/lock".
4. After integration, regenerate layer2-input, field-inventory, provisions and code-findings; re-run eval-perf and golden-lots; expect the gate to widen on lots with INCLUDE links to unauthored exceptions.
5. Renumber migration 280 for one of C or D at integration.
