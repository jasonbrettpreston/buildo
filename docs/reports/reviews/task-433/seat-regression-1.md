# Seat: regression: task-433 plan (PLAN-433-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 202123397. History read with `git log` on lens-compliance.md (cb026342c COMPLY.2, 2b16b3810 REVIEW.LENSES) and on check-lane-close.mjs (f5cc11a99 F10). I also read rule-lists.mjs:299-312, check-lane-close.mjs:55-75, :399, :631 and :764, and the existing tests that read the template. No tests run.

### rg#1 HIGH: the close reads the template at the range base (F10, f5cc11a99), so 433's own lane cannot close if it edits the template and then reviews with it
Plan sentence: "The close recomputes with the template at the range base, the launch commit (:764); a lane launched before this lands must not merge the board's template."
Evidence (READ):
- The F10 ruling was added so a lane cannot change the template its outputs are checked against.
- backlog-lane.mjs:44 orders `--template .claude/review-templates/lens-compliance.md` from the lane worktree.
- Task-433's own compliance outputs come from the edited file and the close recomputes with the old one (check-lane-close.mjs:399, :764).
What would go wrong: close refusal on every out-compliance hash. The plan covers only the merge case.
Smallest correction: see integration ig#1. Run the lane's compliance outputs with a base-template copy, or land the template edit outside the lane.

### rg#2 LOW: the template's cap of "at most 8 MET lines, only for clauses the change is most likely to break" (template :62) is eased by the new line
Plan sentence: "The last line names by id the rules of the pasted list you judged met and raised no finding on."
Evidence (READ): :62 limits MET lines on purpose. The new line asks for every met id, which is a response on every rule, the thing the operator refused ("we cant get a response on every rule - that would seem like too much"). The plan holds to a single line, ids only, and Q3 keeps the report non-gating, so it follows the ruling as put (step 6 B). It is still a change to the intent of cb026342c.
Smallest correction: none needed; keep Q3 default (report only), and record that the 8-MET cap and the Rules met line are separate.

### rg#3 MED: a template change moves prompt hashes of unlaunched plan evidence and the generated page
Evidence (READ):
- check-lane-close.mjs:631 uses the board-head template for the plan gate. The plan names this (caveat a).
- rule-lists.mjs:521 and :537 feed the page's part counts from the same template, so the page and its gate (rule-lists.logic.test.ts:448-457) can go stale. The plan omits this.
Smallest correction: add "run `page --check`" to the order (see integration ig#2).

### rg#4 LOW: parsers and pinned tests are not affected (the plan's claim holds)
Evidence (READ):
- findingsIn and the loose count ignore the new line (rule-lists.mjs:299-312).
- reviewErrors reads `^VERDICT:` and the REVIEW header from the first 15 lines (check-lane-close.mjs:55-75), unchanged.
- No test pins the template ending (grep for "Clauses checked" outside the template: none).
- The single `{{PLAN}}` pin and the system/user split tests (review-templates.logic.test.ts:10-15, review-lens-template.infra.test.ts:67, :102-123) are unaffected by lines after the format block.
No regression found in these.

### rg#5 LOW: previous rulings on the compliance template are kept
The task-366 fix (one `{{PLAN}}`) is untouched. Per-document (RR-0374) and joined form are untouched. Nothing from tasks 375, 410, 418, 419 or 423 is undone beyond rg#1 and rg#3.
