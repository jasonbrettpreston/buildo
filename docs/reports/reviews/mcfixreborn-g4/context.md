# McFixReborn group G4: output review context

## Task
McFixReborn group G4 (review and lane tooling), read at board commit 8dba70e8e. This is one output review of code that is already built and landed. Tasks homed in this group: task-68, task-358, task-363, task-365, task-366, task-369, task-375, task-399, task-406, task-407, task-410, task-412, task-418, task-419, task-423, task-432, task-433. Files of other tasks are also read here: task-384.

## Description
The material is every hand-written core file of the group (31 files), each read once. A whole file comes as a creation diff from the empty tree. Judge the files as they stand against the pasted rule list. There is no plan in this review: judge the output only. Generated files, fixtures, lane records and documents are left out on purpose and are not a finding. A file outside the pasted material is not a finding either; write "cannot see" instead.

## Acceptance criteria
- task-68: backlog/tasks/task-68 - PROOF.TOOL-Page-proof-tool-build-approach-4.2-no-live-lot-renderer-exists-one....md, Acceptance Criteria from line 66
- task-358: backlog/tasks/task-358 - REVIEW.LENSES-The-repo-review-runs-the-Spec-08-DeepSeek-lens-set-compliance-code-review-user-experience-error-paths-security-not-one-generic-round.md, Acceptance Criteria from line 28
- task-363: backlog/tasks/task-363 - PROOF.S-2-proof-slice.mjs-reject-a-null-suite-and-bad-timeout-exit-2-on-an-unwritable-out-dir-correct-the-report-opens-blocker.md, Acceptance Criteria from line 39
- task-365: backlog/tasks/task-365 - COMPLY.1-Handbook-compliance-pass-on-the-unpushed-1·B-change-clause-packs-for-Spec-122-McFrontend-McStorage-McIncrement-and-McLanes-one-DeepSeek-compliance-run-per-handbook-findings-for-a-separate-grounder.md, Acceptance Criteria from line 29
- task-366: backlog/tasks/task-366 - COMPLY.2-Launch-script-attaches-the-governing-rule-lists-by-touched-path-the-close-gate-refuses-a-task-without-the-compliance-lens-output-per-list-and-a-separate-grounder-verdict.md, Acceptance Criteria from line 33
- task-369: backlog/tasks/task-369 - COMPLY.5-Second-handbook-pass-Specs-126-127-128-and-the-full-Spec-135-register-rows-against-the-surface-and-phone-parts-of-the-pushed-1·B-change.md, Acceptance Criteria from line 30
- task-375: backlog/tasks/task-375 - FIX.TOOLS-Review-and-proof-tooling-the-lens-line-passes-the-rule-context-the-security-lens-fires-for-admin-and-PII-the-review-template-substitutes-safely-proof-slice-reads-its-limits-from-settings-D11-D10-two-review-tool-defects.md, Acceptance Criteria from line 41
- task-399: backlog/tasks/task-399 - FOLD.ADOPT-A-confirmed-finding-must-carry-an-outcome-counted-bulk-rulings-below-HIGH.md, Acceptance Criteria from line 38
- task-406: backlog/tasks/task-406 - V2.LIST-The-definitive-compliance-list-every-kind-of-work-and-every-increment-task-resolves-to-its-rule-documents.md, Acceptance Criteria from line 0
- task-407: backlog/tasks/task-407 - V2.LAYOUT-The-brief-states-where-review-files-go-and-the-close-check-reads-that-place.md, Acceptance Criteria from line 0
- task-410: backlog/tasks/task-410 - V2.WHOLE-The-compliance-review-covers-the-whole-change-and-the-close-check-proves-it.md, Acceptance Criteria from line 0
- task-412: backlog/tasks/task-412 - FOLLOWUPS.ROW-review_followups.md-gets-a-rule-list-row-so-a-deferral-has-its-Spec-08-home.md, Acceptance Criteria from line 50
- task-418: backlog/tasks/task-418 - LAUNCH.PREP-The-steps-before-a-build-launch-run-from-one-command.md, Acceptance Criteria from line 48
- task-419: backlog/tasks/task-419 - LAUNCH.GAPS-The-fold-check-leaves-a-record-and-a-one-file-review-keeps-one-name.md, Acceptance Criteria from line 49
- task-423: backlog/tasks/task-423 - PROTOCOL.SIMPLE-One-compliance-review-on-the-plan-and-one-on-the-output-against-rules-sections-no-review-of-paperwork.md, Acceptance Criteria from line 48
- task-432: backlog/tasks/task-432 - INPUTS.4-Fresh-review-context-every-round-the-reviewer-sees-the-rulings-and-task-state-as-they-are-at-that-round.md, Acceptance Criteria from line 0
- task-433: backlog/tasks/task-433 - INPUTS.5-A-rules-checked-line-the-reviewer-lists-the-rule-ids-it-judged-met-and-a-script-flags-a-rule-never-mentioned.md, Acceptance Criteria from line 0

## Decisions naming this task
- RR-0387 (operator, 2026-11-22): each built task's output is reviewed, a separate grounder rules every finding, confirmed defects go to fix tasks.
- RR-0408 (operator, verbatim): "Approved. You normally make mistakes looking at so many tasks - ensure you do the merge correctly with the right files. As you suggested keep the review calls small."
- RR-0414 (operator, verbatim): "4. changed parts only as per your recommendation" (the oversized files are read as changed parts).
- RR-0431 (operator, verbatim): "We only want to review the same set of files once - that is the objective and just the output"
- RR-0433 (operator): tasks 381, 383, 390, 395 and 411 were folded as they stood; the group review is their one output review.
- RR-0439 (operator): each call is at most 120,000 characters; each rule list reads only the files the rule table names for it.

## Implementation Notes
Left out of every group: generated files (their generators are checked by the commit hooks), test fixtures and goldens, documents, lane and review records, backlog cards. Round rule (RR-0385): CRITICAL, HIGH and MED findings are resolved; LOW and NIT are recorded.
