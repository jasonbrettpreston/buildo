# BL-T122 REPORT (task-122, 6c.8a, record-only)

Status line (Spec 137 rule 3): BL-T122 · task-122 · RR-0301 (MORNING-DECISIONS.md:1160, operator verbatim "task 341 approved")

## 1 Verification of the committed tree (read, not trusted)
$ git show --stat 40cbd77b1 (head of this branch; task-121 lane BL-MB94C): 113 files, 538 insertions, 110 deletions
40cbd77b1 feat(126_maxbld_surface_standard): MB-94 (c) recut to the Spec 126 R-2 literal: not_in_engine_population on every option of a no-row lot (6c.5a)
 .cursor/MCFRONTEND-QUEUE.md                                                                    |   1 +
 scripts/surfaces/_schema/report-presentation.json                                              |   1 +
 scripts/surfaces/_schema/seed-report-v2.mjs                                                    |   1 +
 src/lib/admin/report-preview-live/project.ts                                                   |  12 +++-
 src/tests/admin-report-preview-live.logic.test.ts                                              |  38 ++++++++++-
 src/tests/surfaces/engine-inputs-bind.logic.test.ts                                            |  40 ++++++++++++
 113 files changed, 538 insertions(+), 110 deletions(-)

$ file counts in 40cbd77b1: fixtures/goldens vs other
golden/fixture json files changed: 105

## 2 Check reruns (this worktree, head 65b897c64)
$ node scripts/surfaces/surface-validate.mjs --check
surface-validate current; S-gen ok · S-golden ok (18 states x 4; owed 13 states / 52 files) · S-parity ok · binding ok · closed-status ok · budget WAITS MF-08 · S-desc ok (examined 33 in scope: converted 17, pending 3, parked 9, report 4) · S-screen ok (17 surfaces, 98 goldens) · S-sbind ok (17 surfaces, 424 strings)
rc=0
$ node scripts/analysis/report-schema.mjs --check
report-schema current; RS-0 PASS · RS-1 PASS · RS-2 PASS · RS-3 PASS · RS-4 PASS · RS-5 PASS · RS-6 PASS · RS-7 PASS · RS-8 PASS · RS-9 PASS · RS-11 PASS
$ node scripts/surfaces/_schema/seed-report-v2.mjs --check (first line; rest are 124 informational "labels owed" lines)
rc=0
seed-report-v2 current (decl, presentation, rulings, catalogue fields reproduce from report-v2-seed/)
$ npx tsx scripts/surfaces/report-capture.ts --check
report-capture checked 72 goldens; 0 stale
$ npx tsx scripts/surfaces/report-page-capture.ts --check
page goldens current (40 and the landing sample)

## 3 Comparison with the old staged tree (~/Buildo-wt-mb94c, read-only; head bcb018f45)
$ git -C ~/Buildo-wt-mb94c status --short
M  scripts/surfaces/_schema/report-presentation.json
M  scripts/surfaces/_schema/seed-report-v2.mjs
M  src/lib/admin/report-preview-live/project.ts
M  src/tests/admin-report-preview-live.logic.test.ts
A  src/tests/surfaces/engine-inputs-bind.logic.test.ts
(plus untracked mobile/node_modules only; no unstaged change)
File list: the old tree's 5 files are all in 40cbd77b1; nothing present there and absent here at file level. The commit adds the generated goldens (105 json), .cursor/MCFRONTEND-QUEUE.md (+1 note) and docs/reports/reviews/task-121/context-2026-11-19.md.
Hunk level (diff of the changed lines of each of the 5 files, old staged vs 40cbd77b1), every difference is a deliberate recut, none is a lost line:
- report-presentation.json, seed-report-v2.mjs: sentence "Not yet evaluated." (with period) in the old tree; "Not yet evaluated" (R-2 literal) here.
- project.ts: old gate `stamp !== null && !gated && stored.length === 0`; here `stored.length === 0` (per lot, whatever its stamp or gate).
- admin-report-preview-live.logic.test.ts: present only in the old tree: the test 'an unstamped lot (gate unknown) is not labelled' and 'a gated lot keeps its gate: no reason'. They encode the narrowing the literal reverses; here the cases are inverted (unstamped and gated no-row lots ARE labelled; the gate verdict is kept in lineage.freshness) and extra cases added.
- engine-inputs-bind.logic.test.ts: header comment text and the sentence assertion (key built from the exported constant NOT_IN_ENGINE_POPULATION).
Result: the old staged tree holds nothing the recut lacks except the superseded stamp/gate narrowing. The stale worktree is good for nothing now; the orchestrator may ask the operator about removing it (I did not touch it).

## 4 The MB-94 row note (.cursor/MCBYLAWS-QUEUE.md, inserted above the 2026-11-17 note; status line unchanged)
- Dated note 2026-11-19 (M-246, prior text kept; task-122 6c.8a · McIncrement plan · lane BL-T122; operator, verbatim: "task 341 approved", ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1160, RR-0301): part (c) is committed as 40cbd77b1 (lane BL-MB94C, task-121), recut to the Spec 126 11a.3 R-2 literal (docs/specs/02-web-admin/126_maxbld_surface_standard.md:809): `not_in_engine_population` on every option of a lot with no stored Layer 3 rows, whatever its stamp or gate. The old staged tree in ~/Buildo-wt-mb94c is superseded and holds nothing the recut lacks (compared by BL-T122). Not pushed yet; the other parts and the status line are unchanged.

## 5 UNVERIFIED
- The commit's own sha is not inside this report (it cannot be); see the final message.
- The task-121 report claim that the related run was 102 tests green: not rerun (no test runner call allowed); the five --check generators above were rerun.
- The origin sha of the recut (56945a128 in the task-121 final summary) differs from this branch's 40cbd77b1; not compared (read of origin not needed for the record).
