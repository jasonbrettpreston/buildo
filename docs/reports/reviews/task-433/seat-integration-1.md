# Seat: integration: task-433 plan (PLAN-433-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 202123397. Read-only commands only: grep, sed, git log, `node -e`, `rule-lists.mjs findings`. I read all three plans. No tests were run and no model was called.

### ig#1 HIGH: the lane that builds 433 cannot close, because the close recomputes prompt hashes with the template at the range base
Plan sentence: "Template change and hashes: it changes the prompt hash of outputs made after it. Two caveats ... (b) ... a lane launched before this lands must not merge the board's template." Acceptance 2: "hashes in the check-lane-close and lane tests follow (they read the live template)."
Evidence (READ):
- check-lane-close.mjs:764 `readBase` reads `git show ${base}:<path>`, and :399 passes `readBase('.claude/review-templates/lens-compliance.md')` as the template text for every out-compliance output. The commit that introduced it is f5cc11a99 (F10, "reads table, templates and type from the base").
- The lane brief orders the review with `--template .claude/review-templates/lens-compliance.md` (backlog-lane.mjs:44), read from the lane worktree.
- Task-433's own lane edits that file in its worktree, so its out-compliance outputs are hashed with the NEW template while the close recomputes with the launch-commit (old) template.
What would go wrong: every out-compliance output of the 433 lane fails the "prompt_sha256 is not the hash" refusal. The plan only covers other lanes.
Smallest correction: add a step to the plan. Either (a) the lane makes its compliance outputs with a copy of the base template under the name lens-compliance.md (`git show <base>:...`), after confirming the header check at :59-61 only compares the template name; or (b) split the template edit into its own commit on the board, outside the 433 lane, after the lane closes. Name the choice in the plan.

### ig#2 MED: the generated page reads lens-compliance.md, so the template edit can make `page --check` stale, and the page is not in the card's Files line
Evidence (READ):
- rule-lists.mjs:521 `const tmpl = .../lens-compliance.md`, and :537 `buildLensInputs({... templateFile: tmpl})` yields the "parts" column of docs/reports/generated/rule-lists-by-kind.md.
- The generated-doc gate is at rule-lists.logic.test.ts:448-457.
- About 500 more template characters can move a part count at a size boundary.
- PLAN-431 regenerates the same page, so whichever lands second must re-check it.
- The 433 Files line (card :18) and the plan's Files do not list the page.
Smallest correction: add "run `page --check` after the template edit; regenerate and add the page to Files if stale". Fix the card's Files line before launch, as the 431 plan already does for its own.

### ig#3 MED: landing 433 before the pending plan launches invalidates their compliance plan evidence (caveat (a), and clashes with 431 and 432)
Evidence:
- The plan gate recomputes with the template at the board head (check-lane-close.mjs:631).
- docs/reports/reviews/task-432/ already holds in-plan-compliance-* inputs.
- PLAN-431 also changes the resolved list set for 41 tasks.
The plan lists this as Q4 but says nothing about 431 and 432 specifically.
Smallest correction: name 431 and 432 in Q4.

### ig#4 LOW: README.md and rule-lists.logic.test.ts are shared with other plans
Evidence (READ): README is also edited by 432 (:124). rule-lists.logic.test.ts is edited by 431 at :53 and :59-63; 433 adds new describes. 431 changes no rule-lists.mjs code, which answers the plan's UNVERIFIED line on concurrency.
Smallest correction: none.

### ig#5 LOW: the readers of lens outputs do not parse the new line (the plan's claim holds)
Evidence (DRIVEN grep): `grep -rln "Rules met|Clauses checked" scripts src .claude` gives only lens-compliance.md.
- FINDING_LINE needs `BUG|DEFER severity=` at the start of a line (rule-lists.mjs:301).
- FINDING_LOOSE (:299) does not match "Rules met:".
- check-lane-close.mjs reads only `^VERDICT:` and the REVIEW header from the first 15 lines.
The tool trailer (`---`, timing and tokens, seen at the end of out-compliance-queue-137-p1.txt) follows the Rules met line, so nothing shifts.

### ig#6 LOW: the list part of the 431 lists has no bold ids
Evidence (READ): PLAN-431 attaches eng-front, eng-back and eng-shared (sections of 00_engineering_standards.md) to every non-infrastructure kind. That file has no bold ids, so for those lists `unmentioned` prints "holds no rule ids". This is consistent with Q1(A) but is the new normal for 431-resolved tasks. Spec 136 (44 ids) is the only id-bearing list there.
Smallest correction: one sentence in the README text.
