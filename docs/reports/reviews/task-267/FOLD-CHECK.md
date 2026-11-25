# Fold check: task-267 plan (PLAN-267-v2 as folded, round 1, FOLD-267.json)

Checked by: Cairn-Ground-P267

On the board working tree (~/Buildo-wt-board, head 1d1bd554a). I read the task-267 card as it now stands (77 pairs applied through the backlog CLI, round block appended, references added). I also read GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens inputs and outputs in docs/reports/reviews/task-267/. Everything below was computed by running the repo's own functions in memory (planHash, filesEntries, resolveTask, planGateErrors). I ran no test runner and wrote no file.

(1) PASS. All 77 pairs of FOLD-267.json are present exactly once. Each new text occurs once in the card. No old text remains except where the new text contains it, and none was lost or doubled. 75 pairs are in the Implementation Plan and 2 in the Description (the Files line and the Estimate).

(2) PASS. The card holds one round line: "Plan review round 1: 118 folded, 0 task, 0 ruling, 0 wontfix, 7 pile; grounder docs/reports/reviews/task-267/GROUNDER-PLAN.md; triage docs/reports/reviews/task-267/TRIAGE-PLAN.md". It equals TRIAGE-PLAN.md, which has 125 outcome lines: 118 folded and 7 pile. GROUNDER-PLAN.md holds 134 verdict lines: 125 CONFIRMED (1 CRITICAL, 38 HIGH, 68 MED, 16 LOW, 2 NIT), 9 REJECTED, 0 CONFLICT. The block holds 107 per-id outcome lines for the 107 CRITICAL, HIGH and MED ids. All 118 folded quotes of TRIAGE-PLAN.md are present in the card text (0 missing).

(3) PASS. The 13 Ruled lines match `rule-lists.mjs findings` (103 findings). The three Seat lines carry the shas of the committed seat files. All 134 ids are ruled, with no extra and no missing id. The card's references hold GROUNDER-PLAN.md, TRIAGE-PLAN.md and the three seat files.

(4) PASS with two notes. `filesEntries` returns the 45 entries of the Description's Files line. The regex finds `Files:` twice in the card. The second is the old stage-1 dated note in the Notes section, and `filesEntries` reads the first match, which is the new Description line, so the Files line is read once. 43 entries exist on disk. The two that do not are the planned new files src/tests/surfaces/report-failure.logic.test.ts and mobile/__tests__/reportChecked.behaviour.test.tsx. The same two are untracked, which is expected for files this lane creates. There is no unmatched path.

(5) ONE LAUNCH-GATE REFUSAL, not a defect of the fold text. `planGateErrors` for lane BL-MCFIX267, on the card as it stands, with the working-tree folder, this file and the Plan line added in memory, resolves 9 lists, rules 134 findings and returns 1 error. The error is that list `step-132` (docs/specs/01-pipeline/132_step_standard_handbook.md) has no valid compliance lens output in the folder (plan-compliance-step-132.txt).

Cause: before the fold the card had no Files line, so it resolved the 8 default lists, all with lens outputs. The new Files line is the one complete line the round asked for. It names three generated `*.descriptor.json` files, and the `step-pipeline` row of rule-lists.json (`scripts/**/*.descriptor.json`) attaches `step-132` for them. Cards 454 and 465 resolve `step-132` the same way and their folders hold no such output either, so I expect the same refusal there.

Why a pair cannot fix it: removing the three descriptor paths would leave the close check unable to cover the regenerated descriptors, and the plan says never to edit a descriptor by hand. Adding a directory entry to avoid the glob would be tricking the gate.

Remedy, not mine to do (it needs a model call): the orchestrator runs the plan compliance lens for list `step-132` (`rule-lists.mjs lens-input --list step-132 --material-from context-r1.md` and the review tool), committing plan-compliance-step-132.txt with its in- input. The grounder then rules its findings by appending verdict lines, the Ruled line and TRIAGE outcomes. If any new finding is CONFIRMED at MED or above, the round line and block change, so the Plan line below must be recomputed. If it yields no CONFIRMED findings, only the Ruled line and the Plan line change if the card text changes.

(6) PASS. The head name a4a092bad inside the fold text (the FOLD paragraph and the UNVERIFIED line) names the head at which the cited lines were re-read. It stays true, because after it only backlog and task-465 evidence docs moved. No pair is needed. The numbers in the text (the 77 pairs, 45 Files entries) are right.

(7) Claims of the fold re-checked at head 1d1bd554a. These are the lines my verdicts and the fold cite: `route.ts` 74-123, `lookup-flow.ts` 79-93, `useParcelLookup.ts` 18-137, `[parcelId].tsx` 23-37, `what-we-checked.ts` 51-167 and `report-compute.ts` 75. They were also verified at the verdict stage with a quote check on each cited line.

Verdict: PASS (the fold, items 1 to 4 and 6). The launch gate additionally needs the `step-132` compliance output of item 5 before the Plan line is final.

Plan: task-267 sha256:32cfc70500ac
