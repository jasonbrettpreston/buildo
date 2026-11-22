# Seat: integration: task-432 plan (PLAN-432-v1)
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

Basis: board head 202123397 (wf2/board). The board holds uncommitted edits to the task-432 and task-433 cards and an untracked docs/reports/reviews/task-432/. I read PLAN-432-v1, PLAN-433-v1 and PLAN-431-v1. I ran read-only commands only: git ls-tree, git log, git branch --contains, grep, sed, `node -e` on rule-lists.json, `rule-lists.mjs findings --dir`, and `backlog task view`. I did not run the planned tests (no runner named), and I did not run the brief because it writes a context file.

### ig#1 MED: adding `--board` to the G1 call at backlog-lane.mjs:161 breaks an existing pinned test the plan does not list
Plan sentence: ":161: add `'--board', board` to the G1 brief call (so the launch run and the printed command carry the board path)." The plan names only :270 and :276 as pinned regexes.
Evidence (READ and DRIVEN grep): src/tests/backlog/backlog-lane.logic.test.ts:115 pins `/node .*backlog-brief\.mjs --task task-\d+ --lane BL-T1 --stage 1 --root .*wt-t1 --date 2026-11-19 > .*G1-task-\d+\.md/`. The dry-run prints the command through `fmt` (backlog-lane.mjs:110, :115). Any `--board X` placed before or after `--date` sits between two tokens the regex requires to be adjacent.
What would go wrong: that test goes red after the edit, and it is not in the plan's controls or order.
Smallest correction: either update :115 in the plan's test list, or leave :161 alone (see ig#2).

### ig#2 MED: the lane reads BRIEF.md, and the re-run instruction is put where BRIEF.md does not carry it
Plan sentence: "after the 'Context pack sections' line (:180): one line, 'Fresh context every review round ... run `node scripts/analysis/backlog-brief.mjs ...`'" and "the lens line (:187): one clause ... 'see the brief'".
Evidence (READ):
- backlog-brief.mjs prints the G1 ticket. backlog-lane.mjs:190 takes only the `Ticket:` line from it, and :206 puts that line plus the lens line into task.json `extra`.
- The BRIEF.md the lane reads comes from panel-tools brief.mjs (:235). It only points to the G1 file (:201 "the G1 ticket ${g1}"). That is the same fact GROUNDER.md records at out-compliance-eng-all-p1#3.
- The clause "see the brief" is therefore ambiguous: BRIEF.md does not hold the command.
What would go wrong: the lane may never open G1, or may read "the brief" as BRIEF.md and find nothing. The round-2 failure would repeat with the tool "supporting" the fix.
Smallest correction: put the whole re-run command, with `--board ${board}` (`board` is already in scope in lensLine's closure), inside the lens line. That line is in BRIEF.md and is already pinned by regex. This needs no `--board` at :161 (fixes ig#1) and no conditional sentence in the brief (drop T3). Keep `--board` in backlog-brief.mjs.

### ig#3 LOW: the clause must contain no colon, or the pinned segment regex changes meaning
Evidence (READ): backlog-lane.logic.test.ts:266 uses `/Output review lenses[^:]*: ([\s\S]*?)\. Compliance lens/`. The planned clause is inserted inside the first parenthesis, before that first colon. The planned text has no colon, so it is fine as written. A later edit that adds "Fresh context: ..." would shorten the segment and make :267-270 fail.
Smallest correction: say in the plan that the clause carries no ":" (or add a control).

### ig#4 MED: other pending plans change the board in ways that make this task's plan evidence stale
Plan sentence: "Files touched are not in the table's protected_paths" (silent on plan evidence).
Evidence:
- The plan gate recomputes plan-compliance hashes with the template at the board head (check-lane-close.mjs:631 `readBase: i.readRepo`).
- Launch reads the live table (backlog-lane.mjs:78).
- docs/reports/reviews/task-432/ already holds in-plan-compliance-* inputs (untracked).
- PLAN-433 edits lens-compliance.md. PLAN-431 replaces `eng-all` by `eng-front`, `eng-back` and `eng-shared` for several rows, and its own plan names this stale-evidence cost.
What would go wrong: if 431 or 433 lands on the board before 432 is launched, 432's plan-compliance evidence is refused until re-made.
Smallest correction: state a landing order in the plan. Either launch 432 first (it touches no template and no table), or accept re-making the plan evidence.

### ig#5 LOW: file overlaps with the other two plans
Evidence (READ):
- README.md: 432 edits :124. 433 edits "the lens section" of the same file. Different sentences, so a textual merge is likely clean but not certain.
- backlog-lane.logic.test.ts: 431 edits :327. 432 edits near :115, :270 and :276 and adds T4. Different regions.
- backlog-brief.mjs: only 432 touches it.
- 431 says it changes no code in rule-lists.mjs (PLAN-431 "No code in rule-lists.mjs"), so there is no clash with 433 there.
Smallest correction: none needed beyond naming the shared files in the landing order.

### ig#6 LOW: nothing else the edits touch is affected
Callers checked:
- check-lane-close.mjs reads every committed context-rN.md (:836) and matches with `.some` over the hash. It only mentions backlog-brief.mjs in an error string (:477).
- review-template.js `contextRound` is a count of files, unchanged.
- The default (no `--board`) brief output is unchanged apart from the new sentence.
- The existing test at backlog-brief-context.logic.test.ts:185-195 (a later run writes r2 and leaves r1) is unaffected.
- check-lane-close.logic.test.ts:813 is unaffected.
