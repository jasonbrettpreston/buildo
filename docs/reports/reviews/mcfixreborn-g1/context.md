# McFixReborn group G1: output review context

## Task
McFixReborn group G1 (web report page, surface registry and lead detail), read at board commit 8dba70e8e. This is one output review of code that is already built and landed. Tasks homed in this group: task-332, task-374, task-384, task-411. Files of other tasks are also read here: task-320, task-353, task-387, task-390, task-395.

## Description
The material is every hand-written core file of the group (37 files), each read once. A whole file comes as a creation diff from the empty tree; 2 file(s) come as changed parts only. Judge the files as they stand against the pasted rule list. There is no plan in this review: judge the output only. Generated files, fixtures, lane records and documents are left out on purpose and are not a finding. A file outside the pasted material is not a finding either; write "cannot see" instead.

## Acceptance criteria
- task-332: backlog/tasks/task-332 - SRCH.FOOTER-Shared-web-footer-component.md, Acceptance Criteria from line 65
- task-374: backlog/tasks/task-374 - FIX.FOOTER-Web-report-footer-links-use-the-router-and-meet-the-44-px-target-D7-D8.md, Acceptance Criteria from line 27
- task-384: backlog/tasks/task-384 - STD.REPORT-OWN-The-web-report-renderer-gets-a-census-owner-and-comes-under-the-existing-text-component-and-44-px-checks.md, Acceptance Criteria from line 32
- task-411: backlog/tasks/task-411 - FIX.AREA-FACTOR-The-lead-detail-API-serves-the-area-already-converted-the-two-typed-phone-copies-of-the-factor-are-deleted.md, Acceptance Criteria from line 0

## Decisions naming this task
- RR-0387 (operator, 2026-11-22): each built task's output is reviewed, a separate grounder rules every finding, confirmed defects go to fix tasks.
- RR-0408 (operator, verbatim): "Approved. You normally make mistakes looking at so many tasks - ensure you do the merge correctly with the right files. As you suggested keep the review calls small."
- RR-0414 (operator, verbatim): "4. changed parts only as per your recommendation" (the oversized files are read as changed parts).
- RR-0431 (operator, verbatim): "We only want to review the same set of files once - that is the objective and just the output"
- RR-0433 (operator): tasks 381, 383, 390, 395 and 411 were folded as they stood; the group review is their one output review.
- RR-0439 (operator): each call is at most 120,000 characters; each rule list reads only the files the rule table names for it.

## Implementation Notes
Left out of every group: generated files (their generators are checked by the commit hooks), test fixtures and goldens, documents, lane and review records, backlog cards. Changed-part bases: scripts/surfaces/_schema/seed-report-v2.mjs from bf36c2cc2^; scripts/surfaces/parcel_product/F06/surfaces/web_landing.sample.json from f00af29ed^. Round rule (RR-0385): CRITICAL, HIGH and MED findings are resolved; LOW and NIT are recorded.
