# Seat: reality-check: task-453 plan (PLAN-453-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board ~/Buildo-wt-board, branch wf2/board, head 9a10561ef. I read the whole task-453 file and FINDINGS-PLAN.md. I also read scripts/analysis/rule-lists.json and rule-lists.mjs, scripts/hooks/check-lane-close.mjs, backlog-lane.mjs, backlog-brief.mjs, review-template.js, proof-slice.mjs and proof-slices.json. On the test side I read the rule-lists, rule-lists-table, backlog-lane, check-lane-close and proof-slice logic tests where the plan cites them.

I ran no test runner, no database and no file write. Evidence came from `node --input-type=module -e` on a structuredClone of the real table with the plan's edits applied in memory. The edits were every_task=["plan-protocol"], output_off=["plan-protocol"], queue-137 and orchestrator-doc17 off lane-tools, backlog-lib.mjs in protected_paths, and the gemini-review.js glob on lane-tools.

## Checked and clean
- The data-line cites are right. rule-lists.json has protected_paths at :22, five-words at :24, queue-137 at :47, orchestrator-doc17 at :50, lane-tools lists at :165, no_files_default at :231 and every_task at :236.
- The code cites match the text the plan describes:
  - rule-lists.mjs:156-157, :270, :293-294 and :654.
  - check-lane-close.mjs :144, :147 (SEAT_LINE), :465, :489, :518-522, :633-658, :720-745, :752-753, :791 and :839-842.
  - review-template.js:138, proof-slice.mjs:146 (the spawnSync already has encoding utf8, so `.trim()` is safe) and backlog-brief.mjs:176.
- The edited table passes validateTable with 0 problems, before and after.
- The three fail-closed guards still pass with every_task holding one list:
  - validate (:156) returns nothing for ["plan-protocol"].
  - verifyResolved returns [] for every kind I resolved, build and fix.
  - With every_task emptied, validate (:156) and verifyResolved (:293) still refuse. check-lane-close.mjs:489 uses the same emptiness test, which I read but did not run.
  - Result: the plan's "guards pass unchanged" is true.
- Lists per task kind, before and after. "Out" is the output-stage set after outputLists; inc-S and ms-S are the same everywhere.

| Kind (Files entry) | Before | After (all lists) | Out |
|---|---|---|---|
| phone, `mobile/src/app/index.tsx` | mobile-90, 98, 99, surface-136, eng-front, eng-shared, five-words, plan-protocol | the same without five-words | without plan-protocol |
| server lib, `src/lib/parcels/report-compute.ts` | eng-back, eng-shared, step-132, five-words, plan-protocol | the same without five-words | without plan-protocol |
| lane-tools, `scripts/analysis/backlog-lane.mjs` | agents-s5-1to3, agents-s7-s11, queue-137, eng-all, orchestrator-doc17, five-words, plan-protocol | agents-s5-1to3, agents-s7-s11, eng-all, plan-protocol | without plan-protocol |
| migration, `migrations/334_...sql` | step-132, eng-back, eng-shared, five-words, plan-protocol | the same without five-words | without plan-protocol |
| spec, `08_agents.md` | eng-all, five-words, plan-protocol | eng-all, plan-protocol | eng-all |
| spec file under `src/tests/` | eng-all, five-words, plan-protocol | eng-all, plan-protocol | eng-all |

- Build and fix resolve to the same lists. Only the stage differs, as the plan says.
- T2 is real. `scripts/gemini-review.js` is refused today with "matched by no row". Step-pipeline's `not` list excludes it, and after the glob edit it resolves to the lane-tools lists.
- Item 3 test claims are real:
  - The only references to queue-137 and orchestrator-doc17 in the table are the two list definitions and :165.
  - backlog-lane.logic.test.ts :684 and :686 are the only stub uses, so "2 test lines" is right.
  - rule-lists-table.logic.test.ts:372 only asserts absence, so it stays green.
  - rule-lists.logic.test.ts :67, :70 and :74 assert absence on mobile, web and doc-16 files, so they stay green.
- Item 4 (step handbook list, no change) is true:
  - Only rows step-pipeline (lines 85/88) and compute-import (137/140) carry step-132. every_task, milestone_docs, increment_docs and kinds do not.
  - Nothing else attaches it, and the Glossary section of five-words is not in step-132's sections.
  - The open choice is real: migration 334 does resolve to step-132, eng-back and eng-shared.
- Item 2 test-line count holds. The plan's 8 lines in rule-lists-table.logic.test.ts (:30, :37, :38, :44, :49, :168, :210, :243) all contain five-words. The 6 spots in rule-lists.logic.test.ts (:72, :346, :377, :391-392, :465) bring it to about 14.
- Other five-words test uses stay green because the list definition stays. These are rule-lists.logic :347, :354/:357 (the STANDARDIZED... text of the Glossary), :965-966, :993-996 and :1105.
- plan-protocol.md:7 does contain the five principles, and rule-lists.logic :358 pins that text. The plan leaves the file alone, so the pin is safe.
- T7: contextRound at review-template.js:138 counts files. With context-r2 only it returns 2, and "highest plus 1" gives 3, so the AC #6 test is red first.
- ST5: proof-slice.mjs:63-66 accepts `notbuilt` with `blockedBy: []` plus a reason. proof-slice.logic.test.ts:228 lists chk3-nothing-new among the ids that must carry `expect`.
- F10 (check-lane-close.mjs:842): the `ownsTable` judge takes every_task from the board and the other pinned keys from the board, so adding output_off to the pin matches the existing pattern.

