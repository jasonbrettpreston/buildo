# Seat: regression: task-438 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rg#1 HIGH: tests that must change, and tests that must not, are not all named
- Plan sentence: "T5 ... :343 changes: eng-all leaves the out-compliance loop".
- Evidence, backlog-lane.logic.test.ts MUST change (at the head):
  - :398-403 (task-423 d): `['mobile-98','eng-all','storage-doc16','inc-F']` loop expects `out-compliance-<l>` for eng-all. eng-all must move to `out-engineering-eng-all`, with `lens-engineering.md` expected and `out-compliance-eng-all` not expected.
  - :695: `names(f, /^in-plan-compliance-eng-all/)[0]` is undefined after the change.
  - :691-692: the loop builds `in-plan-compliance-<l.id>` for every resolved list with the compliance template. eng-all must use the engineering file and template.
  - :730: counts `review .*lens-compliance.md` lines and compares with ALL lens-input lines. The engineering job uses the other template, so the expected count is `li` minus the engineering lists.
  - Every fixture that goes through plantEvidence (ig#1).
- Must NOT change:
  - :270 and :370 (`lens-compliance.md` present).
  - :301 (`The compliance lens reviews the WHOLE change`).
  - :336-343 (commands carry context, `lens-input --list L --context`, `lens-input --context ... --material <diff file>`).
  - :408 (`--list rules --lists`) and the `accepted form that is not the default ... RR-0374` regex.
  - :551 (`out-compliance-mobile-98`).
  - :644-648 and :656-658 (`plan-compliance-x`, `STUB_FAIL: plan-compliance-queue-137`).
  - :662-665 (>3 outputs, none joined, input count equals output count; both counts drop eng-all equally).
  - :681 (the first plan-compliance file).
  - PARITY pin at ~:283-290.
- check-lane-close.logic.test.ts: existing tests are unchanged. The TABLE lists are on docs/a.md and nothing is an engineering list, so the engineering subset is empty. Adding `engineering` to LENS_TEMPLATES (:33) is harmless because there is no engineering list.
- rule-lists.logic.test.ts :59-63 (resolve membership of eng-all) and rule-lists-table.logic.test.ts :21-23, :161, :194-203 do not change. They change in 431.
- Smallest correction: replace "T5 :343" with the list above. Add `:691-695` and `:730` as explicit edits.

### rg#2 MED: the "both directions" rule (08_agents.md:462) leaves gaps in T1-T5
- Present: T2 has a planted defect for the de-dup. T3 has refused cases (b) and (c), and the (d) control. T4 has both names.
- Missing:
  - A test that a task with NO engineering list needs no engineering output. This must be a refusal-free case under split=true.
  - A refusal case where a joined compliance set made over ALL lists (eng-all included) is refused, with the whole-list text mismatch quoted. T3(e) only tests that the joined compliance set over compliance lists passes.
  - A joined engineering set (`out-engineering-rules`) accepted, and the same set with the wrong template refused.
  - An engineering list in the chunked SPLIT scenario (V2.WHOLE): an engineering output missing its last chunk is refused.
  - A real (non-dry) plan-prep run with the review stub, asserting `REVIEW template=lens-engineering.md` on `plan-engineering-eng-all.txt` (the stub review path at :656-681 already exists; a dry run only prints names).
- Smallest correction: add those five cases to T3 and T5. Each is a few lines in the existing scenario helper.

### rg#3 MED: the RR-0374 joined form needs a stated rule
- Evidence: complianceSetErrors (:428-453) currently covers ALL lists in the joined proof (:446-449). The joined output of an old lane includes eng-all.
- With the plan's per-seat call: the compliance seat's joined proof covers only compliance lists. An old-form joined `out-compliance-rules` that includes eng-all is accepted only when split is false (base lacks the template). When the base has the template, it is refused as "does not carry the whole list" (the joined text differs), and `out-engineering-<id>` is also demanded. This is the correct split, but it is silent.
- The mixed case (joined compliance, per-list engineering) is allowed, because forms are decided per seat per stage.
- Smallest correction: state this in the plan, with the one-sentence test in rg#2.

### rg#4 MED: the transition rule exists, is small, and is a necessary part of the ruled change
- The close side: `split = readBase('.claude/review-templates/lens-engineering.md') !== null` (plan, in closeErrors). This reuses the F10 base rule (:460, :764) and the precedent at :425. It is 3 lines.
- The plan gate side: always split. The only prepped, unlaunched task affected is 431 (ig#4). Tasks 430, 444 and 438 are launched or launch before.
- Is this new gate work that the operator withdrew (RR-0385 item 5, "built gates kept, no new gate work")? No. It does not add a check. It chooses which existing name an existing check expects, and without it every running lane that rebases would be refused. I would call it necessary.
- Alternatives and why not: accept either name for eng-all at the plan gate and at the close. That is 1 line per gate, but it permanently lets a compliance file stand for the engineering seat, defeating "separate from compliance". Rejected.
- What the code needs: nothing beyond the plan's lines. T3(d) is the right control.
- The plan's own cut-over text needs the ig#3 correction.

### rg#5 LOW: the task-407 lock and the layout fragments
- Evidence: the PARITY test (~:281-290) requires these fragments in both backlog-lane.mjs and check-lane-close.mjs: `plan-<lens>[-<list id>][-pN].txt, out-<lens>[-<list id>][-pN].txt, in-<same name>`, `(lens-plan/, lens-out/, stage2/)`, `out-<lens>[-<list id>]-rN.txt`, `fix-*.txt`. The plan's change adds a sentence to `per` and does not touch the `layout` constant.
- What could go wrong: a builder who rewrites `layout` to add engineering would break the parity pin. Lines :301 and :293-300 also require "The compliance lens reviews the WHOLE change" in every brief.
- Smallest correction: say in the plan that `layout` is not edited and that the engineering sentence sits in `per`.

### rg#6 LOW: the record-only brief text
- Evidence: backlog-lane.mjs:188 says "record-only: compliance only". A record-only task that resolves eng-all (a Files path in lane-tools) would now need the engineering output at both stages (phases ['plan','out']).
- What goes wrong: the heading text says "compliance only" while the gate asks for two seats.
- Smallest correction: change the words to "rule lists only" or leave it and note it.

### Regression, what I checked and found true
- The V2.WHOLE chunk coverage, the committed-input check and the whole-list recompute all live in listProof, which the plan reuses unchanged. The engineering list gets them for free.
- The fix branch (:644) is unaffected: fix tasks have `lists = []` in plan-prep (rule-lists.mjs:649).
- Fold merges skip the close check (:707-708), so already-BUILT tasks cannot be re-refused.
- Tasks 436 and 437 changed only backlog-lane.mjs lensLine area (MODEL_LINE), Spec 08 (2 lines) and the two test files. None of that touches the plan's code areas, apart from the line drift in rc#4.

## What I could not verify
- Whether the 20 RUNNING tasks the plan lists (354, 366, 372-376, 378, 381, 383, 384, 387-390, 395, 396, 406, 407, 411) all carry eng-all. I did not resolve each one.
- Whether BL-HB430 or BL-DOCS444 will merge or rebase the board before closing (their branches are 27 and 4 commits behind). Their lane TASK files are not on the board yet.
- Whether TASK-444 is a build task (it decides whether `plan-engineering-eng-all` is also owed at its close).
- The test outcomes themselves. I ran nothing, so the red and green state of T1-T5 and of the tests listed in rg#1 is by reading only.
- The length and behaviour of lens-engineering.md, which does not exist yet.
- The exact count of tests broken by ig#1, because I did not execute them.
- check-task-files.mjs behaviour on a Files line that adds the plant-evidence.mjs path (ig#1), not read in full.
- Whether a lane that rebases will also have lens-engineering.md at its merge-base. That follows from the git logic above and I did not run it.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/hooks/check-lane-close.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/backlog-lane.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/docs/reports/reviews/task-375/plant-evidence.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/.claude/review-templates/lens-compliance.md
