# TABLE.md: slice S, run on committed head 0918e53a8 (tool commit e641ff7be + fix 0918e53a8), 2026-11-19

`node scripts/analysis/proof-slice.mjs --slice S --out <dir>` rc=3; per-row evidence files in the --out dir.

| row | proof | result | evidence | unblocked by |
| --- | --- | --- | --- | --- |
| surface-validate | Search, lot map and semi pages: every declared state has its golden, no drift (S-gen, S-golden, S-parity, binding, S-desc, S-screen, S-sbind). The S-golden count 'owed 13 states / 52 files' is the REPORT manifest, not these pages | PASS | /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/proof2/slice-s/surface-validate.txt | - |
| search-goldens | Search page goldens equal what the binding renders (10 states) | PASS | /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/proof2/slice-s/search-goldens.txt | - |
| lotmap-goldens | Lot map goldens equal what the binding renders (11 states) | PASS | /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/proof2/slice-s/lotmap-goldens.txt | - |
| semi-goldens | Semi question goldens equal what the binding renders (8 states) | PASS | /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/proof2/slice-s/semi-goldens.txt | - |
| mobile-jest | The three pages behave and the Daylight look is pinned (7 mobile jest files: parcelScreens, lotMapScreens, semiQuestionScreens, daylightSearchPages goldens; three behaviour files) | NOT BUILT [not run by this tool: duration unmeasured, and the lane rule refuses the test-runner call; the PLAN gives no other way to measure it] | - | - |
| chk3-nothing-new | CHK.3 nothing-new policy check over the tree | PASS | /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/proof2/slice-s/chk3-nothing-new.txt | - |
| chk5-mcstorage | CHK.5 McStorage writes only to a declared record table | NOT BUILT [WAITS CHK.5 in the check's own output] | /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/proof2/slice-s/chk5-mcstorage.txt | - |
| suite-on-tip | Hooks plus full suite on the current tip (reads the push station pass file; never runs the suite). A landed commit already passed the pre-commit chain (Airtight V3 / Spec 132). The suite also covers the address routing, parser guard, lookup resolution and no-client-maths checks listed here (covers: src/tests/search-routing.logic.test.ts, src/tests/parcel-lookup-resolution.logic.test.ts, src/tests/search-parser-guard.logic.test.ts, src/tests/surfaces/report-no-maths.logic.test.ts) | GAP [no pass file given] | - | - |
| design-fit | Design fit (RS-12): every stored value maps to a designed element (RR-0306: printed as not built) | NOT BUILT | - | task-345, task-67 |
| loading-from-pick | Loading screen from the search pick: compute starts at the pick, button only when report and See details are loaded | NOT BUILT | - | task-266, task-267 |
| load-failure-page | Load-failure page when a lot's report or See details fails to load | NOT BUILT | - | task-317 |
| report-opens | The report opens for the lot (hand-off ends at the report); the customer read returns null today | NOT BUILT | - | task-123 |
| screenshots-25-lots | (a) One screenshot per golden lot (25) of the scenario page on the test stack | NOT BUILT | - | task-123, task-265 |
| elements-number-or-word | (b) Every main and See details element shows a number or the exact words 'Not yet evaluated' on a real lot | NOT BUILT | - | task-123, task-265 |
| key-match | (c) Every number equals the McProof key | NOT BUILT | - | task-123 |
| storage-probes | (d) Storage: opened once is stored with its stamp, a stale stamp is recomputed, no record for an unopened lot | NOT BUILT | - | task-265 |

PASS 5 · FAIL 0 · NOT BUILT 10 · GAP 1 · exit 3