## rc#1 MED: the planned plan-prep change for fix tasks turns two existing backlog-lane tests red, and the plan lists neither
Plan: section 3 item 1, "rule-lists.mjs :654 plan-prep: a fix task also gets the output_off lists at the plan stage"; section 5 backlog-lane tests list only :684, :686, D4, D16 and the brief's out-stage ids.
Evidence: src/tests/backlog/backlog-lane.logic.test.ts:739 is the test `16: a fix task writes the plan lens outputs and no per-list inputs`. It asserts `expect(names(f, /^in-/)).toEqual([])` and that the `plan-*.txt` set equals the lens outputs only. B2 at :746 asserts `toEqual(['plan-error-paths.txt', 'plan-plan-review-deepseek.txt', 'plan-security.txt'])`. rule-lists.mjs:654 reads `const lists = type === 'build' ? r.lists : []`, and :659-671 write an `in-plan-<seat>-<id>` input and a plan output for every id in `lists`. With the real table's output_off of plan-protocol, a fix task would gain `in-plan-compliance-plan-protocol.txt` and `plan-compliance-plan-protocol.txt`. I read the code and tests but did not run them. I am not certain prepFixture uses the real table, though the plan itself says the fixture copies it.
Fix: add to section 5 that tests 16 (:739) and B2 (:746) are rewritten to expect the plan-protocol plan output and its input. Also state that "no per-list inputs" no longer holds for a fix task, which changes the intent of test 16.

## rc#2 MED: the S5 test case as written does not discriminate, so it is not red first
Plan: section 5 `S5`, "reason 'NIT-picking aside ...' with pile on a CRITICAL → refused"; section 3 item 5 S5, "'NIT' deep inside a reason no longer lowers the severity".
Evidence: I ran the old regex `/\b(CRITICAL|...|NIT)\b/` and the planned `/^\W*(...)\b/` on the same strings.
- "NIT-picking aside, this is a r..." gives NIT with both, because the hyphen is a word boundary. A pile on it passes before and after, so a "refused" expectation fails after the change and the test is not red first.
- "the nit is small but a HIGH ri..." gives HIGH before and undefined after.
- "a low-effort fix of a CRITICAL..." gives CRITICAL before and undefined after.
- check-lane-close.mjs:144 already slices the reason to its first 40 characters, so "deep inside" only means characters 1 to 40.
- "LOW: cosmetic only" (existing test :733) gives LOW with both.
Fix: replace the S5 case with one where the severity word is mid-reason, for example `the defect is real, not a NIT: ...`. Today it reads NIT and a pile is wrongly accepted. After the edit it reads null, falls back to the lens severity, and is refused. Reword "deep inside" to "after the first word".

## rc#3 LOW: the item 2 text-site list is partly wrong, and the "about 8" count is really 7 sites
Plan: section 3 item 2, "rule-lists.mjs :12, :156, :270, :287, :293, :543; check-lane-close.mjs :12, :486, :489".
Evidence: `grep -in five` over the tooling files finds "five words" at:
- rule-lists.mjs :156, :270, :293 and :543.
- check-lane-close.mjs :486 and :489.
- scripts/analysis/backlog-lane.mjs:80, `// V2.LIST (task-406): a launch whose lists lack the five words, the p...`. The plan omits this one, and backlog-lane.mjs is on the Files line.
Lines rule-lists.mjs:12, rule-lists.mjs:287 and check-lane-close.mjs:12 say only "every_task" generically and have no five-words wording, so they need no edit.
Fix: replace the list with rule-lists.mjs :156, :270, :293, :543; check-lane-close.mjs :486, :489; backlog-lane.mjs:80. That is 7 sites.

## rc#4 NIT: small line-cite misses in item 5 and item 6
Plan: section 3 item 5 T10 ":558: the catch keeps the error text"; item 6 T8 ":172"; item 5 T9 "backlog-lane.mjs:109".
Evidence: in rule-lists.mjs the `catch { p = 0; }` is on :555, and :558 is a bare `    }`. In backlog-brief.mjs, :172 is the Done-condition line and the `...ac.map(...)` line is :173. In backlog-lane.mjs, `const undo = fmt(board, [...'task','edit',taskId,'-s','LATER'...` is at :111.
Fix: cite :555, :173 and :111.

## UNVERIFIED
- The plan's check-lane-close line counts of 25 code and 55 test lines. I checked the cites but cannot count unwritten code.
- Whether prepFixture uses the real table for the fix cases (rc#1). I did not run the tests.
- A MERGE_HEAD scenario in the test harness, and the migration-334 comment-only edit against validate-migrations.sh. Both are already named in plan section 9.
- The page counts after regeneration. The generator was not run, and I wrote no file.

STATUS: 4 findings (0 CRITICAL, 0 HIGH, 2 MED, 1 LOW, 1 NIT); the data-line edits, guards, per-kind list results and step-handbook claim are all real, but the fix-task plan-prep change breaks two unlisted backlog-lane tests and the S5 test case does not discriminate.
