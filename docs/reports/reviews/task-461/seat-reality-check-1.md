# Seat: reality-check: task-461 plan (PLAN-461-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and wrote no file in the repo; no word of the findings below is the orchestrator's.


Basis: board head 2c902a184 (wf2/board; the plan read 492ef72c7). Files read: the task-461 card in full, mobile/__tests__/lotForm.test.ts, mobile/src/lib/schemas.ts:418-442, mobile/__tests__/schemas.test.ts:320-342, mobile/package.json (jest block and test:ci), ~/Buildo-scratch/lanes-20261124/phone-5af0f7be2.out, the task-450 card :59 and :314, FOLD-PLAN.md:47, GROUNDER-B.md:86, src/tests/parcel-lot-form.logic.test.ts:145-148, src/app/api/parcels/lookup/types.ts:135-141. I did not read FINDINGS-PLAN.md, because task-461 has no review folder beyond context-r1.md. No database connection was made, no runner was run, and nothing was written.

## Checked and clean
- The red line is real. lotForm.test.ts:71 is the exact `{ ...form(true), extra: 1 }` payload with `.toBe(false)`. The output has the failure at `lotForm.test.ts:71:115` (out lines 91 and 97, repeated at 315 and 321). The plan's "81-97 and 305+" is correct.
- The plan's `git diff --stat 5af0f7be2 HEAD -- mobile/` empty claim holds at my head too. The diff printed nothing, so the failure still applies.
- The schema is plain. schemas.ts:425-429 is a plain `z.object` with two closed enums and a boolean. The dated note is at :423-424 and the text matches. `lotForm: ParcelLotFormSchema.nullable().optional()` is at :440. Zod strips the extra key, so the moved line will return true.
- The `form(true)` fixture (line 19) gives semi_half, doubt_multi_parcel_abut and unsure true. Both enum values are in the schema's lists.
- The suite counts match. The out file summary reads "Test Suites: 13 failed, 45 passed, 58 total; Tests: 1 failed, 722 passed, 723 total". There are 13 distinct FAIL suites: lotForm, 11 on '@testing-library/react-native' (22 mentions, two per report), and 1 on 'tailwind-merge' (reportScreens.golden). So the plan's 12 suites that cannot start is right. After the edit the totals should be 12 failed suites and 723 passed tests, with none failed. A move of one line keeps the test count at 723.
- schemas.test.ts is as cited. The task-450 lock is at :324-341, the extra-field case at :329, the lookup-result case at :333-335, and the unknown-enum throw at :339.
- Quotes check out. Task-450 AC3 text matches card :59. FOLD-PLAN :47 and the task-450 card :314 ("NOT PROVEN BY THE COMMIT HOOK: the mobile jest tests") both match the plan's quotes. GROUNDER-B :86 is a D1 line, and I read only its start.
- The server schema is `.strict()` at types.ts:141, and the "strict and closed" test is at parcel-lot-form.logic.test.ts:145-148. Both match the plan's section 5. They are the server schema and are correctly left out of this card.
- jest config in mobile/package.json:82-93 sets no coverageThreshold, so `test:ci` (`jest --coverage --ci`, :11) on a single path cannot fail on coverage.
- mobile/node_modules is a symlink to ~/Buildo/mobile/node_modules, as stated. `git status` shows it as untracked (`?? mobile/node_modules`).
- Of the files the plan lists, only lotForm.test.ts has the lot-form assertion: the only git history line shown for it is cfb4dffee (SEMI-B), which added it. Whether another phone test asserts the old strict form is UNVERIFIED by me. I did not re-grep mobile/__tests__ for the plan's section 5 claim.

## rc#1 NIT: the "one-line change" step runs `test:ci`, which writes a coverage folder
Plan: section 4, "How the lane proves green" (`test:ci` script, mobile/package.json:11).
Evidence: mobile/package.json:11 `"test:ci": "jest --coverage --ci"`. Running it on one file writes a coverage/ directory under mobile/ in the lane's worktree. I did not check whether that folder is gitignored.
Fix: tell the lane to check `git status` after the run and not stage the coverage output, or to run the file without `--coverage`.

## rc#2 NIT: the plan's line numbers are from 492ef72c7, not the head I read
Plan: header, "Board head read: 492ef72c7".
Evidence: the mobile/ diff from 5af0f7be2 to HEAD is empty, so mobile/ line numbers are unchanged at 2c902a184. The task file and the queue row may have moved, so the plan's DoD #6 queue-row line is the only place a head difference could matter.
Fix: none for the code. The lane should re-read the queue row at its own head.

STATUS: 2 findings (0 CRITICAL, 0 HIGH, 0 MED, 0 LOW, 2 NIT); every fact and count in the plan matches the code and the 5af0f7be2 output, with nothing that blocks the one-line test change.
