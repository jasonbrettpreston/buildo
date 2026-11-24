# McFixReborn group G2: output review context

## Task
McFixReborn group G2 (lookup library, report projection, settings), read at board commit 8dba70e8e. This is one output review of code that is already built and landed. Tasks homed in this group: task-69, task-123, task-266, task-318, task-333, task-372. Files of other tasks read here: task-381 and task-383 (one test each), task-395 and task-406 (scripts/seeds/logic_variables.json), task-411 (admin-report-preview-live test).

## Description
The material is every hand-written core file of the group, each read once. A whole file comes as a creation diff from the empty tree; three files come as changed parts only (src-sql-ledger.mjs, logic_variables.json, control-panel.logic.test.ts). Judge the files as they stand against the pasted rule list. There is no plan in this review: judge the output only. Generated files, fixtures, lane records and documents are left out on purpose and are not a finding. A file outside the pasted material is not a finding either; write "cannot see" instead.

## Acceptance criteria
- task-69: backlog/tasks/task-69 - 1.4-Search-parser-direction-guard-after-the-match-and-unit-token-strip-join-key....md, Acceptance Criteria from line 75
- task-123: backlog/tasks/task-123 - 1.3-MB-44-W-customer-scoped-read-module-behind-MAXBLD_WEB_LIVE-pinned-false-display....md, Acceptance Criteria from line 75
- task-266: backlog/tasks/task-266 - LOAD.1-Start-the-one-lot-report-calculation-the-moment-the-user-picks-an-address-on....md, Acceptance Criteria from line 65
- task-318: backlog/tasks/task-318 - SRCH.ROUTE-Search-identifies-the-case-and-routes-it-two-or-more-parcels-at-one....md, Acceptance Criteria from line 54
- task-333: backlog/tasks/task-333 - SRCH.FUZZY-Mis-typed-address-resolves-to-candidates-through-the-permit-pipeline-address-spec-matcher-same-module.md, Acceptance Criteria from line 36
- task-372: backlog/tasks/task-372 - FIX.PROJ-Report-projection-freshness-compares-the-whole-stamp-the-sq-ft-factor-and-the-lot-size-window-are-settings-a-property-test-on-rounding-D1-D2-D9-D6.md, Acceptance Criteria from line 32

## Decisions naming this task
- RR-0387 (operator, 2026-11-22): each built task's output is reviewed, a separate grounder rules every finding, confirmed defects go to fix tasks.
- RR-0408 (operator, verbatim): "Approved. You normally make mistakes looking at so many tasks - ensure you do the merge correctly with the right files. As you suggested keep the review calls small."
- RR-0414 (operator, verbatim): "4. changed parts only as per your recommendation" (the oversized files are read as changed parts).
- RR-0431 (operator, verbatim): "We only want to review the same set of files once - that is the objective and just the output"
- RR-0433 (operator): tasks 381, 383, 390, 395 and 411 were folded as they stood; this group review is their one output review.
- RR-0439 (operator): each call is at most 120,000 characters; each rule list reads only the files the rule table names for it.

## Implementation Notes
Left out of every group: generated files (their generators are checked by the commit hooks), test fixtures and goldens, documents, lane and review records, backlog cards. Changed-part bases: scripts/analysis/src-sql-ledger.mjs from b5d77c14b^, scripts/seeds/logic_variables.json from 2744b12df^, src/tests/control-panel.logic.test.ts from 2744b12df^. Round rule (RR-0385): CRITICAL, HIGH and MED findings are resolved; LOW and NIT are recorded.
