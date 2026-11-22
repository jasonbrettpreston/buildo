# Seat: reality-check: task-432 plan (PLAN-432-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 202123397. Marks: DRIVEN means I ran a read-only command and saw the result; READ means I opened the file and line. I did not run the brief (it writes a file) or the tests (no runner named). I did run `rule-lists.mjs findings --dir` on the BL-SIMPLE423 lane directory.

Facts checked:
- Fact 1 (contextRound, :51, :159): READ, true.
- Fact 2 (CONTEXT_SECTIONS = Task, Description, Acceptance criteria, Decisions naming this task, Implementation Notes): READ, true.
- Facts 3 and 5 (backlog-lane.mjs:161 and :189; lensContexts at check-lane-close.mjs:320-327, :836; `.some` hash match; the :813 test): READ, true.
- Fact 6: DRIVEN. `grep` finds the 08_agents.md:529 text and the README.md:124 text. 08_agents.md:341 is blank and :360 is rule 10, so the stale cites at backlog-brief.mjs:7 and :179 are real.
- Fact 8: DRIVEN. `git ls-tree wf1/inc1b-simple423 backlog/decisions/` has a highest decision number of 156 and none of RR-0372 to RR-0375. decision-159 and decision-160 exist on the board. Both name task-423 (2 grep hits each) and carry `Operator, verbatim, 2026-11-22: "..."` at line 17, which matches the regex at backlog-brief.mjs:42.
- Unverified item on protection: DRIVEN. protected_paths is check-lane-close.mjs, rule-lists.mjs, rule-lists.json, deepseek-review.js and .husky/*. A grep of .husky, scripts/hooks and .claude finds backlog-brief only in an error string at check-lane-close.mjs:477, and in docs. So the table is right and the card's claim that backlog-brief.mjs is protected is wrong.

### rc#1 MED: the measured problem is only partly the stale context
Plan sentence (from the card): "21 of 21 CRITICAL and HIGH lens findings were false, most because the lens read the round 1 context."
Evidence (DRIVEN, GROUNDER.md reasons for the 21 CRIT or HIGH ids that `findings` prints as severity CRIT or HIGH; a 22nd, plan-protocol-p1#4, is MED):
- 12 of the 21 are stale context.
- 7 are "the lens read the older context-r2.md Files line": s7-s11-p2#1, eng-all-p2#1, inc-S-p1#1, ms-S-p1#1, doc17-p1#1, plan-protocol-p1#1, queue-137-p2#1.
- 5 are "the lens context ended at RR-0371": eng-all-p1#1, doc17-p1#2, p1#3, p2#1, p2#2.
- 9 are not: the false "Plan line only in FOLD-CHECK.md" claim (s5-p1#1, five-words-p1#1, error-paths-p1#1), the listProof stand-in claims (s7-s11-p1#1), the old-plan-evidence rule family (inc-S-p1#2, plan-protocol-p1#2, queue-137-p1#1), a premise that is false (ms-S-p1#2), and a template line with no defect (s5-p2#1).
What would go wrong: after this task lands about 9 of the 21 would still be false. That is no defect of the plan, but the replay acceptance (acceptance 2) proves only the context content, not a drop in false findings.
Smallest correction: state "12 of 21" in the plan, and take acceptance 2 as proof of the context only.

### rc#2 LOW: fact 7 ("a commit on branch wf1/inc1b-simple423, not on the board") is no longer true at the board head
Evidence (DRIVEN): `git branch --contains 5d554f459` lists wf1/inc1b-simple423, wf1/inc1b-gate375 and wf2/board. The task-423 fold commit 686e6d141 is at the board head. It was true when the round was made. The branch tip still exists, so the replay in acceptance 2 (scratch checkout of wf1/inc1b-simple423 plus `--board`) still works. DRIVEN: the branch holds decisions only up to 156.
Smallest correction: say "not on the board when the round ran".

### rc#3 LOW: the Principles line overstates what the reviewer sees
Plan sentence: "observable (the context lists every decision title and is committed)."
Evidence (READ): the "Decisions in force" title list is not among CONTEXT_SECTIONS (review-template.js:115, and the plan's own fact 2). The reviewer sees only "Decisions naming this task", so a ruling that governs the task but does not name it (or its plan id, row id or RR id) never reaches the lens, with or without a re-run.
What would go wrong: low. This is an existing limit, but the plan presents the re-run as giving "the rulings as they are".
Smallest correction: drop "lists every decision title" from the principle or add it to NOT IN SCOPE.

### rc#4 LOW: the planned tests are red now and green after (READ)
- T1: `--board` is ignored, so RR-0900 is absent. Red.
- T2: `--board` with no decisions dir exits 0 today. Red.
- T3: the sentence does not exist. Red.
- T4: the dry-run prints the G1 command (backlog-lane.mjs:115), so the `--board` assertion is red now. But see integration ig#1: :115 of the test file breaks too and is not in the plan.
The controls are sound.

### rc#5 LOW: nothing is rebuilt
`--board` mirrors the flag backlog-lane.mjs already has (:42). The re-run reuses the existing contextRound count and the existing test at :185-195. Merging the board (option B) is the only no-code alternative, and the plan costs it correctly: check-lane-close.mjs:764 reads the template at the range base, and :752-755 reads the table there.

OPEN QUESTIONS (code evidence, no ruling):
- Q1 option A: supported. A single `decDir` line at backlog-brief.mjs:39 carries it, and the milestone and docs reads stay on `root`. Option B: no code needed, and the cost the plan gives (a template pulled in by the merge breaks the hash) is true, because :764 reads templates at the base. Note the base is the launch commit and does not move on a merge.
- Q2: the close matches with `.some` over all committed contexts, so a stale context still passes. The file number counts brief runs, so mapping out-X-r2 to a context is a guess (READ). The plan's reading holds.
- Q3: round 1 re-made. Supported: the lane edited the task before round 1 in task-423. Side effect: the launch file context-r2 is then never used, while the lens line (pinned by backlog-lane.logic.test.ts:423-435) still names it. The plan's clause covers this.
